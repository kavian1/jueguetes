export type Suit = 'S' | 'H' | 'D' | 'C';

export type CardKind =
  | 'disparo'
  | 'esquiva'
  | 'manzanilla'
  | 'picnic'
  | 'correo'
  | 'encomienda'
  | 'mercadillo'
  | 'hurto'
  | 'travesura'
  | 'rafaga'
  | 'estampida'
  | 'duelo'
  | 'barril'
  | 'poni'
  | 'catalejo'
  | 'calabozo'
  | 'dinamita'
  | 'repetidora'
  | 'revolver'
  | 'escopeta'
  | 'carabina'
  | 'rifle';

export interface Card {
  id: number;
  kind: CardKind;
  suit: Suit;
  /** 2..14 (11=J, 12=Q, 13=K, 14=A) */
  rank: number;
}

export type Role = 'sheriff' | 'ayudante' | 'forajido' | 'renegado';

export type CharId =
  | 'tinta'
  | 'bruma'
  | 'musgo'
  | 'miel'
  | 'pipa'
  | 'chispa'
  | 'pincho'
  | 'ceniza'
  | 'ramon'
  | 'olmo'
  | 'trebol'
  | 'cardo'
  | 'nuez';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  character: CharId;
  role: Role;
  hp: number;
  maxHp: number;
  hand: Card[];
  inPlay: Card[];
  alive: boolean;
  shotsThisTurn: number;
  tintaUsed: boolean;
}

export type PlayAction =
  | { kind: 'card'; cardId: number; target?: string; targetCard?: number | 'hand' }
  | { kind: 'ability'; cards: number[] }
  | { kind: 'end' };

export type Prompt =
  | { type: 'play'; error?: string }
  | { type: 'discard'; count: number }
  | { type: 'shot'; attacker: string; needed: number; cause: 'disparo' | 'rafaga' }
  | { type: 'beer'; needed: number }
  | { type: 'duel'; opponent: string }
  | { type: 'estampida'; attacker: string }
  | { type: 'store'; cards: Card[] }
  | { type: 'olmo'; cards: Card[] };

export interface PromptReq {
  id: number;
  playerId: string;
  prompt: Prompt;
}

/** Una respuesta genérica: las jugadas usan `action`, el resto `cards`. */
export interface Answer {
  action?: PlayAction;
  cards?: number[];
}

export type Step = 'inicio' | 'robo' | 'juego' | 'descarte';

export interface LogEntry {
  id: number;
  text: string;
  /** si existe, sólo lo ven estos jugadores */
  to?: string[];
  kind?: 'turn' | 'info' | 'bad' | 'good' | 'end';
}

export interface Fx {
  id: number;
  kind:
    | 'turn'
    | 'draw'
    | 'discard'
    | 'play'
    | 'equip'
    | 'steal'
    | 'lasso'
    | 'shot'
    | 'dodge'
    | 'damage'
    | 'heal'
    | 'check'
    | 'explode'
    | 'pass'
    | 'elim'
    | 'store'
    | 'pick'
    | 'duel';
  player: string;
  target?: string;
  card?: Card;
  amount?: number;
  success?: boolean;
  reason?: string;
  role?: Role;
  from?: 'hand' | 'inplay';
}

export type Team = 'sheriff' | 'forajidos' | 'renegado' | 'nadie';

export interface Winner {
  team: Team;
  ids: string[];
  text: string;
}

export interface SeatInfo {
  id: string;
  name: string;
  isBot: boolean;
}

/** Información pública de un jugador tal y como la ve otro jugador. */
export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  character: CharId;
  hp: number;
  maxHp: number;
  alive: boolean;
  handCount: number;
  inPlay: Card[];
  isSheriff: boolean;
  role?: Role;
  tintaUsed: boolean;
}

export interface GameView {
  me: string;
  players: PublicPlayer[];
  hand: Card[];
  deckCount: number;
  discardTop: Card | null;
  discardCount: number;
  turn: string;
  step: Step;
  shotsThisTurn: number;
  prompt: PromptReq | null;
  waiting: { playerId: string; type: Prompt['type'] } | null;
  store: Card[] | null;
  log: LogEntry[];
  fx: Fx[];
  winner: Winner | null;
  /** número de turno (para saber si la partida acaba de empezar) */
  round: number;
}
