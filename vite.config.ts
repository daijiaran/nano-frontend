import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // In development we proxy API requests to the backend to avoid CORS.
  // If you don't use the proxy, set VITE_API_BASE in the frontend env.
  const backendTarget = env.VITE_BACKEND_URL || env.VITE_API_BASE || 'http://localhost:4000';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['nano.demo.haoyan.ltd'],
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/public': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [
        react(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
