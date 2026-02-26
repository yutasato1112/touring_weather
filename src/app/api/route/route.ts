import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ORS API key not configured' }, { status: 500 });
  }

  let body: {
    coordinates: [number, number][];
    preference?: string;
    avoidFeatures?: string[];
    elevation?: boolean;
    extraInfo?: string[];
    avoidPolygons?: [number, number][][];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.coordinates || body.coordinates.length < 2) {
    return NextResponse.json({ error: 'At least 2 coordinates required' }, { status: 400 });
  }

  try {
    const orsBody: Record<string, unknown> = {
      coordinates: body.coordinates,
    };

    if (body.extraInfo && body.extraInfo.length > 0) {
      orsBody.extra_info = body.extraInfo;
    }

    if (body.preference) {
      orsBody.preference = body.preference;
    }

    // Enable elevation by default
    orsBody.elevation = body.elevation !== false;

    const options: Record<string, unknown> = {};

    if (body.avoidFeatures && body.avoidFeatures.length > 0) {
      options.avoid_features = body.avoidFeatures;
    }

    if (body.avoidPolygons && body.avoidPolygons.length > 0) {
      options.avoid_polygons = {
        type: 'MultiPolygon',
        coordinates: body.avoidPolygons.map((ring) => [ring]),
      };
    }

    if (Object.keys(options).length > 0) {
      orsBody.options = options;
    }

    const response = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car/json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(orsBody),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `ORS API error: ${response.status} ${text}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
