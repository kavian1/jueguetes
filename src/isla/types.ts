// Isla Cosecha: tipos del motor y de la vista que recibe cada jugador.

export type Res = 'madera' | 'arcilla' | 'lana' | 'trigo' | 'piedra';
export const RES: Res[] = ['madera', 'arcilla', 'lana', 'trigo', 'piedra'];
export type Terrain = Res | 'duna';
export type ResMap = Record<Res, number>;

export type DevKind = 'perro' | 'cuadrilla' | 'cosecha' | 'mercader' | 'tesoro';
export type Piece = 'camino' | 'cabana' | 'villa';

export interface Hex {
  id: number;
  q: number;
  r: number;
  /** centro en medias anchuras de casilla */
  x: number;
  /** centro en cuartos de alto de casilla */
  y: number;
  terrain: Terrain;
  num: number | null;
  verts: number[];
  edges: number[];
}

export interface Vertex {
  id: number;
  x: number;
  y: number;
  hexes: number[];
  adj: number[];
  edges: number[];
  /** muelle al que da acceso este cruce */
  port?: number;
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  hexes: number[];
}

export interface Port {
  id: number;
  edge: number;
  kind: Res | 'any';
  /** dirección hacia el mar (vector unitario) */
  dx: number;
  dy: number;
}

export interface Board {
  hexes: Hex[];
  verts: Vertex[];
  edges: Edge[];
  ports: Port[];
}

export interface Building {
  owner: string;
  kind: 'cabana' | 'villa';
}

export interface DevCard {
  id: number;
  kind: DevKind;
  /** turno en el que se compró (no se puede jugar ese mismo turno) */
  bought: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  color: number;
  res: ResMap;
  dev: DevCard[];
  /** perros guardianes ya jugados */
  dogs: number;
  roadLen: number;
  left: Record<Piece, number>;
}

export type Action =
  | { kind: 'roll' }
  | { kind: 'road'; edge: number }
  | { kind: 'cabana'; vertex: number }
  | { kind: 'villa'; vertex: number }
  | { kind: 'buy' }
  | { kind: 'bank'; give: Res; get: Res }
  | { kind: 'offer'; give: Partial<ResMap>; want: Partial<ResMap> }
  | { kind: 'dev'; card: DevKind; res?: Res[] }
  | { kind: 'end' };

export type Prompt =
  | { type: 'setup'; step: 'cabana' | 'camino'; vertex?: number; round: 1 | 2 }
  | { type: 'turn'; rolled: boolean; error?: string }
  | { type: 'discard'; count: number }
  | { type: 'robber'; reason: 'siete' | 'perro' }
  | { type: 'steal'; targets: string[] }
  | { type: 'freeRoad'; left: number }
  | { type: 'offer'; from: string; give: Partial<ResMap>; want: Partial<ResMap> }
  | { type: 'tradeWait' };

export interface PromptReq {
  id: number;
  playerId: string;
  prompt: Prompt;
}

/** Respuesta genérica: cada pregunta usa el campo que le toca. */
export interface Answer {
  action?: Action;
  vertex?: number;
  edge?: number;
  hex?: number;
  target?: string;
  res?: Partial<ResMap>;
  accept?: boolean;
  /** quien cierra el trato (null = retirar la oferta) */
  partner?: string | null;
}

export interface LogEntry {
  id: number;
  text: string;
  to?: string[];
  kind?: 'turn' | 'info' | 'bad' | 'good' | 'end';
}

export interface Fx {
  id: number;
  kind:
    | 'turn'
    | 'dice'
    | 'produce'
    | 'build'
    | 'buy'
    | 'dev'
    | 'robber'
    | 'steal'
    | 'discard'
    | 'trade'
    | 'bank'
    | 'bonus'
    | 'gain'
    | 'win';
  player?: string;
  target?: string;
  hex?: number;
  /** cruce o lado donde se construye */
  at?: number;
  piece?: Piece;
  dice?: [number, number];
  res?: Res | null;
  amount?: number;
  give?: Partial<ResMap>;
  get?: Partial<ResMap>;
  card?: DevKind;
  bonus?: 'sendero' | 'jauria';
  /** sólo estos jugadores ven qué recurso fue */
  secret?: string[];
}

export interface Trade {
  id: number;
  from: string;
  give: Partial<ResMap>;
  want: Partial<ResMap>;
  responses: Record<string, 'pending' | 'accept' | 'reject'>;
}

export interface Winner {
  id: string;
  text: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  color: number;
  cards: number;
  devCount: number;
  dogs: number;
  roadLen: number;
  /** puntos visibles (sin tesoros ocultos, salvo al final o si eres tú) */
  vp: number;
  left: Record<Piece, number>;
}

export type Phase = 'setup' | 'main' | 'over';

export interface GameView {
  me: string;
  board: Board;
  buildings: Record<number, Building>;
  roads: Record<number, string>;
  robber: number;
  players: PublicPlayer[];
  res: ResMap;
  dev: DevCard[];
  bank: ResMap;
  devLeft: number;
  dice: [number, number] | null;
  turn: string;
  phase: Phase;
  rolled: boolean;
  devPlayed: boolean;
  round: number;
  prompt: PromptReq | null;
  waiting: { playerId: string; type: Prompt['type'] }[];
  trade: Trade | null;
  longest: string | null;
  army: string | null;
  log: LogEntry[];
  fx: Fx[];
  winner: Winner | null;
  /** puntos necesarios para ganar */
  goal: number;
}

export const emptyRes = (): ResMap => ({ madera: 0, arcilla: 0, lana: 0, trigo: 0, piedra: 0 });
