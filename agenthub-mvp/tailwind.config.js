/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        feishu: {
          bg: '#f5f5f7',
          panel: '#ffffff',
          border: '#e5e5e7',
          text: '#1f1f23',
          subtext: '#86868b',
          accent: '#3370ff',
          hover: '#f0f0f3',
          mention: '#ffe7d1',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        typing: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        typing: 'typing 1.4s infinite',
        slideIn: 'slideIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
