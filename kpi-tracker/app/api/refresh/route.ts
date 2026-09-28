import { NextResponse } from 'next/server';
import { forceRefresh } from '../../../lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const r = await forceRefresh();
  if (r.limited) {
    return NextResponse.json(
      { error: `Refresh is limited to once every few minutes. Try again in ${Math.ceil(r.retryAfterSeconds / 60)} minutes.`, retryAfterSeconds: r.retryAfterSeconds, data: r.data },
      { status: 429, headers: { 'Retry-After': String(r.retryAfterSeconds) } },
    );
  }
  if (r.error) return NextResponse.json({ error: r.error, data: r.data }, { status: r.data ? 200 : 503 });
  return NextResponse.json({ data: r.data });
}
