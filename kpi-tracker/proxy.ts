// Password gate (HTTP basic auth) for every page and API route.
// Set DASHBOARD_PASSWORD (and optionally DASHBOARD_USER, default "otoma").
// In production the app refuses to serve anything if no password is set.
import { NextResponse, type NextRequest } from 'next/server';

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('DASHBOARD_PASSWORD is not set, so the dashboard is locked.', { status: 503 });
    }
    return NextResponse.next(); // local development without a password
  }
  const user = process.env.DASHBOARD_USER || 'otoma';
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [u, ...rest] = atob(header.slice(6)).split(':');
    if (safeEqual(u, user) && safeEqual(rest.join(':'), password)) return NextResponse.next();
  }
  return new NextResponse('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="GTM KPIs", charset="UTF-8"' } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
