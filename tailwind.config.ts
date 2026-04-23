import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Paleta com contraste auditado >= 4.5:1 sobre branco (WCAG 2.1 AA).
        gov: {
          azul: '#1E40AF',      // 8.6:1 sobre branco
          'azul-escuro': '#1E3A8A',
          'azul-claro': '#DBEAFE', // fundo sutil pra pílulas / chips
          texto: '#111827',     // 16.9:1 sobre branco
          muted: '#4B5563',     // 7.5:1 sobre branco
          borda: '#D1D5DB',
          'borda-forte': '#9CA3AF',
          superficie: '#F9FAFB',
          'superficie-2': '#F3F4F6',
          perigo: '#991B1B',    // 8.7:1 sobre branco
          sucesso: '#166534',   // 6.3:1 sobre branco
          alerta: '#92400E',    // 7.4:1 sobre branco — texto de warning
        },
      },
      spacing: {
        18: '4.5rem',
        26: '6.5rem',
      },
      fontSize: {
        display: ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        'gov-card': '0.5rem',
      },
      boxShadow: {
        'gov-card': '0 1px 2px rgba(17,24,39,0.04), 0 1px 3px rgba(17,24,39,0.06)',
        'gov-card-hover': '0 2px 4px rgba(17,24,39,0.06), 0 4px 8px rgba(17,24,39,0.08)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Ubuntu', 'sans-serif'],
      },
      ringWidth: {
        DEFAULT: '2px',
      },
      transitionTimingFunction: {
        'gov-ease': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
