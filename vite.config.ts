import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { seo } from './seo';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dirección pública del sitio (para la URL canónica, las redes sociales y el sitemap).
  // Se cambia en el archivo .env (VITE_SITE_URL) cuando haya dominio propio.
  const site = env.VITE_SITE_URL || 'https://jueguetes.netlify.app';
  return {
    plugins: [react(), seo(site)],
    server: { port: 5173, host: true },
  };
});
