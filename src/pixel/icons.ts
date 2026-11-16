// Iconos de 16×16 dibujados con formas y sombreado por bandas, con el mismo estilo
// que los personajes: borde luminoso arriba-izquierda, sombra abajo-derecha y contorno de color.
import { ramp5 } from './chibi';

export type RGB = [number, number, number];
export type Ramp = RGB[];
export type Mask = (x: number, y: number) => boolean;

const S = 16;
export const INK: RGB = [36, 18, 38];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const custom = (...h: string[]): Ramp => h.map(hex);

// ───────────────────────── formas ─────────────────────────

export const rect =
  (x0: number, y0: number, x1: number, y1: number): Mask =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
export const rrect =
  (x0: number, y0: number, x1: number, y1: number, r: number): Mask =>
  (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.max(x0 + r, Math.min(x1 - r, x));
    const cy = Math.max(y0 + r, Math.min(y1 - r, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
export const ell =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
export const segD = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};
export const seg =
  (ax: number, ay: number, bx: number, by: number, r: number): Mask =>
  (x, y) =>
    segD(x, y, ax, ay, bx, by) <= r;
export const poly =
  (pts: [number, number][]): Mask =>
  (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
export const ring =
  (cx: number, cy: number, r0: number, r1: number, a0 = 0, a1 = 360): Mask =>
  (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r0 || d > r1) return false;
    let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    while (a < a0) a += 360;
    return a <= a1;
  };
export const or =
  (...m: Mask[]): Mask =>
  (x, y) =>
    m.some((f) => f(x, y));
export const minus =
  (a: Mask, b: Mask): Mask =>
  (x, y) =>
    a(x, y) && !b(x, y);
export const star = (cx: number, cy: number, ro: number, ri: number, n = 5, rot = -90): Mask => {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
};

// ───────────────────────── lienzo ─────────────────────────

interface AddOpt {
  base?: number;
  light?: boolean;
  shade?: boolean;
  inner?: boolean;
  spot?: [number, number];
  tone?: (x: number, y: number, t: number) => number;
}

export class Ico {
  ramp: (Ramp | null)[];
  tone: Int8Array;
  part: Int16Array;
  direct: (RGB | null)[];
  private parts = 0;

  constructor(
    public W = S,
    public H = S,
  ) {
    const n = W * H;
    this.ramp = new Array(n).fill(null);
    this.tone = new Int8Array(n);
    this.part = new Int16Array(n).fill(-1);
    this.direct = new Array(n).fill(null);
  }

  add(mask: Mask, r: Ramp, o: AddOpt = {}) {
    const id = this.parts++;
    const W = this.W;
    const H = this.H;
    const M = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask(x + 0.5, y + 0.5)) M[y * W + x] = 1;
    const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && M[y * W + x] === 1;
    const out: [number, number][] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inM(x, y)) continue;
        let t = o.base ?? 2;
        if (o.light !== false && (!inM(x - 1, y) || !inM(x, y - 1))) t = 3;
        if (o.shade !== false && (!inM(x + 1, y) || !inM(x, y + 1))) t = 1;
        if (o.spot && Math.hypot(x + 0.5 - o.spot[0], y + 0.5 - o.spot[1]) < 0.8) t = 4;
        if (o.tone) t = o.tone(x + 0.5, y + 0.5, t);
        if (o.inner !== false)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || inM(nx, ny)) continue;
            const j = ny * W + nx;
            if (this.part[j] >= 0 && this.part[j] !== id) {
              t = 0;
              break;
            }
          }
        out.push([y * W + x, t]);
      }
    for (const [i, t] of out) {
      this.ramp[i] = r;
      this.tone[i] = Math.max(0, Math.min(4, t));
      this.part[i] = id;
      this.direct[i] = null;
    }
  }

  px(x: number, y: number, c: RGB) {
    if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.direct[y * this.W + x] = c;
  }

  outline() {
    const W = this.W;
    const H = this.H;
    const add: [number, RGB][] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.ramp[i]) continue;
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const r = this.ramp[ny * W + nx];
          if (!r) continue;
          add.push([i, mix(r[0], INK, 0.35)]);
          break;
        }
      }
    for (const [i, c] of add) this.direct[i] = c;
  }

  canvas(outline = true): HTMLCanvasElement {
    if (outline) this.outline();
    const c = document.createElement('canvas');
    c.width = this.W;
    c.height = this.H;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.W, this.H);
    for (let i = 0; i < this.W * this.H; i++) {
      const col = this.direct[i] ?? (this.ramp[i] ? this.ramp[i]![this.tone[i]] : null);
      if (!col) continue;
      img.data[i * 4] = col[0];
      img.data[i * 4 + 1] = col[1];
      img.data[i * 4 + 2] = col[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

// ───────────────────────── colores ─────────────────────────

export const C = {
  steel: ramp5('#9aa2c0'),
  dark: ramp5('#5a5470'),
  wood: ramp5('#c9703c'),
  woodD: ramp5('#94492f'),
  gold: ramp5('#f4b63e'),
  red: ramp5('#ea4450'),
  green: ramp5('#3fae5a'),
  blue: ramp5('#3f82ea'),
  sky: ramp5('#74c8f4'),
  cream: ramp5('#f6e4c2'),
  paper: ramp5('#f6e2b8'),
  tan: ramp5('#d4a25e'),
  brown: ramp5('#9a5a36'),
  violet: ramp5('#a45ee0'),
  amber: custom('#7a3218', '#b8561e', '#ec8c2a', '#ffb84a', '#ffe08a'),
  fire: custom('#b4382c', '#e8582e', '#ff9a3a', '#ffd84a', '#fff6c8'),
  flame: custom('#e8582e', '#ff9a3a', '#ffd84a', '#fff0a0', '#ffffff'),
};

// ───────────────────────── dibujos ─────────────────────────

const DRAW: Record<string, (i: Ico) => void> = {
  disparo: (i) => {
    i.add(
      (x, y) => {
        const a = Math.atan2(y - 8, x - 8);
        return Math.hypot(x - 8, y - 8) <= 3.3 + 4.4 * Math.abs(Math.cos(4 * a)) ** 5;
      },
      C.fire,
      { tone: (x, y, t) => (t <= 1 ? t : Math.hypot(x - 8, y - 8) < 1.8 ? 4 : Math.hypot(x - 8, y - 8) < 3.3 ? 3 : 2) },
    );
  },
  esquiva: (i) => {
    i.add(ring(8.5, 8.5, 3.3, 5.6, 175, 380), C.sky, { tone: (x, y, t) => (t === 2 && y < 7 ? 3 : t) });
    const a = (20 * Math.PI) / 180;
    const ex = 8.5 + Math.cos(a) * 4.45;
    const ey = 8.5 + Math.sin(a) * 4.45;
    const dx = -Math.sin(a);
    const dy = Math.cos(a);
    i.add(poly([[ex + dx * 3.6, ey + dy * 3.6], [ex - dy * 3.4, ey + dx * 3.4], [ex + dy * 3.4, ey - dx * 3.4]]), C.sky);
    i.px(1, 6, C.sky[3]);
    i.px(2, 6, C.sky[2]);
    i.px(1, 10, C.sky[3]);
    i.px(2, 10, C.sky[2]);
    i.px(3, 10, C.sky[1]);
  },
  manzanilla: (i) => {
    i.add(rrect(4, 6.5, 11.9, 15, 2.2), C.amber, { tone: (x, y, t) => (t > 1 && x < 5.9 && y > 8 && y < 14 ? 4 : t) });
    i.add(rect(6.5, 2, 9.4, 7), C.amber, { inner: false });
    i.add(rect(6.5, 0.8, 9.4, 2.4), C.brown, { inner: false });
    i.add(rect(4.2, 9.2, 11.8, 12.6), C.cream, { inner: false, tone: (x, y, t) => (y > 10.4 && y < 11.4 ? 2 + (t === 1 ? 0 : 0) : t) });
    for (let x = 5; x <= 11; x++) i.px(x, 10, C.red[2]);
  },
  picnic: (i) => {
    i.add(poly([[4, 11], [4.6, 6.4], [6.4, 8.2], [8, 1.4], [9.8, 7], [11.2, 4.8], [12.2, 11]]), C.fire, { tone: (x, y, t) => (t <= 1 ? t : y < 6 ? 3 : 2) });
    i.add(poly([[5.8, 11.5], [6.6, 8.4], [8, 5.2], [9.6, 8.4], [10.4, 11.5]]), C.flame, { inner: false });
    i.add(ell(8, 10.6, 1.6, 1.3), C.flame, { inner: false, base: 4 });
    i.add(seg(2.8, 13.8, 13.2, 11.2, 1.35), C.woodD);
    i.add(seg(2.8, 11.2, 13.2, 13.8, 1.35), C.wood);
    i.px(3, 3, C.fire[3]);
    i.px(13, 2, C.fire[2]);
    i.px(12, 0, C.fire[3]);
  },
  correo: (i) => {
    i.add(rect(1.5, 3.5, 14.4, 12.6), C.paper, { tone: (x, y, t) => (t <= 1 ? t : Math.abs(segD(x, y, 1.5, 3.5, 8, 8.6)) < 0.6 || Math.abs(segD(x, y, 14.4, 3.5, 8, 8.6)) < 0.6 ? 1 : segD(x, y, 1.5, 12.6, 6, 8.6) < 0.5 || segD(x, y, 14.4, 12.6, 10, 8.6) < 0.5 ? 1 : t) });
    i.add(ell(8, 8.8, 2.1, 1.9), C.red, { spot: [7.3, 8.2] });
  },
  encomienda: (i) => {
    i.add(ell(5, 5.4, 1.8, 1.2), C.gold, { spot: [4.6, 5] });
    i.add(ell(8.2, 4.4, 1.8, 1.2), C.gold, { spot: [7.8, 4] });
    i.add(ell(11.2, 5.4, 1.8, 1.2), C.gold, { spot: [10.8, 5] });
    i.add(rect(1.6, 8.5, 14.4, 14.6), C.wood, { tone: (x, y, t) => (t === 2 && Math.floor(y) === 11 ? 1 : t) });
    i.add(rrect(1.6, 5.6, 14.4, 8.6, 1.6), C.wood, { tone: (x, y, t) => (t === 2 ? 3 : t) });
    i.add(or(rect(3.5, 5.8, 4.6, 14.5), rect(11.4, 5.8, 12.5, 14.5)), C.steel, { inner: false });
    i.add(rrect(6.6, 7.6, 9.4, 11.2, 0.8), C.gold, { spot: [7.3, 8.3] });
    i.px(8, 10, C.gold[0]);
    i.px(13, 2, C.gold[4]);
  },
  mercadillo: (i) => {
    // mazo de subastador sobre su taco
    i.add(rrect(7.6, 12.2, 15, 15, 1), C.woodD, { tone: (x, y, t) => (t === 2 ? 3 : t) });
    i.add(seg(5.6, 6.4, 12.4, 13, 1), C.wood);
    i.add(rrect(1.4, 1.6, 10.2, 6.6, 1.8), C.wood, { spot: [3, 3] });
    i.add(or(rect(3, 1.6, 4, 6.6), rect(7.6, 1.6, 8.6, 6.6)), C.gold, { inner: false });
  },
  hurto: (i) => {
    i.add(or(ell(8, 10.6, 5.4, 4.6), ell(8, 6.6, 2.6, 2.2)), C.tan, { spot: [5.5, 8.5] });
    i.add(ell(8, 3.4, 2.8, 1.6), C.tan);
    i.add(rect(5.6, 4.6, 10.4, 5.8), C.red, { inner: false });
    const g = C.green[0];
    [[8, 8], [7, 9], [8, 10], [9, 11], [8, 12], [7, 13], [9, 9], [7, 12], [8, 7], [8, 13]].forEach(([x, y]) => i.px(x, y, g));
  },
  travesura: (i) => {
    const rope = (x: number, y: number, t: number) => (t <= 1 ? t : Math.floor((Math.atan2(y - 6.5, x - 8) * 6) / Math.PI + x) % 2 === 0 ? 3 : 2);
    i.add(minus(ell(8, 6.5, 6.3, 4.8), ell(8, 6.5, 4.1, 2.8)), C.tan, { tone: rope });
    i.add(seg(8.4, 11, 11, 15, 1), C.tan, { tone: (x, y, t) => (t <= 1 ? t : (Math.floor(y) % 2 ? 3 : 2)) });
    i.add(ell(8.2, 11.2, 1.5, 1.2), C.tan);
  },
  rafaga: (i) => {
    for (const [bx, by] of [
      [4.5, 3.4],
      [7.5, 8],
      [4.5, 12.6],
    ]) {
      i.add(rect(bx - 2, by - 1.3, bx + 2.4, by + 1.3), C.gold, { spot: [bx - 1, by - 0.6] });
      i.add(ell(bx + 3.2, by, 1.9, 1.3), C.steel, { spot: [bx + 2.8, by - 0.5] });
      i.px(Math.floor(bx - 4), Math.floor(by), C.sky[3]);
      i.px(Math.floor(bx - 5), Math.floor(by), C.sky[2]);
    }
  },
  estampida: (i) => {
    i.add(ell(2.5, 14.2, 1.8, 1.2), C.cream);
    i.add(ell(13.5, 14.2, 1.8, 1.2), C.cream);
    i.add(or(seg(4.6, 6.4, 1.8, 3.6, 1), seg(1.8, 3.6, 1.6, 1.4, 0.8), seg(11.4, 6.4, 14.2, 3.6, 1), seg(14.2, 3.6, 14.4, 1.4, 0.8)), C.cream);
    i.add(or(ell(3.6, 7.6, 1.6, 1), ell(12.4, 7.6, 1.6, 1)), C.brown);
    i.add(ell(8, 8.8, 4.4, 4.9), C.brown, { spot: [6.4, 6.6] });
    i.add(ell(8, 12.2, 3, 2), ramp5('#f2b0a0'), { spot: [7, 11.6] });
    i.add(ell(8, 5, 2, 1.1), ramp5('#5a3426'));
    i.px(6, 8, INK);
    i.px(10, 8, INK);
    i.px(7, 12, C.red[0]);
    i.px(9, 12, C.red[0]);
  },
  duelo: (i) => {
    for (const s of [-1, 1]) {
      i.add(seg(8 - s * 5.2, 2.4, 8 + s * 1.6, 9.2, 0.95), C.steel, { spot: [8 - s * 3.6, 4.2] });
      i.add(ell(8 + s * 1.4, 9.6, 1.7, 1.6), C.dark);
      i.add(seg(8 + s * 1.8, 10.4, 8 + s * 4.4, 14, 1.4), C.wood);
    }
  },
  barril: (i) => {
    const body: Mask = (x, y) => Math.abs(y - 8.8) <= 6 && Math.abs(x - 8) <= 4.6 + 1.1 * (1 - ((y - 8.8) / 6) ** 2);
    i.add(body, C.wood, { tone: (x, y, t) => (t <= 1 ? t : Math.floor(x) % 3 === 0 ? 1 : x < 7 ? 3 : t) });
    i.add(or(rect(1, 4.6, 15, 5.5), rect(1, 11.8, 15, 12.7)), C.dark, { inner: false, light: false });
    i.add(ell(8, 2.9, 4.5, 1.3), C.woodD, { base: 3 });
  },
  catalejo: (i) => {
    i.add(seg(2.8, 13.2, 6.4, 9.6, 1.5), C.dark);
    i.add(seg(6.6, 9.4, 7.4, 8.6, 2.1), C.gold, { inner: false });
    i.add(seg(7.6, 8.4, 10.6, 5.4, 1.8), C.brown, { spot: [8.2, 6.8] });
    i.add(seg(10.6, 5.4, 11.4, 4.6, 2.4), C.gold, { inner: false });
    i.add(ell(12.4, 3.6, 2.3, 2.3), C.gold);
    i.add(ell(12.6, 3.4, 1.3, 1.3), C.sky, { inner: false, base: 3 });
    i.px(12, 3, [255, 255, 255]);
  },
  calabozo: (i) => {
    for (const x of [2.4, 5.6, 8.8, 12]) i.add(rect(x, 3, x + 1.6, 13.4), C.steel, { tone: (xx, y, t) => (t <= 1 ? t : xx < x + 0.9 ? 3 : 2) });
    i.add(rect(1, 1.6, 15, 3.6), C.dark);
    i.add(rect(1, 12.6, 15, 14.6), C.dark);
    i.add(minus(ell(11.8, 8.2, 2, 2.3), ell(11.8, 8.2, 1, 1.3)), C.steel, { inner: false });
    i.add(rrect(9.6, 8.6, 14, 12.4, 0.8), C.gold, { spot: [10.4, 9.4] });
    i.px(11, 10, C.gold[0]);
    i.px(12, 10, C.gold[0]);
  },
  dinamita: (i) => {
    for (const k of [-1, 0, 1]) i.add(seg(8 + k * 3, 6.6, 8 + k * 3, 13.6, 1.45), C.red, { tone: (x, y, t) => (t > 1 && x < 8 + k * 3 ? 3 : t) });
    i.add(rect(3, 9.6, 13, 11.2), C.woodD, { inner: false });
    [[8, 5], [8, 4], [9, 3], [10, 2]].forEach(([x, y]) => i.px(x, y, INK));
    i.add(star(11.6, 1.8, 2.2, 0.9, 4, -45), C.flame, { inner: false, base: 3 });
  },
  tirachinas: (i) => {
    i.add(rect(6, 5.2, 13.2, 7.2), C.steel, { spot: [7.5, 5.7] });
    i.add(rrect(3.4, 4.6, 7.6, 9.2, 1), C.steel);
    i.add(seg(4.8, 8.8, 3, 12.6, 1.6), C.wood, { spot: [3.6, 10] });
    i.px(7, 9, C.dark[1]);
    i.px(7, 10, C.dark[1]);
  },
  repetidora: (i) => {
    i.add(rect(7, 4.4, 15, 6.5), C.steel, { spot: [8.6, 4.9] });
    i.add(rect(8.6, 6.5, 14, 7.5), C.dark, { inner: false });
    i.add(rrect(3.4, 3.8, 8.4, 9.2, 1), C.gold, { spot: [4.6, 4.8] });
    i.add(ell(6.4, 7.2, 2.2, 1.8), C.steel, { tone: (x, y, t) => (t > 1 && Math.floor(x) % 2 === 0 ? 1 : t) });
    i.add(seg(4.6, 8.6, 2.2, 13.6, 1.7), C.wood, { spot: [3, 10.2] });
    i.add(minus(ell(7, 10.2, 1.8, 1.6), ell(7, 10, 0.9, 0.8)), C.gold, { inner: false });
  },
  revolver: (i) => {
    i.add(rect(7, 4.4, 15, 6.4), C.steel, { spot: [8.6, 4.9] });
    i.add(rect(8.4, 6.4, 13.6, 7.4), C.dark, { inner: false });
    i.add(rrect(3.4, 3.8, 8.4, 9.2, 1), C.steel);
    i.add(ell(6.4, 7.1, 2.1, 1.7), C.dark, { tone: (x, y, t) => (t > 1 && Math.floor(x) % 2 === 0 ? 3 : t) });
    i.add(rect(2.6, 2.6, 4.2, 4.4), C.dark);
    i.add(seg(4.6, 8.6, 2.2, 13.6, 1.7), C.wood, { spot: [3, 10.2] });
    i.add(minus(ell(7, 10.2, 1.8, 1.6), ell(7, 10, 0.9, 0.8)), C.steel, { inner: false });
  },
  escopeta: (i) => {
    i.add(poly([[5.4, 5.6], [0.6, 8.6], [0.6, 11.6], [2.4, 11.6], [6, 9]]), C.wood, { spot: [2, 9] });
    i.add(rect(5, 5, 15.4, 6.3), C.steel, { spot: [7, 5.4] });
    i.add(rect(5, 6.5, 15.4, 7.8), C.steel, { inner: false, base: 1 });
    i.add(rect(7.4, 7.9, 11.6, 9.3), C.wood, { inner: false });
    i.px(6, 9, C.dark[1]);
  },
  carabina: (i) => {
    i.add(poly([[4.8, 5.6], [0.6, 8.4], [0.6, 11.2], [2.4, 11.2], [5.4, 8.6]]), C.wood, { spot: [2, 8.8] });
    i.add(rect(6.4, 5.4, 15.4, 6.7), C.steel, { spot: [8, 5.8] });
    i.add(rect(8, 6.8, 13, 7.8), C.wood, { inner: false });
    i.add(rrect(4, 4.8, 7.6, 8.4, 0.8), C.gold, { spot: [4.8, 5.6] });
    i.add(minus(ell(5.4, 9.6, 1.8, 1.5), ell(5.4, 9.4, 0.9, 0.7)), C.steel, { inner: false });
  },
  rifle: (i) => {
    i.add(poly([[4.6, 6.6], [0.6, 9.4], [0.6, 12], [2.4, 12], [5.2, 9.4]]), C.wood, { spot: [2, 9.6] });
    i.add(rect(5, 6.4, 15.6, 7.5), C.steel, { spot: [6.6, 6.8] });
    i.add(rrect(5.6, 2.6, 12.4, 4.8, 1), C.dark, { spot: [7, 3.2] });
    i.add(or(rect(5, 2.4, 5.9, 5), rect(12.1, 2.4, 13, 5)), C.gold, { inner: false });
    i.add(or(rect(7, 4.8, 7.8, 6.4), rect(10.4, 4.8, 11.2, 6.4)), C.dark, { inner: false });
    i.add(rect(4, 6, 6.6, 8.6), C.steel);
  },
  poni: (i) => {
    // cabeza de caballo mirando a la izquierda, con crin
    i.add(poly([[9.2, 2.4], [10.8, 0.8], [11.2, 3.4]]), C.brown);
    i.add(or(poly([[10, 2.6], [14.6, 6], [14.6, 14.6], [8.4, 14.6], [8.2, 10], [4.4, 11.4], [1.6, 10.6], [1.4, 8.4], [5.6, 4.4]]), ell(3.2, 9.6, 2.2, 1.9)), C.tan, {
      spot: [6.4, 5.6],
      tone: (x, y, t) => (t > 1 && x > 11.4 ? 1 : t),
    });
    i.add(poly([[10.4, 2.2], [14.8, 5.4], [15.4, 13.6], [13.2, 13.6], [12.6, 6.4], [10, 4]]), ramp5('#5a3426'), { tone: (x, y, t) => (t > 1 && Math.floor(y) % 3 === 0 ? 3 : t) });
    i.add(ell(2.8, 9.8, 1.6, 1.4), ramp5('#e8b490'), { inner: false });
    i.px(7, 6, INK);
    i.px(6, 6, [255, 255, 255]);
    i.px(2, 9, ramp5('#7a3a2a')[1]);
  },
  sheriff: (i) => {
    i.add(star(8, 8.6, 7.2, 3, 5), C.gold, { spot: [6.2, 6.4], tone: (x, y, t) => (t > 1 && x > 8.6 && y > 8.6 ? 2 : t) });
    i.add(ell(8, 8.6, 1.6, 1.6), C.gold, { inner: false, base: 3 });
  },
  ayudante: (i) => {
    i.add((x, y) => (y >= 2 && y <= 9 && Math.abs(x - 8) <= 6) || (y > 9 && y <= 14.8 && Math.abs(x - 8) <= 6 - (y - 9) * 1.05), C.blue, { spot: [4.4, 4] });
    i.add(star(8, 8, 3.6, 1.5, 5), C.gold, { inner: false, base: 3 });
  },
  forajido: (i) => {
    i.add((x, y) => y >= 3 && y <= 13.6 && Math.abs(x - 8) <= 7 - (y - 3) * 0.66, C.red, { tone: (x, y, t) => (t > 1 && (Math.floor(x) + Math.floor(y) * 2) % 4 === 0 ? 4 : t) });
    i.add(or(ell(1.8, 3.2, 1.4, 1.2), ell(14.2, 3.2, 1.4, 1.2)), C.red);
  },
  renegado: (i) => {
    i.add(minus(ell(7.2, 8.2, 6, 6), ell(10.2, 6.6, 5, 5)), C.violet, { spot: [3.6, 6.6] });
    i.add(star(12.4, 11.4, 2.4, 1, 4, -45), C.gold, { inner: false, base: 3 });
  },
};

const cache = new Map<string, HTMLCanvasElement>();

export interface IconDef {
  w?: number;
  h?: number;
  draw: (i: Ico) => void;
}
const EXTRA = new Map<string, IconDef>();
/** Fuentes de sprites ya pintados (lienzos completos) que añaden otros juegos. */
const SOURCES: ((name: string) => HTMLCanvasElement | null)[] = [];

/** Añade dibujos de iconos (de cualquier tamaño) con el mismo estilo. */
export function registerIcons(defs: Record<string, IconDef | ((i: Ico) => void)>) {
  for (const [k, v] of Object.entries(defs)) EXTRA.set(k, typeof v === 'function' ? { draw: v } : v);
}
export function registerSpriteSource(fn: (name: string) => HTMLCanvasElement | null) {
  SOURCES.push(fn);
}

/** Icono si existe un dibujo con ese nombre. */
export function iconSprite(name: string): HTMLCanvasElement | null {
  const hit = cache.get(name);
  if (hit) return hit;
  let c: HTMLCanvasElement | null = null;
  const draw = DRAW[name];
  const extra = EXTRA.get(name);
  if (draw) {
    const i = new Ico();
    draw(i);
    c = i.canvas();
  } else if (extra) {
    const i = new Ico(extra.w ?? S, extra.h ?? S);
    extra.draw(i);
    c = i.canvas();
  } else
    for (const src of SOURCES) {
      c = src(name);
      if (c) break;
    }
  if (!c) return null;
  cache.set(name, c);
  return c;
}

export const ICON_NAMES = Object.keys(DRAW);
