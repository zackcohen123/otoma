// Optional private link. No password prompt.
// - DASHBOARD_LINK_KEY unset: the dashboard is open to anyone with the URL.
// - DASHBOARD_LINK_KEY set: open https://<host>/?key=<key> once. The key is stored in a cookie
//   and removed from the address bar, so later visits (and bookmarks) just work. Requests
//   without the key get a plain 404.
import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'gtm_kpis_key';

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const key = process.env.DASHBOARD_LINK_KEY;
  if (!key) return NextResponse.next();

  const fromUrl = req.nextUrl.searchParams.get('key');
  if (fromUrl && safeEqual(fromUrl, key)) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('key');
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, key, {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  const fromCookie = req.cookies.get(COOKIE)?.value;
  if (fromCookie && safeEqual(fromCookie, key)) return NextResponse.next();

  return new NextResponse('Not found', { status: 404 });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
