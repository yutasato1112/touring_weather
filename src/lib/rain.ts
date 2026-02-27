import { BaseRouteType, RouteInfoWithType, LatLng, Waypoint, AvoidArea } from '@/types';
import { fetchWeatherForPoints } from '@/lib/weather';
import { getCongestionInfo } from '@/lib/traffic';
import { calculateRoute } from '@/lib/route';
import { generateCirclePolygon } from '@/lib/routePreference';

/**
 * WMO天気コードの雨深刻度重み（0〜2.0）
 * 高いほど深刻な降水
 */
export function rainSeverityWeight(weatherCode: number): number {
  // 晴れ・曇り系: 0
  if (weatherCode <= 3) return 0;
  // 霧系: 軽微
  if (weatherCode <= 48) return 0.1;
  // 霧雨系
  if (weatherCode === 51) return 0.3;
  if (weatherCode === 53) return 0.5;
  if (weatherCode === 55) return 0.7;
  // 雨系
  if (weatherCode === 61) return 0.6;
  if (weatherCode === 63) return 1.0;
  if (weatherCode === 65) return 1.5;
  // 雪系
  if (weatherCode === 71) return 0.5;
  if (weatherCode === 73) return 0.8;
  if (weatherCode === 75) return 1.2;
  if (weatherCode === 77) return 0.4;
  // にわか雨系
  if (weatherCode === 80) return 0.7;
  if (weatherCode === 81) return 1.2;
  if (weatherCode === 82) return 1.8;
  // にわか雪系
  if (weatherCode === 85) return 0.6;
  if (weatherCode === 86) return 1.3;
  // 雷雨系
  if (weatherCode === 95) return 1.5;
  if (weatherCode === 96) return 1.8;
  if (weatherCode === 99) return 2.0;
  return 0;
}

/**
 * ルート上から均等にサンプリングし、渋滞考慮の到着時刻を付与する
 */
export function sampleRoutePoints(
  route: RouteInfoWithType,
  departureTime: string,
  baseRouteType: BaseRouteType,
  sampleCount: number = 6
): { position: LatLng; targetTime: string }[] {
  const SAMPLE_COUNT = sampleCount;
  const geometry = route.geometry;
  if (geometry.length < 2) return [];

  const departure = new Date(departureTime);

  // 累積距離を計算
  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    const prev = { lat: geometry[i - 1][1], lng: geometry[i - 1][0] };
    const curr = { lat: geometry[i][1], lng: geometry[i][0] };
    const R = 6371;
    const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
    const dLng = ((curr.lng - prev.lng) * Math.PI) / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const a =
      sinDLat * sinDLat +
      Math.cos((prev.lat * Math.PI) / 180) *
        Math.cos((curr.lat * Math.PI) / 180) *
        sinDLng * sinDLng;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    cumulativeDistances.push(cumulativeDistances[i - 1] + dist);
  }

  const totalCalcDistance = cumulativeDistances[cumulativeDistances.length - 1];
  if (totalCalcDistance === 0) return [];

  const points: { position: LatLng; targetTime: string }[] = [];

  for (let s = 0; s < SAMPLE_COUNT; s++) {
    // 均等配分: 0%, 20%, 40%, 60%, 80%, 100% 付近
    const targetDist = (s / (SAMPLE_COUNT - 1)) * totalCalcDistance;

    // ジオメトリ上の最も近い点を見つける
    let geoIdx = 0;
    for (let i = 1; i < cumulativeDistances.length; i++) {
      if (cumulativeDistances[i] >= targetDist) {
        geoIdx = i;
        break;
      }
      if (i === cumulativeDistances.length - 1) {
        geoIdx = i;
      }
    }

    // 補間
    const prevDist = cumulativeDistances[geoIdx - 1] ?? 0;
    const currDist = cumulativeDistances[geoIdx];
    const segLen = currDist - prevDist;
    const ratio = segLen > 0 ? (targetDist - prevDist) / segLen : 0;

    const lat =
      geometry[geoIdx - 1][1] + ratio * (geometry[geoIdx][1] - geometry[geoIdx - 1][1]);
    const lng =
      geometry[geoIdx - 1][0] + ratio * (geometry[geoIdx][0] - geometry[geoIdx - 1][0]);

    // 渋滞考慮の到着時刻を計算（セグメント逐次計算を簡略化）
    const distRatio = targetDist / totalCalcDistance;
    // 簡易計算: 距離比率分のベース所要時間に渋滞倍率を適用
    const baseSeconds = distRatio * route.totalDuration;
    const midTime = new Date(departure.getTime() + (baseSeconds / 2) * 1000);
    const congestion = getCongestionInfo(midTime, baseRouteType);
    const adjustedSeconds = baseSeconds * congestion.multiplier;
    const arrivalTime = new Date(departure.getTime() + adjustedSeconds * 1000);

    points.push({
      position: { lat, lng },
      targetTime: arrivalTime.toISOString(),
    });
  }

  return points;
}

const RAIN_SAMPLE_COUNT = 20;
const RAIN_SCORE_THRESHOLD = 0.3;
const RAIN_AVOID_RADIUS_KM = 15;

/**
 * 最速ルートをベースに、雨区間を回避するリルートを生成する
 *
 * 1. 最速ルート上を20点サンプリングし天気を取得
 * 2. 雨スコアが閾値を超える地点をクラスタリング
 * 3. 各クラスタの重心に回避ポリゴン（半径15km）を生成
 * 4. Valhalla で回避ポリゴン付きの再ルーティング
 * 5. 雨なし → 最速ルートコピー / Valhalla失敗 → 最速ルートコピー
 */
export async function generateRainAvoidRoute(
  fastestRoute: RouteInfoWithType,
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[],
  existingAvoidAreas: AvoidArea[],
  departureTime: string
): Promise<RouteInfoWithType> {
  // 1. 最速ルート上を20点サンプリングし天気を取得
  const samplePoints = sampleRoutePoints(fastestRoute, departureTime, 'fastest', RAIN_SAMPLE_COUNT);
  if (samplePoints.length === 0) {
    return { ...fastestRoute, routeType: 'rain_avoid', baseRouteType: 'fastest' };
  }

  const weatherResults = await fetchWeatherForPoints(samplePoints);

  // 2. 各地点の雨スコアを算出し、閾値超えの地点をマーク
  const rainIndices: number[] = [];
  for (let i = 0; i < samplePoints.length; i++) {
    const weather = weatherResults[i];
    if (weather) {
      const precipScore = weather.precipitationProbability / 100;
      const severity = rainSeverityWeight(weather.weatherCode);
      const score = precipScore * 0.4 + severity * 0.6;
      if (score > RAIN_SCORE_THRESHOLD) {
        rainIndices.push(i);
      }
    }
  }

  // 雨なし → 最速ルートをそのままコピー
  if (rainIndices.length === 0) {
    return { ...fastestRoute, routeType: 'rain_avoid', baseRouteType: 'fastest' };
  }

  // 3. 隣接する雨地点をクラスタにまとめる
  const clusters: number[][] = [];
  let currentCluster: number[] = [rainIndices[0]];

  for (let i = 1; i < rainIndices.length; i++) {
    if (rainIndices[i] - rainIndices[i - 1] <= 1) {
      currentCluster.push(rainIndices[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [rainIndices[i]];
    }
  }
  clusters.push(currentCluster);

  // 4. 各クラスタの重心座標に回避ポリゴンを生成
  const rainAvoidAreas: AvoidArea[] = clusters.map((cluster) => {
    let sumLat = 0;
    let sumLng = 0;
    for (const idx of cluster) {
      sumLat += samplePoints[idx].position.lat;
      sumLng += samplePoints[idx].position.lng;
    }
    return {
      center: { lat: sumLat / cluster.length, lng: sumLng / cluster.length },
      radiusKm: RAIN_AVOID_RADIUS_KM,
      label: '雨回避',
    };
  });

  // 既存の回避エリアとマージ
  const mergedAvoidAreas = [...existingAvoidAreas, ...rainAvoidAreas];

  // 5. Valhalla で再ルーティング
  try {
    const rerouted = await calculateRoute(origin, destination, waypoints, 'fastest', mergedAvoidAreas);
    return { ...rerouted, routeType: 'rain_avoid', baseRouteType: 'fastest' };
  } catch {
    // Valhalla失敗 → 最速ルートにフォールバック
    return { ...fastestRoute, routeType: 'rain_avoid', baseRouteType: 'fastest' };
  }
}
