import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Esconde o indicator flutuante do Next.js em dev (canto inferior esquerdo).
  devIndicators: false,
  // O cliente postgres.js roda apenas no servidor; evita bundling acidental no navegador.
  serverExternalPackages: ['postgres'],
  // typedRoutes desabilitado: Turbopack (Next 15.2) ainda nao suporta.
  // Reativar quando o Turbopack estabilizar; ate la, o typecheck normal do tsc
  // cobre os href <Link> suficientemente.
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
