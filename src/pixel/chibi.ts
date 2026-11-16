// Personajes chibi en pixel art: cabeza grande, ojos con brillo y sombreado por bandas.
// Cada pieza (pelo, sombrero, ropa…) es una forma que se rasteriza en una rejilla de 32×40
// y se sombrea desplazando su propia silueta (luz desde arriba a la izquierda).

export const FIG_W = 32;
export const FIG_H = 40;

type RGB = [number, number, number];
type Ramp = RGB[]; // 0 sombra profunda · 1 sombra · 2 base · 3 luz · 4 brillo
type Mask = (x: number, y: number) => boolean;

// ───────────────────────── color ─────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Mueve un tono hacia otro por el camino corto del círculo cromático. */
function towards(h: number, target: number, amount: number) {
  const d = ((target - h + 540) % 360) - 180;
  return (h + Math.sign(d) * Math.min(Math.abs(d), amount) + 360) % 360;
}

/** Rampa de pixel art: sombras más frías y saturadas (hacia el morado), luces más cálidas. */
export function ramp5(base: string): Ramp {
  const [h, s, l] = toHsl(hex(base));
  const lift = 0.6 + l;
  return [
    fromHsl(towards(h, 262, 28), clamp01(s * 1.05 + 0.08), l * 0.44),
    fromHsl(towards(h, 262, 14), clamp01(s * 1.08 + 0.04), l * 0.72),
    hex(base),
    fromHsl(towards(h, 52, 9), clamp01(s * 0.96), clamp01(l + (1 - l) * 0.24 * lift)),
    fromHsl(towards(h, 52, 16), clamp01(s * 0.86), clamp01(l + (1 - l) * 0.5 * lift)),
  ];
}

// ───────────────────────── rejilla ─────────────────────────

const N = FIG_W * FIG_H;

enum Cat {
  None,
  Back,
  Body,
  Skin,
  Hair,
  Beard,
  Hat,
  Hand,
}

interface LayerOpt {
  base?: number;
  light?: boolean;
  shade?: boolean;
  /** grosor de la sombra en el borde inferior derecho */
  shadow?: number;
  spot?: [number, number];
  spotR?: number;
  tone?: (x: number, y: number, t: number) => number;
  /** dibuja una línea oscura donde la pieza tapa a otra distinta */
  inner?: boolean;
}

class Fig {
  mat = new Int16Array(N).fill(-1);
  tone = new Int8Array(N);
  cat = new Uint8Array(N);
  direct: (RGB | null)[] = new Array(N).fill(null);
  ramps: Ramp[] = [];

  ramp(base: string): number {
    this.ramps.push(ramp5(base));
    return this.ramps.length - 1;
  }

  layer(mask: Mask, m: number, cat: Cat, opt: LayerOpt = {}) {
    const M = new Uint8Array(N);
    for (let y = 0; y < FIG_H; y++) for (let x = 0; x < FIG_W; x++) if (mask(x + 0.5, y + 0.5)) M[y * FIG_W + x] = 1;
    const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < FIG_W && y < FIG_H && M[y * FIG_W + x] === 1;
    const sh = opt.shadow ?? 1;
    const writes: [number, number][] = [];
    for (let y = 0; y < FIG_H; y++)
      for (let x = 0; x < FIG_W; x++) {
        if (!inM(x, y)) continue;
        const i = y * FIG_W + x;
        let t = opt.base ?? 2;
        if (opt.light !== false && (!inM(x - 1, y) || !inM(x, y - 1))) t = 3;
        if (opt.shade !== false && (!inM(x + 1, y) || !inM(x, y + 1) || (sh > 1 && (!inM(x + sh, y) || !inM(x, y + sh) || !inM(x + 1, y + 1))))) t = 1;
        if (opt.spot && Math.hypot(x + 0.5 - opt.spot[0], y + 0.5 - opt.spot[1]) <= (opt.spotR ?? 0.8)) t = 4;
        if (opt.tone) t = opt.tone(x + 0.5, y + 0.5, t);
        if (opt.inner !== false) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= FIG_W || ny >= FIG_H || inM(nx, ny)) continue;
            const j = ny * FIG_W + nx;
            if (this.mat[j] >= 0 && this.cat[j] !== cat) {
              t = 0;
              break;
            }
          }
        }
        writes.push([i, t]);
      }
    for (const [i, t] of writes) {
      this.mat[i] = m;
      this.tone[i] = Math.max(0, Math.min(4, t));
      this.cat[i] = cat;
      this.direct[i] = null;
    }
  }

  px(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= FIG_W || y >= FIG_H) return;
    this.direct[y * FIG_W + x] = c;
  }

  color(i: number): RGB | null {
    if (this.direct[i]) return this.direct[i];
    if (this.mat[i] < 0) return null;
    return this.ramps[this.mat[i]][this.tone[i]];
  }

  /** El ala del sombrero y el flequillo sombrean la piel que tienen debajo. */
  castShadows() {
    for (let y = 1; y < FIG_H; y++)
      for (let x = 0; x < FIG_W; x++) {
        const i = y * FIG_W + x;
        if (this.cat[i] !== Cat.Skin && this.cat[i] !== Cat.Hair) continue;
        const up1 = this.cat[i - FIG_W];
        const up2 = y > 1 ? this.cat[i - 2 * FIG_W] : Cat.None;
        const byHat = up1 === Cat.Hat || up2 === Cat.Hat;
        const byHair = this.cat[i] === Cat.Skin && up1 === Cat.Hair;
        if ((byHat || byHair) && this.tone[i] > 1) this.tone[i] = 1;
      }
  }

  /** Contorno exterior de 1 px del color más oscuro de la pieza vecina (nunca negro puro). */
  outline() {
    const add: [number, RGB][] = [];
    for (let y = 0; y < FIG_H; y++)
      for (let x = 0; x < FIG_W; x++) {
        const i = y * FIG_W + x;
        if (this.mat[i] >= 0) continue;
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= FIG_W || ny >= FIG_H) continue;
          const j = ny * FIG_W + nx;
          if (this.mat[j] < 0) continue;
          add.push([i, mix(this.ramps[this.mat[j]][0], [24, 14, 30], 0.3)]);
          break;
        }
      }
    for (const [i, c] of add) this.direct[i] = c;
  }

  canvas(x0: number, y0: number, w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = x + x0;
        const sy = y + y0;
        if (sx < 0 || sy < 0 || sx >= FIG_W || sy >= FIG_H) continue;
        const col = this.color(sy * FIG_W + sx);
        if (!col) continue;
        const k = (y * w + x) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

// ───────────────────────── formas ─────────────────────────

const CX = 16;
const ell =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const or =
  (...ms: Mask[]): Mask =>
  (x, y) =>
    ms.some((m) => m(x, y));

const HEAD_CY = 17;
const head: Mask = (x, y) => {
  const v = (y - HEAD_CY) / 8.4;
  let r = 9.2;
  if (v > 0) r *= 1 - 0.13 * v * v;
  const u = (x - CX) / r;
  return Math.abs(u) ** 2.5 + Math.abs(v) ** 2.5 <= 1;
};
const headBig: Mask = (x, y) => {
  const v = (y - HEAD_CY) / 9.4;
  const u = (x - CX) / 10.3;
  return Math.abs(u) ** 2.5 + Math.abs(v) ** 2.5 <= 1;
};
const torsoHW = (y: number) => 8.6 + Math.min(2.6, Math.max(0, (y - 25) * 0.75));
const torso: Mask = (x, y) => y >= 23.4 && Math.abs(x - CX) <= torsoHW(y) - Math.max(0, 26.2 - y) * 1.1;
const arm: Mask = (x, y) => torso(x, y) && y >= 25.8 && Math.abs(x - CX) >= torsoHW(y) - 3.2;
const hands = or(ell(8.4, 29.3, 2.05, 1.8), ell(23.6, 29.3, 2.05, 1.8));

// ───────────────────────── personajes ─────────────────────────

type HatKind = 'cowboy' | 'sombrero' | 'flat' | 'bowler' | 'top' | 'cap' | 'scarf';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'slick' | 'long' | 'bun' | 'braids';
  eyes: string;
  eyeStyle?: 'normal' | 'happy' | 'squint' | 'sly' | 'tired' | 'glasses';
  lashes?: boolean;
  brows?: 'normal' | 'angry' | 'thick' | 'raised';
  mouth?: 'smile' | 'grin' | 'teeth' | 'smirk' | 'neutral' | 'frown';
  lips?: string;
  hat?: { kind: HatKind; color: string; band: string; trim?: string };
  beard?: 'mustache' | 'thin' | 'droopy' | 'full' | 'stubble';
  beardColor?: string;
  shirt: string;
  outer?: { kind: 'vest' | 'coat' | 'poncho' | 'shawl'; color: string; trim?: string; trim2?: string };
  neck?: { kind: 'bandana' | 'tie' | 'lace' | 'necklace' | 'collar'; color: string };
  extras?: ('freckles' | 'blush' | 'earrings' | 'scar' | 'bigEars' | 'clover' | 'rose')[];
}

const LOOKS: Record<string, Look> = {
  tinta: {
    skin: '#f9cba4',
    hair: '#e8603a',
    hairStyle: 'long',
    eyes: '#3fae5a',
    lashes: true,
    mouth: 'smile',
    hat: { kind: 'cowboy', color: '#e0a55a', band: '#8a3a2e' },
    shirt: '#47b05c',
    neck: { kind: 'bandana', color: '#ffcf3d' },
    extras: ['freckles'],
  },
  bruma: {
    skin: '#e6ad7c',
    hair: '#6b4430',
    hairStyle: 'short',
    eyes: '#4a3020',
    eyeStyle: 'squint',
    mouth: 'neutral',
    hat: { kind: 'cowboy', color: '#a3acb8', band: '#3e3858' },
    beard: 'mustache',
    beardColor: '#6b4430',
    shirt: '#4a8be0',
    neck: { kind: 'bandana', color: '#ee4a44' },
  },
  musgo: {
    skin: '#f6d2b0',
    hair: '#2e2638',
    hairStyle: 'slick',
    eyes: '#4a6aa0',
    eyeStyle: 'sly',
    brows: 'raised',
    mouth: 'smirk',
    hat: { kind: 'flat', color: '#3c3050', band: '#e0453f' },
    beard: 'thin',
    beardColor: '#2e2638',
    shirt: '#f6eedf',
    outer: { kind: 'vest', color: '#7a4ec4', trim: '#ffcf3d' },
    neck: { kind: 'tie', color: '#e0453f' },
  },
  miel: {
    skin: '#fbd6b4',
    hair: '#ffd257',
    hairStyle: 'bun',
    eyes: '#3f7ad8',
    lashes: true,
    mouth: 'grin',
    lips: '#e8505b',
    shirt: '#ee5a6a',
    neck: { kind: 'lace', color: '#fff6ea' },
    extras: ['blush', 'earrings'],
  },
  pipa: {
    skin: '#cc8e5e',
    hair: '#2e2230',
    hairStyle: 'short',
    eyes: '#3a2418',
    mouth: 'smile',
    hat: { kind: 'sombrero', color: '#f6d070', band: '#ee4a44', trim: '#3fbf9a' },
    beard: 'droopy',
    beardColor: '#2e2230',
    shirt: '#f4ead4',
    outer: { kind: 'poncho', color: '#ff8a3d', trim: '#ffd84a', trim2: '#3fbf9a' },
  },
  chispa: {
    skin: '#dc9a6c',
    hair: '#2e2230',
    hairStyle: 'braids',
    eyes: '#5a3420',
    lashes: true,
    mouth: 'smirk',
    lips: '#d0484e',
    hat: { kind: 'cowboy', color: '#f8f0e2', band: '#ee4a44' },
    shirt: '#3aa4ec',
    neck: { kind: 'bandana', color: '#ee4a44' },
  },
  pincho: {
    skin: '#f7cba4',
    hair: '#d45a32',
    hairStyle: 'short',
    eyes: '#3f8a4a',
    brows: 'thick',
    mouth: 'neutral',
    hat: { kind: 'cowboy', color: '#93593a', band: '#3e2620' },
    beard: 'stubble',
    beardColor: '#d45a32',
    shirt: '#72bf4a',
    neck: { kind: 'collar', color: '#fff6ea' },
  },
  ceniza: {
    skin: '#efe6da',
    hair: '#2e2638',
    hairStyle: 'short',
    eyes: '#5a4a7a',
    eyeStyle: 'tired',
    mouth: 'neutral',
    hat: { kind: 'top', color: '#3a3248', band: '#8a6ab0' },
    shirt: '#f6eedf',
    outer: { kind: 'coat', color: '#4a3e60' },
    neck: { kind: 'tie', color: '#2e2638' },
    extras: ['rose'],
  },
  ramon: {
    skin: '#f8cfa8',
    hair: '#8a5634',
    hairStyle: 'short',
    eyes: '#6a4a2a',
    mouth: 'teeth',
    hat: { kind: 'cap', color: '#98a2b0', band: '#5a6272' },
    shirt: '#f4e8cc',
    outer: { kind: 'vest', color: '#c57a3e', trim: '#ffcf3d' },
    neck: { kind: 'collar', color: '#fff6ea' },
    extras: ['bigEars', 'freckles'],
  },
  olmo: {
    skin: '#d6966a',
    hair: '#2e2232',
    hairStyle: 'long',
    eyes: '#7a3aa0',
    lashes: true,
    mouth: 'smile',
    lips: '#b8405e',
    hat: { kind: 'scarf', color: '#a45ee0', band: '#ffcf3d' },
    shirt: '#7e4ccc',
    neck: { kind: 'necklace', color: '#ffcf3d' },
    extras: ['earrings'],
  },
  trebol: {
    skin: '#f9d2ae',
    hair: '#e8663a',
    hairStyle: 'short',
    eyes: '#3fae5a',
    mouth: 'smile',
    hat: { kind: 'bowler', color: '#3fb060', band: '#1f6a3e' },
    beard: 'full',
    beardColor: '#e8663a',
    shirt: '#f6eedf',
    outer: { kind: 'vest', color: '#3fb060', trim: '#ffcf3d' },
    neck: { kind: 'collar', color: '#fff6ea' },
    extras: ['freckles', 'clover'],
  },
  cardo: {
    skin: '#cf9062',
    hair: '#2e2228',
    hairStyle: 'short',
    eyes: '#3a2218',
    brows: 'angry',
    mouth: 'frown',
    hat: { kind: 'cowboy', color: '#6a4030', band: '#2e1e1c' },
    beard: 'full',
    beardColor: '#2e2228',
    shirt: '#d84444',
    extras: ['scar'],
  },
  nuez: {
    skin: '#f7cca8',
    hair: '#ece6da',
    hairStyle: 'bun',
    eyes: '#5a6a8a',
    eyeStyle: 'happy',
    mouth: 'smile',
    shirt: '#b0708e',
    outer: { kind: 'shawl', color: '#e2a868', trim: '#4fb85c' },
    extras: ['blush'],
  },
};

// ───────────────────────── pintado ─────────────────────────

function paint(look: Look, blink: boolean): Fig {
  const f = new Fig();
  const skinR = ramp5(look.skin);
  const skin = f.ramp(look.skin);
  const hair = f.ramp(look.hair);

  const shirt = f.ramp(look.shirt);
  const hasHat = !!look.hat && look.hat.kind !== 'scarf';
  const ex = look.extras ?? [];

  // 1. pelo de detrás
  if (look.hairStyle === 'long') f.layer((x, y) => ell(16, 18.6, 11.1, 10.6)(x, y) || (Math.abs(x - CX) <= 10.7 && y >= 18 && y <= 29 - 0.035 * (x - CX) ** 2), hair, Cat.Back, { shadow: 2 });
  if (look.hairStyle === 'braids') f.layer(ell(16, 16.6, 10.3, 9.6), hair, Cat.Back, { shadow: 2 });
  if (look.hairStyle === 'bun' && !hasHat) f.layer(ell(16, 7.6, 3.9, 3.4), hair, Cat.Back, { spot: [14.8, 6.4] });

  // 2. cuerpo y ropa
  f.layer(torso, shirt, Cat.Body, { shadow: 2 });
  const o = look.outer;
  let sleeve = shirt;
  if (o) {
    const oc = f.ramp(o.color);
    const V: Mask = (x, y) => Math.abs(x - CX) < 1.3 + Math.max(0, 30.6 - y) * 0.55;
    if (o.kind === 'vest') f.layer((x, y) => torso(x, y) && !V(x, y) && !arm(x, y), oc, Cat.Body, { shadow: 2 });
    if (o.kind === 'coat') {
      f.layer((x, y) => torso(x, y) && !V(x, y), oc, Cat.Body, { shadow: 2, tone: (x, y, t) => (Math.abs(Math.abs(x - CX) - (1.6 + Math.max(0, 30.6 - y) * 0.55)) < 0.7 && y < 30 ? 3 : t) });
      sleeve = oc;
    }
    if (o.kind === 'poncho') {
      f.layer(torso, oc, Cat.Body, { shadow: 2 });
      sleeve = oc;
    }
    if (o.kind === 'shawl') {
      f.layer((x, y) => torso(x, y) && Math.abs(x - CX) >= 1.2 + Math.max(0, 31 - y) * 0.42, oc, Cat.Body, { shadow: 2 });
      sleeve = oc;
    }
  }
  // mangas con un pliegue que las separa del pecho
  f.layer(arm, sleeve, Cat.Body, { tone: (x, y, t) => (Math.abs(x - CX) < torsoHW(y) - 2.3 ? 1 : t === 3 ? 2 : t) });

  // 3. prendas del cuello
  const n = look.neck;
  if (n) {
    const nc = f.ramp(n.color);
    if (n.kind === 'bandana') {
      f.layer((x, y) => y >= 23.4 && y <= 28.8 && Math.abs(x - CX) <= 5 - (y - 23.4) * 0.95, nc, Cat.Body, { tone: (x, y, t) => (t >= 2 && (Math.floor(x) + 2 * Math.floor(y)) % 4 === 1 ? 4 : t) });
      f.layer(ell(16, 23.9, 1.7, 1.1), nc, Cat.Body, { spot: [15.3, 23.5] });
    }
    if (n.kind === 'tie' || n.kind === 'collar') {
      const white = f.ramp('#fff6ea');
      f.layer((x, y) => y >= 23.4 && y <= 26.2 && Math.abs(x - CX) >= 0.6 && Math.abs(x - CX) <= 3.6 - (y - 23.4) * 1.15, white, Cat.Body);
      if (n.kind === 'tie') {
        f.layer((x, y) => Math.abs(x - CX) < 1 && y >= 24.4 && y <= 31, nc, Cat.Body, { light: false });
        f.layer((x, y) => Math.abs(x - CX) < 1.4 && y >= 23.5 && y <= 25, nc, Cat.Body);
      }
    }
    if (n.kind === 'lace') f.layer((x, y) => y >= 23.4 && y <= 25.6 + (Math.floor(x) % 2 === 0 ? 0.6 : 0) && Math.abs(x - CX) <= 6.4, nc, Cat.Body, { shade: false });
  }

  // 4. orejas y cabeza
  const er = ex.includes('bigEars') ? [2.4, 2.7] : [1.6, 2.1];
  f.layer(or(ell(6.7, 17.6, er[0], er[1]), ell(25.3, 17.6, er[0], er[1])), skin, Cat.Skin, { light: false });
  f.layer(head, skin, Cat.Skin, { tone: (x, y, t) => (t === 3 && y > 21 ? 2 : t) });

  // 5. pelo por delante
  const jag = (x: number) => (Math.floor(x) % 3 === 0 ? 0.85 : 0);
  const cap: Mask = (x, y) => head(x, y) && y < 12.4 + 0.075 * (x - CX) ** 2 + jag(x);
  const sideburns: Mask = (x, y) => head(x, y) && Math.abs(x - CX) >= 7.1 && y < 18.2;
  const short = look.hairStyle === 'short' || look.hairStyle === 'slick';
  if (short) f.layer(or(cap, sideburns), hair, Cat.Hair, { spot: [11.5, 10.5], tone: look.hairStyle === 'slick' ? (x, y, t) => (t >= 2 && (Math.floor(x) + Math.floor(y)) % 5 === 0 ? 4 : t) : undefined });
  if (look.hairStyle === 'long') f.layer(or(cap, (x, y) => headBig(x, y) && Math.abs(x - CX) >= 6.7 && y >= 10 && y <= 26.5), hair, Cat.Hair, { spot: [11, 10.5] });
  if (look.hairStyle === 'bun') f.layer(or(cap, sideburns), hair, Cat.Hair, { spot: [11.5, 10.2] });
  if (look.hairStyle === 'braids') {
    f.layer(or(cap, (x, y) => headBig(x, y) && Math.abs(x - CX) >= 6.6 && y >= 10 && y <= 20.6), hair, Cat.Hair, { spot: [11, 10.5] });
    for (const s of [-1, 1]) {
      const bx = (y: number) => CX + s * (8.9 + (y - 20) * 0.1);
      f.layer((x, y) => Math.abs(x - bx(y)) < 1.7 && y >= 19.6 && y <= 31, hair, Cat.Hair, {
        light: false,
        shade: false,
        tone: (x, y) => ((Math.floor(y) + (x < bx(y) ? 0 : 1)) % 2 === 0 ? 3 : 1),
      });
    }
  }

  // 6. barba
  const beard = f.ramp(look.beardColor ?? look.hair);
  const b = look.beard;
  if (b === 'mustache') f.layer(or(ell(16, 20.4, 3.9, 1.15), ell(12.4, 21.1, 1.1, 1.05), ell(19.6, 21.1, 1.1, 1.05)), beard, Cat.Beard, { spot: [14, 19.9] });
  if (b === 'droopy') f.layer(or(ell(16, 20.3, 4.3, 1.25), (x, y) => Math.abs(x - CX) >= 3 && Math.abs(x - CX) <= 4.7 && y >= 20 && y <= 23.6), beard, Cat.Beard, { spot: [13.6, 19.8] });
  if (b === 'full')
    f.layer(
      (x, y) => (head(x, y) || ell(16, 24, 6.6, 3.1)(x, y)) && (y > 20.6 || (Math.abs(x - CX) > 6.8 && y > 16.6)) && !(Math.abs(x - CX) < 1.6 && y > 21 && y < 22.2),
      beard,
      Cat.Beard,
      { shadow: 2, tone: (x, y, t) => (t === 2 && (Math.floor(x) * 3 + Math.floor(y) * 5) % 7 === 0 ? 3 : t) },
    );

  // 7. sombrero
  const hat = look.hat;
  if (hat) {
    const hc = f.ramp(hat.color);
    const bc = f.ramp(hat.band);
    const brimTone = (center: (x: number) => number) => (x: number, y: number, t: number) => (t <= 1 ? t : y < center(x) - 0.2 ? (x < CX + 5 ? 3 : 2) : 1);
    switch (hat.kind) {
      case 'cowboy': {
        const c = (x: number) => 10.9 - 1.7 * ((x - CX) / 14) ** 4;
        f.layer((x, y) => ((x - CX) / 14) ** 2 + ((y - c(x)) / 2.15) ** 2 <= 1, hc, Cat.Hat, { tone: brimTone(c) });
        const crown: Mask = (x, y) => y >= 3.4 + 0.06 * (x - CX) ** 2 + (Math.abs(x - CX) < 1.1 ? 0.7 : 0) && y <= 10.6 && Math.abs(x - CX) <= 6.9 - (10.6 - y) * 0.12;
        f.layer(crown, hc, Cat.Hat, { shadow: 2, spot: [12.6, 5.6], tone: (x, y, t) => (Math.abs(x - CX) < 1.2 && y < 6.2 && t > 1 ? 1 : t) });
        f.layer((x, y) => crown(x, y) && y >= 8.1, bc, Cat.Hat, { light: false });
        break;
      }
      case 'sombrero': {
        const c = (x: number) => 11.3 - 2.6 * ((x - CX) / 15.9) ** 4;
        f.layer((x, y) => ((x - CX) / 15.9) ** 2 + ((y - c(x)) / 2.8) ** 2 <= 1, hc, Cat.Hat, { tone: brimTone(c) });
        const crown: Mask = (x, y) => y >= 1 + 0.2 * (x - CX) ** 2 && y <= 10.6 && Math.abs(x - CX) <= 5.7 - (10.6 - y) * 0.1;
        f.layer(crown, hc, Cat.Hat, { shadow: 2, spot: [13.4, 3.8] });
        f.layer((x, y) => crown(x, y) && y >= 7.2 && y <= 9.6, bc, Cat.Hat, { light: false });
        if (hat.trim) for (let x = 12; x <= 19; x += 2) f.px(x, 8, ramp5(hat.trim)[3]);
        break;
      }
      case 'flat': {
        const c = () => 10.9;
        f.layer((x, y) => ((x - CX) / 11.6) ** 2 + ((y - 10.9) / 1.7) ** 2 <= 1, hc, Cat.Hat, { tone: brimTone(c) });
        const crown: Mask = (x, y) => y >= 5.2 && y <= 10.6 && Math.abs(x - CX) <= 6.9 - Math.max(0, 6.2 - y) * 1.6;
        f.layer(crown, hc, Cat.Hat, { shadow: 2, spot: [12, 6.4] });
        f.layer((x, y) => crown(x, y) && y >= 8.2, bc, Cat.Hat, { light: false });
        break;
      }
      case 'bowler': {
        const c = (x: number) => 10.9 - 0.9 * ((x - CX) / 9.6) ** 4;
        f.layer((x, y) => ((x - CX) / 9.6) ** 2 + ((y - c(x)) / 1.55) ** 2 <= 1, hc, Cat.Hat, { tone: brimTone(c) });
        const crown: Mask = (x, y) => ell(16, 10.6, 7.1, 5.9)(x, y) && y <= 10.6;
        f.layer(crown, hc, Cat.Hat, { shadow: 2, spot: [13, 6.2] });
        f.layer((x, y) => crown(x, y) && y >= 8.4, bc, Cat.Hat, { light: false });
        break;
      }
      case 'top': {
        const c = (x: number) => 10.9 - 0.6 * ((x - CX) / 9.8) ** 4;
        f.layer((x, y) => ((x - CX) / 9.8) ** 2 + ((y - c(x)) / 1.6) ** 2 <= 1, hc, Cat.Hat, { tone: brimTone(c) });
        const crown: Mask = (x, y) => y >= 0.4 && y <= 10.6 && Math.abs(x - CX) <= 5.7 + (y < 2 ? 0.7 : 0);
        f.layer(crown, hc, Cat.Hat, { shadow: 2, tone: (x, y, t) => (Math.floor(x) === 12 && y > 1.5 && y < 7 ? 4 : t) });
        f.layer((x, y) => crown(x, y) && y >= 7.6 && y <= 10.2, bc, Cat.Hat, { light: false });
        break;
      }
      case 'cap': {
        const dome: Mask = (x, y) => ell(15.5, 12, 9.9, 5.6)(x, y) && y <= 12;
        f.layer(dome, hc, Cat.Hat, {
          shadow: 2,
          spot: [12, 8],
          tone: (x, y, t) => (t > 1 && (Math.abs(x - 15.5 - (y - 6.8) * 0.9) < 0.5 || Math.abs(x - 15.5 + (y - 6.8) * 0.9) < 0.5) ? 1 : t),
        });
        f.layer((x, y) => ell(20.8, 12.3, 6.4, 1.8)(x, y) && y >= 11.6, bc, Cat.Hat);
        f.layer(ell(15.5, 6.9, 1.2, 1), bc, Cat.Hat);
        break;
      }
      case 'scarf': {
        const top: Mask = (x, y) => headBig(x, y) && y < 12.9 + 0.055 * (x - CX) ** 2;
        const drape: Mask = (x, y) => Math.abs(x - CX) >= 7.4 && Math.abs(x - CX) <= 10.5 && y >= 11 && y <= 22.5 && ell(16, 17.5, 11, 11.2)(x, y);
        f.layer(or(top, drape), hc, Cat.Hat, { shadow: 2, spot: [11.4, 9.4], tone: (x, y, t) => (t === 2 && Math.floor(x) % 3 === 0 && y > 12 ? 1 : t) });
        f.layer(or(ell(26.3, 14.8, 2.1, 1.9), (x, y) => Math.abs(x - 26.6 - (y - 16) * 0.25) < 1 && y >= 16 && y <= 21.5), hc, Cat.Hat, { spot: [25.6, 14.2] });
        const coin = ramp5(hat.band);
        for (let x = 9; x <= 22; x += 2) {
          const yy = Math.floor(12.4 + 0.055 * (x + 0.5 - CX) ** 2);
          f.px(x, yy, coin[3]);
        }
        break;
      }
    }
  }

  // 8. manos apoyadas en el borde de la mesa
  void hands; // las manos las sugiere el abanico de cartas que sujetan

  f.castShadows();
  f.outline();

  // 9. cara (sellos de píxel)
  const ink = mix(hex(look.eyes), [26, 14, 34], 0.72);
  const white: RGB = [255, 252, 242];
  const iris = ramp5(look.eyes)[3];
  const brow = mix(ramp5(look.beardColor ?? look.hair)[0], [26, 14, 34], 0.2);
  const style = look.eyeStyle ?? 'normal';
  const eye = (x0: number, outer: number) => {
    if (style === 'happy') {
      // ojos cerrados de felicidad: forma de ∩
      f.px(x0, 16, ink);
      f.px(x0 + 1, 16, ink);
      f.px(x0 - 1, 17, ink);
      f.px(x0 + 2, 17, ink);
      return;
    }
    if (blink) {
      f.px(x0, 17, ink);
      f.px(x0 + 1, 17, ink);
      if (look.lashes) f.px(outer, 16, ink);
      return;
    }
    if (style === 'squint') {
      f.px(x0 - 1, 17, ink);
      f.px(x0, 17, ink);
      f.px(x0 + 1, 17, ink);
      f.px(x0 + 2, 17, ink);
      f.px(outer < x0 ? x0 + 1 : x0, 16, ink);
      return;
    }
    if (style === 'sly') {
      f.px(x0 - 1, 16, ink);
      f.px(x0, 16, ink);
      f.px(x0 + 1, 16, ink);
      f.px(x0 + 2, 16, ink);
      f.px(x0, 17, white);
      f.px(x0 + 1, 17, ink);
      f.px(x0 + 1, 18, iris);
      f.px(x0, 18, ink);
      return;
    }
    f.px(x0, 16, white);
    f.px(x0 + 1, 16, ink);
    f.px(x0, 17, ink);
    f.px(x0 + 1, 17, ink);
    f.px(x0, 18, ink);
    f.px(x0 + 1, 18, iris);
    if (look.lashes) f.px(outer, 16, ink);
    if (style === 'tired') {
      f.px(x0, 19, mix(skinR[1], [120, 80, 140], 0.3));
      f.px(x0 + 1, 19, mix(skinR[1], [120, 80, 140], 0.3));
    }
  };
  eye(11, 10);
  eye(19, 21);
  if (style === 'glasses') {
    const g = ramp5('#e0b050')[2];
    for (const x0 of [10, 18]) {
      f.px(x0 + 1, 15, g);
      f.px(x0 + 2, 15, g);
      f.px(x0 + 1, 19, g);
      f.px(x0 + 2, 19, g);
      for (let y = 16; y <= 18; y++) {
        f.px(x0, y, g);
        f.px(x0 + 3, y, g);
      }
    }
    for (let x = 14; x <= 17; x++) f.px(x, 16, g);
  }
  // cejas
  const br = look.brows ?? 'normal';
  if (br === 'angry') {
    [[10, 13], [11, 13], [12, 14], [21, 13], [20, 13], [19, 14]].forEach(([x, y]) => f.px(x, y, brow));
  } else {
    const wide = br === 'thick';
    for (const [x0, raise] of [
      [11, 0],
      [19, br === 'raised' ? 1 : 0],
    ]) {
      f.px(x0, 14 - raise, brow);
      f.px(x0 + 1, 14 - raise, brow);
      if (wide) f.px(x0 < 16 ? x0 - 1 : x0 + 2, 14 - raise, brow);
    }
  }
  // mofletes, nariz y pecas
  const blush = mix(skinR[2], [255, 110, 125], ex.includes('blush') ? 0.55 : 0.32);
  for (const x of [9, 10, 21, 22]) f.px(x, 20, blush);
  f.px(16, 19, skinR[1]);
  if (ex.includes('freckles')) for (const [x, y] of [[9, 19], [11, 19], [20, 19], [22, 19]]) f.px(x, y, skinR[1]);
  if (ex.includes('scar')) for (const [x, y] of [[8, 16], [9, 17], [9, 18]]) f.px(x, y, mix(skinR[4], [255, 170, 170], 0.5));
  if (ex.includes('earrings')) for (const x of [6, 25]) f.px(x, 20, ramp5('#ffcf3d')[3]);

  // boca
  const r = b === 'mustache' || b === 'droopy' || b === 'full' ? 22 : 21;
  const mouthC = mix(skinR[0], [140, 30, 60], 0.55);
  const lips = look.lips ? hex(look.lips) : mouthC;
  const m = look.mouth ?? 'smile';
  if (b !== 'full' || m !== 'smile') {
    if (m === 'smile') {
      f.px(14, r - 1, mouthC);
      f.px(17, r - 1, mouthC);
      f.px(15, r, lips);
      f.px(16, r, lips);
    } else if (m === 'grin' || m === 'teeth') {
      f.px(14, r, mouthC);
      f.px(17, r, mouthC);
      f.px(15, r, m === 'teeth' ? mouthC : white);
      f.px(16, r, m === 'teeth' ? mouthC : white);
      f.px(15, r + 1, m === 'teeth' ? white : lips);
      f.px(16, r + 1, m === 'teeth' ? white : lips);
    } else if (m === 'smirk') {
      f.px(15, r, lips);
      f.px(16, r, lips);
      f.px(17, r - 1, mouthC);
    } else if (m === 'frown') {
      f.px(15, r, mouthC);
      f.px(16, r, mouthC);
      f.px(14, r + 1, mouthC);
      f.px(17, r + 1, mouthC);
    } else {
      f.px(15, r, mouthC);
      f.px(16, r, mouthC);
    }
  } else {
    f.px(15, 21, mouthC);
    f.px(16, 21, mouthC);
  }
  if (b === 'thin') {
    const c = ramp5(look.beardColor ?? look.hair)[1];
    [[13, 20], [14, 20], [17, 20], [18, 20], [12, 19], [19, 19]].forEach(([x, y]) => f.px(x, y, c));
  }
  if (b === 'stubble') {
    const c = mix(skinR[1], ramp5(look.beardColor ?? look.hair)[1], 0.5);
    for (let y = 21; y <= 24; y++) for (let x = 9; x <= 22; x++) if ((x + y) % 2 === 0 && head(x + 0.5, y + 0.5) && !(y === 21 && x >= 14 && x <= 17)) f.px(x, y, c);
  }

  // detalles de la ropa
  if (o?.kind === 'poncho') {
    const t1 = ramp5(o.trim ?? '#ffd84a')[2];
    const t2 = ramp5(o.trim2 ?? '#3fbf9a')[2];
    for (let x = 0; x < FIG_W; x++) {
      if (torso(x + 0.5, 26.5) && x % 4 < 2) f.px(x, 26, t1);
      if (torso(x + 0.5, 27.5) && (x + 1) % 4 < 2) f.px(x, 27, t1);
      if (torso(x + 0.5, 28.5) && x % 2 === 0) f.px(x, 28, t2);
    }
  }
  if (o?.kind === 'vest' && o.trim) {
    const gold = ramp5(o.trim)[3];
    f.px(13, 27, gold);
    f.px(13, 29, gold);
  }
  if (o?.kind === 'shawl') {
    const t = ramp5(o.trim ?? '#4fb85c')[2];
    for (let y = 25; y < 30; y++) for (let x = 0; x < FIG_W; x++) if ((x + y) % 4 === 0 && torso(x + 0.5, y + 0.5) && Math.abs(x + 0.5 - CX) >= 2.4 + Math.max(0, 31 - y) * 0.42) f.px(x, y, t);
  }
  if (n?.kind === 'necklace') {
    const gold = ramp5(n.color);
    for (let x = 12; x <= 19; x++) f.px(x, Math.round(23.8 + 0.13 * (x + 0.5 - CX) ** 2), gold[2]);
    f.px(15, 26, gold[3]);
    f.px(16, 26, gold[2]);
  }
  if (ex.includes('clover')) {
    const g = ramp5('#4fc860');
    f.px(11, 26, g[3]);
    f.px(10, 27, g[2]);
    f.px(12, 27, g[2]);
    f.px(11, 27, g[4]);
    f.px(11, 28, g[0]);
  }
  if (ex.includes('rose')) {
    const rr = ramp5('#ee4a5a');
    f.px(12, 26, rr[4]);
    f.px(13, 26, rr[2]);
    f.px(12, 27, rr[2]);
    f.px(13, 27, rr[1]);
    f.px(11, 27, ramp5('#4fc860')[1]);
  }

  return f;
}

// ───────────────────────── API ─────────────────────────

/** Añade personajes de otros juegos (con el mismo dibujo y estilo). El nombre sólo puede llevar letras. */
export function registerLooks(looks: Record<string, Look>) {
  Object.assign(LOOKS, looks);
}

export interface PixelSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const cache = new Map<string, PixelSprite>();

/**
 * Sprite de personaje:
 *  - `<id>`: retrato de 26×26
 *  - `fig_<id>` y `fig_<id>_blink`: figura sentada de 32×40
 */
export function chibiSprite(name: string): PixelSprite | null {
  const hit = cache.get(name);
  if (hit) return hit;
  const m = /^(fig_)?([a-z]+)(_blink)?$/.exec(name);
  if (!m || !(m[2] in LOOKS)) return null;
  const fig = paint(LOOKS[m[2]], !!m[3]);
  const out: PixelSprite = m[1] ? { canvas: fig.canvas(0, 0, FIG_W, FIG_H), w: FIG_W, h: FIG_H } : { canvas: fig.canvas(3, 0, 26, 26), w: 26, h: 26 };
  cache.set(name, out);
  return out;
}

export const PORTRAIT_SIZE = 26;
