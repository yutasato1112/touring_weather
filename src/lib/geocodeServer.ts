/**
 * サーバーサイド共有ジオコード関数
 *
 * src/app/api/geocode/route.ts から抽出。
 * /api/geocode および /api/parse-route-preference の両方から利用される。
 */

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

export interface ScoredSuggestion extends GeocodeSuggestion {
  score: number;
}

/** カテゴリ・タイプからアイコン絵文字を決定 */
function getCategoryIcon(category: string, type: string, name: string): string {
  const c = category.toLowerCase();
  const t = type.toLowerCase();
  const stripped = name.replace(/^(北海道|.{2,3}[都道府県])/, '');

  if (t === 'station' || t === 'halt' || c === 'railway' || stripped.includes('駅')) return '🚉';
  if (t === 'aerodrome' || c === 'aeroway' || stripped.includes('空港')) return '✈️';
  if (t === 'peak' || t === 'volcano' || stripped.endsWith('山') || stripped.endsWith('岳') || stripped.includes('峠')) return '⛰️';
  if (t === 'water' || t === 'lake' || t === 'river' || stripped.endsWith('湖') || stripped.endsWith('海') || stripped.endsWith('川')) return '🌊';
  if (stripped.includes('温泉')) return '♨️';
  if (t === 'park' || t === 'garden' || c === 'leisure') return '🌳';
  if (t === 'shrine' || stripped.includes('神社') || stripped.includes('大社')) return '⛩️';
  if (t === 'temple' || stripped.includes('寺') || stripped.endsWith('院')) return '🛕';
  if (t === 'castle' || stripped.endsWith('城')) return '🏯';
  if (stripped.includes('道の駅') || stripped.includes('サービスエリア') || stripped.includes('パーキング')) return '🅿️';
  if (t === 'city' || t === 'town' || t === 'village' || t === 'administrative' || t === 'county') return '🏙️';
  if (c === 'highway' || t === 'motorway' || t === 'trunk') return '🛣️';
  if (c === 'building' || c === 'amenity' || c === 'shop') return '🏢';
  if (c === 'tourism' || t === 'attraction' || t === 'viewpoint') return '📍';

  return '📍';
}

/** Nominatimのtype/classから重要度ボーナスを算出 */
function getTypeBonus(type: string, category: string): number {
  if (type === 'administrative' || type === 'city' || type === 'town') return 0.3;
  if (category === 'boundary') return 0.25;
  if (type === 'station' || category === 'railway') return 0.2;
  if (category === 'tourism' || category === 'historic') return 0.1;
  return 0;
}

export async function searchNominatim(q: string): Promise<ScoredSuggestion[] | null> {
  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '1',
      limit: '7',
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
    return data.map((item: any) => {
      const addr = item.address || {};
      const type = item.type || '';
      const category = item.class || '';

      let rawName = item.name
        || addr.tourism || addr.amenity || addr.building || addr.leisure
        || addr.railway || addr.aeroway || addr.natural || addr.historic
        || item.display_name?.split(',')[0]?.trim()
        || '';

      if ((type === 'station' || type === 'halt' || type === 'train_station' || category === 'railway')
          && rawName && !rawName.endsWith('駅')) {
        rawName = rawName + '駅';
      }
      if (type === 'administrative' || category === 'boundary') {
        const ward = addr.city_district || addr.suburb || addr.quarter || '';
        if (ward && !rawName.includes('区') && !rawName.includes('市') && !rawName.includes('町')) {
          rawName = ward;
        }
      }

      const city = addr.city || addr.town || addr.village || addr.county || '';
      const state = addr.state || '';
      const areaParts = [city, state].filter(Boolean);
      const area = areaParts.join(', ');
      const labelParts = [rawName, city, state].filter(Boolean);
      const label = [...new Set(labelParts)].join(', ');

      const icon = getCategoryIcon(category, type, rawName);
      const importance = parseFloat(item.importance) || 0;
      const score = importance + getTypeBonus(type, category);

      return { lat: parseFloat(item.lat), lng: parseFloat(item.lon), label, name: rawName, area, icon, type, category, score };
    });
  } catch {
    return null;
  }
}

export async function searchGSI(q: string): Promise<ScoredSuggestion[] | null> {
  try {
    const response = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    return data.slice(0, 5).map((item: any, index: number) => {
      const [lng, lat] = item.geometry?.coordinates || [0, 0];
      const title = item.properties?.title || `${lat}, ${lng}`;
      const prefMatch = title.match(/^(北海道|.{2,3}[都道府県])/);
      let name = title;
      let area = '';
      if (prefMatch) {
        const pref = prefMatch[1];
        const rest = title.slice(pref.length);
        const cityMatch = rest.match(/^(.+?[市区町村郡])/);
        if (cityMatch) {
          area = pref + cityMatch[1];
          const afterCity = rest.slice(cityMatch[1].length);
          name = afterCity || title;
          if (!afterCity) {
            name = cityMatch[1];
            area = pref;
          }
        } else {
          name = rest || pref;
          area = rest ? pref : '';
        }
      }
      const icon = getCategoryIcon('', '', name);

      let score = 0.1 - index * 0.01;
      if (name === q || title === q) score += 0.5;
      else if (name.includes(q)) score += 0.4;
      else if (title.includes(q)) score += 0.3;
      else if (q.includes(name) && name.length >= q.length * 0.5) score += 0.2;

      return { lat, lng, label: title, name, area, icon, type: '', category: '', score };
    });
  } catch {
    return null;
  }
}

export async function searchPhoton(q: string): Promise<ScoredSuggestion[] | null> {
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
      .map((f: any, index: number) => {
        const props = f.properties || {};
        const [lng, lat] = f.geometry?.coordinates || [0, 0];

        let name = props.name || props.street || '';
        const city = props.city || props.town || props.village || '';
        const pType = (props.type || props.osm_value || '').toLowerCase();
        const pCat = (props.osm_key || '').toLowerCase();
        if ((pType === 'station' || pType === 'halt' || pCat === 'railway') && name && !name.endsWith('駅')) {
          name = name + '駅';
        }
        const state = props.state || '';
        const areaParts = [city, state].filter(Boolean);
        const area = areaParts.join(', ');
        const labelParts = [name, city, state].filter(Boolean);
        const label = [...new Set(labelParts)].join(', ');

        const type = props.type || props.osm_value || '';
        const category = props.osm_key || '';
        const icon = getCategoryIcon(category, type, name);

        let score = 0.3 - index * 0.03;
        if (name === q) score += 0.4;
        else if (name.includes(q)) score += 0.3;
        else if (q.includes(name) && name.length >= q.length * 0.5) score += 0.15;
        score += getTypeBonus(type, category);

        return { lat, lng, label, name, area, icon, type, category, score };
      });
  } catch {
    return null;
  }
}

function hasResults(results: ScoredSuggestion[] | null): results is ScoredSuggestion[] {
  return results !== null && results.length > 0;
}

export function deduplicateResults(results: ScoredSuggestion[]): ScoredSuggestion[] {
  const kept: ScoredSuggestion[] = [];
  for (const r of results) {
    const dupIndex = kept.findIndex(s => {
      const latClose = Math.abs(s.lat - r.lat) < 0.01;
      const lngClose = Math.abs(s.lng - r.lng) < 0.01;
      if (!latClose || !lngClose) return false;
      if (s.icon !== r.icon) return false;
      return true;
    });
    if (dupIndex >= 0) {
      if (r.score > kept[dupIndex].score) {
        kept[dupIndex] = r;
      }
    } else {
      kept.push(r);
    }
  }
  return kept;
}

export function stripScore(results: ScoredSuggestion[]): GeocodeSuggestion[] {
  return results.map(({ score: _, ...rest }) => rest);
}

/**
 * サーバーサイドでジオコード検索を実行する（3ソース並列 + 重複除去 + スコアランキング）
 */
export async function geocodeSearchServer(q: string): Promise<GeocodeSuggestion[]> {
  const [gsiResults, nominatimResults, photonResults] = await Promise.all([
    searchGSI(q),
    searchNominatim(q),
    searchPhoton(q),
  ]);

  const merged: ScoredSuggestion[] = [];
  if (hasResults(gsiResults)) merged.push(...gsiResults);
  if (hasResults(nominatimResults)) merged.push(...nominatimResults);
  if (hasResults(photonResults)) merged.push(...photonResults);

  if (merged.length > 0) {
    const deduped = deduplicateResults(merged);
    deduped.sort((a, b) => b.score - a.score);
    return stripScore(deduped).slice(0, 7);
  }

  return [];
}
