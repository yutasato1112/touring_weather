import { LatLng, RouteInfo, RouteInfoWithType, RoutePoint, RouteType, BaseRouteType, MultiRouteResult, Waypoint, CongestionSegment, CongestionLevel, RouteRecommendation } from '@/types';
import { getCongestionInfo, calculateAdjustedDuration, resolveTrafficRouteType } from '@/lib/traffic';

/** ORS POST APIのルート種別設定 */
const ROUTE_TYPE_CONFIG: Record<BaseRouteType, {
  preference: string;
  avoidFeatures?: string[];
}> = {
  fastest: { preference: 'fastest' },
  no_highway: { preference: 'fastest', avoidFeatures: ['highways', 'tollways'] },
  scenic: { preference: 'shortest', avoidFeatures: ['highways', 'tollways'] },
};

/**
 * Encoded polyline をデコードする (ORS POST APIのgeometry形式)
 * Google Encoded Polyline Algorithm Format (2D: lat, lng)
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    // ORS returns [lng, lat] order in its geometry
    points.push([lng / 1e5, lat / 1e5]);
  }

  return points;
}

/**
 * 3D Encoded polyline をデコードする (elevation有効時: lat, lng, alt)
 */
function decodePolyline3D(encoded: string): { coords: [number, number][]; altitudes: number[] } {
  const coords: [number, number][] = [];
  const altitudes: number[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  let alt = 0;

  while (index < encoded.length) {
    // Decode lat
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode lng
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode altitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    alt += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e5, lat / 1e5]);
    altitudes.push(alt / 100); // ORS encodes altitude in centimeters
  }

  return { coords, altitudes };
}

/**
 * 標高データから累積上昇量を計算する
 */
function calculateElevationGain(altitudes: number[]): number {
  let gain = 0;
  for (let i = 1; i < altitudes.length; i++) {
    const diff = altitudes[i] - altitudes[i - 1];
    if (diff > 0) {
      gain += diff;
    }
  }
  return Math.round(gain);
}

/** ORS extras の waycategory 値型 */
interface ORSExtras {
  waycategory?: {
    values: [number, number, number][]; // [startIndex, endIndex, value]
  };
}

/** fetchRoute の戻り値 */
interface FetchRouteResult extends RouteInfoWithType {
  extras?: ORSExtras;
}

/** 高速道路区間の情報 */
interface HighwaySegment {
  /** ジオメトリ上の開始インデックス */
  startIndex: number;
  /** ジオメトリ上の終了インデックス */
  endIndex: number;
  /** 区間の距離 (km) */
  distance: number;
}

/**
 * ORS API を呼び出してルートを取得する内部ヘルパー
 */
async function fetchRoute(
  coordinates: [number, number][],
  routeType: BaseRouteType,
  options?: { extraInfo?: string[] }
): Promise<FetchRouteResult> {
  const config = ROUTE_TYPE_CONFIG[routeType];

  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates,
      preference: config.preference,
      avoidFeatures: config.avoidFeatures,
      elevation: true,
      extraInfo: options?.extraInfo,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `経路の計算に失敗しました (${response.status})`);
  }

  const data = await response.json();
  const route = data.routes[0];

  // We always request elevation, so try 3D decode first with validation fallback
  let geometry: [number, number][];
  let elevationGain: number | undefined;

  const decoded3D = decodePolyline3D(route.geometry);
  const sampleCoords = decoded3D.coords.slice(0, Math.min(5, decoded3D.coords.length));
  const coordsValid = decoded3D.coords.length >= 2 &&
    sampleCoords.every(([lng, lat]) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);

  if (coordsValid) {
    geometry = decoded3D.coords;
    elevationGain = calculateElevationGain(decoded3D.altitudes);
  } else {
    geometry = decodePolyline(route.geometry);
  }

  const result: FetchRouteResult = {
    geometry,
    totalDistance: route.summary.distance / 1000,
    totalDuration: route.summary.duration,
    elevationGain,
    routeType,
  };

  if (route.extras) {
    result.extras = route.extras;
  }

  return result;
}

/** ジオメトリ上の2インデックス間の距離 (km) を計算する */
function geometryDistance(
  geometry: [number, number][],
  fromIndex: number,
  toIndex: number
): number {
  let dist = 0;
  const start = Math.max(0, Math.min(fromIndex, geometry.length - 1));
  const end = Math.max(0, Math.min(toIndex, geometry.length - 1));
  for (let i = start + 1; i <= end; i++) {
    const prev: LatLng = { lat: geometry[i - 1][1], lng: geometry[i - 1][0] };
    const curr: LatLng = { lat: geometry[i][1], lng: geometry[i][0] };
    dist += haversineDistance(prev, curr);
  }
  return dist;
}

/**
 * waycategory extras から高速道路・有料道路区間を検出する
 * waycategory bitmask:
 *   bit 0 (値 1) = Highway (highway=motorway — NEXCO高速道路等)
 *   bit 1 (値 2) = Tollway (toll=yes — 都市高速・有料道路等)
 * 都市高速(首都高・阪神高速等)とNEXCO高速を同一扱いするため両ビットを検査する
 *
 * マージ戦略:
 *   Phase 1: インデックスが隣接する区間をマージ
 *   Phase 2: 間のギャップが GAP_THRESHOLD_KM 未満の区間をマージ
 *            （JCT/IC接続部の短い一般道を吸収 — 常磐道→首都高→東名 等）
 *   Phase 3: 5km 未満の短い区間を IC ランプノイズとして除外
 */
function detectHighwaySegments(
  extras: ORSExtras | undefined,
  geometry: [number, number][]
): HighwaySegment[] {
  if (!extras?.waycategory) return [];

  const values = extras.waycategory.values;
  const HIGHWAY_OR_TOLL = 3; // bit 0 | bit 1
  const GAP_THRESHOLD_KM = 20; // JCT/IC接続部とみなす最大ギャップ（首都高等の都市高速ネットワークを考慮）
  const MIN_SEGMENT_KM = 5;    // ノイズ除外の最小区間距離

  // highway または tollway の区間を抽出
  const rawSegments: { startIndex: number; endIndex: number }[] = [];
  for (const [start, end, value] of values) {
    if (value & HIGHWAY_OR_TOLL) {
      rawSegments.push({ startIndex: start, endIndex: end });
    }
  }

  if (rawSegments.length === 0) return [];

  // Phase 1: インデックスが隣接する区間をマージ
  const adjacentMerged: { startIndex: number; endIndex: number }[] = [{ ...rawSegments[0] }];
  for (let i = 1; i < rawSegments.length; i++) {
    const last = adjacentMerged[adjacentMerged.length - 1];
    if (rawSegments[i].startIndex <= last.endIndex + 1) {
      last.endIndex = Math.max(last.endIndex, rawSegments[i].endIndex);
    } else {
      adjacentMerged.push({ ...rawSegments[i] });
    }
  }

  // Phase 2: 短いギャップ（JCT/IC接続部）で分断された区間をマージ
  // 例: 常磐道 →(JCT 2km)→ 首都高 →(IC 1km)→ 東名 → 1つの連続高速区間
  const gapMerged: { startIndex: number; endIndex: number }[] = [{ ...adjacentMerged[0] }];
  for (let i = 1; i < adjacentMerged.length; i++) {
    const last = gapMerged[gapMerged.length - 1];
    const gapDist = geometryDistance(geometry, last.endIndex, adjacentMerged[i].startIndex);
    if (gapDist < GAP_THRESHOLD_KM) {
      last.endIndex = adjacentMerged[i].endIndex;
    } else {
      gapMerged.push({ ...adjacentMerged[i] });
    }
  }

  // Phase 3: 各区間の距離を計算し、短い区間を除外
  const segments: HighwaySegment[] = [];
  for (const seg of gapMerged) {
    const startIdx = Math.min(seg.startIndex, geometry.length - 1);
    const endIdx = Math.min(seg.endIndex, geometry.length - 1);
    const distance = geometryDistance(geometry, startIdx, endIdx);
    if (distance >= MIN_SEGMENT_KM) {
      segments.push({ startIndex: startIdx, endIndex: endIdx, distance });
    }
  }

  return segments;
}

/**
 * 複数の leg ルートを1つに結合する
 * 隣接 leg 間の重複始点を除去してジオメトリを結合
 */
function stitchRoutes(legs: FetchRouteResult[]): RouteInfoWithType {
  const geometry: [number, number][] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalElevationGain = 0;
  let hasElevation = false;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    // 2番目以降の leg は最初の点をスキップ（前の leg の終点と重複するため）
    const startIdx = i === 0 ? 0 : 1;
    for (let j = startIdx; j < leg.geometry.length; j++) {
      geometry.push(leg.geometry[j]);
    }
    totalDistance += leg.totalDistance;
    totalDuration += leg.totalDuration;
    if (leg.elevationGain !== undefined) {
      totalElevationGain += leg.elevationGain;
      hasElevation = true;
    }
  }

  return {
    geometry,
    totalDistance,
    totalDuration,
    elevationGain: hasElevation ? totalElevationGain : undefined,
    routeType: 'fastest',
  };
}

/**
 * 最速ルートで高速道路1回乗車制約を適用する
 *
 * 方針: 「最初の高速入口 〜 最後の高速出口」を1つの高速コリドーとして扱い、
 * その前後だけ一般道で再ルーティングする。
 * コリドー内部は fastest で自由にルーティング（複数路線の乗り継ぎ OK）。
 *
 * 例: つくば →(一般道)→ 常磐道IC →(fastest: 常磐道→首都高→東名)→ 東名IC →(一般道)→ 岐阜
 *
 * 1. fastest + waycategory で初回ルート取得
 * 2. 高速区間が0個 → そのまま返す
 * 3. 高速区間が1個以上 → 最初の入口/最後の出口で3区間再ルーティング
 */
async function calculateFastestSingleHighway(
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[]
): Promise<RouteInfoWithType> {
  const coordinates: [number, number][] = [
    [origin.lng, origin.lat],
    ...waypoints.map((wp) => [wp.position.lng, wp.position.lat] as [number, number]),
    [destination.lng, destination.lat],
  ];

  // Step 1: fastest ルートを waycategory 付きで取得
  const initialRoute = await fetchRoute(coordinates, 'fastest', {
    extraInfo: ['waycategory'],
  });

  // Step 2: 高速区間を検出
  const hwSegments = detectHighwaySegments(initialRoute.extras, initialRoute.geometry);

  // 高速区間が0個 → 一般道のみのルート、そのまま返す
  // 高速区間が1個 → 既に1回乗車、そのまま返す
  if (hwSegments.length <= 1) {
    return {
      geometry: initialRoute.geometry,
      totalDistance: initialRoute.totalDistance,
      totalDuration: initialRoute.totalDuration,
      elevationGain: initialRoute.elevationGain,
      routeType: 'fastest',
    };
  }

  // Step 3: 高速コリドー = 最初の入口 〜 最後の出口
  const firstSegment = hwSegments[0];
  const lastSegment = hwSegments[hwSegments.length - 1];

  const entryCoord = initialRoute.geometry[firstSegment.startIndex];
  const exitCoord = initialRoute.geometry[lastSegment.endIndex];
  const entryLatLng: LatLng = { lat: entryCoord[1], lng: entryCoord[0] };
  const exitLatLng: LatLng = { lat: exitCoord[1], lng: exitCoord[0] };

  // ユーザー経由地を高速入口前/出口後に振り分け
  const waypointsBefore: [number, number][] = [];
  const waypointsAfter: [number, number][] = [];
  for (const wp of waypoints) {
    const distToEntry = haversineDistance(wp.position, entryLatLng);
    const distToExit = haversineDistance(wp.position, exitLatLng);
    const coord: [number, number] = [wp.position.lng, wp.position.lat];
    if (distToEntry <= distToExit) {
      waypointsBefore.push(coord);
    } else {
      waypointsAfter.push(coord);
    }
  }

  try {
    // Step 4: 3 leg を並列計算
    const [leg1, leg2, leg3] = await Promise.all([
      // Leg 1: 出発地 → 最初の高速入口（一般道のみ）
      fetchRoute(
        [[origin.lng, origin.lat], ...waypointsBefore, [entryCoord[0], entryCoord[1]]],
        'no_highway'
      ),
      // Leg 2: 最初の高速入口 → 最後の高速出口（fastest — コリドー内は自由）
      fetchRoute(
        [[entryCoord[0], entryCoord[1]], [exitCoord[0], exitCoord[1]]],
        'fastest'
      ),
      // Leg 3: 最後の高速出口 → 目的地（一般道のみ）
      fetchRoute(
        [[exitCoord[0], exitCoord[1]], ...waypointsAfter, [destination.lng, destination.lat]],
        'no_highway'
      ),
    ]);

    // Step 5: 結合して返す
    return stitchRoutes([leg1, leg2, leg3]);
  } catch {
    // 再ルーティング失敗時は元ルートにフォールバック
    return {
      geometry: initialRoute.geometry,
      totalDistance: initialRoute.totalDistance,
      totalDuration: initialRoute.totalDuration,
      elevationGain: initialRoute.elevationGain,
      routeType: 'fastest',
    };
  }
}

/**
 * サーバーサイドAPI経由で経路を計算する (POST API)
 */
export async function calculateRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[] = [],
  routeType: BaseRouteType = 'fastest'
): Promise<RouteInfoWithType> {
  // fastest の場合は高速1回乗車制約を適用
  if (routeType === 'fastest') {
    return calculateFastestSingleHighway(origin, destination, waypoints);
  }

  const coordinates: [number, number][] = [
    [origin.lng, origin.lat],
    ...waypoints.map((wp) => [wp.position.lng, wp.position.lat] as [number, number]),
    [destination.lng, destination.lat],
  ];

  return fetchRoute(coordinates, routeType);
}

/**
 * 3種類のルートを並列で計算する
 */
export async function calculateMultiRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[] = []
): Promise<MultiRouteResult> {
  const routeTypes: BaseRouteType[] = ['fastest', 'no_highway', 'scenic'];

  const results = await Promise.allSettled(
    routeTypes.map((type) => calculateRoute(origin, destination, waypoints, type))
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
