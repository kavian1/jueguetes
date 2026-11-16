// Generación de la isla: 19 casillas hexagonales (con el vértice hacia arriba),
// sus 54 cruces, 72 caminos y 9 muelles en la costa.
import type { Board, Edge, Hex, Port, Res, Terrain, Vertex } from './types';
import { shuffle } from '../game/rng';

/** Esquinas de una casilla en coordenadas enteras (medias anchuras · cuartos de alto). */
const CORNERS: [number, number][] = [
  [0, -2],
  [1, -1],
  [1, 1],
  [0, 2],
  [-1, 1],
  [-1, -1],
];

const TERRAINS: Terrain[] = [
  ...Array<Terrain>(4).fill('madera'),
  ...Array<Terrain>(4).fill('lana'),
  ...Array<Terrain>(4).fill('trigo'),
  ...Array<Terrain>(3).fill('arcilla'),
  ...Array<Terrain>(3).fill('piedra'),
  'duna',
];

const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORT_KINDS: (Res | 'any')[] = ['any', 'any', 'any', 'any', 'madera', 'arcilla', 'lana', 'trigo', 'piedra'];

/** Puntos (probabilidad) de cada número: los que más salen tienen más puntitos. */
export const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export function makeBoard(rnd: () => number): Board {
  const hexes: Hex[] = [];
  const verts: Vertex[] = [];
  const edges: Edge[] = [];
  const vKey = new Map<string, number>();
  const eKey = new Map<string, number>();

  const vertexAt = (x: number, y: number) => {
    const k = `${x},${y}`;
    let id = vKey.get(k);
    if (id === undefined) {
      id = verts.length;
      vKey.set(k, id);
      verts.push({ id, x, y, hexes: [], adj: [], edges: [] });
    }
    return id;
  };
  const edgeAt = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    let id = eKey.get(k);
    if (id === undefined) {
      id = edges.length;
      eKey.set(k, id);
      edges.push({ id, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
      verts[a].adj.push(b);
      verts[b].adj.push(a);
      verts[a].edges.push(id);
      verts[b].edges.push(id);
    }
    return id;
  };

  for (let r = -2; r <= 2; r++)
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) > 2) continue;
      const id = hexes.length;
      const x = 2 * q + r;
      const y = 3 * r;
      const vs = CORNERS.map(([dx, dy]) => vertexAt(x + dx, y + dy));
      const es = vs.map((v, i) => edgeAt(v, vs[(i + 1) % 6]));
      hexes.push({ id, q, r, x, y, terrain: 'duna', num: null, verts: vs, edges: es });
      for (const v of vs) verts[v].hexes.push(id);
      for (const e of es) edges[e].hexes.push(id);
    }

  // ── terrenos y números (sin 6 ni 8 vecinos) ──
  const neighbours = (h: Hex) => hexes.filter((o) => o !== h && o.edges.some((e) => h.edges.includes(e)));
  for (let tries = 0; tries < 400; tries++) {
    const ts = shuffle([...TERRAINS], rnd);
    const nums = shuffle([...NUMBERS], rnd);
    hexes.forEach((h, i) => {
      h.terrain = ts[i];
      h.num = ts[i] === 'duna' ? null : nums.pop()!;
    });
    const hot = (h: Hex) => h.num === 6 || h.num === 8;
    const ok = hexes.every((h) => !hot(h) || neighbours(h).every((n) => !hot(n)));
    // y que no se junten dos números iguales
    const ok2 = hexes.every((h) => h.num === null || neighbours(h).every((n) => n.num !== h.num));
    if (ok && (ok2 || tries > 200)) break;
  }

  // ── muelles: 9 lados de costa repartidos alrededor de la isla ──
  const coast = edges.filter((e) => e.hexes.length === 1);
  const mid = (e: Edge) => ({ x: (verts[e.a].x + verts[e.b].x) / 2, y: (verts[e.a].y + verts[e.b].y) / 2 });
  // el eje y está en cuartos de alto: se corrige para medir el ángulo en una casilla "redonda"
  const ang = (e: Edge) => {
    const m = mid(e);
    return Math.atan2(m.y * 0.577, m.x);
  };
  coast.sort((a, b) => ang(a) - ang(b));
  const kinds = shuffle([...PORT_KINDS], rnd);
  const ports: Port[] = [];
  const offset = Math.floor(rnd() * 3);
  for (let i = 0; i < 9; i++) {
    const e = coast[(offset + Math.round((i * coast.length) / 9)) % coast.length];
    const h = hexes[e.hexes[0]];
    const m = mid(e);
    const vx = m.x - h.x;
    const vy = (m.y - h.y) * 0.577;
    const len = Math.hypot(vx, vy) || 1;
    const port: Port = { id: i, edge: e.id, kind: kinds[i], dx: vx / len, dy: vy / len };
    ports.push(port);
    verts[e.a].port = i;
    verts[e.b].port = i;
  }

  return { hexes, verts, edges, ports };
}

export const otherEnd = (e: Edge, v: number) => (e.a === v ? e.b : e.a);
