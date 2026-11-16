// Protocolo de red común a todos los juegos del Rincón: el anfitrión ejecuta el motor
// y manda a cada invitado su vista; los invitados sólo mandan respuestas y chat.
import type { VoiceChat, VoiceMember } from './voice';

/** Identificador de cada juego del Rincón. */
export type GameId = 'polvo' | 'isla' | 'villa';

export interface LobbyPlayer {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface ChatMsg {
  id: number;
  from: string;
  text: string;
  system?: boolean;
}

/** Opciones de la sala que elige el anfitrión antes de empezar (p. ej. el modo de juego). */
export type RoomOptions = Record<string, string>;

export interface GameOption {
  id: string;
  label: string;
  choices: { id: string; label: string; hint?: string }[];
  default: string;
}

export type HostMsg =
  | { t: 'welcome'; playerId: string; code: string; game: GameId }
  | { t: 'lobby'; lobby: LobbyPlayer[]; options?: RoomOptions }
  | { t: 'state'; view: unknown; lobby: LobbyPlayer[]; options?: RoomOptions }
  | { t: 'chat'; chat: ChatMsg[] }
  | { t: 'voice'; roster: VoiceMember[] }
  | { t: 'reject'; reason: string };

export type ClientMsg =
  | { t: 'join'; name: string; clientId: string }
  | { t: 'answer'; promptId: number; answer: unknown }
  | { t: 'chat'; text: string }
  | { t: 'voice'; on: boolean; muted: boolean };

export type SessionMode = 'host' | 'client' | 'solo';

export interface Snapshot<V = unknown> {
  /** juego de la sala (el invitado lo sabe al recibir la bienvenida) */
  game: GameId | null;
  mode: SessionMode;
  status: 'connecting' | 'lobby' | 'game' | 'error';
  code: string;
  myId: string;
  lobby: LobbyPlayer[];
  view: V | null;
  chat: ChatMsg[];
  /** opciones de la sala (modo de juego…) */
  options?: RoomOptions;
  error?: string;
}

export interface Session<V = unknown, A = unknown> {
  getSnapshot(): Snapshot<V>;
  subscribe(cb: () => void): () => void;
  answer(promptId: number, answer: A): void;
  sendChat(text: string): void;
  /** chat de voz (no existe en las partidas de práctica) */
  voice?: VoiceChat;
  leave(): void;
  retry?(): void;
  addBot?(): void;
  removePlayer?(id: string): void;
  start?(): void;
  backToLobby?(): void;
  /** sólo el anfitrión, en la sala */
  setOption?(id: string, value: string): void;
}

/** Asiento con el que empieza una partida. */
export interface SeatInfo {
  id: string;
  name: string;
  isBot: boolean;
}

/** Lo mínimo que la sesión necesita saber de una pregunta del motor. */
export interface BasePrompt {
  id: number;
  playerId: string;
}

export interface EngineHooks<R, A> {
  ask: (req: R) => Promise<A>;
  /** el motor ya no espera esa pregunta (p. ej. una oferta que caducó) */
  cancel: (promptId: number) => void;
  onChange: () => void;
  pause: (ms: number) => Promise<void>;
}

/** Cómo arranca y se juega un motor concreto desde la sesión del anfitrión. */
export interface GameAdapter<G = unknown, V = unknown, A = unknown, R extends BasePrompt = BasePrompt> {
  id: GameId;
  minPlayers: number;
  maxPlayers: number;
  /** opciones que el anfitrión puede elegir en la sala */
  options?: GameOption[];
  create(seats: SeatInfo[], hooks: EngineHooks<R, A>, options: RoomOptions): G;
  run(game: G): Promise<void>;
  player(game: G, id: string): { connected: boolean; isBot: boolean } | undefined;
  view(game: G, forId: string): V;
  bot(game: G, req: R): A;
  /** cuánto "piensa" un bot antes de contestar (ms) */
  botDelay(req: R): number;
}

/** Prefijo de los identificadores de PeerJS: compartido por todos los juegos del Rincón. */
export const PEER_PREFIX = 'rincon-de-juegos-v1-';

export function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function getClientId(): string {
  try {
    let id = localStorage.getItem('dem-client-id');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('dem-client-id', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function cleanName(name: string): string {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Forastero';
}

export function loadName(): string {
  try {
    return localStorage.getItem('dem-name') ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('dem-name', name);
  } catch {
    /* almacenamiento bloqueado */
  }
}
