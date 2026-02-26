import { LatLng, RouteInfo, RouteInfoWithType, RoutePoint, RouteType, BaseRouteType, MultiRouteResult, Waypoint, CongestionSegment, CongestionLevel, RouteRecommendation, AvoidArea } from '@/types';
import { getCongestionInfo, calculateAdjustedDuration } from '@/lib/traffic';
import { generateCirclePolygon } from '@/lib/routePreference';

/** Valhalla ルート種別設定 */
const VALHALLA_ROUTE_CONFIG: Record<BaseRouteType, {
  useHighways: number;
  useTolls: number;
  shortest?: boolean;
}> = {
  fastest: { useHighways: 1, useTolls: 1 },
  no_highway: { useHighways: 0, useTolls: 0 },
  scenic: { useHighways: 0, useTolls: 0, shortest: true },
};

/**
 * Valhalla (FOSSGIS公開サーバー) で経路を取得する
 *
 * 全ルート種別に対応:
 * - fastest: use_highways=1, use_tolls=1（NEXCO高速を自然に優先）
 * - no_highway: use_highways=0, use_tolls=0（一般道のみ）
 * - scenic: use_highways=0, use_tolls=0, shortest=true（最短距離＝ワインディング向き）
 */
async function fetchValhallaRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[],
  routeType: BaseRouteType,
  avoidPolygons?: [number, number][][]
): Promise<RouteInfoWithType> {
  const config = VALHALLA_ROUTE_CONFIG[routeType];

  const response = await fetch('/api/valhalla-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      waypoints: waypoints.map((wp) => ({ lat: wp.position.lat, lng: wp.position.lng })),
      useHighways: config.useHighways,
      useTolls: config.useTolls,
      ...(config.shortest && { shortest: true }),
      ...(avoidPolygons && avoidPolygons.length > 0 && { excludePolygons: avoidPolygons }),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `経路の計算に失敗しました (${response.status})`);
  }

  const data = await response.json();

  return {
    geometry: data.geometry,           // [lng, lat][]
    totalDistance: data.totalDistance,   // km
    totalDuration: data.totalDuration,  // seconds
    routeType,
  };
}

/**
 * サーバーサイドAPI経由で経路を計算する（全ルート種別 Valhalla 使用）
 */
export async function calculateRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[] = [],
  routeType: BaseRouteType = 'fastest',
  avoidAreas: AvoidArea[] = []
): Promise<RouteInfoWithType> {
  // AvoidArea → ポリゴン座標に変換
  const avoidPolygons = avoidAreas.length > 0
    ? avoidAreas.map((a) => generateCirclePolygon(a.center, a.radiusKm))
    : undefined;

  return fetchValhallaRoute(origin, destination, waypoints, routeType, avoidPolygons);
}

/**
 * 3種類のルートを並列で計算する
 */
export async function calculateMultiRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[] = [],
  avoidAreas: AvoidArea[] = []
): Promise<MultiRouteResult> {
  const routeTypes: BaseRouteType[] = ['fastest', 'no_highway', 'scenic'];

  const results = await Promise.allSettled(
    routeTypes.map((type) => calculateRoute(origin, destination, waypoints, type, avoidAreas))
  );

  const multiRoute: MultiRouteResult = {
    fastest: null,
    no_highway: null,
    scenic: null,
    rain_avoid: null,
  };

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      multiRoute[routeTypes[index]] = result.value;
    }
  });

  return multiRoute;
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

export function extractRoutePoints(
  geometry: [number, number][],
  totalDistance: number,
  totalDuration: number,
  departureTime: string,
  intervalKm: number = 15,
  routeType: RouteType = 'fastest'
): RoutePoint[] {
  const points: RoutePoint[] = [];
  const departure = new Date(departureTime);

  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    const prev: LatLng = { lat: geometry[i - 1][1], lng: geometry[i - 1][0] };
    const curr: LatLng = { lat: geometry[i][1], lng: geometry[i][0] };
    cumulativeDistances.push(cumulativeDistances[i - 1] + haversineDistance(prev, curr));
  }

  const totalCalcDistance = cumulativeDistances[cumulativeDistances.length - 1];

  // 出発地点の渋滞レベルを取得
  const startCongestion = getCongestionInfo(departure, routeType);
  points.push({
    position: { lat: geometry[0][1], lng: geometry[0][0] },
    distanceFromStart: 0,
    estimatedArrival: departure.toISOString(),
    congestionLevel: startCongestion.level,
  });

  // セグメントごと逐次計算: 前のポイントの到着時刻から次のポイントの所要時間を計算
  let lastArrivalTime = departure;
  let lastDistanceRatio = 0;
  let nextTargetDistance = intervalKm;

  for (let i = 1; i < geometry.length && nextTargetDistance < totalCalcDistance; i++) {
    if (cumulativeDistances[i] >= nextTargetDistance) {
      const prevDist = cumulativeDistances[i - 1];
      const currDist = cumulativeDistances[i];
      const ratio = (nextTargetDistance - prevDist) / (currDist - prevDist);

      const lat = geometry[i - 1][1] + ratio * (geometry[i][1] - geometry[i - 1][1]);
      const lng = geometry[i - 1][0] + ratio * (geometry[i][0] - geometry[i - 1][0]);

      // このセグメントのベース所要時間を距離比率から算出
      const currentDistanceRatio = nextTargetDistance / totalCalcDistance;
      const segmentBaseSeconds = (currentDistanceRatio - lastDistanceRatio) * totalDuration;

      // セグメントの出発時刻（前ポイントの到着時刻）での渋滞倍率を適用
      const congestion = getCongestionInfo(lastArrivalTime, routeType);
      const segmentAdjustedSeconds = segmentBaseSeconds * congestion.multiplier;
      const arrival = new Date(lastArrivalTime.getTime() + segmentAdjustedSeconds * 1000);

      // 到着地点での渋滞レベルを取得（表示用）
      const arrivalCongestion = getCongestionInfo(arrival, routeType);

      points.push({
        position: { lat, lng },
        distanceFromStart: nextTargetDistance,
        estimatedArrival: arrival.toISOString(),
        congestionLevel: arrivalCongestion.level,
      });

      lastArrivalTime = arrival;
      lastDistanceRatio = currentDistanceRatio;
      nextTargetDistance += intervalKm;
    }
  }

  // 終点: 最後のポイントから終点までのセグメントにも渋滞倍率を適用
  const lastCoord = geometry[geometry.length - 1];
  const remainingBaseSeconds = (1 - lastDistanceRatio) * totalDuration;
  const endCongestion = getCongestionInfo(lastArrivalTime, routeType);
  const remainingAdjustedSeconds = remainingBaseSeconds * endCongestion.multiplier;
  const endArrival = new Date(lastArrivalTime.getTime() + remainingAdjustedSeconds * 1000);

  const endArrivalCongestion = getCongestionInfo(endArrival, routeType);
  points.push({
    position: { lat: lastCoord[1], lng: lastCoord[0] },
    distanceFromStart: totalDistance,
    estimatedArrival: endArrival.toISOString(),
    congestionLevel: endArrivalCongestion.level,
  });

  return points;
}

/**
 * ルート情報に渋滞予測の所要時間を付与する
 */
export function attachTrafficEstimate(
  route: RouteInfoWithType,
  departureTime: string
): RouteInfoWithType {
  const departure = new Date(departureTime);
  const effectiveType = route.baseRouteType ?? route.routeType;
  const adjustedDuration = calculateAdjustedDuration(
    route.totalDuration,
    departure,
    effectiveType
  );
  return { ...route, adjustedDuration };
}

/**
 * 選択中ルートのジオメトリから渋滞区間セグメントを生成する
 *
 * ジオメトリを細かいセグメントに分割し、各セグメント通過時点の渋滞レベルで色分けする。
 * 同じ渋滞レベルの連続セグメントは1つにまとめる。
 */
export function computeCongestionSegments(
  geometry: [number, number][],
  totalDuration: number,
  departureTime: string,
  routeType: RouteType
): CongestionSegment[] {
  if (geometry.length < 2) return [];

  const departure = new Date(departureTime);

  // 累積距離を計算
  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    const prev: LatLng = { lat: geometry[i - 1][1], lng: geometry[i - 1][0] };
    const curr: LatLng = { lat: geometry[i][1], lng: geometry[i][0] };
    cumulativeDistances.push(cumulativeDistances[i - 1] + haversineDistance(prev, curr));
  }
  const totalCalcDistance = cumulativeDistances[cumulativeDistances.length - 1];
  if (totalCalcDistance === 0) return [];

  // 各ジオメトリポイントの渋滞レベルを逐次計算
  const pointLevels: CongestionLevel[] = [];
  let currentTime = new Date(departure.getTime());
  let lastDistRatio = 0;

  for (let i = 0; i < geometry.length; i++) {
    const distRatio = cumulativeDistances[i] / totalCalcDistance;

    if (i > 0) {
      const segmentBaseSeconds = (distRatio - lastDistRatio) * totalDuration;
      const congestion = getCongestionInfo(currentTime, routeType);
      const segmentAdjustedSeconds = segmentBaseSeconds * congestion.multiplier;
      currentTime = new Date(currentTime.getTime() + segmentAdjustedSeconds * 1000);
    }

    const congestion = getCongestionInfo(currentTime, routeType);
    pointLevels.push(congestion.level);
    lastDistRatio = distRatio;
  }

  // 連続する同一レベルのポイントをセグメントにまとめる
  const segments: CongestionSegment[] = [];
  let currentLevel = pointLevels[0];
  let currentPositions: [number, number][] = [[geometry[0][1], geometry[0][0]]];

  for (let i = 1; i < geometry.length; i++) {
    const level = pointLevels[i];
    const latLng: [number, number] = [geometry[i][1], geometry[i][0]];

    if (level !== currentLevel) {
      // レベルが変わった: 境界点を共有して新セグメント開始
      currentPositions.push(latLng);
      segments.push({ positions: currentPositions, level: currentLevel });
      currentLevel = level;
      currentPositions = [latLng];
    } else {
      currentPositions.push(latLng);
    }
  }

  // 最後のセグメント
  if (currentPositions.length >= 2) {
    segments.push({ positions: currentPositions, level: currentLevel });
  }

  return segments;
}

/**
 * 渋滞考慮後の所要時間でルート推薦を算出する
 */
export function computeRouteRecommendation(multiRoute: MultiRouteResult): RouteRecommendation {
  const getDuration = (route: RouteInfoWithType | null): number | null => {
    if (!route) return null;
    return route.adjustedDuration ?? route.totalDuration;
  };

  // 全体で最速のルートを決定
  const allTypes: BaseRouteType[] = ['fastest', 'no_highway', 'scenic'];
  let fastestType: BaseRouteType = 'fastest';
  let fastestDuration = Infinity;

  for (const type of allTypes) {
    const d = getDuration(multiRoute[type]);
    if (d !== null && d < fastestDuration) {
      fastestDuration = d;
      fastestType = type;
    }
  }

  // 一般道系（no_highway, scenic）で最速のルートを決定
  const nonHighwayTypes: BaseRouteType[] = ['no_highway', 'scenic'];
  let noHighwayType: BaseRouteType = 'no_highway';
  let noHighwayDuration = Infinity;

  for (const type of nonHighwayTypes) {
    const d = getDuration(multiRoute[type]);
    if (d !== null && d < noHighwayDuration) {
      noHighwayDuration = d;
      noHighwayType = type;
    }
  }

  return {
    fastest: fastestType,
    no_highway: noHighwayType,
  };
}

/**
 * タブ種別から実際に表示するルートを解決する
 */
export function resolveTabRoute(
  tabType: RouteType,
  multiRoute: MultiRouteResult,
  recommendation: RouteRecommendation
): RouteInfoWithType | null {
  switch (tabType) {
    case 'fastest':
      return multiRoute[recommendation.fastest];
    case 'no_highway':
      return multiRoute[recommendation.no_highway];
    case 'scenic':
      return multiRoute.scenic;
    case 'rain_avoid':
      return multiRoute.rain_avoid;
  }
}
