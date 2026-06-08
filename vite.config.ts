/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'AgentHub-V2—SharedTypes/src'),
      '@canvas': path.resolve(__dirname, 'AgentHub-V2—CanvasEngine/src'),
      '@genui': path.resolve(__dirname, 'AgentHub-V2—GenUI/src'),
      '@panels': path.resolve(__dirname, 'AgentHub-V2—Panels/src'),
      '@demofx': path.resolve(__dirname, 'AgentHub-V2—DemoFX/src'),
      '@shell': path.resolve(__dirname, 'AgentHub-V2—AppShell/src'),
      '@backend': path.resolve(__dirname, 'AgentHub-V2—BackendServices/src'),
      '@legacy': path.resolve(__dirname, '../agenthub-mvp/src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: [
      'AgentHub-V2—*/__tests__/**/*.test.{ts,tsx}',
    ],
  },
});
