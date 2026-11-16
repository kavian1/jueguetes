// Plugin de Vite para el SEO: mete en el HTML el título, la descripción, la URL canónica,
// las etiquetas para redes sociales, los datos estructurados y un contenido estático legible
// por los buscadores. Al compilar crea además una página HTML por juego, robots.txt y sitemap.xml.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { PAGES, SITE_NAME, type PageInfo } from './src/site';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function jsonLd(p: PageInfo, site: string): string {
  const website = {
    '@type': 'WebSite',
    '@id': `${site}/#website`,
    name: SITE_NAME,
    url: `${site}/`,
    inLanguage: 'es',
    description: PAGES[0].description,
  };
  const game = (g: PageInfo) => ({
    '@type': 'VideoGame',
    '@id': `${site}${g.path}#juego`,
    name: g.ogTitle.split(' · ')[0],
    url: `${site}${g.path}`,
    description: g.description,
    image: `${site}${g.image}`,
    inLanguage: 'es',
    genre: g.genre,
    gamePlatform: ['Navegador web', 'Ordenador', 'Móvil'],
    applicationCategory: 'Game',
    operatingSystem: 'Cualquiera con un navegador moderno',
    playMode: 'MultiPlayer',
    numberOfPlayers: g.players ? { '@type': 'QuantitativeValue', minValue: g.players[0], maxValue: g.players[1] } : undefined,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    isPartOf: { '@id': `${site}/#website` },
  });
  const games = PAGES.filter((g) => g.game);
  const graph: unknown[] = [website];
  if (!p.game)
    graph.push({
      '@type': 'ItemList',
      name: 'Juegos del Rincón',
      itemListElement: games.map((g, i) => ({ '@type': 'ListItem', position: i + 1, item: game(g) })),
    });
  else
    graph.push(game(p), {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: p.ogTitle.split(' · ')[0], item: `${site}${p.path}` },
      ],
    });
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function headTags(p: PageInfo, site: string): string {
  const url = `${site}${p.path}`;
  const img = `${site}${p.image}`;
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="es" href="${url}" />`,
    `<link rel="alternate" hreflang="x-default" href="${url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:title" content="${esc(p.ogTitle)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(p.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.ogTitle)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<meta name="twitter:image:alt" content="${esc(p.imageAlt)}" />`,
    jsonLd(p, site),
  ].join('\n    ');
}

/** Contenido estático: lo ven los buscadores (y quien no tenga JavaScript) hasta que arranca la app. */
function fallback(p: PageInfo): string {
  const others = PAGES.filter((o) => o !== p);
  const links = others
    .map((o) => `<li><a href="${o.path}">${esc(o.game ? o.ogTitle.split(' · ')[0] : SITE_NAME)}</a>: ${esc(o.game ? o.description : 'todos los juegos')}</li>`)
    .join('');
  return [
    `<main class="seo-fallback">`,
    `<h1>${esc(p.h1)}</h1>`,
    ...p.intro.map((t) => `<p>${esc(t)}</p>`),
    p.facts ? `<ul>${p.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '',
    `<nav aria-label="Juegos"><h2>${p.game ? 'Más en el Rincón' : 'Juegos'}</h2><ul>${links}</ul></nav>`,
    `<noscript><p><b>Activa JavaScript para jugar.</b></p></noscript>`,
    `</main>`,
  ].join('');
}

const wrap = (name: string, body: string) => `<!--${name}:start-->${body}<!--${name}:end-->`;
const swap = (html: string, name: string, body: string) => html.replace(new RegExp(`<!--${name}:start-->[\\s\\S]*?<!--${name}:end-->`), wrap(name, body));

export function seo(siteUrl: string): Plugin {
  const site = siteUrl.replace(/\/+$/, '');
  let outDir = 'dist';
  return {
    name: 'rincon-seo',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    transformIndexHtml(html) {
      return html.replace('<!--seo-->', wrap('seo', headTags(PAGES[0], site))).replace('<!--fallback-->', wrap('fallback', fallback(PAGES[0])));
    },
    closeBundle() {
      let base: string;
      try {
        base = readFileSync(resolve(outDir, 'index.html'), 'utf-8');
      } catch {
        return; // no es una compilación de producción
      }
      for (const p of PAGES) {
        if (p.path === '/') continue;
        const html = swap(swap(base, 'seo', headTags(p, site)), 'fallback', fallback(p));
        const dir = resolve(outDir, p.path.replace(/^\/|\/$/g, ''));
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'index.html'), html);
      }
      const today = new Date().toISOString().slice(0, 10);
      const urls = PAGES.map(
        (p) => `  <url>\n    <loc>${site}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${p.path === '/' ? '1.0' : '0.8'}</priority>\n  </url>`,
      ).join('\n');
      writeFileSync(resolve(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      writeFileSync(resolve(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
    },
  };
}
