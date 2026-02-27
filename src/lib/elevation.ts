/**
 * Open-Meteo Elevation API を使ってルートの累積標高差を算出する
 * https://open-meteo.com/en/docs/elevation-api
 *
 * - 無料・APIキー不要
 * - 1リクエストあたり最大100座標
 * - Copernicus DEM 90m解像度
 */

const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
const MAX_COORDS_PER_REQUEST = 100;

/**
 * ジオメトリから累積標高差(m)を算出する
 * 上り区間のみを合計（サイクリング・バイクの「獲得標高」）
 * 失敗時は 0 を返す（UI をブロックしない）
 */
export async function fetchElevationGain(
  geometry: [number, number][]
): Promise<number> {
  if (geometry.length < 2) return 0;

  try {
    const sampled = sampleGeometry(geometry, MAX_COORDS_PER_REQUEST);
    const elevations = await fetchElevations(sampled);

    let totalGain = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) totalGain += diff;
    }

    return Math.round(totalGain);
  } catch {
    return 0;
  }
}

/** ジオメトリを最大 maxPoints 個に等間隔サンプリング */
function sampleGeometry(
  geometry: [number, number][],
  maxPoints: number
): { lat: number; lng: number }[] {
  if (geometry.length <= maxPoints) {
    return geometry.map(([lng, lat]) => ({ lat, lng }));
  }

  const step = (geometry.length - 1) / (maxPoints - 1);
  const sampled: { lat: number; lng: number }[] = [];

  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.round(i * step), geometry.length - 1);
    sampled.push({ lat: geometry[idx][1], lng: geometry[idx][0] });
  }

  return sampled;
}

/** Open-Meteo Elevation API で標高データを取得（429リトライ付き） */
async function fetchElevations(
  coords: { lat: number; lng: number }[]
): Promise<number[]> {
  const lats = coords.map((c) => c.lat.toFixed(4)).join(',');
  const lngs = coords.map((c) => c.lng.toFixed(4)).join(',');
  const url = `${ELEVATION_API}?latitude=${lats}&longitude=${lngs}`;

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.status !== 429) {
      if (!response.ok) throw new Error(`Elevation API: ${response.status}`);
      const data = await response.json();
      return data.elevation as number[];
    }
    lastStatus = response.status;
  }
  throw new Error(`Elevation API: ${lastStatus}`);
}
