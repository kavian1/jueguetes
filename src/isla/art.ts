// Arte en pixel art cozy de Isla Cosecha: la isla entera se pinta píxel a píxel en un
// lienzo pequeño (cada casilla mide 34×36) y las piezas, fichas e iconos son sprites con
// el mismo sombreado por bandas (rampas de 5 tonos y contornos de color).
import { Px, hash, hex as rgb, mix, type Mask, type RGB } from '../pixel/world';
import { ramp5 } from '../pixel/chibi';
import { C, INK, Ico, custom, ell, or, poly, rect, registerIcons, ring, rrect, seg, star } from '../pixel/icons';
import type { Board, Edge, Hex, Res, Terrain } from './types';
import { PIPS } from './board';
import { PLAYER_COLORS } from './rules';

type Ramp = RGB[];

/** Media anchura de una casilla y cuarto de su alto, en píxeles del mundo. */
export const HW = 17;
export const QH = 9;
/** Tamaño del lienzo de la isla y posición de su centro. */
export const BW = 222;
export const BH = 184;
const OX = 111;
const OY = 92;

export const hexPos = (h: { x: number; y: number }) => ({ x: OX + h.x * HW, y: OY + h.y * QH });
export const vertPos = (v: { x: number; y: number }) => ({ x: OX + v.x * HW, y: OY + v.y * QH });
/** Posición central del número de una casilla. */
export const tokenPos = (h: Hex) => {
  const p = hexPos(h);
  return { x: p.x, y: p.y + 3 };
};

export type RoadDir = 'v' | 'a' | 'b';
export function edgeInfo(board: Board, e: Edge): { x: number; y: number; dir: RoadDir } {
  const A = board.verts[e.a];
  const B = board.verts[e.b];
  const pa = vertPos(A);
  const pb = vertPos(B);
  const [l, r] = pa.x <= pb.x ? [pa, pb] : [pb, pa];
  const dir: RoadDir = l.x === r.x ? 'v' : r.y > l.y ? 'a' : 'b';
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, dir };
}

const insideHex = (dx: number, dy: number) => Math.abs(dx) <= HW && Math.abs(dy) <= 2 * QH - (Math.abs(dx) * QH) / HW;

// ───────────────────────── colores ─────────────────────────

const R = {
  forest: ramp5('#4a9a48'),
  pine: ramp5('#2f8a52'),
  pineB: ramp5('#3fa65a'),
  leaf: ramp5('#5cbc4e'),
  trunk: ramp5('#8a5232'),
  clay: ramp5('#dc7f4c'),
  brick: ramp5('#c9563a'),
  kiln: ramp5('#b86a46'),
  meadow: ramp5('#9cd66a'),
  wool: custom('#a89cb8', '#d6cfe0', '#f4f0f2', '#ffffff', '#ffffff'),
  face: ramp5('#4a3a4c'),
  wheat: ramp5('#f2c449'),
  hay: ramp5('#e8b048'),
  stone: ramp5('#a9a5bc'),
  rock: ramp5('#8f8aa6'),
  snow: custom('#9aa8d0', '#c8d4ee', '#eef4ff', '#ffffff', '#ffffff'),
  crystal: ramp5('#58b8f4'),
  sand: ramp5('#f3d896'),
  palm: ramp5('#4cb050'),
  wood: ramp5('#c27a46'),
  cream: ramp5('#f6e6c8'),
  red: ramp5('#e8484d'),
  fox: ramp5('#f08a3a'),
};

const WATER_DEEP = rgb('#3aa6d8');
const SHALLOW = [rgb('#52c0e0'), rgb('#6ed2e6'), rgb('#8fe2ea')];
const FOAM = rgb('#f4fcff');
const WET = rgb('#e2c07c');
const BEACH = ramp5('#f4dc9e');

// ───────────────────────── pintar con formas ─────────────────────────

/** Forma sombreada recortada a la casilla `clip` (borde claro arriba-izq., sombra abajo-der. y contorno). */
function blob(P: Px, mask: Mask, r: Ramp, box: [number, number, number, number], o: { clip?: Mask; tone?: (x: number, y: number, t: number) => number; spot?: [number, number]; outline?: boolean; shadow?: boolean } = {}) {
  const [x0, y0, x1, y1] = box.map(Math.floor);
  const w = x1 - x0 + 3;
  const h = y1 - y0 + 3;
  const M = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask(x0 - 1 + x + 0.5, y0 - 1 + y + 0.5)) M[y * w + x] = 1;
  const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && M[y * w + x] === 1;
  const clip = o.clip;
  // sombra proyectada (abajo a la derecha)
  if (o.shadow !== false)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (inM(x, y) || !inM(x - 1, y - 1)) continue;
        const X = x0 - 1 + x;
        const Y = y0 - 1 + y;
        if (clip && !clip(X + 0.5, Y + 0.5)) continue;
        if (!inM(x - 1, y) && !inM(x, y - 1)) P.tint(X, Y, rgb('#2a1838'), 0.22);
        else P.tint(X, Y, rgb('#2a1838'), 0.34);
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = x0 - 1 + x;
      const Y = y0 - 1 + y;
      if (clip && !clip(X + 0.5, Y + 0.5)) continue;
      if (inM(x, y)) {
        let t = 2;
        if (!inM(x - 1, y) || !inM(x, y - 1)) t = 3;
        if (!inM(x + 1, y) || !inM(x, y + 1)) t = 1;
        if (o.spot && Math.hypot(X + 0.5 - o.spot[0], Y + 0.5 - o.spot[1]) < 0.9) t = 4;
        if (o.tone) t = o.tone(X + 0.5, Y + 0.5, t);
        P.put(X, Y, r[Math.max(0, Math.min(4, t))]);
      } else if (o.outline !== false && (inM(x + 1, y) || inM(x - 1, y) || inM(x, y + 1) || inM(x, y - 1))) {
        P.put(X, Y, mix(r[0], INK, 0.35));
      }
    }
}

const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Mask => {
  const f = poly([
    [ax, ay],
    [bx, by],
    [cx, cy],
  ]);
  return f;
};

// ───────────────────────── decorados ─────────────────────────

function pine(P: Px, x: number, base: number, h: number, clip: Mask, r = R.pine) {
  const tiers = 3;
  const m: Mask = (X, Y) => {
    if (Math.abs(X - x) < 0.9 && Y > base - 2.2 && Y < base) return false;
    for (let i = 0; i < tiers; i++) {
      const top = base - 2 - h + i * (h / 3.4);
      const bot = top + h / 2.1;
      const half = 2.2 + i * 1.25;
      if (Y >= top && Y <= bot && Math.abs(X - x) <= ((Y - top) / (bot - top)) * half + 0.3) return true;
    }
    return false;
  };
  blob(P, (X, Y) => Math.abs(X - x) < 1 && Y >= base - 3 && Y < base, R.trunk, [x - 2, base - 4, x + 2, base], { clip });
  blob(P, m, r, [x - 6, base - h - 3, x + 6, base - 1], {
    clip,
    tone: (X, Y, t) => (t === 2 && X < x - 0.6 && hash(Math.floor(X), Math.floor(Y)) > 0.45 ? 3 : t),
  });
}

function roundTree(P: Px, x: number, base: number, clip: Mask) {
  blob(P, (X, Y) => Math.abs(X - x) < 1 && Y >= base - 4 && Y < base, R.trunk, [x - 2, base - 5, x + 2, base], { clip });
  blob(P, or(ell(x, base - 6.5, 3.6, 3.2), ell(x - 1.6, base - 8, 2.4, 2.2), ell(x + 1.8, base - 7.6, 2.2, 2.2)), R.leaf, [x - 5, base - 11, x + 5, base - 2], {
    clip,
    spot: [x - 1.6, base - 8.6],
  });
  P.put(Math.round(x + 1), base - 6, rgb('#ff6a6a'));
}

function mushroom(P: Px, x: number, y: number) {
  P.put(x, y, rgb('#f6e6c8'));
  P.put(x - 1, y - 1, rgb('#e8484d'));
  P.put(x, y - 1, rgb('#ff8a7a'));
  P.put(x + 1, y - 1, rgb('#e8484d'));
}

function sheep(P: Px, x: number, base: number, clip: Mask, flip = false) {
  const s = flip ? -1 : 1;
  for (const lx of [x - 2, x + 2]) {
    P.put(lx, base - 1, R.face[1]);
    P.put(lx, base - 2, R.face[2]);
  }
  blob(P, or(ell(x, base - 4.4, 3.6, 2.6), ell(x - 1.6 * s, base - 5.6, 2, 1.8), ell(x + 1.2 * s, base - 5.8, 1.8, 1.6)), R.wool, [x - 5, base - 9, x + 5, base - 1], { clip });
  blob(P, ell(x + 3.6 * s, base - 4.8, 1.5, 1.6), R.face, [x + 3.6 * s - 3, base - 8, x + 3.6 * s + 3, base - 2], { clip, shadow: false });
  P.put(Math.round(x + 3.6 * s + (flip ? -1 : 0)), base - 5, rgb('#ffffff'));
}

function fence(P: Px, x0: number, x1: number, y: number, clip: Mask) {
  for (let x = Math.floor(x0); x <= x1; x++) {
    if (!clip(x + 0.5, y + 0.5)) continue;
    P.put(x, y - 2, R.wood[3]);
    P.put(x, y, R.wood[2]);
    if ((x - Math.floor(x0)) % 3 === 0) {
      P.put(x, y - 3, R.wood[3]);
      P.put(x, y - 1, R.wood[1]);
      P.put(x, y + 1, R.wood[0]);
    }
  }
}

function hayBale(P: Px, x: number, base: number, clip: Mask) {
  blob(P, ell(x, base - 3, 3.4, 2.8), R.hay, [x - 4, base - 7, x + 4, base], {
    clip,
    tone: (X, Y, t) => (t === 2 && Math.abs(Math.hypot(X - x - 0.8, (Y - base + 3) * 1.2) - 1.6) < 0.5 ? 1 : t),
  });
}

function windmill(P: Px, x: number, base: number, clip: Mask) {
  blob(P, (X, Y) => Y >= base - 9 && Y < base && Math.abs(X - x) <= 2.2 + (Y - (base - 9)) * 0.18, R.cream, [x - 4, base - 10, x + 4, base], { clip });
  blob(P, tri(x - 3.2, base - 8.6, x, base - 12.4, x + 3.2, base - 8.6), R.red, [x - 4, base - 13, x + 4, base - 8], { clip });
  P.put(x, base - 2, R.trunk[0]);
  P.put(x, base - 3, R.trunk[1]);
  const hx = x;
  const hy = base - 9;
  const blades = or(seg(hx, hy, hx + 4.6, hy - 4.6, 0.75), seg(hx, hy, hx + 4.6, hy + 4.6, 0.75), seg(hx, hy, hx - 4.6, hy + 4.6, 0.75), seg(hx, hy, hx - 4.6, hy - 4.6, 0.75));
  blob(P, blades, R.wood, [hx - 6, hy - 6, hx + 6, hy + 6], { clip, shadow: false });
  P.put(hx, hy, R.trunk[0]);
  P.put(hx - 1, hy, R.trunk[0]);
}

function bricks(P: Px, x: number, base: number, clip: Mask) {
  const rows = [
    [x - 4, base - 2, 3],
    [x, base - 2, 3],
    [x - 2, base - 4, 3],
    [x + 2, base - 4, 2],
    [x, base - 6, 3],
  ];
  const m: Mask = (X, Y) => rows.some(([bx, by, w]) => X >= bx && X < bx + w + 0.6 && Y >= by && Y < by + 2);
  blob(P, m, R.brick, [x - 5, base - 7, x + 5, base], {
    clip,
    tone: (X, Y, t) => (t >= 2 && rows.some(([bx, by]) => Math.floor(X) === bx + 3 || Math.floor(Y) === by + 2) ? 1 : t),
  });
}

function kiln(P: Px, x: number, base: number, clip: Mask) {
  blob(P, (X, Y) => ell(x, base - 1, 4.4, 5.6)(X, Y) && Y < base, R.kiln, [x - 5, base - 7, x + 5, base], { clip, spot: [x - 2, base - 4.6] });
  P.put(x, base - 2, rgb('#ffb43a'));
  P.put(x - 1, base - 2, rgb('#ff7a2a'));
  P.put(x, base - 1, rgb('#ff7a2a'));
  P.put(x - 1, base - 1, rgb('#b8382a'));
  P.put(x, base - 7, rgb('#d8d0e0'));
  P.put(x + 1, base - 9, rgb('#e8e2ee'));
}

function mountain(P: Px, x: number, base: number, w: number, h: number, clip: Mask) {
  const m = tri(x - w, base, x, base - h, x + w, base);
  blob(P, m, R.rock, [x - w - 1, base - h - 1, x + w + 1, base], {
    clip,
    tone: (X, Y, t) => {
      if (t <= 1) return t;
      const side = X - x + (Y - (base - h)) * 0.25;
      return side < 0 ? 3 : t === 3 ? 2 : 1;
    },
  });
  const snowH = h * 0.36;
  blob(P, (X, Y) => m(X, Y) && Y < base - h + snowH + (hash(Math.floor(X), 7) > 0.5 ? 1 : 0), R.snow, [x - w, base - h - 1, x + w, base - h + snowH + 1], {
    clip,
    outline: false,
    shadow: false,
    tone: (X, _Y, t) => (X > x + 0.5 ? 1 : t),
  });
}

function crystal(P: Px, x: number, y: number) {
  P.put(x, y - 1, R.crystal[4]);
  P.put(x, y, R.crystal[3]);
  P.put(x + 1, y, R.crystal[1]);
  P.put(x, y + 1, R.crystal[1]);
}

function palm(P: Px, x: number, base: number, clip: Mask) {
  const trunk: Mask = (X, Y) => Y >= base - 11 && Y < base && Math.abs(X - (x + ((base - Y) * (base - Y)) / 60)) < 1.05;
  blob(P, trunk, R.trunk, [x - 2, base - 12, x + 4, base], { clip, tone: (_X, Y, t) => (t >= 2 && Math.floor(Y) % 2 === 0 ? 1 : t) });
  const tx = x + 2;
  const ty = base - 11;
  const fronds = or(seg(tx, ty, tx - 5, ty + 2.6, 1), seg(tx, ty, tx + 5.4, ty + 2.4, 1), seg(tx, ty, tx - 3, ty - 2.8, 0.9), seg(tx, ty, tx + 3.6, ty - 2.6, 0.9), seg(tx, ty, tx, ty + 3, 0.8));
  blob(P, fronds, R.palm, [tx - 7, ty - 5, tx + 7, ty + 5], { clip });
  P.put(tx - 1, ty + 1, rgb('#8a5232'));
  P.put(tx + 1, ty + 1, rgb('#6a3a26'));
}

function starfish(P: Px, x: number, y: number) {
  const c = rgb('#ff8a6a');
  P.put(x, y, rgb('#ffb08a'));
  P.put(x, y - 1, c);
  P.put(x - 1, y, c);
  P.put(x + 1, y, c);
  P.put(x - 1, y + 1, c);
  P.put(x + 1, y + 1, c);
}

function den(P: Px, x: number, y: number, clip: Mask) {
  blob(P, ell(x, y, 3.6, 2.2), R.sand, [x - 5, y - 3, x + 5, y + 3], { clip, shadow: false, tone: (X, Y, t) => (ell(x + 0.4, y + 0.4, 2.2, 1.2)(X, Y) ? 0 : t) });
}

// ───────────────────────── casillas ─────────────────────────

const GROUND: Record<Terrain, Ramp> = {
  madera: R.forest,
  arcilla: R.clay,
  lana: R.meadow,
  trigo: R.wheat,
  piedra: R.stone,
  duna: R.sand,
};

/** Textura del suelo de cada terreno (índice de tono 1–3). */
function groundTone(t: Terrain, X: number, Y: number, cx: number, cy: number): number {
  const n = hash(X, Y);
  switch (t) {
    case 'madera':
      return n > 0.86 ? 1 : n < 0.08 ? 3 : 2;
    case 'arcilla':
      return (Y + Math.floor(X / 5)) % 5 === 0 && n > 0.35 ? 1 : n > 0.93 ? 3 : 2;
    case 'lana':
      return n > 0.9 ? 3 : n < 0.06 ? 1 : 2;
    case 'trigo': {
      const row = (X - cx + 2 * (Y - cy) + 200) % 6;
      return row < 2 ? 1 : row === 2 && n > 0.5 ? 3 : 2;
    }
    case 'piedra':
      return n > 0.88 ? 1 : n < 0.1 ? 3 : 2;
    case 'duna': {
      const w = Math.sin((X - cx) * 0.35 + (Y - cy) * 0.9) + Math.sin((X - cx) * 0.12 - (Y - cy) * 0.4);
      return w > 1.35 ? 3 : w < -1.5 ? 1 : 2;
    }
  }
}

function decorate(P: Px, h: Hex, cx: number, cy: number, clip: Mask) {
  const r = (k: number) => hash(h.id * 31 + k, 977);
  const j = (k: number, a: number) => Math.round((r(k) - 0.5) * a);
  switch (h.terrain) {
    case 'madera': {
      pine(P, cx - 8 + j(1, 2), cy - 3, 9, clip);
      pine(P, cx + 8 + j(2, 2), cy - 2, 10, clip, R.pineB);
      pine(P, cx + j(3, 2), cy - 9, 9, clip);
      pine(P, cx - 11, cy + 9, 8, clip, R.pineB);
      if (r(4) > 0.4) roundTree(P, cx + 11, cy + 10, clip);
      else pine(P, cx + 11, cy + 10, 8, clip);
      mushroom(P, cx - 4 + j(5, 3), cy + 13);
      mushroom(P, cx + 5, cy - 13);
      break;
    }
    case 'arcilla': {
      kiln(P, cx - 8 + j(1, 2), cy - 2, clip);
      bricks(P, cx + 8 + j(2, 2), cy - 3, clip);
      bricks(P, cx + 10, cy + 12, clip);
      blob(P, ell(cx - 9, cy + 9, 3.2, 1.6), R.clay, [cx - 13, cy + 7, cx - 5, cy + 11], { clip, shadow: false, tone: (_X, _Y, t) => (t >= 2 ? 0 : t) });
      blob(P, ell(cx + 1 + j(3, 4), cy - 11, 2.6, 1.3), R.clay, [cx - 4, cy - 13, cx + 6, cy - 9], { clip, shadow: false, tone: (_X, _Y, t) => (t >= 2 ? 1 : t) });
      break;
    }
    case 'lana': {
      fence(P, cx - 14, cx + 14, cy - 8 + j(1, 1), clip);
      sheep(P, cx - 8 + j(2, 2), cy + 1, clip);
      sheep(P, cx + 9 + j(3, 2), cy + 2, clip, true);
      sheep(P, cx + 3 + j(4, 3), cy - 10, clip, r(5) > 0.5);
      for (let k = 0; k < 9; k++) {
        const fx = cx + j(10 + k, 26);
        const fy = cy + j(30 + k, 26);
        if (!clip(fx + 0.5, fy + 0.5) || (Math.abs(fx - cx) < 8 && fy > cy - 4 && fy < cy + 11)) continue;
        P.put(fx, fy, [rgb('#ffffff'), rgb('#ffd84a'), rgb('#ff8ab0')][k % 3]);
      }
      break;
    }
    case 'trigo': {
      if (r(1) > 0.45) windmill(P, cx - 8 + j(2, 2), cy - 1, clip);
      else hayBale(P, cx - 9, cy - 1, clip);
      hayBale(P, cx + 9 + j(3, 2), cy - 2, clip);
      hayBale(P, cx + 1 + j(4, 4), cy - 9, clip);
      for (const [px, py] of [
        [cx - 11, cy + 9],
        [cx + 12, cy + 8],
        [cx - 3, cy - 14],
      ]) {
        if (clip(px + 0.5, py + 0.5)) {
          P.put(px, py, rgb('#e8484d'));
          P.put(px, py + 1, R.forest[1]);
        }
      }
      break;
    }
    case 'piedra': {
      mountain(P, cx - 6, cy - 1, 7, 12, clip);
      mountain(P, cx + 7, cy, 6, 9, clip);
      mountain(P, cx + 1, cy - 6, 5, 8, clip);
      blob(P, ell(cx - 10, cy + 10, 2, 1.5), R.rock, [cx - 13, cy + 8, cx - 7, cy + 12], { clip });
      blob(P, ell(cx + 10, cy + 10, 2.4, 1.6), R.rock, [cx + 7, cy + 8, cx + 13, cy + 12], { clip });
      crystal(P, cx - 2, cy + 13);
      crystal(P, cx + 13, cy + 3);
      crystal(P, cx - 13, cy + 3);
      break;
    }
    case 'duna': {
      palm(P, cx - 9, cy + 1, clip);
      palm(P, cx + 9, cy - 3, clip);
      den(P, cx, cy - 9, clip);
      starfish(P, cx + 10, cy + 10);
      P.put(cx - 9, cy + 11, rgb('#fff4e8'));
      P.put(cx - 8, cy + 11, rgb('#f2c8b0'));
      break;
    }
  }
}

/** Pinta la isla completa: mar poco profundo, playa, casillas con su decorado y muelles. */
export function paintIsland(ctx: CanvasRenderingContext2D, board: Board) {
  const P = new Px(BW, BH, ctx);
  const N = BW * BH;
  const owner = new Int16Array(N).fill(-1);
  const centers = board.hexes.map((h) => hexPos(h));
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      for (let k = 0; k < centers.length; k++) {
        const c = centers[k];
        if (insideHex(x + 0.5 - c.x, y + 0.5 - c.y)) {
          owner[y * BW + x] = k;
          break;
        }
      }
    }

  // distancia aproximada a tierra (chaflán 3-4)
  const INF = 1e6;
  const dist = new Float32Array(N).fill(INF);
  for (let i = 0; i < N; i++) if (owner[i] >= 0) dist[i] = 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= BW || y >= BH ? INF : dist[y * BW + x]);
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const i = y * BW + x;
      dist[i] = Math.min(dist[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = BH - 1; y >= 0; y--)
    for (let x = BW - 1; x >= 0; x--) {
      const i = y * BW + x;
      dist[i] = Math.min(dist[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }

  // mar y playa
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const i = y * BW + x;
      if (owner[i] >= 0) continue;
      const d = dist[i] / 3;
      const n = hash(x >> 2, y >> 2) * 1.4 + hash(x, y) * 0.5;
      const beach = 3.2 + n * 0.9;
      if (d <= beach) {
        const t = d < 1.2 ? 1 : hash(x, y) > 0.93 ? 4 : hash(x * 3, y) > 0.86 ? 3 : 2;
        P.put(x, y, BEACH[t]);
      } else if (d <= beach + 1) P.put(x, y, WET);
      else if (d <= beach + 2.1 && (x + y) % 3 !== 0) P.put(x, y, FOAM);
      else {
        const far = d - beach;
        const band = far < 5 ? 2 : far < 9 ? 1 : 0;
        // tramado que se funde con el mar de fondo
        const edge = 13 + n * 2.5;
        if (far > edge + 2) continue;
        if (far > edge && (x + y * 2) % 4 !== 0) continue;
        if (far > edge - 1.5 && (x + y) % 2 === 0) {
          P.put(x, y, SHALLOW[0]);
          continue;
        }
        let c = SHALLOW[band];
        if (band < 2 && far % 4 > 3.3 && (x + y) % 2 === 0) c = SHALLOW[band + 1];
        // ondas claras en el agua
        if (hash(x >> 1, y) > 0.985) c = mix(c, FOAM, 0.6);
        P.put(x, y, c);
      }
    }
  // sombra de la isla sobre la arena (abajo a la derecha)
  for (let y = 1; y < BH; y++)
    for (let x = 1; x < BW; x++) {
      const i = y * BW + x;
      if (owner[i] >= 0) continue;
      if (owner[(y - 1) * BW + (x - 1)] >= 0 || owner[(y - 2 >= 0 ? y - 2 : 0) * BW + (x - 1)] >= 0) P.tint(x, y, rgb('#8a5a3a'), 0.3);
    }

  // suelo de cada casilla con bisel
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const k = owner[y * BW + x];
      if (k < 0) continue;
      const h = board.hexes[k];
      const c = centers[k];
      const o = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= BW || yy >= BH ? -1 : owner[yy * BW + xx]);
      let t = groundTone(h.terrain, x, y, c.x, c.y);
      if (o(x - 1, y) !== k || o(x, y - 1) !== k) t = 3;
      if (o(x + 1, y) !== k || o(x, y + 1) !== k) t = o(x + 1, y) < 0 || o(x, y + 1) < 0 ? 0 : 1;
      P.put(x, y, GROUND[h.terrain][t]);
    }

  // decorados (recortados a la casilla, sin pisar el borde)
  board.hexes.forEach((h, k) => {
    const c = centers[k];
    const clip: Mask = (X, Y) => insideHex(X - c.x, Y - c.y) && insideHex((X - c.x) * 1.09, (Y - c.y) * 1.09);
    decorate(P, h, c.x, c.y, clip);
  });

  // muelles
  for (const port of board.ports) {
    const e = board.edges[port.edge];
    const a = vertPos(board.verts[e.a]);
    const b = vertPos(board.verts[e.b]);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ux = port.dx;
    const uy = port.dy;
    const plank = R.wood;
    for (let s = 1; s <= 11; s++) {
      for (let w = -1; w <= 1; w++) {
        const X = Math.round(mx + ux * s - uy * w);
        const Y = Math.round(my + uy * s + ux * w);
        const tone = s % 3 === 0 ? 1 : w < 0 ? 3 : 2;
        P.put(X, Y, plank[tone]);
      }
    }
    // postes en el agua
    for (const s of [4, 10])
      for (const w of [-2, 2]) {
        const X = Math.round(mx + ux * s - uy * w);
        const Y = Math.round(my + uy * s + ux * w);
        P.put(X, Y, R.trunk[0]);
        P.put(X, Y + 1, R.trunk[1]);
      }
  }
  P.flush();
}

/** Mar de fondo a pantalla completa con olitas y destellos. */
export function paintOcean(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const deep = [rgb('#3196cd'), WATER_DEEP, rgb('#45b1df')];
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // oleaje suave: bandas onduladas con tramado ordenado en los bordes
      const v = Math.sin(x * 0.05 + Math.sin(y * 0.09) * 1.7) * 0.55 + Math.sin(y * 0.13 + x * 0.017) * 0.45;
      const d = (bayer[y & 3][x & 3] / 16 - 0.47) * 0.32;
      const q = v + d;
      P.put(x, y, deep[q > 0.5 ? 2 : q < -0.55 ? 0 : 1]);
    }
  // olitas (pequeñas medias lunas)
  const WAVE = rgb('#8fdcf2');
  const WAVE2 = rgb('#62c4ea');
  for (let gy = 0; gy < H; gy += 11)
    for (let gx = 0; gx < W; gx += 17) {
      const r = hash(gx * 7 + 1, gy * 3 + 5);
      if (r < 0.55) continue;
      const x = gx + Math.floor(hash(gx, gy) * 10);
      const y = gy + Math.floor(hash(gy, gx) * 6);
      P.put(x, y, WAVE);
      P.put(x + 1, y - 1, WAVE);
      P.put(x + 2, y - 1, WAVE);
      P.put(x + 3, y, WAVE);
      P.put(x + 1, y, WAVE2);
      P.put(x + 2, y, WAVE2);
    }
  P.flush();
}

// ───────────────────────── sprites ─────────────────────────

const DIG: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  ':': ['.', '#', '.', '#', '.'],
};

function digits(i: Ico, s: string, x: number, y: number, c: RGB) {
  let cx = x;
  for (const ch of s) {
    const g = DIG[ch];
    if (!g) continue;
    g.forEach((row, yy) => [...row].forEach((v, xx) => v === '#' && i.px(cx + xx, y + yy, c)));
    cx += g[0].length + 1;
  }
}
const digitsWidth = (s: string) => [...s].reduce((w, ch) => w + (DIG[ch]?.[0].length ?? 0) + 1, 0) - 1;

const TOKEN = custom('#b08a5a', '#e4c48a', '#f8e8c4', '#fff6e0', '#ffffff');
const RED: RGB = [214, 52, 58];

const colorRamp = (c: number) => ramp5(PLAYER_COLORS[c % PLAYER_COLORS.length].hex);

function drawRes(i: Ico, r: Res) {
  switch (r) {
    case 'madera': {
      const log = ramp5('#b8683a');
      const end = custom('#9a6a3a', '#d8a868', '#f4d29a', '#ffe8bc', '#fff4dc');
      i.add(rrect(1, 9, 11.5, 13.6, 2.2), log, { tone: (_x, y, t) => (t === 2 && Math.floor(y) === 11 ? 1 : t) });
      i.add(ell(12, 11.3, 2.4, 2.4), end, { tone: (x, y, t) => (t >= 2 && Math.abs(Math.hypot(x - 12, y - 11.3) - 1.3) < 0.45 ? 1 : t) });
      i.add(rrect(3.5, 4.2, 13, 8.8, 2.2), log, { tone: (_x, y, t) => (t === 2 && Math.floor(y) === 6 ? 1 : t) });
      i.add(ell(13.4, 6.5, 2.3, 2.3), end, { tone: (x, y, t) => (t >= 2 && Math.abs(Math.hypot(x - 13.4, y - 6.5) - 1.2) < 0.45 ? 1 : t) });
      i.add(seg(5.5, 3.6, 4.4, 1.6, 0.6), R.leaf, { inner: false });
      i.px(3, 1, R.leaf[3]);
      break;
    }
    case 'arcilla': {
      const B = R.brick;
      const brick = (x0: number, y0: number) => rrect(x0, y0, x0 + 6.6, y0 + 3.4, 0.6);
      i.add(brick(1, 11), B, { spot: [2.2, 11.8] });
      i.add(brick(8.4, 11), B, { spot: [9.6, 11.8] });
      i.add(brick(4.7, 6.8), B, { spot: [5.9, 7.6] });
      i.add(brick(5.6, 2.6), ramp5('#dc7048'), { spot: [6.8, 3.4] });
      break;
    }
    case 'lana': {
      i.add(or(ell(7.4, 9, 5.4, 3.8), ell(5, 6.8, 2.8, 2.4), ell(8.6, 6, 2.8, 2.4), ell(11.2, 7.6, 2.4, 2.2)), R.wool, { spot: [5, 6] });
      i.add(ell(13.2, 9.2, 2, 2.2), R.face, { inner: false });
      i.px(13, 9, [255, 255, 255]);
      for (const lx of [4, 6, 9, 11]) {
        i.px(lx, 13, R.face[1]);
        i.px(lx, 14, R.face[0]);
      }
      break;
    }
    case 'trigo': {
      const stalk = ramp5('#c89a38');
      for (const [bx, by, ex, ey] of [
        [8, 15, 4.2, 5],
        [8, 15, 8, 3],
        [8, 15, 11.8, 5],
      ]) {
        i.add(seg(bx, by, ex, ey, 0.55), stalk, { inner: false });
      }
      for (const [x, y] of [
        [4, 4.2],
        [8, 2.2],
        [12, 4.2],
      ]) {
        i.add(or(ell(x - 0.9, y, 1.1, 1.6), ell(x + 0.9, y + 0.4, 1.1, 1.6), ell(x, y - 1.8, 0.9, 1.2), ell(x - 0.8, y + 2.4, 1, 1.3), ell(x + 0.8, y + 2.6, 1, 1.3)), R.wheat, { spot: [x - 1, y - 0.6] });
      }
      i.add(rect(5.6, 10, 10.4, 11.4), C.red, { inner: false });
      break;
    }
    case 'piedra': {
      i.add(poly([[1.5, 13.5], [3, 7], [7, 3.2], [11.6, 4.6], [14.6, 9.4], [13.6, 13.8]]), R.rock, {
        tone: (x, y, t) => (t <= 1 ? t : x + y * 0.4 < 8 ? 3 : t),
      });
      i.add(poly([[5.2, 10.6], [6.6, 6.4], [9, 5.6], [9.6, 9.6]]), R.crystal, { spot: [7, 7] });
      i.add(poly([[10, 12.6], [11.2, 9.4], [12.8, 10.4], [12.2, 12.8]]), R.crystal);
      i.px(13, 3, R.crystal[4]);
      i.px(14, 2, [255, 255, 255]);
      break;
    }
  }
}

function drawDog(i: Ico) {
  const fur = ramp5('#e0a868');
  const ear = ramp5('#8a5232');
  i.add(or(ell(2.6, 7.2, 2, 3.6), ell(13.4, 7.2, 2, 3.6)), ear);
  i.add(ell(8, 7.4, 5, 4.6), fur, { spot: [5.6, 5] });
  i.add(ell(8, 10.6, 3.2, 2.4), C.cream);
  i.add(ell(8, 9.4, 1.2, 0.9), ramp5('#3a2a38'), { inner: false });
  i.add(ell(8, 13, 1, 1.1), ramp5('#ff7a8a'), { inner: false });
  i.px(5, 7, INK);
  i.px(10, 7, INK);
  i.px(5, 6, [255, 255, 255]);
  i.px(10, 6, [255, 255, 255]);
}

registerIcons({
  res_madera: (i) => drawRes(i, 'madera'),
  res_arcilla: (i) => drawRes(i, 'arcilla'),
  res_lana: (i) => drawRes(i, 'lana'),
  res_trigo: (i) => drawRes(i, 'trigo'),
  res_piedra: (i) => drawRes(i, 'piedra'),
  dev_perro: drawDog,
  dev_cuadrilla: (i) => {
    i.add(seg(3, 13.5, 12.4, 3.2, 0.9), C.wood);
    i.add(or(ring(11.6, 5.6, 3.6, 5, 200, 330), ell(12.6, 3.6, 1.2, 1.2)), C.steel, { spot: [9, 1.8] });
    i.add(seg(12.8, 13.6, 4.6, 4.6, 0.9), C.woodD);
    i.add(poly([[1.6, 4.6], [4.4, 1.4], [7, 4], [4.4, 7.2]]), C.steel, { spot: [3.6, 3] });
  },
  dev_cosecha: (i) => {
    i.add(ell(5.6, 6.6, 2.2, 2.2), C.red, { spot: [4.8, 5.8] });
    i.add(ell(9.6, 5.8, 2.2, 2.2), ramp5('#7ac83e'), { spot: [8.8, 5] });
    i.add(ell(7.6, 4, 1.6, 1.6), ramp5('#f2a33a'), { spot: [7, 3.4] });
    i.add(ring(8, 9.4, 4.6, 5.8, 180, 360), C.tan);
    i.add((x, y) => y >= 8.4 && y <= 14.4 && Math.abs(x - 8) <= 6.6 - (y - 8.4) * 0.4, C.tan, {
      tone: (x, y, t) => (t >= 2 && (Math.floor(x) + Math.floor(y)) % 3 === 0 ? 1 : t),
    });
  },
  dev_mercader: (i) => {
    i.add(or(ell(8, 10.4, 5.2, 4.4), rect(6.2, 4.6, 9.8, 7.4)), ramp5('#b07a4a'), { spot: [5.6, 8.6] });
    i.add(rect(5.6, 5.8, 10.4, 6.8), C.gold, { inner: false });
    i.add(ell(8, 3.4, 2.6, 1.4), ramp5('#b07a4a'));
    i.add(ell(12.6, 13.4, 2.2, 1.6), C.gold, { spot: [12, 13] });
    i.px(7, 11, C.gold[3]);
    i.px(8, 10, C.gold[3]);
    i.px(9, 11, C.gold[3]);
    i.px(8, 12, C.gold[3]);
  },
  dev_tesoro: (i) => {
    i.add(ell(5, 5.6, 1.8, 1.2), C.gold, { spot: [4.6, 5.2] });
    i.add(ell(8.2, 4.6, 1.8, 1.2), C.gold, { spot: [7.8, 4.2] });
    i.add(ell(11.2, 5.6, 1.8, 1.2), C.gold, { spot: [10.8, 5.2] });
    i.add(rect(1.6, 8.5, 14.4, 14.6), C.wood, { tone: (_x, y, t) => (t === 2 && Math.floor(y) === 11 ? 1 : t) });
    i.add(rrect(1.6, 5.8, 14.4, 8.6, 1.6), C.wood, { tone: (_x, _y, t) => (t === 2 ? 3 : t) });
    i.add(or(rect(3.5, 5.9, 4.6, 14.5), rect(11.4, 5.9, 12.5, 14.5)), C.steel, { inner: false });
    i.add(rrect(6.6, 7.6, 9.4, 11.2, 0.8), C.gold, { spot: [7.3, 8.3] });
  },
  dev_dorso: (i) => {
    i.add(ell(8, 8, 6.4, 6.4), ramp5('#3fae5a'), { spot: [5.4, 5] });
    i.add(or(seg(8, 12.6, 8, 4, 0.6), seg(8, 8, 5.4, 5.8, 0.5), seg(8, 10, 10.8, 7.6, 0.5)), ramp5('#9ae07a'), { inner: false });
  },
  isla_sendero: (i) => {
    i.add(rect(7.2, 5, 8.8, 15), C.wood);
    i.add(poly([[1.6, 2.4], [11, 2.4], [14.4, 4.6], [11, 6.8], [1.6, 6.8]]), C.cream, { spot: [3, 3.4] });
    i.add(poly([[14.2, 8.4], [5, 8.4], [1.6, 10.6], [5, 12.8], [14.2, 12.8]]), C.cream);
    i.px(4, 4, C.brown[1]);
    i.px(6, 4, C.brown[1]);
    i.px(8, 4, C.brown[1]);
    i.px(8, 10, C.brown[1]);
    i.px(10, 10, C.brown[1]);
    i.px(12, 10, C.brown[1]);
  },
  isla_jauria: (i) => {
    i.add(star(8, 8.6, 7.4, 4.4, 8, -90), C.gold, { spot: [5.6, 5] });
    i.add(ell(8, 8.6, 3.8, 3.8), C.red, { inner: true });
    i.add(or(ell(6.6, 7.4, 0.9, 1.3), ell(9.4, 7.4, 0.9, 1.3), ell(8, 9.6, 1.6, 1.3), ell(5.6, 9.2, 0.7, 0.9), ell(10.4, 9.2, 0.7, 0.9)), C.cream, { inner: false });
  },
  isla_granero: (i) => {
    i.add(poly([[1, 7], [8, 1.6], [15, 7], [15, 15], [1, 15]]), C.red, { spot: [4, 6] });
    i.add(poly([[0.4, 7.4], [8, 1], [15.6, 7.4], [14.2, 8.2], [8, 3], [1.8, 8.2]]), C.cream, { inner: false });
    i.add(rect(5, 9, 11, 15), C.cream, { inner: false });
    i.add(or(seg(5.6, 9.6, 10.4, 14.4, 0.5), seg(10.4, 9.6, 5.6, 14.4, 0.5)), C.red, { inner: false });
  },
  isla_dado: (i) => {
    i.add(rrect(1, 1, 15, 15, 3), C.cream, { spot: [3.6, 3.6] });
    for (const [x, y] of [
      [5, 5],
      [8, 8],
      [11, 11],
    ])
      i.add(ell(x, y, 1.2, 1.2), C.red, { inner: false });
  },
  isla_cartas: (i) => {
    i.add(rrect(5, 1.4, 14.4, 13.6, 1.4), ramp5('#3fae5a'), { spot: [6.6, 3] });
    i.add(rrect(1.6, 3.4, 11, 15.4, 1.4), C.cream, { spot: [3, 5] });
    i.add(ell(6.3, 9.4, 2.6, 2.6), ramp5('#3fae5a'));
  },
  isla_mano: (i) => {
    for (let k = 0; k < 3; k++) i.add(rrect(2 + k * 3, 2 + (k === 1 ? 0 : 1), 9 + k * 3, 14 + (k === 1 ? 0 : 1), 1.2), [C.paper, C.cream, C.paper][k], { spot: [3 + k * 3, 4] });
  },
  isla_boat: {
    w: 14,
    h: 14,
    draw: (i) => {
      i.add(poly([[1, 9], [13, 9], [11, 12.6], [3, 12.6]]), ramp5('#c27a46'), { tone: (_x, y, t) => (t >= 2 && Math.floor(y) === 10 ? 3 : t) });
      i.add(rect(6.6, 1.4, 7.4, 9), C.woodD, { inner: false });
      i.add(poly([[7.6, 1.6], [12.6, 7.8], [7.6, 7.8]]), C.cream, { spot: [8.4, 4] });
      i.add(poly([[6.4, 2.6], [2.4, 7.8], [6.4, 7.8]]), ramp5('#ff8a6a'));
    },
  },
  isla_gull: {
    w: 9,
    h: 5,
    draw: (i) => {
      i.add(or(seg(0.8, 1.4, 4.5, 3.4, 0.6), seg(4.5, 3.4, 8.2, 1.4, 0.6)), custom('#8a92a8', '#c8d0e0', '#ffffff', '#ffffff', '#ffffff'), { inner: false, light: false });
    },
  },
  isla_wave: {
    w: 7,
    h: 3,
    draw: (i) => {
      i.add(ring(3.5, 3.6, 1.8, 3.1, 180, 360), custom('#62c4ea', '#8fdcf2', '#c8f0fa', '#ffffff', '#ffffff'), { inner: false, light: false });
    },
  },
  isla_zorro: {
    w: 17,
    h: 16,
    draw: (i) => {
      const F = R.fox;
      const W = custom('#c8b8c8', '#ecdfe6', '#fff8f2', '#ffffff', '#ffffff');
      // cola enroscada
      i.add(or(ell(12.6, 12.4, 3.6, 2.4), ell(14.4, 9.6, 1.8, 2.8)), F, { spot: [11, 11.6] });
      i.add(ell(14.6, 7.6, 1.4, 1.6), W, { inner: false });
      // cuerpo
      i.add(or(ell(7.6, 11.6, 4.4, 3.8), rect(4.6, 13, 10.6, 15)), F, { spot: [5, 9.6] });
      i.add(ell(7, 12.6, 2, 2.4), W);
      // cabeza y orejas
      i.add(or(poly([[2.2, 4.8], [2.6, 0.6], [5.6, 3.2]]), poly([[8.4, 3.2], [11.4, 0.6], [11.8, 4.8]])), F);
      i.px(3, 2, ramp5('#5a3426')[2]);
      i.px(10, 2, ramp5('#5a3426')[2]);
      i.add(ell(7, 5.8, 4.6, 3.4), F, { spot: [4.4, 4] });
      i.add(or(ell(4.6, 7.4, 2.4, 1.6), ell(9.4, 7.4, 2.4, 1.6)), W, { inner: false });
      i.px(7, 8, INK);
      i.px(5, 5, INK);
      i.px(9, 5, INK);
      i.px(5, 4, [255, 255, 255]);
      i.px(9, 4, [255, 255, 255]);
      i.px(3, 7, [255, 154, 168]);
      i.px(11, 7, [255, 154, 168]);
      // patitas
      i.px(5, 15, ramp5('#5a3426')[2]);
      i.px(9, 15, ramp5('#5a3426')[2]);
    },
  },
});

// fichas con número, dados, piezas de cada color y carteles de muelle
const extra: Record<string, { w: number; h: number; draw: (i: Ico) => void }> = {};
for (let n = 2; n <= 12; n++) {
  if (n === 7) continue;
  extra['isla_num_' + n] = {
    w: 13,
    h: 13,
    draw: (i) => {
      i.add(ell(6.5, 6.5, 5.9, 5.9), TOKEN, { spot: [4, 3.4] });
      const s = String(n);
      const red = n === 6 || n === 8;
      digits(i, s, Math.round(6.5 - digitsWidth(s) / 2 - 0.01), 2, red ? RED : INK);
      const pips = PIPS[n];
      const x0 = Math.round(6.5 - (pips * 2 - 1) / 2);
      for (let k = 0; k < pips; k++) i.px(x0 + k * 2, 9, red ? RED : mix(INK, [180, 150, 120], 0.25));
    },
  };
}
for (let d = 1; d <= 6; d++) {
  extra['isla_die_' + d] = {
    w: 13,
    h: 13,
    draw: (i) => {
      i.add(rrect(0.6, 0.6, 12.4, 12.4, 2.6), custom('#a89aa8', '#e2d8de', '#fff8f0', '#ffffff', '#ffffff'), { spot: [2.6, 2.4] });
      const P: Record<number, [number, number][]> = {
        1: [[6, 6]],
        2: [[3, 3], [9, 9]],
        3: [[3, 3], [6, 6], [9, 9]],
        4: [[3, 3], [9, 3], [3, 9], [9, 9]],
        5: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]],
        6: [[3, 3], [9, 3], [3, 6], [9, 6], [3, 9], [9, 9]],
      };
      for (const [x, y] of P[d]) {
        const c: RGB = d === 1 ? RED : [58, 42, 72];
        i.px(x, y, c);
        i.px(x + 1, y, c);
        i.px(x, y + 1, c);
        i.px(x + 1, y + 1, mix(c, [255, 255, 255], 0.2));
      }
    },
  };
}
for (let c = 0; c < PLAYER_COLORS.length; c++) {
  const roof = colorRamp(c);
  extra[`isla_cabana_${c}`] = {
    w: 12,
    h: 12,
    draw: (i) => {
      i.add(rect(2, 5.6, 10, 11.4), C.cream, { spot: [3, 6.6] });
      i.add(rect(7.8, 1.2, 9.2, 5), R.brick, { inner: false });
      i.add(poly([[0.4, 6.6], [6, 1], [11.6, 6.6]]), roof, { spot: [3.6, 4.4] });
      i.add(rect(5, 8, 7, 11.4), ramp5('#9a5a36'), { inner: false });
      i.px(8, 8, [255, 216, 106]);
      i.px(3, 8, [255, 216, 106]);
    },
  };
  extra[`isla_villa_${c}`] = {
    w: 16,
    h: 16,
    draw: (i) => {
      i.add(rect(8.4, 4.6, 14, 15.4), C.cream, { spot: [9.4, 5.6] });
      i.add(poly([[7.6, 5.2], [11.2, 0.6], [14.8, 5.2]]), roof, { spot: [10, 3] });
      i.add(rect(1.4, 8.6, 9, 15.4), C.cream, { spot: [2.4, 9.6] });
      i.add(poly([[0.4, 9.4], [5.2, 4.6], [10, 9.4]]), roof, { spot: [3, 7.6] });
      i.add(rect(4.4, 11.6, 6.4, 15.4), ramp5('#9a5a36'), { inner: false });
      i.px(10, 8, [255, 216, 106]);
      i.px(12, 8, [255, 216, 106]);
      i.px(11, 12, [255, 216, 106]);
      i.px(2, 11, [255, 216, 106]);
      i.px(11, 3, [255, 255, 255]);
    },
  };
  const road = (draw: (i: Ico, m: Mask) => void, m: Mask) => (i: Ico) => draw(i, m);
  const roadDraw = (i: Ico, m: Mask) => i.add(m, roof, { tone: (x, y, t) => (t === 2 && (Math.floor(x) + Math.floor(y)) % 4 === 0 ? 3 : t) });
  extra[`isla_road_v_${c}`] = { w: 5, h: 16, draw: road(roadDraw, seg(2.5, 2.6, 2.5, 13.4, 1.25)) };
  extra[`isla_road_a_${c}`] = { w: 16, h: 10, draw: road(roadDraw, seg(2.4, 2.2, 13.6, 7.8, 1.3)) };
  extra[`isla_road_b_${c}`] = { w: 16, h: 10, draw: road(roadDraw, seg(2.4, 7.8, 13.6, 2.2, 1.3)) };
  extra[`isla_flag_${c}`] = {
    w: 10,
    h: 12,
    draw: (i) => {
      i.add(rect(1.4, 1, 2.4, 11.4), C.woodD, { inner: false });
      i.add(poly([[2.6, 1.4], [9.4, 3.6], [2.6, 6.4]]), roof, { spot: [3.4, 2.6] });
    },
  };
}
// fantasmas para marcar dónde se puede construir
const GHOST = custom('#6a5a7a', '#cfc4e0', '#ffffff', '#ffffff', '#ffffff');
extra.isla_road_v_ghost = { w: 5, h: 16, draw: (i) => i.add(seg(2.5, 2.6, 2.5, 13.4, 1.25), GHOST) };
extra.isla_road_a_ghost = { w: 16, h: 10, draw: (i) => i.add(seg(2.4, 2.2, 13.6, 7.8, 1.3), GHOST) };
extra.isla_road_b_ghost = { w: 16, h: 10, draw: (i) => i.add(seg(2.4, 7.8, 13.6, 2.2, 1.3), GHOST) };

const PORT_BADGE = custom('#8a5a3a', '#d8a868', '#fbe8c4', '#fff6e0', '#ffffff');
const PORT_COLOR: Record<Res, Ramp> = {
  madera: ramp5('#3f9a4a'),
  arcilla: ramp5('#d0603e'),
  lana: ramp5('#7cc456'),
  trigo: ramp5('#e8aa2a'),
  piedra: ramp5('#8a86a6'),
};
extra.isla_port_any = {
  w: 15,
  h: 11,
  draw: (i) => {
    i.add(rrect(0.6, 0.6, 14.4, 10.4, 2.4), PORT_BADGE, { spot: [2.4, 2] });
    digits(i, '3:1', 3, 3, INK);
  },
};

/** Iconos de 7×7 para los carteles de los muelles. */
function mini(i: Ico, r: Res, ox: number, oy: number) {
  const o = (m: Mask): Mask => (x, y) => m(x - ox, y - oy);
  switch (r) {
    case 'madera':
      i.add(o(rrect(0.4, 1.8, 6, 5.6, 1.6)), ramp5('#b8683a'));
      i.add(o(ell(5.6, 3.7, 1.5, 1.7)), custom('#9a6a3a', '#d8a868', '#f4d29a', '#ffe8bc', '#fff4dc'), { light: false });
      break;
    case 'arcilla':
      i.add(o(rect(0.4, 3.8, 3.4, 6)), R.brick);
      i.add(o(rect(3.8, 3.8, 6.8, 6)), R.brick);
      i.add(o(rect(2, 1, 5, 3.4)), R.brick);
      break;
    case 'lana':
      i.add(o(or(ell(3, 3.8, 2.8, 2.2), ell(2.4, 2.4, 1.6, 1.4), ell(4.2, 2.4, 1.4, 1.4))), R.wool);
      i.add(o(ell(6.2, 3.8, 1, 1.2)), R.face, { inner: false, light: false });
      break;
    case 'trigo':
      i.add(o(seg(3.5, 6.6, 3.5, 3, 0.5)), ramp5('#c89a38'), { inner: false });
      i.add(o(or(ell(3.5, 2.6, 1.4, 2.4), ell(1.6, 3.6, 1, 1.4), ell(5.4, 3.6, 1, 1.4))), R.wheat);
      break;
    case 'piedra':
      i.add(o(poly([[0.4, 6.4], [1.4, 2.6], [3.6, 0.8], [6.2, 2.4], [6.6, 6.4]])), R.rock, { tone: (x, y, t) => (t <= 1 ? t : x - ox + (y - oy) * 0.5 < 3 ? 3 : t) });
      i.px(ox + 3, oy + 3, R.crystal[4]);
      i.px(ox + 4, oy + 4, R.crystal[2]);
      break;
  }
}

for (const r of ['madera', 'arcilla', 'lana', 'trigo', 'piedra'] as Res[]) {
  extra['isla_port_' + r] = {
    w: 22,
    h: 13,
    draw: (i) => {
      i.add(rrect(5, 1.6, 21.4, 11.4, 2.4), PORT_COLOR[r], { spot: [7, 3] });
      i.add(ell(6.5, 6.5, 6, 6), PORT_BADGE, { spot: [4, 3.4] });
      mini(i, r, 3, 3);
      digits(i, '2:1', 12, 4, [255, 250, 236]);
    },
  };
  extra['mini_' + r] = { w: 9, h: 9, draw: (i) => mini(i, r, 1, 1) };
}

registerIcons(extra);
