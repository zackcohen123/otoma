import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// This app lives in a subfolder of a repo with its own lockfile; pin the root here.
const root = fileURLToPath(new URL('.', import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root },
  outputFileTracingRoot: root,
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'no-referrer' }] }];
  },
};

export default nextConfig;
