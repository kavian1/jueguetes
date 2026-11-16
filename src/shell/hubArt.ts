// Escenas del Rincón de Juegos: la salita acogedora del menú, las portadas de las cajas
// y la playa que hace de fondo en la portada y la sala de Isla Cosecha.
import { Px, cloud, ell, hash, hex, mix, pot, shape, sleepingCat, type Mask, type RGB } from '../pixel/world';
import { ramp5 } from '../pixel/chibi';

type Ramp = RGB[];

function vband(P: Px, y0: number, y1: number, cols: RGB[], x0 = 0, x1 = P.w) {
  const h = Math.max(1, y1 - y0);
  for (let y = y0; y < y1; y++) {
    const v = ((y - y0) / h) * (cols.length - 1);
    const i = Math.floor(v);
    const f = v - i;
    for (let x = x0; x < x1; x++) P.put(x, y, f > 0.78 && (x + y) % 2 === 0 ? cols[Math.min(cols.length - 1, i + 1)] : cols[i]);
  }
}

const rect =
  (x0: number, y0: number, x1: number, y1: number): Mask =>
  (x, y) =>
    x >= x0 && x < x1 && y >= y0 && y < y1;

// ───────────────────────── salita del menú ─────────────────────────

export function paintHub(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const u = Math.max(0.7, H / 200);
  const r = (v: number) => Math.round(v * u);
  const floorY = Math.round(H * 0.78);
  const wainY = Math.round(H * 0.6);

  // papel pintado melocotón con rayas y florecitas
  const WALL = ramp5('#f4b98a');
  for (let y = 0; y < wainY; y++)
    for (let x = 0; x < W; x++) {
      const stripe = x % r(14) < r(5);
      let c = stripe ? WALL[3] : WALL[2];
      const fx = x % r(14);
      const fy = (y + (Math.floor(x / r(14)) % 2) * r(9)) % r(18);
      if (!stripe && fx === r(9) && fy === r(8)) c = hex('#ff8a8a');
      if (!stripe && ((fx === r(9) - 1 || fx === r(9) + 1) && fy === r(8))) c = hex('#ffc0a8');
      if (!stripe && fx === r(9) && (fy === r(8) - 1 || fy === r(8) + 1)) c = hex('#ffc0a8');
      if (y < r(3)) c = WALL[1];
      P.put(x, y, c);
    }
  // zócalo de madera con paneles
  const WOOD = ramp5('#c27a46');
  for (let y = wainY; y < floorY; y++)
    for (let x = 0; x < W; x++) {
      let t = 2;
      if (y < wainY + r(3)) t = y === wainY ? 4 : 3;
      const pw = r(30);
      const px = x % pw;
      const inPanel = px > r(3) && px < pw - r(3) && y > wainY + r(6) && y < floorY - r(5);
      if (inPanel) t = px === r(4) || y === wainY + r(7) ? 1 : px === pw - r(4) || y === floorY - r(6) ? 3 : 2;
      if (y >= floorY - r(2)) t = 1;
      P.put(x, y, WOOD[t]);
    }
  // suelo de tablones
  const FLOOR = ramp5('#b06038');
  for (let y = floorY; y < H; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor((y - floorY) / r(6));
      const off = (row * r(23)) % r(46);
      let t = (y - floorY) % r(6) === 0 ? 1 : hash(Math.floor((x + off) / r(46)), row) > 0.5 ? 2 : 3;
      if ((x + off) % r(46) === 0) t = 1;
      if (t === 3 && hash(x, y) > 0.96) t = 4;
      P.put(x, y, FLOOR[t]);
    }

  // ventana con atardecer
  const wx0 = Math.round(W * 0.06);
  const wx1 = Math.round(W * 0.27);
  const wy0 = r(26);
  const wy1 = wainY - r(16);
  vband(P, wy0, wy1, ['#5a4aa8', '#8a5ac0', '#d878b0', '#ff9a8a', '#ffc078', '#ffe0a0'].map(hex), wx0, wx1);
  // sol poniente y colinas
  const sx = Math.round((wx0 + wx1) / 2 + r(6));
  const sy = wy1 - r(10);
  for (let y = sy - r(7); y <= sy + r(7); y++) for (let x = sx - r(7); x <= sx + r(7); x++) if (Math.hypot(x - sx, y - sy) < r(6.5) && y < wy1) P.put(x, y, hex(Math.hypot(x - sx, y - sy) < r(4.5) ? '#fff2c0' : '#ffd88a'));
  for (let x = wx0; x < wx1; x++) {
    const hh = Math.round(r(6) + Math.sin(x * 0.12) * r(2.5) + Math.sin(x * 0.31) * r(1));
    for (let y = wy1 - hh; y < wy1; y++) P.put(x, y, hex(y < wy1 - hh + 1 ? '#7ac06a' : '#4f9a58'));
  }
  for (let k = 0; k < 9; k++) {
    const x = wx0 + Math.floor(hash(k, 3) * (wx1 - wx0));
    const y = wy0 + Math.floor(hash(k, 9) * (wy1 - wy0) * 0.45);
    P.put(x, y, hex('#fff6d8'));
  }
  // marco y cruceta
  const FR = ramp5('#f4ead8');
  const fr = r(3);
  shape(P, (x, y) => x >= wx0 - fr && x < wx1 + fr && y >= wy0 - fr && y < wy1 + fr && !(x >= wx0 && x < wx1 && y >= wy0 && y < wy1), FR, [wx0 - fr, wy0 - fr, wx1 + fr, wy1 + fr]);
  const midX = Math.round((wx0 + wx1) / 2);
  const midY = Math.round((wy0 + wy1) / 2);
  shape(P, (x, y) => (x >= midX - 1 && x < midX + 1 && y >= wy0 && y < wy1) || (y >= midY - 1 && y < midY + 1 && x >= wx0 && x < wx1), FR, [wx0, wy0, wx1, wy1], { outline: false });
  // alféizar con macetas
  shape(P, rect(wx0 - fr - r(3), wy1 + fr, wx1 + fr + r(3), wy1 + fr + r(3)), FR, [wx0 - fr - r(4), wy1 + fr - 1, wx1 + fr + r(4), wy1 + fr + r(4)]);
  const sill = wy1 + fr;
  pot(P, wx0 + r(8), sill, r(7), r(5));
  shape(P, (x, y) => ell(wx0 + r(8), sill - r(8), r(5), r(4))(x, y) || ell(wx0 + r(5), sill - r(6), r(3), r(2.6))(x, y), ramp5('#4fb054'), [wx0, sill - r(13), wx0 + r(15), sill - r(4)], { spot: [wx0 + r(6), sill - r(10)] });
  pot(P, wx1 - r(8), sill, r(6), r(5));
  for (const [dx, c] of [
    [-2, '#ff7aa8'],
    [0, '#ffd84a'],
    [2, '#ff8a6a'],
  ] as const) {
    const fx = wx1 - r(8) + r(dx);
    for (let y = sill - r(10); y < sill - r(5); y++) P.put(fx, y, hex('#3f9a4a'));
    shape(P, ell(fx, sill - r(11), r(1.6), r(1.6)), ramp5(c), [fx - r(3), sill - r(14), fx + r(3), sill - r(8)]);
  }
  // cortinas
  const CUR = ramp5('#4cb8a8');
  for (const side of [-1, 1]) {
    const cx0 = side < 0 ? wx0 - fr - r(9) : wx1 + fr - r(1);
    const cw = r(10);
    const m: Mask = (x, y) => {
      const yy = y - (wy0 - r(10));
      if (yy < 0 || y > wy1 + r(6)) return false;
      const waist = yy > (wy1 - wy0) * 0.62 && yy < (wy1 - wy0) * 0.72 ? r(3) : 0;
      const xx = side < 0 ? x - cx0 : cx0 + cw - x;
      return xx >= 0 && xx < cw - waist * 0.8;
    };
    shape(P, m, CUR, [cx0 - 1, wy0 - r(11), cx0 + cw + 1, wy1 + r(7)], { tone: (x, _y, t) => (t === 2 && Math.floor(x) % r(4) === 0 ? 1 : t) });
  }
  // barra de la cortina
  shape(P, rect(wx0 - fr - r(11), wy0 - r(12), wx1 + fr + r(11), wy0 - r(10)), ramp5('#c27a46'), [wx0 - fr - r(12), wy0 - r(13), wx1 + fr + r(12), wy0 - r(9)]);

  // estantería con cajas de juegos
  const bx0 = Math.round(W * 0.74);
  const bx1 = Math.round(W * 0.95);
  const by0 = r(30);
  const by1 = floorY + r(2);
  const SH = ramp5('#a65a32');
  shape(P, rect(bx0, by0, bx1, by1), SH, [bx0 - 1, by0 - 1, bx1 + 1, by1 + 1], { shadow: 2 });
  const shelves = 4;
  const sh = Math.floor((by1 - by0 - r(4)) / shelves);
  const boxes = ['#e8484d', '#3a86ec', '#f5c43a', '#5cbc6a', '#a25ce0', '#f5922a', '#4cb8a8', '#ff7aa8'];
  for (let s = 0; s < shelves; s++) {
    const top = by0 + r(3) + s * sh;
    const bottom = top + sh - r(3);
    for (let y = top; y < bottom; y++) for (let x = bx0 + r(3); x < bx1 - r(3); x++) P.put(x, y, SH[y < top + 2 ? 0 : 1]);
    shape(P, rect(bx0 + r(1), bottom, bx1 - r(1), bottom + r(3)), ramp5('#c27a46'), [bx0, bottom - 1, bx1, bottom + r(3) + 1]);
    let x = bx0 + r(4);
    let k = s * 3;
    while (x < bx1 - r(10)) {
      const kind = hash(k, s * 7);
      const bw = kind < 0.6 ? r(4) + Math.floor(hash(k, 2) * r(3)) : r(14);
      const bh = kind < 0.6 ? sh - r(5) - Math.floor(hash(k, 5) * r(5)) : r(5) + Math.floor(hash(k, 4) * r(3));
      if (x + bw > bx1 - r(4)) break;
      const col = ramp5(boxes[Math.floor(hash(k, 11) * boxes.length)]);
      if (kind >= 0.6) {
        // cajas de juego tumbadas, unas encima de otras
        let yb = bottom;
        for (let st = 0; st < 2; st++) {
          const c2 = st ? ramp5(boxes[Math.floor(hash(k + 5, 13) * boxes.length)]) : col;
          shape(P, rect(x, yb - bh, x + bw, yb), c2, [x - 1, yb - bh - 1, x + bw + 1, yb], { tone: (X, Y, t) => (t === 2 && Math.floor(Y) === yb - bh + 2 && X > x + 2 && X < x + bw - 2 ? 4 : t) });
          yb -= bh + 1;
        }
      } else {
        shape(P, rect(x, bottom - bh, x + bw, bottom), col, [x - 1, bottom - bh - 1, x + bw + 1, bottom], {
          tone: (_X, Y, t) => (t === 2 && (Math.floor(Y) === bottom - bh + r(3) || Math.floor(Y) === bottom - r(3)) ? 4 : t),
        });
      }
      x += bw + 1 + (hash(k, 9) > 0.8 ? r(4) : 0);
      k++;
    }
    if (s === 1) {
      const px = bx1 - r(8);
      pot(P, px, bottom, r(6), r(4));
      shape(P, (X, Y) => ell(px, bottom - r(7), r(4), r(3.4))(X, Y), ramp5('#4fb054'), [px - r(5), bottom - r(11), px + r(5), bottom - r(3)], { spot: [px - r(2), bottom - r(8)] });
    }
  }

  // guirnalda de lucecitas
  const bulbs = ['#ff6a6a', '#ffd84a', '#6ad8ff', '#8aea6a', '#ff9ad8'];
  for (let x = 0; x < W; x++) {
    const y = r(6) + Math.round(Math.abs(Math.sin((x / W) * Math.PI * 3)) * r(9));
    P.put(x, y, hex('#5a3a2a'));
    if (x % r(16) === r(8)) {
      const c = hex(bulbs[Math.floor(x / r(16)) % bulbs.length]);
      for (let yy = 1; yy <= r(3); yy++)
        for (let xx = -1; xx <= 1; xx++) {
          if (yy === r(3) && xx !== 0) continue;
          P.put(x + xx, y + yy, xx < 0 && yy === 1 ? mix(c, [255, 255, 255], 0.6) : c);
        }
      // halo suave en la pared
      for (let yy = -r(5); yy <= r(7); yy++)
        for (let xx = -r(6); xx <= r(6); xx++) {
          const d = Math.hypot(xx, yy - 2);
          if (d < r(6) && d > 2 && (xx + yy) % 2 === 0) P.tint(x + xx, y + yy, c, 0.12);
        }
    }
  }

  // alfombra y gata dormida
  const rx = Math.round(W * 0.5);
  const ry = floorY + Math.round((H - floorY) * 0.55);
  const rugW = Math.round(W * 0.34);
  const rugH = Math.max(r(8), Math.round((H - floorY) * 0.36));
  const RUG = ramp5('#e8584d');
  shape(P, ell(rx, ry, rugW, rugH), RUG, [rx - rugW - 1, ry - rugH - 1, rx + rugW + 1, ry + rugH + 1], {
    tone: (x, y, t) => {
      const d = ((x - rx) / rugW) ** 2 + ((y - ry) / rugH) ** 2;
      if (t <= 1) return t;
      if (d > 0.62 && d < 0.74) return 4;
      if (d < 0.25 && (Math.floor(x) + Math.floor(y)) % 3 === 0) return 3;
      return t;
    },
  });
  sleepingCat(P, Math.round(W * 0.2), floorY + Math.round((H - floorY) * 0.62));
  // planta grande en el suelo
  const plx = Math.round(W * 0.68);
  pot(P, plx, H - r(4), r(12), r(10));
  for (const [dx, dy, rr] of [
    [-6, -18, 6],
    [5, -20, 6],
    [0, -26, 6],
    [-9, -27, 4],
    [8, -29, 4],
  ]) {
    const cx = plx + r(dx);
    const cy = H - r(4) + r(dy);
    shape(P, ell(cx, cy, r(rr), r(rr * 0.8)), ramp5('#3fa65a'), [cx - r(rr) - 1, cy - r(rr) - 1, cx + r(rr) + 1, cy + r(rr) + 1], { spot: [cx - r(2), cy - r(2)] });
  }
  P.flush();
}

// ───────────────────────── portadas ─────────────────────────

/** Portada de Polvo y Pólvora: atardecer en el desierto con el saloon. */
export function paintPolvoCover(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const hor = Math.round(H * 0.62);
  vband(P, 0, hor, ['#ff8a5a', '#ffa860', '#ffc874', '#ffe09a'].map(hex));
  const sx = Math.round(W * 0.72);
  const sy = Math.round(hor * 0.62);
  for (let y = sy - 9; y < hor; y++) for (let x = sx - 9; x <= sx + 9; x++) if (Math.hypot(x - sx, y - sy) < 8.5) P.put(x, y, hex(Math.hypot(x - sx, y - sy) < 6 ? '#fff4c8' : '#ffe08a'));
  // mesetas
  const MESA = ramp5('#c45a48');
  shape(P, (x, y) => y >= hor - 14 && y < hor && x > W * 0.04 && x < W * 0.34 - (y < hor - 10 ? 4 : 0), MESA, [0, hor - 15, W * 0.36, hor], { outline: false });
  shape(P, (x, y) => y >= hor - 9 && y < hor && x > W * 0.48 && x < W * 0.62, MESA, [W * 0.46, hor - 10, W * 0.64, hor], { outline: false });
  // suelo
  vband(P, hor, H, ['#f2b860', '#e89c4a', '#d6823e'].map(hex));
  // saloon
  const WD = ramp5('#b8683a');
  const x0 = Math.round(W * 0.1);
  const x1 = Math.round(W * 0.46);
  const top = hor - 22;
  shape(P, rect(x0, top, x1, hor + 6), WD, [x0 - 1, top - 1, x1 + 1, hor + 7], { tone: (_x, y, t) => (t === 2 && Math.floor(y) % 3 === 0 ? 1 : t) });
  shape(P, rect(x0 + 3, top - 5, x1 - 3, top + 1), ramp5('#d88a4a'), [x0 + 2, top - 6, x1 - 2, top + 2]);
  shape(P, rect(x0 - 2, top + 9, x1 + 2, top + 11), ramp5('#8a4a2e'), [x0 - 3, top + 8, x1 + 3, top + 12]);
  for (const wx of [x0 + 4, x1 - 9]) shape(P, rect(wx, top + 2, wx + 5, top + 7), ramp5('#ffd86a'), [wx - 1, top + 1, wx + 6, top + 8]);
  shape(P, rect(Math.round((x0 + x1) / 2) - 3, top + 13, Math.round((x0 + x1) / 2) + 3, hor + 6), ramp5('#6a3a26'), [x0, top + 12, x1, hor + 7]);
  // cactus
  const G = ramp5('#46b35c');
  const cx = Math.round(W * 0.84);
  shape(P, (x, y) => (x >= cx && x < cx + 4 && y >= hor - 6 && y < H - 4) || (x >= cx - 4 && x < cx && y >= hor + 2 && y < hor + 5) || (x >= cx - 4 && x < cx - 1 && y >= hor - 2 && y < hor + 5) || (x >= cx + 4 && x < cx + 7 && y >= hor && y < hor + 3) || (x >= cx + 5 && x < cx + 7 && y >= hor - 4 && y < hor + 3), G, [cx - 5, hor - 7, cx + 8, H - 4]);
  P.flush();
}

/** Portada de Isla Cosecha: islita de casillas en un mar turquesa. */
export function paintIslaCover(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  vband(P, 0, Math.round(H * 0.3), ['#7ad0f6', '#9fdcf6', '#c8ecf8'].map(hex));
  for (let y = Math.round(H * 0.3); y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = hash(x >> 2, y >> 1);
      P.put(x, y, hex(y < H * 0.34 ? '#8fe2ea' : n > 0.86 ? '#7ad8ee' : '#46b4e0'));
    }
  cloud(P, Math.round(W * 0.18), Math.round(H * 0.13), 0.55);
  cloud(P, Math.round(W * 0.8), Math.round(H * 0.1), 0.45);
  // islita: 7 casillas pequeñas
  const terr: Ramp[] = [ramp5('#4a9a48'), ramp5('#f2c449'), ramp5('#9cd66a'), ramp5('#dc7f4c'), ramp5('#a9a5bc'), ramp5('#4a9a48'), ramp5('#f2c449')];
  const hw = 7;
  const qh = 4;
  const cx = Math.round(W * 0.5);
  const cy = Math.round(H * 0.64);
  const cells = [
    [0, 0],
    [2, 0],
    [-2, 0],
    [1, -3],
    [-1, -3],
    [1, 3],
    [-1, 3],
  ];
  const inside = (dx: number, dy: number) => Math.abs(dx) <= hw && Math.abs(dy) <= 2 * qh - (Math.abs(dx) * qh) / hw;
  // playa
  shape(P, (x, y) => cells.some(([a, b]) => inside((x - (cx + a * hw)) * 0.86, (y - (cy + b * qh)) * 0.84)), ramp5('#f4dc9e'), [cx - 30, cy - 22, cx + 30, cy + 22], { outline: false });
  cells.forEach(([a, b], k) => {
    const hx = cx + a * hw;
    const hy = cy + b * qh;
    shape(P, (x, y) => inside(x - hx, y - hy), terr[k], [hx - hw - 1, hy - 2 * qh - 1, hx + hw + 1, hy + 2 * qh + 1], { outline: false, spot: [hx - 3, hy - 3] });
  });
  // arbolitos, montaña y una cabaña roja
  for (const [tx, ty] of [
    [cx - 1, cy - 3],
    [cx + 2, cy - 1],
    [cx + 14, cy - 2],
  ]) {
    shape(P, (x, y) => y >= ty - 5 && y < ty && Math.abs(x - tx) <= (y - (ty - 5)) * 0.6 + 0.3, ramp5('#2f8a52'), [tx - 4, ty - 6, tx + 4, ty]);
  }
  shape(P, (x, y) => y < cy - 9 && y >= cy - 18 && Math.abs(x - (cx + 7)) <= (y - (cy - 18)) * 0.8, ramp5('#8f8aa6'), [cx, cy - 19, cx + 15, cy - 9]);
  P.put(cx + 7, cy - 17, hex('#ffffff'));
  P.put(cx + 6, cy - 16, hex('#ffffff'));
  P.put(cx + 8, cy - 16, hex('#eef4ff'));
  const hx = cx - 12;
  const hy = cy - 1;
  shape(P, rect(hx - 3, hy - 3, hx + 3, hy + 2), ramp5('#f6e6c8'), [hx - 4, hy - 4, hx + 4, hy + 3]);
  shape(P, (x, y) => y >= hy - 7 && y < hy - 2 && Math.abs(x - hx) <= (y - (hy - 7)) + 0.5, ramp5('#e8484d'), [hx - 6, hy - 8, hx + 6, hy - 2]);
  // barquito
  const bx = Math.round(W * 0.84);
  const by = Math.round(H * 0.8);
  shape(P, (x, y) => y >= by && y < by + 3 && Math.abs(x - bx) <= 5 - (y - by), ramp5('#c27a46'), [bx - 6, by - 1, bx + 6, by + 3]);
  shape(P, (x, y) => y >= by - 8 && y < by - 1 && x >= bx && x <= bx + (y - (by - 8)) * 0.6, ramp5('#f6e6c8'), [bx - 1, by - 9, bx + 6, by]);
  for (let y = by - 9; y < by; y++) P.put(bx - 1, y, hex('#6a3a26'));
  P.flush();
}

/** Fondo de la portada y la sala de Isla Cosecha: cielo, mar y una playa en primer plano. */
export function paintIslaScene(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const u = Math.max(0.7, H / 200);
  const r = (v: number) => Math.round(v * u);
  const hor = Math.round(H * 0.42);
  vband(P, 0, hor, ['#46a8ec', '#64baf0', '#8acdf4', '#b4e0f6', '#dcf2f8'].map(hex));
  // sol
  const sx = Math.round(W * 0.8);
  const sy = Math.round(hor * 0.32);
  for (let y = sy - r(16); y < sy + r(16); y++)
    for (let x = sx - r(16); x < sx + r(16); x++) {
      const d = Math.hypot(x - sx, y - sy);
      if (d < r(9)) P.put(x, y, hex(d < r(6.5) ? '#fff8d0' : '#ffe68a'));
      else if (d < r(15) && (x + y) % 2 === 0) P.tint(x, y, hex('#fff2b0'), 0.25);
    }
  cloud(P, Math.round(W * 0.15), Math.round(hor * 0.28), u * 1.1);
  cloud(P, Math.round(W * 0.45), Math.round(hor * 0.16), u * 0.8);
  cloud(P, Math.round(W * 0.62), Math.round(hor * 0.5), u * 0.6);
  // islas lejanas
  for (const [fx, w, h] of [
    [0.12, 0.16, 9],
    [0.34, 0.09, 6],
    [0.9, 0.12, 8],
  ]) {
    const cx = Math.round(W * fx);
    const ww = Math.round(W * w);
    shape(P, (x, y) => y < hor && y >= hor - r(h) && ((x - cx) / ww) ** 2 + ((y - hor) / r(h)) ** 2 <= 1, ramp5('#5aa8a0'), [cx - ww - 1, hor - r(h) - 1, cx + ww + 1, hor], { outline: false, light: true });
  }
  // mar con reflejos
  const sea = Math.round(H * 0.74);
  vband(P, hor, sea, ['#3aa6d8', '#40b0dc', '#4cbce0', '#5cc8e4', '#74d6e8'].map(hex));
  for (let y = hor + 1; y < sea; y += 3)
    for (let x = 0; x < W; x++) {
      const k = hash(x >> 3, y);
      if (k > 0.86) P.put(x, y, hex('#9ae4f2'));
      if (Math.abs(x - sx) < r(10) - (y - hor) * 0.05 && hash(x, y) > 0.6) P.put(x, y, hex('#fff2c0'));
    }
  // espuma y arena
  for (let x = 0; x < W; x++) {
    const wave = Math.round(Math.sin(x * 0.08) * r(2) + Math.sin(x * 0.21) * r(1));
    for (let y = sea + wave; y < H; y++) {
      const d = y - (sea + wave);
      let c: RGB;
      if (d < r(2)) c = hex((x + y) % 3 ? '#f4fcff' : '#c8f0f6');
      else if (d < r(4)) c = hex('#e2c07c');
      else c = ramp5('#f4dc9e')[hash(x, y) > 0.94 ? 4 : hash(x * 3, y) > 0.85 ? 3 : 2];
      P.put(x, y, c);
    }
  }
  // palmeras en la arena
  for (const [fx, flip] of [
    [0.06, 1],
    [0.94, -1],
  ] as const) {
    const bx = Math.round(W * fx);
    const base = H - r(6);
    const hgt = r(54);
    const T = ramp5('#9a5a36');
    shape(P, (x, y) => y >= base - hgt && y < base && Math.abs(x - (bx + (flip * ((base - y) * (base - y))) / (hgt * 3.2))) < r(2.4), T, [bx - r(20), base - hgt - 1, bx + r(20), base], {
      tone: (_x, y, t) => (t >= 2 && Math.floor(y / r(3)) % 2 === 0 ? 1 : t),
    });
    const tx = bx + Math.round((flip * hgt) / 3.2);
    const ty = base - hgt;
    const L = ramp5('#4cb050');
    for (const [ax, ay] of [
      [-1, 0.3],
      [1, 0.3],
      [-0.7, -0.6],
      [0.7, -0.6],
      [0, 0.8],
      [-1, 0.9],
      [1, 0.9],
    ] as const) {
      const ex = tx + ax * r(22);
      const ey = ty + ay * r(12);
      shape(P, (x, y) => {
        const t = ((x - tx) * (ex - tx) + (y - ty) * (ey - ty)) / ((ex - tx) ** 2 + (ey - ty) ** 2);
        if (t < 0 || t > 1) return false;
        const px = tx + t * (ex - tx);
        const py = ty + t * (ey - ty) + Math.sin(t * Math.PI) * r(3) * (ay < 0 ? -1 : 1) * 0 + t * t * r(5);
        return Math.hypot(x - px, y - py) < r(3.2) * (1 - t * 0.7);
      }, L, [Math.min(tx, ex) - r(4), Math.min(ty, ey) - r(4), Math.max(tx, ex) + r(4), Math.max(ty, ey) + r(10)]);
    }
    P.put(tx - 1, ty + 2, hex('#7a4a2a'));
    P.put(tx + 1, ty + 2, hex('#7a4a2a'));
  }
  P.flush();
}
