import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionSecurityMeta = {
  name: 'production-security-meta',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = "default-src 'self'; base-uri 'self'; form-action 'self'; frame-src 'self' https:; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests";
    return html.replace('</head>', `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`);
  }
};

export default defineConfig({
  plugins: [react(), productionSecurityMeta],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});