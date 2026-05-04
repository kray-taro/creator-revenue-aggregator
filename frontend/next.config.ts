import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin Turbopack's workspace root to the frontend directory to prevent
  // it from resolving modules from the monorepo root (which lacks frontend deps).
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Allow MSW service worker
  async headers() {
    return [
      {
        source: '/mockServiceWorker.js',
        headers: [{ key: 'Service-Worker-Allowed', value: '/' }],
      },
    ];
  },
};

export default nextConfig;
