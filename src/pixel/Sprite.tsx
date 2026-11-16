import { PAL, SPRITES } from './sprites';
import { chibiSprite } from './chibi';
import { iconSprite } from './icons';

interface SpriteData {
  url: string;
  /** tamaño lógico (en "píxeles de sprite"); se multiplica por la escala al mostrarlo */
  w: number;
  h: number;
  hires: boolean;
}

const cache = new Map<string, SpriteData>();

type Grid = string[][];

/** Scale2x (EPX): duplica la resolución redondeando diagonales sin añadir colores. */
function scale2x(g: Grid): Grid {
  const h = g.length;
  const w = g[0].length;
  const at = (x: number, y: number) => g[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  const out: Grid = Array.from({ length: h * 2 }, () => new Array(w * 2));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const P = g[y][x];
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const C = at(x - 1, y);
      const D = at(x, y + 1);
      out[2 * y][2 * x] = C === A && C !== D && A !== B ? A : P;
      out[2 * y][2 * x + 1] = A === B && A !== C && B !== D ? B : P;
      out[2 * y + 1][2 * x] = D === C && D !== B && C !== A ? C : P;
      out[2 * y + 1][2 * x + 1] = B === D && B !== A && D !== C ? D : P;
    }
  return out;
}

/** Scale3x (AdvMAME3x): igual que Scale2x pero triplicando. */
function scale3x(g: Grid): Grid {
  const h = g.length;
  const w = g[0].length;
  const at = (x: number, y: number) => g[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  const out: Grid = Array.from({ length: h * 3 }, () => new Array(w * 3));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [A, B, C, D, E, F, G, Hh, I] = [at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1), at(x - 1, y), at(x, y), at(x + 1, y), at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)];
      const e = [
        D === B && D !== Hh && B !== F ? D : E,
        (D === B && D !== Hh && B !== F && E !== C) || (B === F && B !== D && F !== Hh && E !== A) ? B : E,
        B === F && B !== D && F !== Hh ? F : E,
        (D === B && D !== Hh && B !== F && E !== G) || (D === Hh && D !== B && Hh !== F && E !== A) ? D : E,
        E,
        (B === F && B !== D && F !== Hh && E !== I) || (Hh === F && D !== Hh && B !== F && E !== C) ? F : E,
        D === Hh && D !== B && Hh !== F ? D : E,
        (D === Hh && D !== B && Hh !== F && E !== I) || (Hh === F && D !== Hh && B !== F && E !== G) ? Hh : E,
        Hh === F && D !== Hh && B !== F ? F : E,
      ];
      for (let k = 0; k < 9; k++) out[3 * y + Math.floor(k / 3)][3 * x + (k % 3)] = e[k];
    }
  return out;
}

/**
 * Factor de suavizado EPX según la escala. Desactivado: todo el arte comparte el mismo
 * tamaño de píxel nítido para que el estilo sea coherente.
 */
function smoothFactor(_scale: number): number {
  return 1;
}

export function spriteData(name: string, scale = 1): SpriteData {
  const key = `${name}@${smoothFactor(scale)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const hi = chibiSprite(name);
  let data: SpriteData;
  const icon = hi ? null : iconSprite(name);
  if (hi) data = { url: hi.canvas.toDataURL(), w: hi.w, h: hi.h, hires: false };
  else if (icon) data = { url: icon.toDataURL(), w: icon.width, h: icon.height, hires: false };
  else {
    const rows = SPRITES[name] ?? SPRITES.hat;
    const w0 = Math.max(...rows.map((r) => r.length));
    let grid: Grid = rows.map((r) => r.padEnd(w0, '.').split(''));
    const f = smoothFactor(scale);
    if (f === 2) grid = scale2x(grid);
    if (f === 3) grid = scale3x(grid);
    if (f === 4) grid = scale2x(scale2x(grid));
    const canvas = document.createElement('canvas');
    canvas.width = grid[0].length;
    canvas.height = grid.length;
    const ctx = canvas.getContext('2d')!;
    grid.forEach((row, y) =>
      row.forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = PAL[ch] ?? '#ff00ff';
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    data = { url: canvas.toDataURL(), w: w0, h: rows.length, hires: f > 1 };
  }
  cache.set(key, data);
  return data;
}

interface Props {
  name: string;
  scale?: number;
  className?: string;
  title?: string;
}

export function Sprite({ name, scale = 3, className, title }: Props) {
  const d = spriteData(name, scale);
  return (
    <img
      src={d.url}
      width={d.w * scale}
      height={d.h * scale}
      className={'sprite' + (d.hires ? ' hires' : '') + (className ? ' ' + className : '')}
      alt=""
      title={title}
      draggable={false}
    />
  );
}
