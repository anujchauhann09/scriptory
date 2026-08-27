import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  /**
   * Everything `define`d here is substituted into the bundle as a literal and
   * shipped to every visitor. There is no such thing as a private value in a
   * frontend build, so only genuinely public configuration belongs in this
   * file — API base URLs, feature flags, version strings.
   *
   * This previously injected GEMINI_API_KEY, a paid backend credential, into
   * the client bundle where anyone could read it out of the served JavaScript.
   * The key is used exclusively by the API for embedding generation and now
   * stays there. Vite's own `VITE_`-prefix rule enforces the same boundary for
   * `import.meta.env`, which is why the API URL is exposed that way instead.
   */
  /**
   * A production bundle is immutable once built: the API URL is a string
   * literal inside the JavaScript, not something the host can override at
   * serve time. So a stale local .env does not fail loudly — it ships a site
   * that silently calls http://localhost:5000 from every visitor's browser,
   * and over HTTPS the plaintext scheme is blocked as mixed content on top of
   * that. Both cases are caught here, at the only point where they are still
   * cheap to fix.
   */
  if (mode === 'production') {
    const apiUrl = env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error(
        'VITE_API_URL must be set for a production build — otherwise the bundle ships pointing at localhost.'
      );
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(apiUrl)) {
      throw new Error(
        `VITE_API_URL is a local address ("${apiUrl}"). A production bundle must point at the deployed API.`
      );
    }
    if (!apiUrl.startsWith('https://')) {
      throw new Error(
        `VITE_API_URL must use https:// in a production build (got "${apiUrl}"); credentials ride on a Secure cookie.`
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      target: ['es2015', 'chrome87', 'firefox78', 'safari14'],
      // Source maps would publish the original TypeScript alongside the bundle.
      sourcemap: false,
    },
  };
});
