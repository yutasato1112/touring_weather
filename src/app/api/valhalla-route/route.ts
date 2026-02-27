import { NextRequest, NextResponse } from 'next/server';
import { calculateCurvatureScore } from '@/lib/routeAnalysis';

interface ValhallaRouteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  costing?: string;      // 'auto' | 'motorcycle'
  useHighways?: number;  // 0.0 - 1.0
  useTolls?: number;     // 0.0 - 1.0
  useTrails?: number;    // 0.0 - 1.0 (motorcycle only)
  shortest?: boolean;    // true で最短距離ルート
  alternates?: number;   // 代替ルート数（カーブ度で最良を選択）
  excludePolygons?: [number, number][][]; // [lng, lat][][] 回避ポリゴン
}

/**
 * Valhalla (FOSSGIS公開サーバー) 経路計算プロキシ
 *
 * - 完全無料・APIキー不要
 * - OSM データベースによる正確なルーティング
 * - NEXCO高速道路を自然に優先（都市高速より高い制限速度を正しく反映）
 * - Encoded polyline (precision 6) → [lng, lat][] に変換
 * - ワインディング(scenic): 2戦略×alternatesでカーブ度最高のルートを自動選択
 */

const VALHALLA_ENDPOINT = 'https://valhalla1.openstreetmap.de/route';

type RouteCandidate = {
  geometry: [number, number][];
  totalDistance: number;
  totalDuration: number;
};

/**
 * Valhalla encoded polyline (precision 6) をデコードする
 * デコード結果は [lat, lng] → [lng, lat] に変換して返す（ORS互換形式）
 */
function decodePolyline6(encoded: string): [number, number][] {
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

    points.push([lng / 1e6, lat / 1e6]);
  }

  return points;
}

/** 429リトライ付きでValhalla APIにリクエスト */
async function fetchWithRetry(
  valhallaBody: Record<string, unknown>
): Promise<Response & { ok: boolean; status: number }> {
  const requestBody = JSON.stringify(valhallaBody);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    const response = await fetch(VALHALLA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TouringWeather/1.0',
      },
      body: requestBody,
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429 && attempt < 2) continue;
    return response;
  }

  throw new Error('Unexpected retry exhaustion');
}

/** Valhalla trip オブジェクトからルート情報を抽出する */
function extractRouteFromTrip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trip: any
): RouteCandidate | null {
  if (!trip?.legs?.length) return null;

  const geometry: [number, number][] = [];
  for (let i = 0; i < trip.legs.length; i++) {
    const legPoints = decodePolyline6(trip.legs[i].shape);
    for (let j = 0; j < legPoints.length; j++) {
      if (i > 0 && j === 0) continue;
      geometry.push(legPoints[j]);
    }
  }

  return {
    geometry,
    totalDistance: trip.summary.length,
    totalDuration: trip.summary.time,
  };
}

/** Valhallaレスポンスから全ルート候補（primary + alternates）を抽出する */
async function extractCandidates(response: Response): Promise<RouteCandidate[]> {
  if (!response.ok) return [];

  const data = await response.json();
  const candidates: RouteCandidate[] = [];

  const primary = extractRouteFromTrip(data.trip);
  if (primary) candidates.push(primary);

  if (Array.isArray(data.alternates)) {
    for (const alt of data.alternates) {
      const route = extractRouteFromTrip(alt.trip);
      if (route) candidates.push(route);
    }
  }

  return candidates;
}

/** 候補リストからカーブ度が最も高いルートを選択する */
function pickCurviest(candidates: RouteCandidate[]): RouteCandidate {
  let best = candidates[0];
  let bestScore = calculateCurvatureScore(best.geometry);

  for (let i = 1; i < candidates.length; i++) {
    const score = calculateCurvatureScore(candidates[i].geometry);
    if (score > bestScore) {
      bestScore = score;
      best = candidates[i];
    }
  }

  return best;
}

/** 通常ルート（fastest / no_highway）のレスポンスハンドラ */
async function handleStandardResponse(response: Response): Promise<NextResponse> {
  if (response.status === 429) {
    return NextResponse.json({ error: 'Valhalla rate limited' }, { status: 502 });
  }
  if (!response.ok) {
    return NextResponse.json({ error: `Valhalla API error: ${response.status}` }, { status: 502 });
  }

  const data = await response.json();
  const route = extractRouteFromTrip(data.trip);
  if (!route) {
    return NextResponse.json({ error: 'No route found' }, { status: 404 });
  }

  return NextResponse.json(route);
}

/** 2点間のhaversine距離 (km) */
function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * 長距離ルート向け: origin→destination の中間地点を垂直にオフセットした経由地を生成する
 *
 * 平野部の国道を直進する一般道ルートと差別化するため、
 * 中間地点を左右にオフセットして山間部・峠道を通る迂回ルートを探索する。
 * 300km超では1/3・2/3地点にも追加のオフセット経由地を生成。
 *
 * @returns 経由地セットの配列（各セットは1～2個のオフセット経由地）。短距離なら空配列。
 */
function generateDetourWaypoints(
  origin: { lat: number; lon: number },
  dest: { lat: number; lon: number }
): { lat: number; lon: number }[][] {
  const distKm = haversineKm(origin, dest);
  if (distKm < 80) return [];

  // オフセット量: 距離に応じてスケール（80km→10km、300km+→30km上限）
  const offsetKm = Math.min(Math.max(distKm * 0.1, 10), 30);

  // origin→destination の方位角
  const dLon = (dest.lon - origin.lon) * Math.PI / 180;
  const lat1 = origin.lat * Math.PI / 180;
  const lat2 = dest.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);

  // 垂直方向のオフセット（度換算）
  const perpLeft = bearing + Math.PI / 2;
  const perpRight = bearing - Math.PI / 2;
  const latPerKm = 1 / 111;

  function offsetPoint(
    baseLat: number, baseLon: number, perpAngle: number, km: number
  ): { lat: number; lon: number } {
    const lonPerKm = 1 / (111 * Math.cos(baseLat * Math.PI / 180));
    return {
      lat: baseLat + km * Math.cos(perpAngle) * latPerKm,
      lon: baseLon + km * Math.sin(perpAngle) * lonPerKm,
    };
  }

  const midLat = (origin.lat + dest.lat) / 2;
  const midLon = (origin.lon + dest.lon) / 2;

  const results: { lat: number; lon: number }[][] = [
    [offsetPoint(midLat, midLon, perpLeft, offsetKm)],
    [offsetPoint(midLat, midLon, perpRight, offsetKm)],
  ];

  // 300km超: 1/3・2/3地点にもオフセットを追加（ジグザグ迂回）
  if (distKm > 300) {
    const thirdLat = origin.lat + (dest.lat - origin.lat) / 3;
    const thirdLon = origin.lon + (dest.lon - origin.lon) / 3;
    const twoThirdLat = origin.lat + (dest.lat - origin.lat) * 2 / 3;
    const twoThirdLon = origin.lon + (dest.lon - origin.lon) * 2 / 3;

    results.push([
      offsetPoint(thirdLat, thirdLon, perpLeft, offsetKm),
      offsetPoint(twoThirdLat, twoThirdLon, perpRight, offsetKm),
    ]);
    results.push([
      offsetPoint(thirdLat, thirdLon, perpRight, offsetKm),
      offsetPoint(twoThirdLat, twoThirdLon, perpLeft, offsetKm),
    ]);
  }

  return results;
}

/**
 * ワインディング(scenic)専用: 複数戦略で候補を収集し、カーブ度で最良を選択
 *
 * 戦略1: motorcycle costing + alternates（バイク向き道路を好む）
 * 戦略2: auto + shortest + alternates（最短距離 = 山を迂回せず峠を直行）
 * 戦略3: 長距離向け迂回（中間地点を山側にオフセットした経由地で山道を強制）
 *
 * 遠回りしてでも山道・峠道を通るルートを優先する。
 */
async function handleScenicRoute(
  locations: { lat: number; lon: number; type?: string }[],
  body: ValhallaRouteRequest,
  excludePolygons?: { lat: number; lon: number }[][]
): Promise<NextResponse> {
  const allCandidates: RouteCandidate[] = [];
  const numAlternates = body.alternates ?? 2;

  const baseOptions: Record<string, unknown> = {
    directions_options: { units: 'km' },
    shape_format: 'polyline6',
    ...(excludePolygons && { exclude_polygons: excludePolygons }),
  };

  // 戦略1: motorcycle costing（脇道・二次道路を好む）
  const motoBody: Record<string, unknown> = {
    locations,
    costing: 'motorcycle',
    costing_options: {
      motorcycle: {
        use_highways: body.useHighways ?? 0,
        use_tolls: body.useTolls ?? 0.5,
        ...(body.useTrails !== undefined && { use_trails: body.useTrails }),
      },
    },
    ...baseOptions,
    alternates: numAlternates,
  };

  const motoResult = await fetchWithRetry(motoBody);

  if (motoResult.ok) {
    allCandidates.push(...await extractCandidates(motoResult));
  } else if (motoResult.status !== 429) {
    // motorcycle非対応 → auto で高速回避フォールバック
    const fallbackBody: Record<string, unknown> = {
      locations,
      costing: 'auto',
      costing_options: {
        auto: {
          use_highways: body.useHighways ?? 0,
          use_tolls: body.useTolls ?? 0.5,
        },
      },
      ...baseOptions,
      alternates: numAlternates,
    };
    const fallbackResult = await fetchWithRetry(fallbackBody);
    allCandidates.push(...await extractCandidates(fallbackResult));
  }

  // 戦略2: 最短距離ルート（山を迂回せず峠を直行 → ワインディングになりやすい）
  await new Promise((r) => setTimeout(r, 300));
  const shortestBody: Record<string, unknown> = {
    locations,
    costing: 'auto',
    costing_options: {
      auto: {
        use_highways: 0,
        use_tolls: body.useTolls ?? 0.5,
        shortest: true,
      },
    },
    ...baseOptions,
    alternates: numAlternates,
  };

  const shortestResult = await fetchWithRetry(shortestBody);
  if (shortestResult.ok) {
    allCandidates.push(...await extractCandidates(shortestResult));
  }

  // 戦略3: 長距離向け迂回ルート（中間地点をオフセットして山道を強制通過）
  const origin = locations[0];
  const dest = locations[locations.length - 1];
  const detourSets = generateDetourWaypoints(origin, dest);

  for (const detourWps of detourSets) {
    await new Promise((r) => setTimeout(r, 300));

    // ユーザー経由地 + オフセット経由地を origin からの距離順でソート
    const userWaypoints = locations.slice(1, -1);
    const allWaypoints = [
      ...userWaypoints,
      ...detourWps.map((wp) => ({ lat: wp.lat, lon: wp.lon, type: 'through' as const })),
    ];
    allWaypoints.sort((a, b) => {
      const cosLat = Math.cos(origin.lat * Math.PI / 180);
      const da = (a.lat - origin.lat) ** 2 + ((a.lon - origin.lon) * cosLat) ** 2;
      const db = (b.lat - origin.lat) ** 2 + ((b.lon - origin.lon) * cosLat) ** 2;
      return da - db;
    });

    const detourBody: Record<string, unknown> = {
      locations: [origin, ...allWaypoints, dest],
      costing: 'motorcycle',
      costing_options: {
        motorcycle: {
          use_highways: 0,
          use_tolls: body.useTolls ?? 0.5,
          ...(body.useTrails !== undefined && { use_trails: body.useTrails }),
        },
      },
      ...baseOptions,
    };

    const result = await fetchWithRetry(detourBody);
    if (result.ok) {
      allCandidates.push(...await extractCandidates(result));
    } else if (result.status !== 429) {
      // motorcycle非対応フォールバック
      const fbBody: Record<string, unknown> = {
        ...detourBody,
        costing: 'auto',
        costing_options: {
          auto: { use_highways: 0, use_tolls: body.useTolls ?? 0.5 },
        },
      };
      const fbResult = await fetchWithRetry(fbBody);
      allCandidates.push(...await extractCandidates(fbResult));
    }
  }

  if (allCandidates.length === 0) {
    return NextResponse.json({ error: 'No route found' }, { status: 404 });
  }

  return NextResponse.json(pickCurviest(allCandidates));
}

export async function POST(request: NextRequest) {
  let body: ValhallaRouteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.origin || !body.destination) {
    return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
  }

  try {
    const locations: { lat: number; lon: number; type?: string }[] = [
      { lat: body.origin.lat, lon: body.origin.lng },
    ];

    if (body.waypoints && body.waypoints.length > 0) {
      for (const wp of body.waypoints) {
        locations.push({ lat: wp.lat, lon: wp.lng, type: 'through' });
      }
    }

    locations.push({ lat: body.destination.lat, lon: body.destination.lng });

    // 回避ポリゴン: [lng, lat][][] → [{lat, lon}][] (Valhalla形式)
    const excludePolygons = body.excludePolygons?.length
      ? body.excludePolygons.map((ring) => ring.map(([lng, lat]) => ({ lat, lon: lng })))
      : undefined;

    // ワインディング(scenic): デュアル戦略でカーブ度最高のルートを選択
    const isScenic = body.costing === 'motorcycle' && body.alternates && body.alternates > 0;
    if (isScenic) {
      return await handleScenicRoute(locations, body, excludePolygons);
    }

    // 通常ルート (fastest / no_highway)
    const costing = body.costing || 'auto';
    const costingOptions: Record<string, unknown> = {
      use_highways: body.useHighways ?? 1.0,
      use_tolls: body.useTolls ?? 1.0,
      ...(body.useTrails !== undefined && { use_trails: body.useTrails }),
      ...(body.shortest && { shortest: true }),
    };

    const valhallaBody: Record<string, unknown> = {
      locations,
      costing,
      costing_options: { [costing]: costingOptions },
      directions_options: { units: 'km' },
      shape_format: 'polyline6',
      ...(excludePolygons && { exclude_polygons: excludePolygons }),
    };

    const result = await fetchWithRetry(valhallaBody);
    return await handleStandardResponse(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
