// @ts-nocheck -- herramienta de desarrollo que corre en Node (sin tipos de Node instalados)
// Genera las imágenes para compartir en redes (1200×630) y los iconos de la web en /public,
// con el mismo pixel art del juego. Uso: npx vite-node scripts/make-og.ts
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// ── lienzo falso para pintar sin navegador ──
class FakeCtx {
  constructor(private c: FakeCanvas) {}
  createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData(img) {
    this.c.data = img.data;
    this.c.width = img.width;
    this.c.height = img.height;
  }
}
class FakeCanvas {
  width = 0;
  height = 0;
  data = new Uint8ClampedArray(0);
  getContext() {
    return new FakeCtx(this);
  }
  toDataURL() {
    return '';
  }
}
globalThis.document = { createElement: () => new FakeCanvas() };
globalThis.window = { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) };

const { makeBoard } = await import('../src/isla/board');
const art = await import('../src/isla/art');
const { iconSprite } = await import('../src/pixel/icons');
const { chibiSprite } = await import('../src/pixel/chibi');
const { paintTown } = await import('../src/pixel/world');
const hub = await import('../src/shell/hubArt');
const villa = await import('../src/villa/art');
const { mulberry32 } = await import('../src/game/rng');

type Img = { width: number; height: number; data: Uint8ClampedArray };

function canvas(w: number, h: number): Img {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}
function paint(fn: (ctx, w: number, h: number) => void, w: number, h: number): Img {
  const c = new FakeCanvas();
  fn(c.getContext(), w, h);
  return c;
}
function blit(dst: Img, src: Img, x0: number, y0: number) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const a = src.data[si + 3] / 255;
      if (!a) continue;
      const X = Math.round(x0) + x;
      const Y = Math.round(y0) + y;
      if (X < 0 || Y < 0 || X >= dst.width || Y >= dst.height) continue;
      const di = (Y * dst.width + X) * 4;
      for (let k = 0; k < 3; k++) dst.data[di + k] = dst.data[di + k] * (1 - a) + src.data[si + k] * a;
      dst.data[di + 3] = 255;
    }
}
function put(dst: Img, x: number, y: number, c: number[], a = 1) {
  if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) return;
  const i = (y * dst.width + x) * 4;
  for (let k = 0; k < 3; k++) dst.data[i + k] = dst.data[i + k] * (1 - a) + c[k] * a;
  dst.data[i + 3] = 255;
}
function rect(dst: Img, x0: number, y0: number, w: number, h: number, c: number[], a = 1) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(dst, x, y, c, a);
}
const sprite = (name: string) => iconSprite(name) ?? chibiSprite(name)?.canvas;
function stamp(dst: Img, name: string, cx: number, cy: number, scale = 1) {
  let s = sprite(name);
  if (!s) throw new Error('falta ' + name);
  if (scale > 1) s = upscale(s, scale);
  blit(dst, s, Math.round(cx - s.width / 2), Math.round(cy - s.height / 2));
}
function upscale(src: Img, s: number): Img {
  const out = canvas(src.width * s, src.height * s);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / s) * src.width + Math.floor(x / s)) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
    }
  return out;
}

// ── letras de 5×7 para los títulos ──
const F: Record<string, string> = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'].join(''),
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'].join(''),
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'].join(''),
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'].join(''),
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'].join(''),
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'].join(''),
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'].join(''),
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'].join(''),
  'J': ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'].join(''),
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'].join(''),
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'].join(''),
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'].join(''),
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'].join(''),
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'].join(''),
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'].join(''),
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'].join(''),
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'].join(''),
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'].join(''),
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'].join(''),
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'].join(''),
  ',': ['.....', '.....', '.....', '.....', '..##.', '...#.', '..#..'].join(''),
  '·': ['.....', '.....', '.....', '..##.', '..##.', '.....', '.....'].join(''),
  '★': ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#', '.....'].join(''),
};
const ACCENT: Record<string, string> = { Ó: 'O', Í: 'I', Á: 'A' };
for (const [k, g] of Object.entries(F)) if (g.length !== 35) throw new Error(`letra ${k} mal dibujada (${g.length})`);

function textWidth(s: string, k: number) {
  return [...s].reduce((w, ch) => w + (ch === ' ' ? 3 : 6) * k, 0) - k;
}

/** Escribe texto pixelado con contorno oscuro y sombra, como los títulos del juego. */
function title(dst: Img, s: string, x0: number, y0: number, k: number, fill: number[], ink = [29, 26, 36], drop = [106, 68, 40]) {
  const mask = new Set<string>();
  let cx = x0;
  for (const ch of s) {
    if (ch === ' ') {
      cx += 3 * k;
      continue;
    }
    const base = ACCENT[ch] ?? ch;
    const g = F[base];
    if (!g) throw new Error('sin letra ' + ch);
    for (let i = 0; i < 35; i++)
      if (g[i] === '#') for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) mask.add(`${cx + (i % 5) * k + xx},${y0 + Math.floor(i / 5) * k + yy}`);
    if (ACCENT[ch]) for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) mask.add(`${cx + 3 * k + xx},${y0 - 2 * k + yy}`), mask.add(`${cx + 2 * k + xx},${y0 - k + yy}`);
    cx += 6 * k;
  }
  const pts = [...mask].map((p) => p.split(',').map(Number));
  const o = Math.max(1, Math.round(k / 2));
  for (const [x, y] of pts) for (let d = 1; d <= o + 2; d++) put(dst, x, y + o + d, drop);
  for (const [x, y] of pts) for (let dy = -o; dy <= o; dy++) for (let dx = -o; dx <= o; dx++) put(dst, x + dx, y + dy, ink);
  for (const [x, y] of pts) put(dst, x, y, fill);
}
function ribbon(dst: Img, s: string, cx: number, y: number, k = 1) {
  const w = textWidth(s, k);
  rect(dst, Math.round(cx - w / 2) - 5, y - 3, w + 10, 7 * k + 6, [42, 24, 20], 0.82);
  let x = Math.round(cx - w / 2);
  for (const ch of s) {
    if (ch === ' ') {
      x += 3 * k;
      continue;
    }
    const g = F[ACCENT[ch] ?? ch];
    for (let i = 0; i < 35; i++) if (g[i] === '#') rect(dst, x + (i % 5) * k, y + Math.floor(i / 5) * k, k, k, [255, 243, 176]);
    x += 6 * k;
  }
}

// ── PNG ──
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function savePng(img: Img, file: string, alpha = false) {
  const bpp = alpha ? 4 : 3;
  const raw = Buffer.alloc((img.width * bpp + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * bpp + 1)] = 0;
    for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + x) * 4;
      const di = y * (img.width * bpp + 1) + 1 + x * bpp;
      for (let k = 0; k < bpp; k++) raw[di + k] = img.data[si + k];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
  console.log('escrito', file, img.width + '×' + img.height);
}

const W = 400;
const H = 210;
const PAPER = [246, 231, 200];

// ── Isla Cosecha ──
{
  const img = paint(art.paintOcean, W, H);
  const board = makeBoard(mulberry32(5));
  const island = paint((ctx) => art.paintIsland(ctx, board), art.BW, art.BH);
  const ox = W - art.BW - 8;
  const oy = Math.round((H - art.BH) / 2);
  blit(img, island, ox, oy);
  const at = (p) => ({ x: p.x + ox, y: p.y + oy });
  for (const port of board.ports) {
    const e = board.edges[port.edge];
    const pa = art.vertPos(board.verts[e.a]);
    const pb = art.vertPos(board.verts[e.b]);
    const m = at({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
    stamp(img, 'isla_boat', m.x + port.dx * 7 - port.dy * 10, m.y + port.dy * 7 + port.dx * 10 - 2);
    stamp(img, 'isla_port_' + port.kind, m.x + port.dx * 14, m.y + port.dy * 14);
  }
  for (const h of board.hexes) if (h.num) {
    const p = at(art.tokenPos(h));
    stamp(img, 'isla_num_' + h.num, p.x, p.y);
  }
  const pieces: [number, string][] = [
    [10, 'cabana_0'],
    [20, 'villa_1'],
    [33, 'cabana_2'],
    [44, 'villa_3'],
    [27, 'cabana_1'],
  ];
  for (const [v, name] of pieces) {
    const c = name.slice(-1);
    for (const e of board.verts[v].edges.slice(0, 2)) {
      const info = art.edgeInfo(board, board.edges[e]);
      const p = at(info);
      stamp(img, `isla_road_${info.dir}_${c}`, p.x, p.y);
    }
    const p = at(art.vertPos(board.verts[v]));
    stamp(img, 'isla_' + name, p.x, p.y - (name.startsWith('villa') ? 4 : 3));
  }
  const desert = board.hexes.find((h) => h.terrain === 'duna');
  const dp = at(art.hexPos(desert));
  stamp(img, 'isla_zorro', dp.x, dp.y - 2);
  // título a la izquierda
  title(img, 'ISLA', 18, 44, 4, PAPER);
  title(img, 'COSECHA', 18, 84, 3, PAPER);
  ribbon(img, 'COSECHA, COMERCIA', 72, 126);
  ribbon(img, 'Y CONSTRUYE', 72, 140);
  stamp(img, 'isla_zorro', 40, 176, 2);
  stamp(img, 'res_trigo', 82, 180);
  stamp(img, 'res_lana', 104, 180);
  stamp(img, 'res_madera', 126, 180);
  savePng(upscale(img, 3), 'public/og-isla.png');
}

// ── Polvo y Pólvora ──
{
  const img = paint(paintTown, W, H);
  title(img, 'POLVO Y PÓLVORA', Math.round(W / 2 - textWidth('POLVO Y PÓLVORA', 3) / 2), 26, 3, PAPER);
  ribbon(img, '★ UN DUELO DE ROLES OCULTOS ★', W / 2, 58);
  const cast = ['fig_cardo', 'fig_tinta', 'fig_olmo', 'fig_miel', 'fig_pipa'];
  cast.forEach((f, i) => stamp(img, f, 80 + i * 60, H - 26, 1));
  savePng(upscale(img, 3), 'public/og-polvo.png');
}

// ── Villa Moneda ──
{
  const img = paint(villa.paintVillaScene, W, H);
  title(img, 'VILLA MONEDA', Math.round(W / 2 - textWidth('VILLA MONEDA', 3) / 2), 22, 3, PAPER);
  ribbon(img, '★ COMPRA, CONSTRUYE Y GOBIERNA ★', W / 2, 54);
  const cast = ['fig_vmrita', 'fig_vmernesto', 'fig_vmlola', 'fig_vmclara', 'fig_vmpepe'];
  cast.forEach((f, i) => stamp(img, f, 80 + i * 60, H - 22, 1));
  savePng(upscale(img, 3), 'public/og-villa.png');
}

// ── Rincón de Juegos ──
{
  const img = paint(hub.paintHub, W, H);
  title(img, 'RINCÓN DE JUEGOS', Math.round(W / 2 - textWidth('RINCÓN DE JUEGOS', 3) / 2), 30, 3, PAPER);
  ribbon(img, '★ JUEGOS DE MESA ONLINE CON AMIGOS ★', W / 2, 62);
  const covers = [villa.paintVillaCover, hub.paintIslaCover, hub.paintPolvoCover];
  covers.forEach((fn, i) => {
    const x = Math.round(W / 2 - 160 + i * 112);
    const y = 82;
    rect(img, x - 4, y - 4, 104, 76, [58, 36, 24]);
    rect(img, x - 3, y - 3, 102, 74, PAPER);
    blit(img, paint(fn, 96, 56), x, y);
    rect(img, x - 1, y - 1, 98, 1, [58, 36, 24]);
    rect(img, x - 1, y + 56, 98, 1, [58, 36, 24]);
  });
  stamp(img, 'fig_vmrita', W / 2 - 160 + 22, 82 + 37);
  stamp(img, 'isla_zorro', W / 2 - 48 + 82, 82 + 46);
  stamp(img, 'fig_cardo', W / 2 + 64 + 22, 82 + 37);
  savePng(upscale(img, 3), 'public/og-rincon.png');
}

// ── iconos: el zorro sobre fondo crema ──
function icon(size: number, scale: number, file: string, round = false) {
  const img = canvas(size, size);
  rect(img, 0, 0, size, size, [246, 231, 200]);
  if (round) {
    // esquinas transparentes no: los iconos de app quedan mejor a sangre
  }
  stamp(img, 'isla_zorro', size / 2, size / 2 + scale, scale);
  savePng(img, file);
}
icon(512, 22, 'public/icon-512.png');
icon(192, 8, 'public/icon-192.png');
icon(180, 8, 'public/apple-touch-icon.png');

// favicon en SVG con los píxeles del zorro
{
  const s = sprite('isla_zorro');
  const rects: string[] = [];
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      const i = (y * s.width + x) * 4;
      if (!s.data[i + 3]) continue;
      const hex = '#' + [0, 1, 2].map((k) => s.data[i + k].toString(16).padStart(2, '0')).join('');
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex}"/>`);
    }
  writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -1 18 18" shape-rendering="crispEdges">${rects.join('')}</svg>\n`);
  console.log('escrito public/favicon.svg');
}
