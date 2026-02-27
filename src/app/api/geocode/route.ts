import { NextRequest, NextResponse } from 'next/server';
import { geocodeSearchServer } from '@/lib/geocodeServer';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  const results = await geocodeSearchServer(q);
  return NextResponse.json(results);
}
