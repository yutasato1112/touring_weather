import { BaseRouteType, RouteInfoWithType, LatLng } from '@/types';
import { fetchWeatherForPoints } from '@/lib/weather';
import { getCongestionInfo } from '@/lib/traffic';

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
 * ルート上から均等に6地点をサンプリングし、渋滞考慮の到着時刻を付与する
 */
export function sampleRoutePoints(
  route: RouteInfoWithType,
  departureTime: string,
  baseRouteType: BaseRouteType
): { position: LatLng; targetTime: string }[] {
  const SAMPLE_COUNT = 6;
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

export interface RainAnalysisResult {
  bestRouteType: BaseRouteType;
  scores: Record<BaseRouteType, number>;
}

/**
 * 全ルートの天気を並列取得し、レインスコアを算出して最良ルートを返す
 */
export async function analyzeRainAvoidance(
  routes: Record<BaseRouteType, RouteInfoWithType | null>,
  departureTime: string
): Promise<RainAnalysisResult> {
  const baseTypes: BaseRouteType[] = ['fastest', 'no_highway', 'scenic'];
  const availableTypes = baseTypes.filter((t) => routes[t] !== null);

  // 各ルートのサンプル地点を準備
  const routeSamples = availableTypes.map((type) => ({
    type,
    points: sampleRoutePoints(routes[type]!, departureTime, type),
  }));

  // 全ルートの天気を並列取得
  const allPoints = routeSamples.flatMap((rs) => rs.points);
  const allWeather = await fetchWeatherForPoints(allPoints);

  // ルートごとにスコアを算出
  const scores: Record<string, number> = {};
  let offset = 0;

  for (const rs of routeSamples) {
    let score = 0;
    for (let i = 0; i < rs.points.length; i++) {
      const weather = allWeather[offset + i];
      if (weather) {
        // 降水確率ベーススコア（0〜1）
        const precipScore = weather.precipitationProbability / 100;
        // WMO天気コードの深刻度重み
        const severity = rainSeverityWeight(weather.weatherCode);
        // 複合スコア: 降水確率 + 深刻度（深刻度を重視）
        score += precipScore * 0.4 + severity * 0.6;
      }
    }
    scores[rs.type] = score;
    offset += rs.points.length;
  }

  // 最もスコアが低い（雨が少ない）ルートを選択
  let bestType = availableTypes[0];
  let bestScore = scores[bestType];
  for (const type of availableTypes) {
    if (scores[type] < bestScore) {
      bestScore = scores[type];
      bestType = type;
    }
  }

  const fullScores: Record<BaseRouteType, number> = {
    fastest: scores['fastest'] ?? Infinity,
    no_highway: scores['no_highway'] ?? Infinity,
    scenic: scores['scenic'] ?? Infinity,
  };

  return { bestRouteType: bestType, scores: fullScores };
}
