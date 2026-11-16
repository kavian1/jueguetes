import type { Answer, Card, CardKind, PlayAction, PlayerState, PromptReq } from './types';
import type { Game } from './engine';
import { CARD_DEFS, isWeapon } from './cards';
import { hasInPlay, validatePlay, weaponOf, weaponRange } from './rules';

/** Decide la respuesta de un bot (o de un jugador desconectado) a cualquier pregunta del motor. */
export function botAnswer(game: Game, req: PromptReq): Answer {
  const me = game.byId(req.playerId)!;
  const pr = req.prompt;
  const ofKind = (k: CardKind) => me.hand.filter((c) => c.kind === k);
  switch (pr.type) {
    case 'play':
      return { action: choosePlay(game, me) };
    case 'discard':
      return { cards: worstCards(game, me, pr.count) };
    case 'shot':
      return { cards: ofKind('esquiva').slice(0, pr.needed).map((c) => c.id) };
    case 'beer':
      return { cards: ofKind('manzanilla').slice(0, pr.needed).map((c) => c.id) };
    case 'duel':
    case 'estampida': {
      const c = ofKind('disparo')[0];
      return { cards: c ? [c.id] : [] };
    }
    case 'store': {
      const best = [...pr.cards].sort((a, b) => cardValue(game, me, b) - cardValue(game, me, a))[0];
      return { cards: best ? [best.id] : [] };
    }
    case 'olmo': {
      const best = [...pr.cards].sort((a, b) => cardValue(game, me, b) - cardValue(game, me, a));
      return { cards: best.slice(0, 2).map((c) => c.id) };
    }
  }
}

/** Puntuación de "enemistad": cuanto más alta, más ganas de atacar. <= 0.5 no se ataca. */
export function enemyScore(game: Game, me: PlayerState, t: PlayerState): number {
  const h = (a: string, b: string) => game.hostility[a]?.[b] ?? 0;
  const sheriff = game.players.find((p) => p.role === 'sheriff')!;
  // pequeño ruido estable por pareja y ronda para que no siempre elijan igual
  let hash = game.turnCount * 31;
  for (const ch of me.id + t.id) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  const jitter = (hash % 100) / 200;

  // jugadores que han atacado al Sheriff (sospechosos de Forajido)
  const sheriffAttackers = game.players.filter((q) => q !== sheriff && h(q.id, sheriff.id) > 0);
  const defendsSheriff = sheriffAttackers.reduce((s, q) => s + h(t.id, q.id), 0);

  switch (me.role) {
    case 'forajido': {
      if (t.role === 'sheriff') return 100;
      return h(t.id, me.id) * 2 + defendsSheriff - h(t.id, sheriff.id) * 2 + jitter;
    }
    case 'sheriff':
    case 'ayudante': {
      if (t.role === 'sheriff') return -100;
      let s = h(t.id, sheriff.id) * 3 + h(t.id, me.id) * 1.5 - defendsSheriff;
      if (me.role === 'sheriff') s += 0.6;
      return s + jitter;
    }
    case 'renegado': {
      const othersLeft = game.alive().filter((p) => p !== me && p.role !== 'sheriff').length;
      if (t.role === 'sheriff') return othersLeft === 0 ? 100 : sheriff.hp <= 2 ? -100 : -5;
      return h(t.id, sheriff.id) * 2 + h(t.id, me.id) * 2 + 0.4 + jitter;
    }
  }
}

function choosePlay(game: Game, me: PlayerState): PlayAction {
  const ctx = { players: game.table(), meId: me.id, hand: me.hand, shotsThisTurn: me.shotsThisTurn };
  const ok = (a: PlayAction) => validatePlay(ctx, a) === null;
  const ofKind = (k: CardKind) => me.hand.filter((c) => c.kind === k);
  const play = (c: Card, target?: string, targetCard?: number | 'hand'): PlayAction => ({ kind: 'card', cardId: c.id, target, targetCard });
  const others = game.alive().filter((p) => p !== me);
  const scored = others.map((p) => ({ p, s: enemyScore(game, me, p) })).sort((a, b) => b.s - a.s);
  const enemies = scored.filter((e) => e.s > 0.5).map((e) => e.p);
  const friends = scored.filter((e) => e.s < 0).map((e) => e.p);
  const aliveN = game.alive().length;

  // 1. Curarse
  const beers = ofKind('manzanilla');
  if (beers.length && me.hp < me.maxHp && aliveN > 2 && (me.hp <= 2 || beers.length > 1 || me.maxHp - me.hp >= 2)) return play(beers[0]);
  if (me.character === 'nuez' && me.hp < me.maxHp && me.hand.length - me.hp >= 2) {
    const w = worstCards(game, me, 2);
    if (w.length === 2) return { kind: 'ability', cards: w };
  }

  // 2. Robar cartas
  for (const k of ['encomienda', 'correo'] as CardKind[]) {
    const c = ofKind(k)[0];
    if (c) return play(c);
  }

  // 3. Equiparse
  for (const k of ['barril', 'poni', 'catalejo'] as CardKind[]) {
    const c = ofKind(k)[0];
    if (c && ok(play(c))) return play(c);
  }
  const shots = ofKind('disparo').length;
  const cur = weaponOf(me);
  const weapons = me.hand.filter((c) => isWeapon(c.kind)).sort((a, b) => CARD_DEFS[b.kind].weaponRange! - CARD_DEFS[a.kind].weaponRange!);
  for (const w of weapons) {
    const r = CARD_DEFS[w.kind].weaponRange!;
    if (w.kind === 'repetidora') {
      if (cur?.kind !== 'repetidora' && shots >= 2 && enemies.some((e) => game.dist(me, e) <= 1)) return play(w);
      continue;
    }
    if (r > weaponRange(me) && !(cur?.kind === 'repetidora' && shots >= 2)) return play(w);
  }

  // 4. Subasta (beneficia a todos, pero tú eliges primero)
  const store = ofKind('mercadillo')[0];
  if (store) return play(store);

  // 5. Dinamita
  const dyn = ofKind('dinamita')[0];
  if (dyn && me.hp >= 3 && ok(play(dyn)) && game.rnd() < 0.5) return play(dyn);

  // 6. Calabozo
  const jail = ofKind('calabozo')[0];
  if (jail) for (const e of enemies) if (ok(play(jail, e.id))) return play(jail, e.id);

  // 7. Atraco / Lazo
  for (const k of ['hurto', 'travesura'] as CardKind[]) {
    const c = ofKind(k)[0];
    if (!c) continue;
    for (const e of enemies) {
      const valuable = e.inPlay.find((x) => isWeapon(x.kind) || ['barril', 'poni', 'catalejo'].includes(x.kind));
      const tc: number | 'hand' = valuable ? valuable.id : e.hand.length ? 'hand' : (e.inPlay.find((x) => x.kind !== 'calabozo')?.id ?? 'hand');
      if (ok(play(c, e.id, tc))) return play(c, e.id, tc);
    }
    // liberar a un amigo del calabozo con un Lazo
    if (k === 'travesura') {
      for (const f of friends) {
        const j = f.inPlay.find((x) => x.kind === 'calabozo');
        if (j && ok(play(c, f.id, j.id))) return play(c, f.id, j.id);
      }
    }
  }

  // 8. Ataques masivos
  const lowFriend = friends.some((f) => f.hp <= 1);
  for (const k of ['rafaga', 'estampida'] as CardKind[]) {
    const c = ofKind(k)[0];
    if (c && enemies.length && !lowFriend && (friends.length === 0 || enemies.length >= friends.length)) return play(c);
  }

  // 9. Duelo
  const duel = ofKind('duelo')[0];
  if (duel && enemies.length) {
    const e = enemies[0];
    if (shots >= 2 || (shots >= 1 && e.hand.length <= 2) || e.hand.length === 0) return play(duel, e.id);
  }

  // 10. Fogata si estás herido y no hay enemigos muy heridos
  const picnic = ofKind('picnic')[0];
  if (picnic && me.hp < me.maxHp && ok(play(picnic))) return play(picnic);

  // 11. Disparar
  const shot = ofKind('disparo')[0];
  if (shot) for (const e of enemies) if (ok(play(shot, e.id))) return play(shot, e.id);

  return { kind: 'end' };
}

export function cardValue(game: Game, me: PlayerState, c: Card): number {
  switch (c.kind) {
    case 'manzanilla':
      return me.hp < me.maxHp ? 9 : 7;
    case 'esquiva':
      return 8;
    case 'disparo':
      return me.hand.filter((x) => x.kind === 'disparo').length > 2 ? 4 : 6;
    case 'barril':
      return hasInPlay(me, c.kind) ? 1 : 7.5;
    case 'poni':
      return hasInPlay(me, c.kind) ? 1 : 6;
    case 'catalejo':
      return hasInPlay(me, c.kind) ? 1 : 5;
    case 'dinamita':
      return hasInPlay(me, c.kind) ? 0.5 : 2;
    case 'calabozo':
      return 5;
    case 'correo':
      return 6;
    case 'encomienda':
      return 7;
    case 'hurto':
    case 'travesura':
      return 6;
    case 'rafaga':
      return 7;
    case 'estampida':
      return 6;
    case 'duelo':
      return 5;
    case 'mercadillo':
    case 'picnic':
      return 4;
    default: {
      const r = CARD_DEFS[c.kind].weaponRange ?? 0;
      return r > weaponRange(me) ? 3.5 + r * 0.5 : 1;
    }
  }
}

export function worstCards(game: Game, me: PlayerState, n: number): number[] {
  return [...me.hand]
    .sort((a, b) => cardValue(game, me, a) - cardValue(game, me, b))
    .slice(0, n)
    .map((c) => c.id);
}
