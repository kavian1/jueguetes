// Villa Moneda: tipos del motor y de la vista que recibe cada jugador.

export type Group = 'viejo' | 'puerto' | 'flores' | 'huertas' | 'feria' | 'bosque' | 'mirador';

export type SpaceKind =
  | 'salida'
  | 'calle'
  | 'transporte'
  | 'empresa'
  | 'banco'
  | 'atraccion'
  | 'buzon'
  | 'hacienda'
  | 'bolsa'
  | 'subasta'
  | 'metro'
  | 'manifestacion'
  | 'ayuntamiento'
  | 'comisaria'
  | 'plaza'
  | 'arresto';

export interface Space {
  id: number;
  kind: SpaceKind;
  name: string;
  /** nombre corto para la casilla del tablero */
  short: string;
  group?: Group;
  price?: number;
  /** alquiler de una calle: [solar, 1 casa, 2 casas, 3 casas, edificio] */
  rent?: number[];
  /** impuesto de Hacienda */
  tax?: number;
  /** icono de la casilla */
  icon: string;
}

/** Modos de juego: cómo y cuándo termina la partida. */
export type Mode = 'rapida' | 'final' | 'magnate';

export type CharId = 'rita' | 'nora' | 'tomas' | 'ernesto' | 'lola' | 'abel' | 'clara' | 'pepe' | 'fortu' | 'mar';
export type PartyId = 'rojo' | 'azul' | 'verde' | 'naranja';

export type NewsId =
  | 'boom'
  | 'crisis'
  | 'inflacion'
  | 'rebajas'
  | 'tipos'
  | 'huelga'
  | 'turismo'
  | 'frio'
  | 'panico'
  | 'calma'
  | 'dividendos'
  | 'inspeccion'
  | 'subvencion'
  | 'tormenta'
  | 'festival'
  | 'anticipadas'
  | 'loteria';

export type CardId =
  | 'salida'
  | 'comisaria'
  | 'libre'
  | 'atras'
  | 'transporte'
  | 'plaza'
  | 'metro'
  | 'herencia'
  | 'error'
  | 'tartas'
  | 'multa'
  | 'reparaciones'
  | 'cumple'
  | 'ronda'
  | 'veterinario'
  | 'devolucion'
  | 'luna';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  color: number;
  char: CharId | null;
  cash: number;
  pos: number;
  loans: number;
  jail: number; // 0 = libre; 1-3 = turnos que lleva en la comisaría
  freeCards: number;
  /** a Lola le queda el atajo (se recarga cada dos vueltas) */
  taxi: boolean;
  /** vueltas desde que Lola usó el atajo */
  taxiLaps: number;
  bankrupt: boolean;
  /** ronda en la que quebró (0 si sigue en juego) */
  out: number;
}

export interface Owned {
  owner: string;
  /** 0 solar · 1-3 casas · 4 edificio */
  level: number;
}

export interface TradeSide {
  props: number[];
  cash: number;
}

export type Action =
  | { kind: 'roll' }
  | { kind: 'end' }
  | { kind: 'build'; space: number }
  | { kind: 'sellBuilding'; space: number }
  | { kind: 'sellProp'; space: number }
  | { kind: 'loan' }
  | { kind: 'repay' }
  | { kind: 'jailPay' }
  | { kind: 'jailCard' }
  | { kind: 'trade'; to: string; give: TradeSide; want: TradeSide }
  /** sólo en la deuda */
  | { kind: 'pay' }
  | { kind: 'bankrupt' };

export type Prompt =
  | { type: 'character'; options: CharId[] }
  | { type: 'turn'; stage: 'pre' | 'post'; error?: string }
  | { type: 'buy'; space: number; price: number }
  /** Lola: ¿repite la tirada? */
  | { type: 'adjust'; roll: number; to: number }
  | { type: 'bolsa' }
  | { type: 'pickCard'; cards: CardId[] }
  | { type: 'debt'; amount: number; to: string | null; reason: string; error?: string }
  | { type: 'vote'; early: boolean }
  | { type: 'tradeOffer'; from: string; give: TradeSide; want: TradeSide }
  /** subasta: puja secreta (0 = paso) */
  | { type: 'bid'; space: number; min: number; host: string }
  /** manifestación: elige una propiedad rival que dejará de cobrar */
  | { type: 'protest'; targets: number[] }
  /** metro: ¿viajas a la otra estación? */
  | { type: 'metro'; to: number; cost: number }
  /** ayuntamiento: ¿pagas un referéndum? */
  | { type: 'referendum'; cost: number };

export interface PromptReq {
  id: number;
  playerId: string;
  prompt: Prompt;
}

/** Respuesta genérica: cada pregunta usa el campo que le toca. */
export interface Answer {
  action?: Action;
  char?: CharId;
  accept?: boolean;
  delta?: number;
  card?: CardId;
  party?: PartyId | null;
  donation?: number;
  bid?: number;
  space?: number;
}

export interface LogEntry {
  id: number;
  text: string;
  kind?: 'turn' | 'info' | 'bad' | 'good' | 'end' | 'news' | 'vote';
}

export interface Fx {
  id: number;
  kind: 'turn' | 'dice' | 'move' | 'money' | 'buy' | 'build' | 'sell' | 'jail' | 'card' | 'news' | 'election' | 'win' | 'bankrupt' | 'auction' | 'protest';
  player?: string;
  /** dinero: positivo cobra, negativo paga */
  amount?: number;
  dice?: [number, number];
  from?: number;
  to?: number;
  /** movimiento directo (cartas, comisaría, metro) en vez de casilla a casilla */
  jump?: boolean;
  space?: number;
  level?: number;
  card?: CardId;
  news?: NewsId;
  party?: PartyId | null;
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
  char: CharId | null;
  cash: number;
  pos: number;
  loans: number;
  jail: number;
  freeCards: number;
  taxi: boolean;
  bankrupt: boolean;
  out: number;
  worth: number;
}

export interface Election {
  round: number;
  party: PartyId | null;
  mayor: string | null;
  support: Record<PartyId, number>;
  /** quién votó a quién (se enseña al terminar la votación) */
  votes: Record<string, { party: PartyId | null; donation: number }>;
}

/** Resultado de la última subasta (para enseñarlo en la mesa). */
export interface Auction {
  space: number;
  winner: string | null;
  price: number;
  bids: Record<string, number>;
}

export type Phase = 'choose' | 'main' | 'over';

export interface GameView {
  me: string;
  mode: Mode;
  players: PublicPlayer[];
  owned: Record<number, Owned>;
  /** propiedades cortadas por una manifestación → dueño */
  closed: Record<number, string>;
  turn: string;
  phase: Phase;
  round: number;
  /** última ronda (en «hasta el final» es sólo un tope de seguridad) */
  maxRounds: number;
  /** patrimonio que hay que alcanzar en el modo magnate */
  goal: number | null;
  dice: [number, number] | null;
  doubles: number;
  pot: number;
  news: NewsId | null;
  party: PartyId | null;
  mayor: string | null;
  election: Election | null;
  auction: Auction | null;
  nextElection: number | null;
  prompt: PromptReq | null;
  waiting: { playerId: string; type: Prompt['type'] }[];
  log: LogEntry[];
  fx: Fx[];
  winner: Winner | null;
  /** ranking final (o actual) por patrimonio */
  ranking: { id: string; worth: number }[];
}
