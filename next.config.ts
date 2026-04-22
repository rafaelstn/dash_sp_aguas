import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // O cliente postgres.js roda apenas no servidor; evita bundling acidental no navegador.
  serverExternalPackages: ['postgres'],
  experimental: {
    typedRoutes: true,
  },
  // Cabeçalho de idioma pt-BR é requisito WCAG / e-MAG.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Language', value: 'pt-BR' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
