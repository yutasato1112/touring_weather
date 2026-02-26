import { NextRequest, NextResponse } from 'next/server';

interface ReverseGeocodeResult {
  label: string;
  shortName: string;
  prefecture: string;
  city: string;
  lat: number;
  lng: number;
}

/**
 * HeartRails GeoAPI 逆ジオコーディング（APIキー不要、県名+市区町村名を返す）
 * @returns null on error
 */
async function reverseHeartRails(lat: string, lng: string): Promise<ReverseGeocodeResult | null> {
  try {
    const response = await fetch(
      `https://geoapi.heartrails.com/api/json?method=searchByGeoLocation&x=${lng}&y=${lat}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const loc = data.response?.location?.[0];
    if (!loc) return null;

    const prefecture = loc.prefecture || '';
    const city = loc.city || '';
    const town = loc.town || '';

    let shortName = '';
    if (prefecture && city) {
      shortName = `${prefecture}${city}`;
    } else if (prefecture) {
      shortName = prefecture;
    }

    const parts = [town, city, prefecture].filter(Boolean);
    const label = parts.join(', ') || `${lat}, ${lng}`;

    return { label, shortName, prefecture, city, lat: parseFloat(lat), lng: parseFloat(lng) };
  } catch {
    return null;
  }
}

/**
 * 国土地理院 逆ジオコーディング（APIキー不要、レート制限なし）
 * 県名のみ返す（muniCd → 都道府県コード変換）
 * @returns null on error
 */
async function reverseGSI(lat: string, lng: string): Promise<ReverseGeocodeResult | null> {
  try {
    const response = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const muniCd = data.results?.muniCd;
    if (!muniCd) return null;

    const prefCode = muniCd.substring(0, 2);
    const prefecture = PREFECTURE_NAMES[prefCode] || '';

    return {
      label: prefecture || `${lat}, ${lng}`,
      shortName: prefecture,
      prefecture,
      city: '',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    };
  } catch {
    return null;
  }
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
 * Nominatim で逆ジオコーディング
 * @returns null on error
 */
async function reverseNominatim(lat: string, lng: string): Promise<ReverseGeocodeResult | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=ja`,
      {
        headers: { 'User-Agent': 'TouringWeather/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const address = data.address || {};
    const prefecture = address.state || address.province || '';
    const city = address.city || address.town || address.village || address.county || '';

    let shortName = '';
    if (prefecture && city) {
      shortName = `${prefecture}${city}`;
    } else if (prefecture) {
      shortName = prefecture;
    } else if (city) {
      shortName = city;
    }

    return {
      label: data.display_name || `${lat}, ${lng}`,
      shortName, prefecture, city,
      lat: parseFloat(lat), lng: parseFloat(lng),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  // 1. HeartRails（APIキー不要、県名+市区町村名を返す）
  const heartRailsResult = await reverseHeartRails(lat, lng);
  if (heartRailsResult !== null && heartRailsResult.shortName) {
    return NextResponse.json(heartRailsResult);
  }

  // 2. Nominatim（県名+市区町村名）
  const nominatimResult = await reverseNominatim(lat, lng);
  if (nominatimResult !== null && nominatimResult.shortName) {
    return NextResponse.json(nominatimResult);
  }

  // 3. 国土地理院（県名のみだが安定）
  const gsiResult = await reverseGSI(lat, lng);
  if (gsiResult !== null && gsiResult.shortName) {
    return NextResponse.json(gsiResult);
  }

  return NextResponse.json(heartRailsResult ?? nominatimResult ?? gsiResult ?? {
    label: `${lat}, ${lng}`, shortName: '', prefecture: '', city: '',
    lat: parseFloat(lat), lng: parseFloat(lng),
  });
}
