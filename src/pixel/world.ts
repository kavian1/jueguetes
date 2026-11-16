// Escenarios en pixel art cozy: saloon, mesa de póker (en perspectiva y vista cenital) y pueblo.
// Todo se pinta a baja resolución con rampas de 5 tonos y se escala sin suavizado.
import { ramp5 } from './chibi';

export type RGB = [number, number, number];
export type Ramp = RGB[];
export type Mask = (x: number, y: number) => boolean;

/** Tamaño del píxel del mundo (en píxeles de pantalla). */
export function worldScale(): number {
  if (window.innerWidth >= 1180 && window.innerHeight >= 700) return 4;
  return 3;
}

/** Geometría de la mesa en perspectiva, en fracciones del tablero (la comparte la interfaz). */
export const POV = { cx: 0.5, cy: 0.84, rx: 0.47, ry: 0.5 };

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class Px {
  img: ImageData;
  d: Uint8ClampedArray;
  constructor(
    public w: number,
    public h: number,
    private ctx: CanvasRenderingContext2D,
  ) {
    this.img = ctx.createImageData(w, h);
    this.d = this.img.data;
  }
  put(x: number, y: number, c: RGB, a = 1) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    if (a >= 1 || d[i + 3] === 0) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = a >= 1 ? 255 : Math.round(255 * a);
    } else {
      d[i] += (c[0] - d[i]) * a;
      d[i + 1] += (c[1] - d[i + 1]) * a;
      d[i + 2] += (c[2] - d[i + 2]) * a;
    }
  }
  get(x: number, y: number): RGB | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return this.d[i + 3] ? [this.d[i], this.d[i + 1], this.d[i + 2]] : null;
  }
  tint(x: number, y: number, c: RGB, a: number) {
    const p = this.get(x, y);
    if (p) this.put(x, y, mix(p, c, a));
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB) {
    for (let y = Math.floor(y0); y < y0 + h; y++) for (let x = Math.floor(x0); x < x0 + w; x++) this.put(x, y, c);
  }
  flush() {
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** Forma con sombreado de pixel art: borde luminoso arriba-izquierda, sombra abajo-derecha y contorno. */
export function shape(
  P: Px,
  mask: Mask,
  r: Ramp,
  box: [number, number, number, number],
  o: { outline?: boolean; shadow?: number; light?: boolean; base?: number; tone?: (x: number, y: number, t: number) => number; spot?: [number, number] } = {},
) {
  const [x0, y0, x1, y1] = box.map(Math.floor);
  const w = x1 - x0 + 3;
  const h = y1 - y0 + 3;
  const M = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask(x0 - 1 + x + 0.5, y0 - 1 + y + 0.5)) M[y * w + x] = 1;
  const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && M[y * w + x] === 1;
  const sh = o.shadow ?? 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = x0 - 1 + x;
      const Y = y0 - 1 + y;
      if (inM(x, y)) {
        let t = o.base ?? 2;
        if (o.light !== false && (!inM(x - 1, y) || !inM(x, y - 1))) t = 3;
        if (!inM(x + 1, y) || !inM(x, y + 1) || (sh > 1 && (!inM(x + sh, y) || !inM(x, y + sh)))) t = 1;
        if (o.spot && Math.hypot(X + 0.5 - o.spot[0], Y + 0.5 - o.spot[1]) < 0.9) t = 4;
        if (o.tone) t = o.tone(X + 0.5, Y + 0.5, t);
        P.put(X, Y, r[Math.max(0, Math.min(4, t))]);
      } else if (o.outline !== false && (inM(x + 1, y) || inM(x - 1, y) || inM(x, y + 1) || inM(x, y - 1))) {
        P.put(X, Y, mix(r[0], [26, 12, 24], 0.35));
      }
    }
}

export const ell =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// ───────────────────────── letras de 3×5 ─────────────────────────

export const FONT: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  '0': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  $: ['.#.', '###', '##.', '.##', '###'],
};

export function text(P: Px, s: string, x: number, y: number, c: RGB) {
  let cx = Math.floor(x);
  for (const ch of s) {
    if (ch === ' ') {
      cx += 2;
      continue;
    }
    const g = FONT[ch];
    if (!g) continue;
    g.forEach((row, yy) => [...row].forEach((v, xx) => v === '#' && P.put(cx + xx, Math.floor(y) + yy, c)));
    cx += 4;
  }
}
export const textWidth = (s: string) => [...s].reduce((w, ch) => w + (ch === ' ' ? 2 : 4), 0) - 1;

// ───────────────────────── piezas reutilizables ─────────────────────────

export function cactus(P: Px, x: number, base: number, h: number, flower = true) {
  const G = ramp5('#46b35c');
  const w = 5;
  const trunk: Mask = (X, Y) => X >= x && X < x + w && Y >= base - h && Y < base && !(Y < base - h + 1.5 && (X < x + 1 || X >= x + w - 1));
  const armL: Mask = (X, Y) => (X >= x - 4 && X < x && Y >= base - h * 0.55 && Y < base - h * 0.55 + 3) || (X >= x - 4 && X < x - 1 && Y >= base - h * 0.85 && Y < base - h * 0.55 + 3 && !(Y < base - h * 0.85 + 1 && X < x - 3));
  const armR: Mask = (X, Y) => (X >= x + w && X < x + w + 4 && Y >= base - h * 0.4 && Y < base - h * 0.4 + 3) || (X >= x + w + 1 && X < x + w + 4 && Y >= base - h * 0.7 && Y < base - h * 0.4 + 3 && !(Y < base - h * 0.7 + 1 && X >= x + w + 3));
  const m: Mask = (X, Y) => trunk(X, Y) || armL(X, Y) || armR(X, Y);
  shape(P, m, G, [x - 5, base - h - 1, x + w + 5, base], { tone: (X, Y, t) => (t === 2 && Math.floor(X) === x + 1 ? 3 : t === 2 && (Math.floor(X) + Math.floor(Y)) % 4 === 0 ? 1 : t) });
  if (flower) {
    const F = ramp5('#ff7aa8');
    P.put(x + 1, base - h - 1, F[3]);
    P.put(x + 2, base - h - 2, F[2]);
    P.put(x + 3, base - h - 1, F[2]);
    P.put(x + 2, base - h - 1, ramp5('#ffd84a')[3]);
  }
}

export function pot(P: Px, cx: number, base: number, w: number, h: number) {
  const T = ramp5('#de6e40');
  const body: Mask = (X, Y) => Y >= base - h && Y < base && Math.abs(X - cx) <= w / 2 - (Y - (base - h)) * 0.18;
  shape(P, body, T, [cx - w / 2 - 1, base - h - 1, cx + w / 2 + 1, base]);
  shape(P, (X, Y) => Y >= base - h - 2 && Y < base - h + 1 && Math.abs(X - cx) <= w / 2 + 1, T, [cx - w / 2 - 2, base - h - 3, cx + w / 2 + 2, base - h + 1], { base: 3 });
}

/** Gata negra durmiendo hecha una bola (guiño a la imagen de referencia). */
export function sleepingCat(P: Px, x: number, base: number) {
  const K = ramp5('#3a3048');
  const body = ell(x + 6, base - 3, 6.2, 3.4);
  const headM = ell(x + 11, base - 4.2, 3.2, 2.8);
  const ear1: Mask = (X, Y) => Y > base - 8.4 && Y < base - 6 && X > x + 9 && X < x + 10.6 && Y > base - 8.4 + (X - (x + 9)) * 0.2;
  const ear2: Mask = (X, Y) => Y > base - 8.2 && Y < base - 6 && X > x + 12 && X < x + 13.6;
  const tail: Mask = (X, Y) => Y >= base - 2 && Y < base && X >= x - 2 && X < x + 3;
  const m: Mask = (X, Y) => body(X, Y) || headM(X, Y) || ear1(X, Y) || ear2(X, Y) || tail(X, Y);
  shape(P, m, K, [x - 3, base - 9, x + 15, base], { spot: [x + 4, base - 5.4] });
  P.put(x + 10, base - 4, ramp5('#e8d8f0')[1]);
  P.put(x + 12, base - 4, ramp5('#e8d8f0')[1]);
  P.put(x + 11, base - 3, ramp5('#ff9aa8')[2]);
}

// ───────────────────────── saloon ─────────────────────────

export function paintSaloon(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const u = Math.max(0.7, H / 200);
  const r = (v: number) => Math.round(v * u);
  const crownH = Math.max(3, r(4));
  const railY = Math.round(H * 0.42);
  const floorY = Math.round(H * 0.6);

  const WP = ramp5('#b8405a');
  const WPS = ramp5('#93304c');
  const GOLD = ramp5('#f2b84a');
  const WOOD = ramp5('#c46c3c');
  const WOODD = ramp5('#8c4a32');
  const FLOOR = ramp5('#cc7c46');
  const TEAL = ramp5('#2fa8a0');
  const CREAM = ramp5('#f6e4c2');

  // papel pintado con rayas y un motivo de rombos
  for (let y = crownH; y < railY; y++)
    for (let x = 0; x < W; x++) {
      const sx = x % 16;
      const stripe = sx < 5;
      let c = stripe ? WPS[2] : WP[2];
      if (sx === 5 || sx === 15) c = WP[1];
      if (!stripe) {
        const lx = sx - 10;
        const ly = ((y - crownH + (Math.floor(x / 16) % 2) * 7) % 14) - 7;
        const dd = Math.abs(lx) + Math.abs(ly);
        if (dd === 3) c = WP[3];
        else if (dd === 0) c = GOLD[3];
        else if (dd === 1) c = WP[3];
      } else if ((y + Math.floor(x / 16)) % 4 === 0 && sx === 2) c = WPS[3];
      if (y < crownH + 2) c = mix(c, WPS[0], y === crownH ? 0.55 : 0.3);
      P.put(x, y, c);
    }
  // moldura del techo
  for (let x = 0; x < W; x++) for (let y = 0; y < crownH; y++) P.put(x, y, WOODD[[0, 3, 2, 1, 1][Math.min(4, y)]]);
  // moldura de la pared y zócalo con paneles
  [3, 2, 1, 0].forEach((t, k) => {
    for (let x = 0; x < W; x++) P.put(x, railY + k, WOOD[t]);
  });
  const panelTop = railY + 4;
  const panelBot = floorY - 3;
  const pw = Math.max(20, r(28));
  const st = Math.max(2, r(3));
  for (let y = panelTop; y < panelBot; y++)
    for (let x = 0; x < W; x++) {
      const px = x % pw;
      const ix0 = st;
      const ix1 = pw - st;
      const iy0 = panelTop + st;
      const iy1 = panelBot - st;
      let t = 1;
      if (px >= ix0 && px < ix1 && y >= iy0 && y < iy1) {
        t = 2;
        if (px === ix0 || y === iy0) t = 3;
        if (px === ix1 - 1 || y === iy1 - 1) t = 0;
        if (t === 2 && px % 6 === 3 && y % 9 < 4) t = 1;
      } else if (y === panelTop || px === 0) t = 2;
      P.put(x, y, WOOD[t]);
    }
  [3, 2, 0].forEach((t, k) => {
    for (let x = 0; x < W; x++) P.put(x, panelBot + k, WOODD[t]);
  });

  // suelo de tablones
  let y = floorY;
  let k = 0;
  while (y < H) {
    const h = Math.max(3, Math.round((3 + k * 1.1) * u));
    const gap = Math.round((38 + (k % 3) * 9) * u) + k * 3;
    const off = Math.floor(hash(k, 7) * gap);
    const tone = k % 2 ? 2 : 3;
    for (let yy = y; yy < Math.min(H, y + h); yy++)
      for (let x = 0; x < W; x++) {
        let t = tone;
        if (yy === y + h - 1) t = 0;
        else if ((x + off) % gap === 0) t = 1;
        else if (hash(Math.floor((x + off) / 3), yy) < 0.06) t = 1;
        P.put(x, yy, FLOOR[t]);
      }
    y += h;
    k++;
  }

  // alfombra bajo la mesa
  const rugCx = W / 2;
  const rugCy = floorY + (H - floorY) * 0.78;
  const rugW = W * 0.42;
  const rugH = (H - floorY) * 0.55;
  const RED = ramp5('#d8463e');
  const NAVY = ramp5('#2c6f8f');
  for (let yy = Math.floor(rugCy - rugH); yy < H; yy++)
    for (let x = Math.floor(rugCx - rugW); x < rugCx + rugW; x++) {
      const nx = (x + 0.5 - rugCx) / rugW;
      const ny = (yy + 0.5 - rugCy) / rugH;
      const q = Math.abs(nx) ** 4 + Math.abs(ny) ** 4;
      if (q > 1) continue;
      let c = NAVY[2];
      if (q > 0.62) c = RED[2];
      if (q > 0.62 && q < 0.7) c = GOLD[3];
      if (q > 0.9) c = RED[1];
      if (q <= 0.62) {
        const dx = Math.abs((x - rugCx) % 14);
        const dy = Math.abs((yy - rugCy) % 10);
        if (Math.abs(dx - 7) + Math.abs(dy - 5) * 1.4 < 2.5) c = NAVY[3];
        else if ((x + yy) % 9 === 0) c = NAVY[1];
      }
      if (q > 0.62 && q < 0.9 && (x + yy * 2) % 6 === 0) c = GOLD[2];
      P.put(x, yy, c);
    }

  // espejo de la barra con marco dorado
  const mx0 = Math.round(W * 0.37);
  const mx1 = Math.round(W * 0.63);
  const my0 = crownH + r(16);
  const my1 = railY - r(12);
  const GLASS = ramp5('#5aa6bc');
  for (let yy = my0; yy < my1; yy++)
    for (let x = mx0; x < mx1; x++) {
      const fx = Math.min(x - mx0, mx1 - 1 - x);
      const fy = Math.min(yy - my0, my1 - 1 - yy);
      const f = Math.min(fx, fy);
      let c: RGB;
      if (f === 0) c = GOLD[0];
      else if (f < 3) c = (x - mx0 < 3 || yy - my0 < 3) && f === 1 ? GOLD[4] : f === 1 ? GOLD[3] : GOLD[2];
      else if (f === 3) c = GOLD[1];
      else {
        const diag = (x - mx0 + (yy - my0)) % 26;
        c = GLASS[1];
        if (diag < 2) c = GLASS[3];
        else if (diag === 3 || diag === 5) c = GLASS[2];
        if (yy - my0 < 6) c = mix(c, GLASS[0], 0.25);
      }
      P.put(x, yy, c);
    }
  // cresta del marco
  shape(P, (X, Y) => ell(W / 2, my0, r(12), r(6))(X, Y) && Y < my0, GOLD, [W / 2 - r(13), my0 - r(7), W / 2 + r(13), my0], { spot: [W / 2 - r(4), my0 - r(4)] });
  // cráneo de longhorn sobre la cresta
  const BONE = ramp5('#f4e6c8');
  const sx = W / 2;
  const sy = my0 - r(9);
  const horn: Mask = (X, Y) => {
    const d = Math.abs(X - sx);
    if (d < 3 || d > r(20)) return false;
    const yc = sy - 1 - ((d - 3) / r(17)) ** 2 * r(6);
    return Math.abs(Y - yc) < 1.3 - (d / r(20)) * 0.5;
  };
  const skull: Mask = (X, Y) => ell(sx, sy + 1.5, 3.4, 4.2)(X, Y) || ell(sx, sy - 0.5, 4.4, 2.4)(X, Y);
  shape(P, (X, Y) => horn(X, Y) || skull(X, Y), BONE, [sx - r(21), sy - r(8), sx + r(21), sy + 6], { spot: [sx - 1.5, sy - 1] });
  P.put(sx - 2, sy, BONE[0]);
  P.put(sx + 1, sy, BONE[0]);
  P.put(sx - 1, sy + 3, BONE[1]);
  P.put(sx, sy + 3, BONE[1]);

  // estante con botellas de colores
  const shelfY = my1 + 1;
  P.rect(mx0 - r(6), shelfY, mx1 - mx0 + r(12), 1, WOODD[3]);
  P.rect(mx0 - r(6), shelfY + 1, mx1 - mx0 + r(12), 2, WOODD[1]);
  const bottles = ['#3fbf6e', '#ee4a5e', '#f6a83a', '#3a82ec', '#a45ee6', '#c8eef4', '#3fbf6e', '#f6a83a'];
  let bx = mx0 - r(4);
  let bi = 0;
  while (bx < mx1 + r(2)) {
    const B = ramp5(bottles[bi % bottles.length]);
    const bh = 7 + Math.floor(hash(bi, 3) * 6);
    const tall = hash(bi, 9) > 0.5;
    const top = shelfY - bh;
    const bodyM: Mask = (X, Y) => Y >= top + (tall ? 3 : 2) && Y < shelfY && X >= bx && X < bx + 4;
    const neckM: Mask = (X, Y) => Y >= top && Y < top + (tall ? 3 : 2) && X >= bx + 1 && X < bx + 3;
    shape(P, (X, Y) => bodyM(X, Y) || neckM(X, Y), B, [bx - 1, top - 1, bx + 5, shelfY], { tone: (X, Y, t) => (Math.floor(X) === bx && Y > top + 3 && t > 0 ? 4 : t) });
    if (hash(bi, 5) > 0.4) for (let x = bx; x < bx + 4; x++) P.put(x, shelfY - Math.floor(bh * 0.45), CREAM[2]);
    P.put(bx + 1, top - 1, ramp5('#9a5a36')[2]);
    P.put(bx + 2, top - 1, ramp5('#9a5a36')[1]);
    bx += 6 + (hash(bi, 1) > 0.6 ? 2 : 0);
    bi++;
  }

  // banderines de fiesta
  const bunt = ['#ee4a5e', '#ffd04a', '#2fbfa8', '#3a90ec', '#ff8a3d', '#5ac85a'];
  const bx0 = W * 0.16;
  const bx1 = W * 0.84;
  const sag = r(7);
  const by = crownH + r(3);
  const catY = (x: number) => by + sag * (1 - ((2 * (x - bx0)) / (bx1 - bx0) - 1) ** 2);
  for (let x = Math.floor(bx0); x < bx1; x++) P.put(x, Math.floor(catY(x)), WOODD[1]);
  let fi = 0;
  for (let x = bx0 + 3; x < bx1 - 6; x += 9) {
    const F = ramp5(bunt[fi++ % bunt.length]);
    const top = catY(x + 3) + 1;
    shape(P, (X, Y) => Y >= top && Y < top + 7 && Math.abs(X - (x + 3)) <= 3.2 - (Y - top) * 0.45, F, [x - 1, top - 1, x + 8, top + 8], { tone: (X, Y, t) => (t > 0 && X < x + 3 ? Math.max(t, 3) : t) });
  }

  // lámparas de aceite con halo pixelado
  const lamps = [Math.round(W * 0.29), Math.round(W * 0.71)];
  const WARM = hex('#ffe3a0');
  for (const lx of lamps) {
    const ly = crownH + r(14);
    for (let yy = crownH; yy < ly - 3; yy += 2) P.put(lx, yy, WOODD[0]);
    // halo por anillos con tramado
    for (let yy = ly - r(26); yy < ly + r(26); yy++)
      for (let x = lx - r(32); x < lx + r(32); x++) {
        const d = Math.hypot((x - lx) / 1.25, yy - ly - 2);
        if (d < r(11)) P.tint(x, yy, WARM, 0.26);
        else if (d < r(18)) {
          if ((x + yy) % 2 === 0) P.tint(x, yy, WARM, 0.2);
        } else if (d < r(25) && (x % 2 === 0 && yy % 2 === 0)) P.tint(x, yy, WARM, 0.16);
      }
    shape(P, (X, Y) => Y >= ly - 3 && Y < ly - 1 && Math.abs(X - lx) <= 3, GOLD, [lx - 4, ly - 4, lx + 4, ly - 1]);
    shape(P, ell(lx + 0.5, ly + 2, 3, 3.6), ramp5('#ffd06a'), [lx - 3, ly - 2, lx + 4, ly + 6], { spot: [lx - 0.5, ly + 0.5] });
    P.put(lx, ly + 2, hex('#fff6d0'));
    P.put(lx + 1, ly + 2, hex('#fff6d0'));
    shape(P, (X, Y) => Y >= ly + 5 && Y < ly + 7 && Math.abs(X - lx - 0.5) <= 3.5, GOLD, [lx - 4, ly + 4, lx + 5, ly + 7]);
  }

  // carteles de "SE BUSCA"
  const poster = (cx: number, top: number) => {
    const pw2 = 21;
    const ph = 26;
    const x0 = Math.round(cx - pw2 / 2);
    shape(P, (X, Y) => X >= x0 && X < x0 + pw2 && Y >= top && Y < top + ph && !(Y > top + ph - 2 && (X + Y) % 3 === 0), CREAM, [x0 - 1, top - 1, x0 + pw2, top + ph], { light: false });
    const ink = ramp5('#7a3a2a')[1];
    text(P, 'SE', x0 + Math.round((pw2 - textWidth('SE')) / 2), top + 2, ink);
    text(P, 'BUSCA', x0 + Math.round((pw2 - textWidth('BUSCA')) / 2), top + 8, ink);
    shape(P, (X, Y) => ell(cx, top + 18, 3, 3.4)(X, Y) || (Y >= top + 20 && Y < top + 23 && Math.abs(X - cx) < 5), ramp5('#b07a5a'), [cx - 6, top + 14, cx + 6, top + 23], { outline: false });
    P.put(Math.round(cx), top - 1, WOODD[0]);
  };
  poster(W * 0.26, crownH + r(20));
  poster(W * 0.74, crownH + r(22));

  // ventanas al desierto con cortinas
  const windowAt = (cx: number, side: number) => {
    const ww = Math.max(28, r(38));
    const wh = Math.max(34, r(50));
    const x0 = Math.round(cx - ww / 2);
    const y0 = crownH + r(12);
    // cristal: cielo, sol, mesetas y desierto
    const SKY = ['#4cb2ee', '#6cc4f4', '#94d6f6', '#c4eaf6', '#ffe4ac'].map(hex);
    const MESA = ramp5('#f2884a');
    const SAND = ramp5('#f8c47c');
    for (let yy = y0; yy < y0 + wh; yy++)
      for (let x = x0; x < x0 + ww; x++) {
        const v = (yy - y0) / wh;
        let c = SKY[Math.min(4, Math.floor(v * 6))];
        const sunD = Math.hypot(x - (x0 + ww * (side < 0 ? 0.7 : 0.3)), yy - (y0 + wh * 0.42));
        if (sunD < 3.2) c = hex('#fff6cf');
        else if (sunD < 5 && (x + yy) % 2 === 0) c = hex('#ffe9a0');
        const hz = y0 + wh * 0.68;
        const mesaTop = hz - (Math.abs(x - (x0 + ww * 0.42)) < ww * 0.22 ? wh * 0.14 : Math.abs(x - (x0 + ww * 0.42)) < ww * 0.27 ? wh * 0.07 : 0);
        if (yy >= mesaTop && yy < hz) c = yy < mesaTop + 1 ? MESA[3] : x > x0 + ww * 0.52 ? MESA[1] : MESA[2];
        if (yy >= hz) c = yy < hz + 1 ? SAND[3] : (x + yy) % 7 === 0 ? SAND[1] : SAND[2];
        P.put(x, yy, c);
      }
    cactus(P, x0 + Math.round(ww * 0.75), y0 + Math.round(wh * 0.88), Math.max(6, r(8)), false);
    // reflejos del cristal
    for (let i = 0; i < wh; i++) {
      const xx = x0 + Math.round(ww * 0.15) + Math.round(i * 0.5);
      if (xx < x0 + ww && i % 9 < 6) {
        P.tint(xx, y0 + wh - 1 - i, [255, 255, 255], 0.35);
        P.tint(xx + 1, y0 + wh - 1 - i, [255, 255, 255], 0.2);
      }
    }
    // marco y travesaños turquesa
    const frame: Mask = (X, Y) => {
      const inOuter = X >= x0 - 3 && X < x0 + ww + 3 && Y >= y0 - 3 && Y < y0 + wh + 3;
      const inGlass = X >= x0 && X < x0 + ww && Y >= y0 && Y < y0 + wh;
      const mull = (Math.abs(X - (x0 + ww / 2)) < 1 || Math.abs(Y - (y0 + wh * 0.45)) < 1) && inGlass;
      return (inOuter && !inGlass) || mull;
    };
    shape(P, frame, TEAL, [x0 - 4, y0 - 4, x0 + ww + 4, y0 + wh + 4]);
    // alféizar
    shape(P, (X, Y) => X >= x0 - 5 && X < x0 + ww + 5 && Y >= y0 + wh + 3 && Y < y0 + wh + 6, WOOD, [x0 - 6, y0 + wh + 2, x0 + ww + 6, y0 + wh + 6], { base: 3 });
    if (side < 0) {
      pot(P, x0 + 6, y0 + wh + 3, 7, 5);
      cactus(P, x0 + 4, y0 + wh - 2, 7);
    } else sleepingCat(P, x0 + ww - 17, y0 + wh + 3);
    // cortinas mostaza con pliegues y alzapaño
    const CURT = ramp5('#f2b340');
    const ROPE = ramp5('#e84a4a');
    const cw = Math.max(7, Math.round(ww * 0.28));
    for (const s of [-1, 1]) {
      const edge = s < 0 ? x0 - 4 : x0 + ww + 4;
      const tie = y0 + Math.round(wh * 0.58);
      const curtain: Mask = (X, Y) => {
        if (Y < y0 - 5 || Y > y0 + wh + 2) return false;
        const pull = Y < tie ? 1 - ((tie - Y) / (tie - y0 + 5)) * 0.15 : 0.6 + ((Y - tie) / (y0 + wh + 2 - tie)) * 0.5;
        const width = cw * pull;
        return s < 0 ? X >= edge - width + cw * 0.15 && X < edge + cw * 0.35 : X >= edge - cw * 0.35 && X < edge + width - cw * 0.15;
      };
      shape(P, curtain, CURT, [edge - cw - 2, y0 - 6, edge + cw + 2, y0 + wh + 3], { tone: (X, Y, t) => (t <= 1 ? t : [3, 2, 2, 1][Math.floor(X + (Y > tie ? 1 : 0)) % 4]) });
      shape(P, (X, Y) => Math.abs(Y - tie) < 1.2 && (s < 0 ? X >= edge - cw * 0.5 && X < edge + cw * 0.4 : X >= edge - cw * 0.4 && X < edge + cw * 0.5), ROPE, [edge - cw, tie - 2, edge + cw, tie + 2]);
    }
    shape(P, (X, Y) => X >= x0 - cw - 6 && X < x0 + ww + cw + 6 && Y >= y0 - 7 && Y < y0 - 5, GOLD, [x0 - cw - 7, y0 - 8, x0 + ww + cw + 7, y0 - 5]);
    // haz de luz que entra por la ventana y cae al suelo
    const toward = side < 0 ? 1 : -1;
    const fy0 = y0 + wh;
    const fy1 = H;
    for (let yy = fy0; yy < fy1; yy++) {
      const t = (yy - fy0) / (fy1 - fy0);
      const left = x0 + toward * t * W * 0.16;
      const right = x0 + ww + toward * t * W * 0.16 + t * ww * 0.6;
      for (let x = Math.floor(Math.min(left, right)); x < Math.max(left, right); x++) {
        const edgeD = Math.min(x - Math.min(left, right), Math.max(left, right) - x);
        const a = 0.16 * (1 - t * 0.7);
        if (edgeD < 2 && (x + yy) % 2) continue;
        P.tint(x, yy, hex('#fff2c4'), a);
      }
    }
  };
  windowAt(W * 0.115, -1);
  windowAt(W * 0.885, 1);

  // cactus en macetas en las esquinas del suelo
  for (const [cx, s] of [
    [W * 0.03, -1],
    [W * 0.97, 1],
  ] as [number, number][]) {
    const base = floorY + r(18);
    pot(P, cx, base, 12, 9);
    cactus(P, Math.round(cx - 2), base - 8, r(16));
    void s;
  }

  // viñeta tramada en las esquinas
  const DARK = hex('#2a1020');
  for (let yy = 0; yy < H; yy++)
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (yy - H / 2) / (H / 2);
      const q = dx * dx * 0.8 + dy * dy;
      if (q > 1.25) P.tint(x, yy, DARK, 0.32);
      else if (q > 1.0 && (x + yy) % 2 === 0) P.tint(x, yy, DARK, 0.24);
      else if (q > 0.85 && x % 2 === 0 && yy % 2 === 0) P.tint(x, yy, DARK, 0.16);
    }
  P.flush();
}

// ───────────────────────── mesa en perspectiva ─────────────────────────

export function paintPovTable(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H);
  const P = new Px(W, H, ctx);
  const cx = W * POV.cx;
  const cy = H * POV.cy;
  const rx = W * POV.rx;
  const ry = H * POV.ry;
  const RWx = Math.max(5, Math.round(W * 0.026));
  const RWy = Math.max(4, Math.round(RWx * 0.75));
  const fx = rx - RWx;
  const fy = ry - RWy;
  const T = Math.max(4, Math.round(H * 0.05));
  const FELT = ramp5('#3cae5e');
  const RIM = ramp5('#c9723e');
  const APRON = ramp5('#93502f');
  const GOLD = ramp5('#f2c050');
  const lx = cx;
  const ly = H * 0.6;
  const LR = rx * 0.78;
  const lineX = fx - RWx * 1.3;
  const lineY = fy - RWy * 1.3;

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const X = x + 0.5;
      const Y = y + 0.5;
      const e = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2;
      const ef = ((X - cx) / fx) ** 2 + ((Y - cy - 1) / fy) ** 2;
      const check = (x + y) % 2 === 0;
      if (ef <= 1) {
        // tapete: charco de luz por bandas con tramado en los bordes
        const d = Math.hypot((X - lx) / LR, (Y - ly) / (LR * 0.5));
        let t = 1;
        if (d < 0.46) t = 3;
        else if (d < 0.54) t = check ? 3 : 2;
        else if (d < 0.9) t = 2;
        else if (d < 1.0) t = check ? 2 : 1;
        if (Y < cy && ef > 0.93) t = ef > 0.975 ? 0 : 1;
        const hsh = hash(x, y);
        if (hsh < 0.025) t = Math.min(4, t + 1);
        else if (hsh > 0.975) t = Math.max(0, t - 1);
        let c = FELT[t];
        const el = Math.sqrt(((X - cx) / lineX) ** 2 + ((Y - cy - 1) / lineY) ** 2);
        if (Math.abs(el - 1) * Math.min(lineX, lineY) < 0.55) c = (x >> 1) % 3 === 0 ? GOLD[2] : GOLD[3];
        P.put(x, y, c);
      } else if (e <= 1) {
        // borde de madera por bandas
        const rho = Math.sqrt(e);
        const rhoF = rho / Math.sqrt(ef);
        const s = (1 - rho) / Math.max(1e-4, 1 - rhoF);
        let t = s < 0.16 ? 1 : s < 0.42 ? 3 : s < 0.76 ? 2 : s < 0.9 ? 1 : 0;
        const th = Math.atan2((Y - cy) / ry, (X - cx) / rx);
        if (s > 0.2 && s < 0.4 && th < -1.5 && th > -2.7 && Math.floor(th * 45) % 3 === 0) t = 4;
        if (s > 0.46 && s < 0.72 && Math.floor(th * 60 + s * 4) % 9 === 0) t = 1;
        if (rho > 1 - 0.9 / Math.min(rx, ry)) t = 0;
        P.put(x, y, RIM[t]);
      } else {
        const ea = ((X - cx) / rx) ** 2 + ((Y - cy - T) / ry) ** 2;
        if (ea <= 1 && Y > cy - ry * 0.1) {
          let t = 1;
          if (ea > 0.982) t = 0;
          else if (Math.round(X) % Math.max(8, Math.round(W / 40)) === 0) t = 0;
          else if (Math.round(X) % Math.max(8, Math.round(W / 40)) === 1) t = 2;
          P.put(x, y, APRON[t]);
        } else {
          const es = ((X - cx - 2) / (rx + 5)) ** 2 + ((Y - cy - T - 4) / (ry + 4)) ** 2;
          if (es <= 1 && check) P.put(x, y, [28, 10, 18], 0.42);
        }
      }
    }

  // fichas de póker apiladas
  const chips = (x: number, base: number, n: number, seed: number) => {
    const cols = ['#ee4a5e', '#3a86ec', '#f6e4c2', '#3c3250', '#ffcf3d'];
    for (let i = 0; i < n; i++) {
      const C = ramp5(cols[Math.floor(hash(seed, i) * cols.length)]);
      const yy = base - i * 2;
      shape(P, ell(x, yy, 4.2, 1.7), C, [x - 5, yy - 2, x + 5, yy + 2], { tone: (X, Y, t) => (Y > yy + 0.3 ? (Math.floor(X) % 3 === 0 ? 4 : 1) : t) });
    }
  };
  chips(Math.round(cx - rx * 0.56), Math.round(H * 0.76), 5, 1);
  chips(Math.round(cx - rx * 0.56) + 9, Math.round(H * 0.77), 3, 2);
  chips(Math.round(cx + rx * 0.6), Math.round(H * 0.73), 4, 3);
  P.flush();
}

// ───────────────────────── mesa vista desde arriba (móvil) ─────────────────────────

export function paintTopTable(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H);
  const P = new Px(W, H, ctx);
  const FELT = ramp5('#3cae5e');
  const RIM = ramp5('#c9723e');
  const GOLD = ramp5('#f2c050');
  const m = 2;
  const R = Math.min(10, Math.floor(Math.min(W, H) / 5));
  const rim = Math.max(4, Math.round(Math.min(W, H) * 0.05));
  const inRR = (x: number, y: number, x0: number, y0: number, x1: number, y1: number, rad: number) => {
    const cx = Math.max(x0 + rad, Math.min(x1 - rad, x));
    const cy = Math.max(y0 + rad, Math.min(y1 - rad, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const X = x + 0.5;
      const Y = y + 0.5;
      if (!inRR(X, Y, m, m, W - m, H - m - 2, R)) {
        if (inRR(X, Y, m + 2, m + 3, W - m + 1, H - m + 1, R) && (x + y) % 2 === 0) P.put(x, y, [28, 10, 18], 0.4);
        continue;
      }
      const inner = inRR(X, Y, m + rim, m + rim, W - m - rim, H - m - 2 - rim, Math.max(2, R - rim));
      if (!inner) {
        let t = 2;
        if (!inRR(X, Y, m + 1, m + 1, W - m - 1, H - m - 3, R - 1)) t = 0;
        else if (!inRR(X, Y, m + 2, m + 2, W - m - 2, H - m - 4, R - 2) && Y < H / 2) t = 3;
        else if (inRR(X, Y, m + rim - 1, m + rim - 1, W - m - rim + 1, H - m - 1 - rim, Math.max(2, R - rim + 1))) t = 0;
        P.put(x, y, RIM[t]);
      } else {
        const d = Math.hypot((X - W / 2) / (W * 0.42), (Y - H * 0.55) / (H * 0.42));
        let t = d < 0.55 ? 3 : d < 0.62 ? ((x + y) % 2 ? 3 : 2) : d < 0.95 ? 2 : 1;
        if (hash(x, y) < 0.02) t = Math.min(4, t + 1);
        const nearLine = !inRR(X, Y, m + rim + 4, m + rim + 4, W - m - rim - 4, H - m - 6 - rim, Math.max(2, R - rim - 2)) && inRR(X, Y, m + rim + 3, m + rim + 3, W - m - rim - 3, H - m - 5 - rim, Math.max(2, R - rim - 1));
        P.put(x, y, nearLine ? GOLD[3] : FELT[t]);
      }
    }
  P.flush();
}

// ───────────────────────── pueblo (portada y sala) ─────────────────────────

/** Fachada de madera con falso frente, cartel, ventanas, puerta y porche. */
function building(
  P: Px,
  x0: number,
  base: number,
  w: number,
  h: number,
  o: { color: string; trim: string; sign: string; awning?: [string, string]; star?: boolean; doors?: 'swing' | 'plain' },
) {
  const B = ramp5(o.color);
  const T = ramp5(o.trim);
  const D = ramp5('#7a4430');
  const top = base - h;
  const step = Math.max(3, Math.round(w * 0.12));
  // falso frente escalonado
  const facade: Mask = (X, Y) => X >= x0 && X < x0 + w && Y >= top && Y < base && !(Y < top + step && (X < x0 + step || X >= x0 + w - step));
  shape(P, facade, B, [x0 - 1, top - 1, x0 + w + 1, base], {
    tone: (X, Y, t) => (t <= 1 ? t : Math.floor(X - x0) % 4 === 0 ? 1 : Math.floor(X - x0) % 4 === 1 ? 3 : 2),
  });
  // cornisa
  shape(P, (X, Y) => Y >= top + step - 1 && Y < top + step + 1 && X >= x0 - 1 && X < x0 + w + 1, T, [x0 - 2, top + step - 2, x0 + w + 2, top + step + 1], { base: 3 });
  shape(P, (X, Y) => Y >= top - 1 && Y < top + 1 && X >= x0 + step - 1 && X < x0 + w - step + 1, T, [x0 + step - 2, top - 2, x0 + w - step + 2, top + 1], { base: 3 });
  // cartel con letras
  const tw = textWidth(o.sign);
  const sx = Math.round(x0 + (w - tw) / 2);
  const sy = top + step + 3;
  shape(P, (X, Y) => X >= sx - 3 && X < sx + tw + 3 && Y >= sy - 2 && Y < sy + 7, D, [sx - 4, sy - 3, sx + tw + 4, sy + 7]);
  text(P, o.sign, sx, sy, T[4]);
  if (o.star) {
    const G = ramp5('#ffd04a');
    const cx = x0 + w / 2;
    const cy = sy + 12;
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1], [-1, 2], [1, 2]]) P.put(cx + dx, cy + dy, dy < 0 ? G[3] : G[2]);
  }
  // ventanas
  const winY = Math.round(top + h * 0.48);
  const winW = Math.max(5, Math.round(w * 0.16));
  const winH = Math.max(6, Math.round(h * 0.2));
  const GL = ramp5('#5ab4ec');
  for (const wx of [x0 + Math.round(w * 0.12), x0 + w - Math.round(w * 0.12) - winW]) {
    shape(P, (X, Y) => X >= wx && X < wx + winW && Y >= winY && Y < winY + winH, GL, [wx - 1, winY - 1, wx + winW + 1, winY + winH + 1], {
      tone: (X, Y, t) => (Math.floor(X) === wx + 1 && Y < winY + winH - 1 ? 4 : Math.floor(Y) === winY + Math.floor(winH / 2) ? 1 : t),
    });
    P.rect(wx - 1, winY - 2, winW + 2, 1, T[3]);
    P.rect(wx - 1, winY + winH, winW + 2, 1, T[2]);
  }
  // puerta
  const dw = Math.max(5, Math.round(w * 0.2));
  const dx0 = Math.round(x0 + (w - dw) / 2);
  const dh = Math.max(8, Math.round(h * 0.32));
  if (o.doors === 'swing') {
    P.rect(dx0, base - dh, dw, dh, ramp5('#3a2230')[1]);
    shape(P, (X, Y) => Y >= base - dh + 2 && Y < base - 3 && ((X >= dx0 && X < dx0 + dw / 2 - 0.5) || (X >= dx0 + dw / 2 + 0.5 && X < dx0 + dw)), D, [dx0 - 1, base - dh + 1, dx0 + dw + 1, base - 2]);
  } else {
    shape(P, (X, Y) => X >= dx0 && X < dx0 + dw && Y >= base - dh && Y < base, D, [dx0 - 1, base - dh - 1, dx0 + dw + 1, base], { tone: (X, Y, t) => (t > 1 && Math.floor(X) === dx0 + dw - 2 && Math.floor(Y) === base - Math.floor(dh / 2) ? 4 : t) });
  }
  // toldo de rayas o tejadillo con sombra
  const ay = base - dh - 4;
  if (o.awning) {
    const A1 = ramp5(o.awning[0]);
    const A2 = ramp5(o.awning[1]);
    for (let y = ay; y < ay + 4; y++)
      for (let x = x0 - 2; x < x0 + w + 2; x++) {
        const stripe = Math.floor((x - x0) / 3) % 2 === 0;
        const t = y === ay ? 3 : y === ay + 3 ? 1 : 2;
        P.put(x, y, (stripe ? A1 : A2)[t]);
      }
    for (let x = x0 - 2; x < x0 + w + 2; x += 3) P.put(x + 1, ay + 4, ramp5(o.awning[0])[1]);
  } else {
    for (let x = x0 - 2; x < x0 + w + 2; x++) {
      P.put(x, ay + 2, D[3]);
      P.put(x, ay + 3, D[1]);
    }
  }
  for (let x = x0; x < x0 + w; x++) for (let y = ay + 4; y < ay + 6; y++) P.tint(x, y, [40, 16, 30], 0.25);
  // postes y pasarela de tablas
  for (const px of [x0 - 1, x0 + w]) P.rect(px, ay + 2, 1, base - ay - 2, D[1]);
  for (let x = x0 - 3; x < x0 + w + 3; x++) {
    P.put(x, base, D[3]);
    P.put(x, base + 1, (x - x0) % 5 === 0 ? D[0] : D[2]);
    P.put(x, base + 2, D[0]);
  }
}

function barrel(P: Px, x: number, base: number) {
  const W2 = ramp5('#b8683a');
  const m: Mask = (X, Y) => Y >= base - 8 && Y < base && Math.abs(X - x) <= 3.2 + (1 - ((Y - (base - 4)) / 4) ** 2) * 0.8;
  shape(P, m, W2, [x - 5, base - 9, x + 5, base], { tone: (X, Y, t) => (t > 1 && (Math.floor(Y) === base - 6 || Math.floor(Y) === base - 2) ? 0 : t > 1 && Math.floor(X) === x - 2 ? 3 : t) });
}

export function cloud(P: Px, cx: number, cy: number, s: number) {
  const parts = [ell(cx, cy, 6 * s, 3 * s), ell(cx - 5 * s, cy + 1, 4 * s, 2.4 * s), ell(cx + 5 * s, cy + 1, 4.4 * s, 2.6 * s), ell(cx - 1 * s, cy - 2.4 * s, 4 * s, 3 * s)];
  const m: Mask = (X, Y) => parts.some((p) => p(X, Y));
  const CL = [hex('#9fbfe0'), hex('#c4dcf0'), hex('#eaf4fb'), hex('#ffffff'), hex('#ffffff')];
  shape(P, m, CL, [cx - 10 * s, cy - 6 * s, cx + 10 * s, cy + 4 * s], { outline: false, shadow: 2 });
}

function waterTower(P: Px, x: number, base: number, s: number) {
  const D = ramp5('#8a5236');
  const T = ramp5('#c27a46');
  const legH = Math.round(14 * s);
  for (const lx of [x - 6 * s, x + 6 * s]) for (let y = base - legH; y < base; y++) P.put(Math.round(lx + ((y - base) / legH) * (lx < x ? -1.5 : 1.5)), y, D[1]);
  for (let y = base - legH; y < base; y += 4) for (let xx = Math.round(x - 6 * s); xx <= x + 6 * s; xx++) if ((xx + y) % 3 === 0) P.put(xx, y, D[0]);
  const tankTop = base - legH - Math.round(10 * s);
  shape(P, (X, Y) => Y >= tankTop && Y < base - legH && Math.abs(X - x) <= 7.5 * s, T, [x - 9 * s, tankTop - 1, x + 9 * s, base - legH], { tone: (X, Y, t) => (t > 1 && Math.floor(X) % 3 === 0 ? 1 : t) });
  shape(P, (X, Y) => Y >= tankTop - 4 * s && Y < tankTop + 1 && Math.abs(X - x) <= 8.5 * s - (Y - (tankTop - 4 * s)) * -0 && Math.abs(X - x) <= 2 + (Y - (tankTop - 4 * s)) * 1.8, D, [x - 10 * s, tankTop - 5 * s, x + 10 * s, tankTop + 1], { base: 3 });
}

function wagonWheel(P: Px, cx: number, cy: number) {
  const W2 = ramp5('#a35e36');
  shape(P, (X, Y) => {
    const d = Math.hypot(X - cx, Y - cy);
    if (d > 5.6) return false;
    if (d > 4.2) return true;
    const a = Math.atan2(Y - cy, X - cx);
    return d < 1.4 || Math.abs(Math.sin(a * 4)) < 0.28;
  }, W2, [cx - 7, cy - 7, cx + 7, cy + 7]);
}

export function paintTown(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const u = Math.max(0.7, H / 200);
  const r = (v: number) => Math.round(v * u);
  const horizon = Math.round(H * 0.46);

  // cielo por bandas con tramado en las uniones
  const SKY = ['#3aa6ec', '#54b6f0', '#78c8f4', '#a2daf6', '#cdeef8', '#ffe8bc'].map(hex);
  for (let y = 0; y < horizon; y++) {
    const v = (y / horizon) * (SKY.length - 1);
    const i = Math.floor(v);
    const f = v - i;
    for (let x = 0; x < W; x++) {
      const c = f > 0.82 && (x + y) % 2 === 0 ? SKY[Math.min(SKY.length - 1, i + 1)] : SKY[i];
      P.put(x, y, c);
    }
  }
  // sol con halo
  const sunX = Math.round(W * 0.82);
  const sunY = Math.round(horizon * 0.3);
  for (let y = sunY - r(14); y < sunY + r(14); y++)
    for (let x = sunX - r(14); x < sunX + r(14); x++) {
      const d = Math.hypot(x - sunX, y - sunY);
      if (d < r(5)) P.put(x, y, hex(d < r(3.5) ? '#fffbe6' : '#fff0b0'));
      else if (d < r(8) && (x + y) % 2 === 0) P.tint(x, y, hex('#fff2c0'), 0.6);
      else if (d < r(12) && x % 2 === 0 && y % 2 === 0) P.tint(x, y, hex('#fff2c0'), 0.4);
    }
  cloud(P, Math.round(W * 0.2), Math.round(horizon * 0.22), u);
  cloud(P, Math.round(W * 0.58), Math.round(horizon * 0.12), u * 0.8);
  cloud(P, Math.round(W * 0.92), Math.round(horizon * 0.5), u * 0.7);
  cloud(P, Math.round(W * 0.42), Math.round(horizon * 0.42), u * 0.6);

  // montañas lejanas (rosadas) y mesetas cercanas (naranjas)
  const FAR = ramp5('#d79ac4');
  const NEAR = ramp5('#ef8a4c');
  for (let x = 0; x < W; x++) {
    const hFar = Math.round(r(16) + Math.sin(x * 0.045) * r(5) + Math.sin(x * 0.11 + 1) * r(2));
    for (let y = horizon - hFar; y < horizon; y++) P.put(x, y, y === horizon - hFar ? FAR[3] : (x + y) % 11 === 0 ? FAR[1] : FAR[2]);
  }
  const mesas: [number, number, number][] = [
    [0.08, 0.16, r(24)],
    [0.34, 0.12, r(18)],
    [0.6, 0.2, r(28)],
    [0.88, 0.14, r(20)],
  ];
  for (const [fx, fw, mh] of mesas) {
    const x0 = Math.round(W * fx);
    const w = Math.round(W * fw);
    const m: Mask = (X, Y) => {
      const dx = Math.abs(X - (x0 + w / 2));
      const half = w / 2 + (Y - (horizon - mh)) * 0.35;
      return Y >= horizon - mh && Y < horizon && dx <= half;
    };
    shape(P, m, NEAR, [x0 - mh, horizon - mh - 1, x0 + w + mh, horizon], {
      outline: false,
      tone: (X, Y, t) => (t === 3 ? 3 : X > x0 + w * 0.62 ? 1 : (Math.floor(Y) - (horizon - mh)) % 5 === 4 ? 1 : 2),
    });
  }

  // suelo de arena con camino, rodadas y piedrecitas
  const SAND = ramp5('#f4c27c');
  for (let y = horizon; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = (y - horizon) / (H - horizon);
      let t = 2;
      const road = v > 0.34 && v < 0.62;
      if (road) t = 3;
      const rut = road && (Math.abs(v - 0.41) < 0.01 || Math.abs(v - 0.55) < 0.01);
      const hsh = hash(x, y);
      if (hsh < 0.012) t = 1;
      else if (hsh > 0.992) t = 4;
      P.put(x, y, rut ? mix(SAND[2], SAND[1], 0.45) : SAND[t]);
    }
  for (let i = 0; i < W / 8; i++) {
    const x = Math.floor(hash(i, 1) * W);
    const y = horizon + 4 + Math.floor(hash(i, 2) * (H - horizon - 6));
    const kind = hash(i, 3);
    if (kind < 0.55) {
      P.put(x, y, SAND[1]);
      P.put(x + 1, y, SAND[1]);
      P.put(x, y - 1, SAND[4]);
    } else {
      const G = ramp5('#5cc060');
      P.put(x, y, G[2]);
      P.put(x - 1, y - 1, G[3]);
      P.put(x + 1, y - 1, G[3]);
      if (kind > 0.85) P.put(x, y - 2, ramp5(kind > 0.93 ? '#ff7aa8' : '#ffd04a')[2]);
    }
  }

  // edificios a los lados (el centro queda libre para el título y el panel)
  const base = horizon + r(18);
  const bw = Math.max(34, r(46));
  const bh = Math.max(34, r(48));
  if (W > 160) {
    waterTower(P, Math.round(W * 0.305), base - r(2), u * 1.45);
    building(P, r(4), base, bw, bh, { color: '#d9534f', trim: '#fff0d8', sign: 'SALOON', doors: 'swing' });
    building(P, r(4) + bw + r(6), base, Math.round(bw * 0.85), Math.round(bh * 0.8), { color: '#33a89c', trim: '#fff0d8', sign: 'TIENDA', awning: ['#ee4a4a', '#fff0d8'] });
    building(P, W - r(4) - bw, base, bw, bh, { color: '#e8a83e', trim: '#fff0d8', sign: 'SHERIFF', star: true });
    building(P, W - r(4) - bw - r(6) - Math.round(bw * 0.85), base, Math.round(bw * 0.85), Math.round(bh * 0.82), { color: '#7a86c8', trim: '#fff0d8', sign: 'BANCO' });
    barrel(P, r(4) + bw + 2, base + 1);
    barrel(P, r(4) + bw - 6, base + 1);
    wagonWheel(P, W - r(4) - bw - r(10), base - 4);
  }

  // cactus y matorrales en primer plano
  cactus(P, Math.round(W * 0.05), H - r(10), r(22));
  cactus(P, Math.round(W * 0.93), H - r(14), r(26));
  cactus(P, Math.round(W * 0.16), H - r(30), r(12), false);
  cactus(P, Math.round(W * 0.8), H - r(36), r(10));
  for (const [fx, fy] of [
    [0.3, 0.92],
    [0.66, 0.95],
    [0.5, 0.99],
  ]) {
    const x = Math.round(W * fx);
    const y = Math.round(H * fy);
    const TW = ramp5('#c2884a');
    shape(P, (X, Y) => {
      const d = Math.hypot(X - x, (Y - y) * 1.2);
      return d < 4 && (Math.floor(X * 1.7 + Y) % 3 !== 0 || d < 1.5);
    }, TW, [x - 5, y - 5, x + 5, y + 5]);
  }
  P.flush();
}
