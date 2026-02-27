import { NextRequest, NextResponse } from 'next/server';
import { fetchLoopPerimeter } from '@/lib/geocodeServer';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 1) {
    return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
  }

  const numPoints = parseInt(request.nextUrl.searchParams.get('n') || '8', 10);
  const result = await fetchLoopPerimeter(q.trim(), Math.max(4, Math.min(numPoints, 20)));

  if (!result) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
