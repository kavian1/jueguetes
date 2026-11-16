import type { Card, CardKind, CharId, PlayAction } from './types';
import { BASE_WEAPON, CARD_DEFS, isWeapon } from './cards';

/** Lo mínimo que necesitan las reglas para validar jugadas (todo es información pública). */
export interface TablePlayer {
  id: string;
  alive: boolean;
  character: CharId;
  inPlay: Card[];
  isSheriff: boolean;
  hp: number;
  maxHp: number;
  handCount: number;
}

export const hasInPlay = (p: { inPlay: Card[] }, kind: CardKind) => p.inPlay.some((c) => c.kind === kind);
export const weaponOf = (p: { inPlay: Card[] }) => p.inPlay.find((c) => isWeapon(c.kind));

export function weaponRange(p: { inPlay: Card[] }): number {
  const w = weaponOf(p);
  return w ? CARD_DEFS[w.kind].weaponRange! : BASE_WEAPON.range;
}

export function weaponName(p: { inPlay: Card[] }): string {
  const w = weaponOf(p);
  return w ? CARD_DEFS[w.kind].name : BASE_WEAPON.name;
}

export function shotLimit(p: { inPlay: Card[]; character: CharId }): number {
  if (hasInPlay(p, 'repetidora')) return Infinity;
  if (p.character === 'chispa') return 2;
  return 1;
}

export function hurtoRange(p: { character: CharId }): number {
  return p.character === 'ramon' ? 2 : 1;
}

/** Distancia a la que `fromId` ve a `toId` (con Caballo, Catalejo y habilidades). */
export function distance(players: TablePlayer[], fromId: string, toId: string): number {
  const alive = players.filter((p) => p.alive);
  const i = alive.findIndex((p) => p.id === fromId);
  const j = alive.findIndex((p) => p.id === toId);
  if (i < 0 || j < 0) return Infinity;
  if (i === j) return 0;
  const n = alive.length;
  const d = Math.abs(i - j);
  let dist = Math.min(d, n - d);
  const from = alive[i];
  const to = alive[j];
  if (hasInPlay(to, 'poni')) dist += 1;
  if (to.character === 'musgo') dist += 1;
  if (hasInPlay(from, 'catalejo')) dist -= 1;
  if (from.character === 'bruma') dist -= 1;
  return Math.max(1, dist);
}

export function needsPlayerTarget(kind: CardKind): boolean {
  return kind === 'disparo' || kind === 'hurto' || kind === 'travesura' || kind === 'duelo' || kind === 'calabozo';
}

export function needsCardTarget(kind: CardKind): boolean {
  return kind === 'hurto' || kind === 'travesura';
}

export interface PlayContext {
  players: TablePlayer[];
  meId: string;
  hand: Card[];
  shotsThisTurn: number;
}

/** Comprueba si un jugador puede ser objetivo de una carta (sin mirar la carta concreta que se le quita). */
export function targetError(ctx: PlayContext, kind: CardKind, targetId: string | undefined): string | null {
  const me = ctx.players.find((p) => p.id === ctx.meId)!;
  const t = targetId ? ctx.players.find((p) => p.id === targetId) : undefined;
  if (!t) return 'Elige un objetivo.';
  if (!t.alive) return 'Ese jugador ya no está en la partida.';
  if (t.id === me.id) return 'No puedes elegirte a ti.';
  const dist = distance(ctx.players, me.id, t.id);
  switch (kind) {
    case 'disparo':
      if (dist > weaponRange(me)) return `Está a distancia ${dist} y tu alcance es ${weaponRange(me)}.`;
      return null;
    case 'hurto':
      if (dist > hurtoRange(me)) return `El Atraco sólo llega a distancia ${hurtoRange(me)} (está a ${dist}).`;
      if (t.handCount === 0 && t.inPlay.length === 0) return 'No tiene cartas que quitarle.';
      return null;
    case 'travesura':
      if (t.handCount === 0 && t.inPlay.length === 0) return 'No tiene cartas que descartar.';
      return null;
    case 'calabozo':
      if (t.isSheriff) return 'No puedes encerrar al Sheriff.';
      if (hasInPlay(t, 'calabozo')) return 'Ya está en el Calabozo.';
      return null;
    case 'duelo':
      return null;
    default:
      return null;
  }
}

export function validatePlay(ctx: PlayContext, action: PlayAction): string | null {
  const me = ctx.players.find((p) => p.id === ctx.meId);
  if (!me || !me.alive) return 'No estás en la partida.';
  if (action.kind === 'end') return null;
  if (action.kind === 'ability') {
    if (me.character !== 'nuez') return 'Tu personaje no tiene esa habilidad.';
    const ids = new Set(action.cards);
    if (ids.size !== 2 || !action.cards.every((id) => ctx.hand.some((c) => c.id === id))) return 'Elige 2 cartas de tu mano.';
    if (me.hp >= me.maxHp) return 'Ya tienes la vida al máximo.';
    return null;
  }
  const card = ctx.hand.find((c) => c.id === action.cardId);
  if (!card) return 'Esa carta no está en tu mano.';
  const kind = card.kind;
  const aliveCount = ctx.players.filter((p) => p.alive).length;

  if (needsPlayerTarget(kind)) {
    const err = targetError(ctx, kind, action.target);
    if (err) return err;
    if (needsCardTarget(kind)) {
      const t = ctx.players.find((p) => p.id === action.target)!;
      const tc = action.targetCard ?? 'hand';
      if (tc === 'hand') {
        if (t.handCount === 0) return 'No tiene cartas en la mano.';
      } else if (!t.inPlay.some((c) => c.id === tc)) return 'Esa carta no está en juego.';
    }
  }

  switch (kind) {
    case 'disparo':
      if (ctx.shotsThisTurn >= shotLimit(me)) return 'Ya has disparado este turno.';
      return null;
    case 'esquiva':
      return 'La Esquiva sólo se juega cuando te disparan.';
    case 'manzanilla':
      if (aliveCount <= 2) return 'Con sólo 2 jugadores el Whisky no tiene efecto.';
      if (me.hp >= me.maxHp) return 'Ya tienes la vida al máximo.';
      return null;
    case 'picnic':
      if (!ctx.players.some((p) => p.alive && p.hp < p.maxHp)) return 'Nadie necesita recuperar vida.';
      return null;
    case 'dinamita':
    case 'barril':
    case 'poni':
    case 'catalejo':
      if (hasInPlay(me, kind)) return `Ya tienes ${CARD_DEFS[kind].name} en juego.`;
      return null;
    default:
      if (isWeapon(kind) && hasInPlay(me, kind)) return 'Ya tienes esa arma en juego.';
      return null;
  }
}

export function validTargets(ctx: PlayContext, kind: CardKind): string[] {
  return ctx.players.filter((p) => targetError(ctx, kind, p.id) === null).map((p) => p.id);
}

/** ¿La carta desenfundada cuenta como corazón para este personaje? */
export function countsAsHeart(character: CharId, card: Card): boolean {
  return card.suit === 'H' || (character === 'trebol' && card.suit === 'D');
}

export function dynamiteExplodes(card: Card): boolean {
  return card.suit === 'S' && card.rank >= 2 && card.rank <= 9;
}
