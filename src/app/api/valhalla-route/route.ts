import { NextRequest, NextResponse } from 'next/server';

interface ValhallaRouteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  useHighways?: number;  // 0.0 - 1.0
  useTolls?: number;     // 0.0 - 1.0
}

/**
 * Valhalla (FOSSGIS公開サーバー) 経路計算プロキシ
 *
 * - 完全無料・APIキー不要
 * - OSM データベースによる正確なルーティング
 * - NEXCO高速道路を自然に優先（都市高速より高い制限速度を正しく反映）
 * - Encoded polyline (precision 6) → [lng, lat][] に変換
 */

const VALHALLA_ENDPOINT = 'https://valhalla1.openstreetmap.de/route';

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
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    // Convert to [lng, lat] order (ORS-compatible)
    points.push([lng / 1e6, lat / 1e6]);
  }

  return points;
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
    // Build Valhalla request
    const locations: { lat: number; lon: number; type?: string }[] = [
      { lat: body.origin.lat, lon: body.origin.lng },
    ];

    // Add waypoints as "through" locations (no stop)
    if (body.waypoints && body.waypoints.length > 0) {
      for (const wp of body.waypoints) {
        locations.push({ lat: wp.lat, lon: wp.lng, type: 'through' });
      }
    }

    locations.push({ lat: body.destination.lat, lon: body.destination.lng });

    const valhallaBody = {
      locations,
      costing: 'auto',
      costing_options: {
        auto: {
          use_highways: body.useHighways ?? 1.0,
          use_tolls: body.useTolls ?? 1.0,
        },
      },
      directions_options: { units: 'km' },
      shape_format: 'polyline6',
    };

    const response = await fetch(VALHALLA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TouringWeather/1.0',
      },
      body: JSON.stringify(valhallaBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Valhalla API error: ${response.status} ${text}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const trip = data.trip;

    if (!trip || !trip.legs || trip.legs.length === 0) {
      return NextResponse.json({ error: 'No route found' }, { status: 404 });
    }

    // Decode and merge all leg shapes into single geometry
    const geometry: [number, number][] = [];
    for (let i = 0; i < trip.legs.length; i++) {
      const legPoints = decodePolyline6(trip.legs[i].shape);
      for (let j = 0; j < legPoints.length; j++) {
        // Skip first point of subsequent legs (overlap with previous leg's last point)
        if (i > 0 && j === 0) continue;
        geometry.push(legPoints[j]);
      }
    }

    const totalDistance = trip.summary.length;     // km (already in km with units: km)
    const totalDuration = trip.summary.time;        // seconds

    return NextResponse.json({
      geometry,
      totalDistance,
      totalDuration,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
