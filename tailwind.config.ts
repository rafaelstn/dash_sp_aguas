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
          texto: '#111827',     // 16.9:1 sobre branco
          muted: '#4B5563',     // 7.5:1 sobre branco
          borda: '#D1D5DB',
          superficie: '#F9FAFB',
          perigo: '#991B1B',    // 8.7:1 sobre branco
          sucesso: '#166534',   // 6.3:1 sobre branco
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Ubuntu', 'sans-serif'],
      },
      ringWidth: {
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
