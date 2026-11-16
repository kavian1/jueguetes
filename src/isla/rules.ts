// Reglas puras de Isla Cosecha: costes, dónde se puede construir, comercio y puntos.
import type { Board, Building, DevKind, Piece, PlayerState, Res, ResMap } from './types';
import { RES } from './types';
import { otherEnd } from './board';

export const GOAL = 10;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;
export const BANK_START = 19;
export const PIECES: Record<Piece, number> = { camino: 15, cabana: 5, villa: 4 };

export const COST: Record<Piece | 'carta', Partial<ResMap>> = {
  camino: { madera: 1, arcilla: 1 },
  cabana: { madera: 1, arcilla: 1, lana: 1, trigo: 1 },
  villa: { trigo: 2, piedra: 3 },
  carta: { lana: 1, trigo: 1, piedra: 1 },
};

export const RES_INFO: Record<Res, { name: string; one: string; terrain: string }> = {
  madera: { name: 'Madera', one: 'madera', terrain: 'Bosque' },
  arcilla: { name: 'Arcilla', one: 'arcilla', terrain: 'Barrizal' },
  lana: { name: 'Lana', one: 'lana', terrain: 'Prado' },
  trigo: { name: 'Trigo', one: 'trigo', terrain: 'Trigal' },
  piedra: { name: 'Piedra', one: 'piedra', terrain: 'Cantera' },
};

export const DEV_INFO: Record<DevKind, { name: string; text: string }> = {
  perro: { name: 'Perro guardián', text: 'Espanta al zorro: muévelo a otra casilla y roba un recurso a un vecino de allí.' },
  cuadrilla: { name: 'Cuadrilla', text: 'Construye gratis dos caminos.' },
  cosecha: { name: 'Buena cosecha', text: 'Coge del granero dos recursos a tu elección.' },
  mercader: { name: 'Mercader astuto', text: 'Elige un recurso: todos los demás te dan los que tengan de él.' },
  tesoro: { name: 'Tesoro escondido', text: 'Vale 1 punto. Se queda oculto en tu mano hasta el final.' },
};

export const DEV_DECK: DevKind[] = [
  ...Array<DevKind>(14).fill('perro'),
  ...Array<DevKind>(5).fill('tesoro'),
  'cuadrilla',
  'cuadrilla',
  'cosecha',
  'cosecha',
  'mercader',
  'mercader',
];

export const PLAYER_COLORS = [
  { name: 'Rojo', hex: '#e8484d' },
  { name: 'Azul', hex: '#3a86ec' },
  { name: 'Morado', hex: '#a25ce0' },
  { name: 'Naranja', hex: '#f5922a' },
];

export const total = (r: Partial<ResMap>) => RES.reduce((s, k) => s + (r[k] ?? 0), 0);
export const has = (r: ResMap, need: Partial<ResMap>) => RES.every((k) => r[k] >= (need[k] ?? 0));
export const pay = (r: ResMap, need: Partial<ResMap>) => {
  for (const k of RES) r[k] -= need[k] ?? 0;
};
export const gain = (r: ResMap, got: Partial<ResMap>) => {
  for (const k of RES) r[k] += got[k] ?? 0;
};

export interface Table {
  board: Board;
  buildings: Map<number, Building>;
  roads: Map<number, string>;
}

/** Cruce libre y sin edificios en los cruces vecinos (regla de distancia). */
export function freeSpot(t: Table, v: number): boolean {
  if (t.buildings.has(v)) return false;
  return t.board.verts[v].adj.every((a) => !t.buildings.has(a));
}

const blockedFor = (t: Table, v: number, pid: string) => {
  const b = t.buildings.get(v);
  return !!b && b.owner !== pid;
};

export function canRoad(t: Table, pid: string, e: number): boolean {
  if (t.roads.has(e)) return false;
  const edge = t.board.edges[e];
  for (const v of [edge.a, edge.b]) {
    const b = t.buildings.get(v);
    if (b?.owner === pid) return true;
    if (blockedFor(t, v, pid)) continue;
    if (t.board.verts[v].edges.some((o) => o !== e && t.roads.get(o) === pid)) return true;
  }
  return false;
}

export function roadSpots(t: Table, pid: string): number[] {
  return t.board.edges.filter((e) => canRoad(t, pid, e.id)).map((e) => e.id);
}

export function canCabana(t: Table, pid: string, v: number, setup = false): boolean {
  if (!freeSpot(t, v)) return false;
  if (setup) return true;
  return t.board.verts[v].edges.some((e) => t.roads.get(e) === pid);
}

export function cabanaSpots(t: Table, pid: string, setup = false): number[] {
  return t.board.verts.filter((v) => canCabana(t, pid, v.id, setup)).map((v) => v.id);
}

export function villaSpots(t: Table, pid: string): number[] {
  const out: number[] = [];
  for (const [v, b] of t.buildings) if (b.owner === pid && b.kind === 'cabana') out.push(v);
  return out;
}

/** Camino continuo más largo de un jugador (los edificios rivales lo cortan). */
export function longestRoad(t: Table, pid: string): number {
  const mine = new Set<number>();
  for (const [e, o] of t.roads) if (o === pid) mine.add(e);
  if (!mine.size) return 0;
  let best = 0;
  const used = new Set<number>();
  const dfs = (v: number, len: number) => {
    if (len > best) best = len;
    if (len > 0 && blockedFor(t, v, pid)) return;
    for (const e of t.board.verts[v].edges) {
      if (!mine.has(e) || used.has(e)) continue;
      used.add(e);
      dfs(otherEnd(t.board.edges[e], v), len + 1);
      used.delete(e);
    }
  };
  const starts = new Set<number>();
  for (const e of mine) {
    starts.add(t.board.edges[e].a);
    starts.add(t.board.edges[e].b);
  }
  for (const v of starts) dfs(v, 0);
  return best;
}

/** Proporción a la que un jugador cambia un recurso con el granero (4, 3 o 2 a 1). */
export function bankRatio(t: Table, pid: string, res: Res): number {
  let ratio = 4;
  for (const [v, b] of t.buildings) {
    if (b.owner !== pid) continue;
    const port = t.board.verts[v].port;
    if (port === undefined) continue;
    const kind = t.board.ports[port].kind;
    if (kind === res) ratio = Math.min(ratio, 2);
    else if (kind === 'any') ratio = Math.min(ratio, 3);
  }
  return ratio;
}

export function publicVp(t: Table, p: PlayerState, longest: string | null, army: string | null): number {
  let vp = 0;
  for (const b of t.buildings.values()) if (b.owner === p.id) vp += b.kind === 'villa' ? 2 : 1;
  if (longest === p.id) vp += 2;
  if (army === p.id) vp += 2;
  return vp;
}

export function totalVp(t: Table, p: PlayerState, longest: string | null, army: string | null): number {
  return publicVp(t, p, longest, army) + p.dev.filter((d) => d.kind === 'tesoro').length;
}

export const resList = (r: Partial<ResMap>) =>
  RES.filter((k) => (r[k] ?? 0) > 0)
    .map((k) => `${r[k]} ${RES_INFO[k].one}`)
    .join(', ');
