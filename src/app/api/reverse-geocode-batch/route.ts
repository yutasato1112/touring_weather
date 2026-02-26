import { NextRequest, NextResponse } from 'next/server';

interface PointInput {
  lat: number;
  lng: number;
}

interface ReverseResult {
  shortName: string;
  lat: number;
  lng: number;
}

/** 都道府県コード → 名前（JIS X 0401） */
const PREFECTURE_NAMES: Record<string, string> = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県',
  '06': '山形県', '07': '福島県', '08': '茨城県', '09': '栃木県', '10': '群馬県',
  '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県', '15': '新潟県',
  '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県',
  '21': '岐阜県', '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県',
  '26': '京都府', '27': '大阪府', '28': '兵庫県', '29': '奈良県', '30': '和歌山県',
  '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
  '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県',
  '41': '佐賀県', '42': '長崎県', '43': '熊本県', '44': '大分県', '45': '宮崎県',
  '46': '鹿児島県', '47': '沖縄県',
};

/**
 * HeartRails GeoAPI 逆ジオコーディング（1件、APIキー不要、県名+市区町村名）
 */
async function reverseHeartRails(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://geoapi.heartrails.com/api/json?method=searchByGeoLocation&x=${lng}&y=${lat}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return '';

    const data = await response.json();
    const loc = data.response?.location?.[0];
    if (!loc) return '';

    const prefecture = loc.prefecture || '';
    const city = loc.city || '';

    if (prefecture && city) return `${prefecture}${city}`;
    return prefecture || city || '';
  } catch {
    return '';
  }
}

/**
 * 国土地理院 逆ジオコーディング（1件、APIキー不要、レート制限なし、県名のみ）
 */
async function reverseGSI(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return '';

    const data = await response.json();
    const muniCd = data.results?.muniCd;
    if (!muniCd) return '';

    const prefCode = muniCd.substring(0, 2);
    return PREFECTURE_NAMES[prefCode] || '';
  } catch {
    return '';
  }
}

/**
 * Nominatim 逆ジオコーディング（1件）
 * @returns null on 429 or error
 */
async function reverseNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=ja`,
      {
        headers: { 'User-Agent': 'TouringWeather/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.status === 429) return null;
    if (!response.ok) return null;

    const data = await response.json();
    const address = data.address || {};
    const prefecture = address.state || address.province || '';
    const city = address.city || address.town || address.village || address.county || '';

    if (prefecture && city) return `${prefecture}${city}`;
    return prefecture || city || '';
  } catch {
    return null;
  }
}

const HEARTRAILS_CONCURRENCY = 5;  // HeartRails 並列数
const GSI_CONCURRENCY = 10;        // 国土地理院はレート制限なし
const NOMINATIM_DELAY_MS = 1100;   // Nominatim rate limit: 1 req/s

/**
 * バッチ逆ジオコーディング
 *
 * 戦略:
 * 1. HeartRails を並列実行（県名+市区町村名）
 * 2. 空結果の地点を国土地理院で並列リトライ（県名のみ）
 * 3. それでも空の地点を Nominatim で順次リトライ
 */
async function batchReverse(points: PointInput[]): Promise<ReverseResult[]> {
  // Phase 1: HeartRails で全地点を並列処理
  const heartRailsResults = await parallelFetch(points, reverseHeartRails, HEARTRAILS_CONCURRENCY);
  const results: ReverseResult[] = points.map((p, i) => ({
    shortName: heartRailsResults[i],
    lat: p.lat,
    lng: p.lng,
  }));

  // Phase 2: 空結果の地点を Nominatim で順次リトライ（県名+市区町村名）
  const failedAfterHR = results
    .map((r, i) => (r.shortName === '' ? i : -1))
    .filter((i) => i >= 0);

  for (let j = 0; j < failedAfterHR.length; j++) {
    if (j > 0) {
      await new Promise((r) => setTimeout(r, NOMINATIM_DELAY_MS));
    }
    const idx = failedAfterHR[j];
    const shortName = await reverseNominatim(points[idx].lat, points[idx].lng);
    if (shortName !== null && shortName !== '') {
      results[idx] = { shortName, lat: points[idx].lat, lng: points[idx].lng };
    }
  }

  // Phase 3: まだ空の地点を国土地理院で並列リトライ（県名のみだが安定）
  const failedAfterNom = results
    .map((r, i) => (r.shortName === '' ? i : -1))
    .filter((i) => i >= 0);

  if (failedAfterNom.length > 0) {
    const gsiPoints = failedAfterNom.map((i) => points[i]);
    const gsiResults = await parallelFetch(gsiPoints, reverseGSI, GSI_CONCURRENCY);
    for (let j = 0; j < failedAfterNom.length; j++) {
      const idx = failedAfterNom[j];
      if (gsiResults[j]) {
        results[idx] = { shortName: gsiResults[j], lat: points[idx].lat, lng: points[idx].lng };
      }
    }
  }

  return results;
}

/**
 * 汎用並列実行（concurrency 制限付き）
 */
async function parallelFetch(
  points: PointInput[],
  fetchFn: (lat: number, lng: number) => Promise<string>,
  concurrency: number
): Promise<string[]> {
  const results: string[] = new Array(points.length).fill('');
  let cursor = 0;

  async function worker() {
    while (cursor < points.length) {
      const idx = cursor++;
      results[idx] = await fetchFn(points[idx].lat, points[idx].lng);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, points.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const points: PointInput[] = body.points;

    if (!Array.isArray(points) || points.length === 0) {
      return NextResponse.json({ error: 'points array is required' }, { status: 400 });
    }

    if (points.length > 50) {
      return NextResponse.json({ error: 'Too many points (max 50)' }, { status: 400 });
    }

    const results = await batchReverse(points);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
