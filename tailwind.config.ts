import type { Config } from 'tailwindcss';

/**
 * Tokens em CSS custom properties (globals.css). Os nomes `gov-*` são
 * mantidos como API pública — código existente continua válido. O mapeamento
 * para HSL vars permite dark mode futuro trocando apenas globals.css.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // API pública — mantida pra não quebrar código existente.
        gov: {
          azul: 'hsl(var(--gov-azul))',
          'azul-escuro': 'hsl(var(--gov-azul-escuro))',
          'azul-claro': 'hsl(var(--gov-azul-claro))',
          texto: 'hsl(var(--fg-default))',
          muted: 'hsl(var(--fg-muted))',
          borda: 'hsl(var(--border-default))',
          'borda-forte': 'hsl(var(--border-strong))',
          superficie: 'hsl(var(--bg-app))',
          'superficie-2': 'hsl(var(--bg-surface-2))',
          perigo: 'hsl(var(--status-danger))',
          sucesso: 'hsl(var(--status-success))',
          alerta: 'hsl(var(--status-warn))',
        },
        // Tokens semânticos novos — preferir em componentes novos.
        app: {
          bg: 'hsl(var(--bg-app))',
          surface: 'hsl(var(--bg-surface))',
          'surface-2': 'hsl(var(--bg-surface-2))',
          'surface-3': 'hsl(var(--bg-surface-3))',
          fg: 'hsl(var(--fg-default))',
          'fg-muted': 'hsl(var(--fg-muted))',
          'fg-subtle': 'hsl(var(--fg-subtle))',
          border: 'hsl(var(--border-default))',
          'border-subtle': 'hsl(var(--border-subtle))',
          'border-strong': 'hsl(var(--border-strong))',
        },
      },
      spacing: {
        18: '4.5rem',
        26: '6.5rem',
        header: '48px',
        sidenav: '224px',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],      // 11px — badges
        xs: ['0.75rem', { lineHeight: '1rem' }],            // 12px — meta
        sm: ['0.8125rem', { lineHeight: '1.125rem' }],     // 13px — base tabela
        base: ['0.875rem', { lineHeight: '1.25rem' }],      // 14px — texto
        md: ['1rem', { lineHeight: '1.5rem' }],             // 16px — ênfase
        lg: ['1.125rem', { lineHeight: '1.5rem' }],         // 18px — h3
        xl: ['1.25rem', { lineHeight: '1.75rem' }],         // 20px — h2
        '2xl': ['1.5rem', { lineHeight: '2rem' }],          // 24px — h1
        display: ['1.75rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        'gov-card': '0.375rem',
      },
      boxShadow: {
        'gov-card': '0 1px 2px rgba(17,24,39,0.04), 0 1px 3px rgba(17,24,39,0.06)',
        'gov-card-hover': '0 2px 4px rgba(17,24,39,0.06), 0 4px 8px rgba(17,24,39,0.08)',
        'gov-sticky': '0 1px 0 hsl(var(--border-subtle))',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Ubuntu', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Code', 'JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      ringWidth: { DEFAULT: '2px' },
      ringColor: { DEFAULT: 'hsl(var(--ring))' },
      ringOffsetWidth: { DEFAULT: '2px' },
      transitionTimingFunction: {
        'gov-ease': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
};

export default config;
