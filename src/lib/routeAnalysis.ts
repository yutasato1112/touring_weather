/**
 * ルートジオメトリからカーブ度（くねくね度）を算出する
 */

interface LatLng {
  lat: number;
  lng: number;
}

function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function bearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * ジオメトリ座標列からカーブ度スコア (deg/km) を算出する
 *
 * アルゴリズム:
 * 1. 500m間隔でサンプリング（ポリラインのノイズを除去）
 * 2. 各サンプル間のベアリング(方位角)を計算
 * 3. 連続ベアリングの変化量を合計
 * 4. 総距離で割って deg/km を算出
 *
 * 目安: 0-3 直線的 / 3-8 ゆるやか / 8-18 ワインディング / 18+ 峠道
 */
export function calculateCurvatureScore(geometry: [number, number][]): number {
  if (geometry.length < 3) return 0;

  const SAMPLE_INTERVAL_KM = 0.5;

  // 等間隔サンプリング
  const sampled: LatLng[] = [];
  let accDist = 0;
  sampled.push({ lat: geometry[0][1], lng: geometry[0][0] });

  for (let i = 1; i < geometry.length; i++) {
    const prev = { lat: geometry[i - 1][1], lng: geometry[i - 1][0] };
    const curr = { lat: geometry[i][1], lng: geometry[i][0] };
    accDist += haversineDistance(prev, curr);

    if (accDist >= SAMPLE_INTERVAL_KM) {
      sampled.push(curr);
      accDist = 0;
    }
  }

  if (sampled.length < 3) return 0;

  // ベアリング変化量の合計
  let totalBearingChange = 0;
  let totalDistance = 0;

  for (let i = 1; i < sampled.length - 1; i++) {
    const bearingIn = bearing(sampled[i - 1], sampled[i]);
    const bearingOut = bearing(sampled[i], sampled[i + 1]);
    let delta = Math.abs(bearingOut - bearingIn);
    if (delta > 180) delta = 360 - delta;
    totalBearingChange += delta;
    totalDistance += haversineDistance(sampled[i - 1], sampled[i]);
  }
  totalDistance += haversineDistance(
    sampled[sampled.length - 2],
    sampled[sampled.length - 1]
  );

  if (totalDistance === 0) return 0;

  return totalBearingChange / totalDistance;
}

export type CurvatureRating = 'straight' | 'gentle' | 'curvy' | 'very_curvy';

export function getCurvatureRating(score: number): {
  rating: CurvatureRating;
  label: string;
} {
  if (score < 3) return { rating: 'straight', label: '直線的' };
  if (score < 8) return { rating: 'gentle', label: 'ゆるやかカーブ' };
  if (score < 18) return { rating: 'curvy', label: 'ワインディング' };
  return { rating: 'very_curvy', label: '峠道' };
}
