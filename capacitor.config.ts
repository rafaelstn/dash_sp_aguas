import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor empacota o app Next.js (SSR + rotas de API) como um app Android
 * que carrega a aplicação a partir de `server.url`. Não é um build offline:
 * o app precisa estar rodando na URL configurada.
 *
 * Aponta para o deploy de produção (Vercel) na rota `/app`. Assim o APK
 * funciona para qualquer pessoa, em qualquer rede, sem depender do PC: o
 * WebView carrega o app na Vercel, que conversa com o Supabase.
 */
const config: CapacitorConfig = {
  appId: 'br.gov.sp.spaguas.app',
  appName: 'SPÁguas Fichas',
  webDir: 'android-www',
  server: {
    url: 'https://dash-sp-aguas.vercel.app/app',
  },
};

export default config;
