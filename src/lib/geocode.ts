import { LatLng } from '@/types';

export interface GeocodeSuggestion {
  lat: number;
  lng: number;
  label: string;
  name: string;
  area: string;
  icon: string;
  type: string;
  category: string;
}

/**
 * 地名・住所・ランドマークを検索する
 * サーバー側で Nominatim → Photon フォールバックを行う
 */
export async function geocodeSearch(query: string): Promise<GeocodeSuggestion[]> {
  if (!query || query.length < 2) return [];

  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];

    const data: GeocodeSuggestion[] = await response.json();
    return data;
  } catch {
    return [];
  }
}

/**
 * 逆ジオコーディングで県名・市区町村名を取得する（単一地点）
 */
export async function reverseGeocodeShortName(position: LatLng): Promise<string> {
  try {
    const response = await fetch(
      `/api/reverse-geocode?lat=${position.lat}&lng=${position.lng}`
    );
    if (!response.ok) return '';
    const data = await response.json();
    return data.shortName || '';
  } catch {
    return '';
  }
}

/**
 * 複数地点の逆ジオコーディングをバッチ実行する
 *
 * サーバー側で Nominatim（順次）→ 429 時 Photon（並列）に自動切替
 */
export async function reverseGeocodePoints(positions: LatLng[]): Promise<string[]> {
  if (positions.length === 0) return [];

  try {
    const response = await fetch('/api/reverse-geocode-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: positions.map((p) => ({ lat: p.lat, lng: p.lng })),
      }),
    });

    if (!response.ok) {
      // バッチ API 失敗時は個別フォールバック
      return fallbackSequential(positions);
    }

    const data = await response.json();
    return (data.results || []).map((r: any) => r.shortName || '');
  } catch {
    return fallbackSequential(positions);
  }
}

/**
 * バッチ API 失敗時のフォールバック: 個別に順次リクエスト
 */
async function fallbackSequential(positions: LatLng[]): Promise<string[]> {
  const results: string[] = [];
  for (const pos of positions) {
    try {
      const name = await reverseGeocodeShortName(pos);
      results.push(name);
    } catch {
      results.push('');
    }
  }
  return results;
}
