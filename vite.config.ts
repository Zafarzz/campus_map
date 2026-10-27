import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the FastAPI backend lives. Default: a local/tunnelled backend on :8000.
  // Override with VITE_BACKEND_PROXY_TARGET in `.env.local` (e.g. http://92.5.52.80).
  const backend = env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000';

  return {
    plugins: [
      react(),
      basicSsl()
    ],
    server: {
      host: true, // Listen on all network interfaces
      https: true,
      // Same-origin proxy so the HTTPS dev page can call the plain-HTTP backend
      // without mixed-content or CORS problems (backend/docs/PROPOSED_ROOT_CHANGES.md P-1).
      proxy: {
        '/api': { target: backend, changeOrigin: true, secure: false },
        '/healthz': { target: backend, changeOrigin: true, secure: false },
        '/readyz': { target: backend, changeOrigin: true, secure: false },
        '/ws': { target: backend, changeOrigin: true, secure: false, ws: true },
      },
    }
  };
});
