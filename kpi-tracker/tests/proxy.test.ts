import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { proxy } from '../proxy';

const req = (url: string, cookie?: string) => new NextRequest(url, { headers: cookie ? { cookie } : {} });

afterEach(() => {
  delete process.env.DASHBOARD_LINK_KEY;
});

describe('private link', () => {
  it('is open to anyone when no key is set', () => {
    expect(proxy(req('https://kpis.example/')).status).toBe(200);
  });

  it('accepts the key in the link, stores it and cleans the address bar', () => {
    process.env.DASHBOARD_LINK_KEY = 's3cret';
    const res = proxy(req('https://kpis.example/?key=s3cret'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://kpis.example/');
    expect(res.headers.get('set-cookie')).toMatch(/gtm_kpis_key=s3cret.*HttpOnly/i);
  });

  it('lets the cookie through and hides the app from everyone else', () => {
    process.env.DASHBOARD_LINK_KEY = 's3cret';
    expect(proxy(req('https://kpis.example/api/kpis', 'gtm_kpis_key=s3cret')).status).toBe(200);
    expect(proxy(req('https://kpis.example/')).status).toBe(404);
    expect(proxy(req('https://kpis.example/?key=wrong')).status).toBe(404);
  });
});
