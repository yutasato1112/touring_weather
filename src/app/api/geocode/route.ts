import { NextRequest, NextResponse } from 'next/server';

interface GeocodeSuggestion {
  lat: number;
  lng: number;
  label: string;
  type: string;
  category: string;
}

/**
 * Nominatim で検索（日本語ランドマーク・住所検索に強い）
 * @returns null on 429 or error
 */
async function searchNominatim(q: string): Promise<GeocodeSuggestion[] | null> {
  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'jp',
      'accept-language': 'ja',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { 'User-Agent': 'TouringWeather/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.status === 429) return null;
    if (!response.ok) return null;

    const data = await response.json();
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      label: item.display_name,
      type: item.type || '',
      category: item.class || '',
    }));
  } catch {
    return null;
  }
}

/**
 * 国土地理院 AddressSearch API（APIキー不要、日本語ランドマーク・住所に強い）
 * @returns null on error
 */
async function searchGSI(q: string): Promise<GeocodeSuggestion[] | null> {
  try {
    const response = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    return data.slice(0, 5).map((item: any) => {
      const [lng, lat] = item.geometry?.coordinates || [0, 0];
      return {
        lat,
        lng,
        label: item.properties?.title || `${lat}, ${lng}`,
        type: '',
        category: '',
      };
    });
  } catch {
    return null;
  }
}

/**
 * Photon (komoot) で検索
 * @returns null on error
 */
async function searchPhoton(q: string): Promise<GeocodeSuggestion[] | null> {
  try {
    const params = new URLSearchParams({
      q,
      lang: 'default',
      limit: '5',
      lat: '36.0',
      lon: '140.0',
    });

    const response = await fetch(
      `https://photon.komoot.io/api/?${params}`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const features = data.features || [];

    return features
      .filter((f: any) => {
        const country = f.properties?.country;
        return !country || country === '日本' || country === 'Japan';
      })
      .map((f: any) => {
        const props = f.properties || {};
        const [lng, lat] = f.geometry?.coordinates || [0, 0];

        const parts = [
          props.name,
          props.city || props.town || props.village,
          props.state,
        ].filter(Boolean);
        const label = parts.join(', ') || props.label || `${lat}, ${lng}`;

        return {
          lat,
          lng,
          label,
          type: props.type || props.osm_value || '',
          category: props.osm_key || '',
        };
      });
  } catch {
    return null;
  }
}

/**
 * 結果があるかチェック
 */
function hasResults(results: GeocodeSuggestion[] | null): results is GeocodeSuggestion[] {
  return results !== null && results.length > 0;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  // 1. 国土地理院（レート制限なし、ランドマーク・住所に強い）
  const gsiResults = await searchGSI(q);
  if (hasResults(gsiResults)) {
    return NextResponse.json(gsiResults);
  }

  // 2. Nominatim（OSMデータ、日本語ラベル詳細）
  const nominatimResults = await searchNominatim(q);
  if (hasResults(nominatimResults)) {
    return NextResponse.json(nominatimResults);
  }

  // 3. Photon（最終フォールバック）
  const photonResults = await searchPhoton(q);
  if (hasResults(photonResults)) {
    return NextResponse.json(photonResults);
  }

  // 全て失敗: 空配列を返す（500にはしない）
  return NextResponse.json([]);
}
