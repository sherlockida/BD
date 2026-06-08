/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './AgentHub-V2—*/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        feishu: {
          bg: '#f5f6f7',
          surface: '#ffffff',
          border: '#e5e6eb',
          text: '#1f2329',
          'text-secondary': '#646a73',
          accent: '#3370ff',
          'accent-hover': '#2860e1',
          danger: '#f54a45',
          success: '#2ba471',
          warning: '#f5a623',
        },
        canvas: {
          bg: '#fafbfc',
          grid: '#e8eaed',
          'node-bg': '#ffffff',
          'node-border': '#d3d7de',
          'node-shadow': 'rgba(0, 0, 0, 0.06)',
          'edge-active': '#3370ff',
          'edge-lineage': '#8b8fa3',
        },
        workstation: {
          idle: '#c0c4cc',
          thinking: '#f5a623',
          producing: '#3370ff',
          'awaiting-input': '#7c3aed',
          done: '#2ba471',
          error: '#f54a45',
        },
      },
      animation: {
        'pulse-status': 'pulse-status 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'flow-line': 'flow-line 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-status': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'flow-line': {
          '0%': { strokeDashoffset: '20' },
          '100%': { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [],
};
