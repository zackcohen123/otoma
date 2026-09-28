import { NextResponse } from 'next/server';
import { getKpis, NoDataError } from '../../../lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getKpis(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = e instanceof NoDataError ? 503 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
