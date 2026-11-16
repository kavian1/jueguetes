import type { GameView, PublicPlayer } from './types';
import type { Game } from './engine';

/** Construye lo que un jugador concreto puede ver (oculta manos y roles ajenos). */
export function buildView(game: Game, forId: string): GameView {
  const over = !!game.winner;
  const me = game.byId(forId);
  const players: PublicPlayer[] = game.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    connected: p.connected,
    character: p.character,
    hp: p.hp,
    maxHp: p.maxHp,
    alive: p.alive,
    handCount: p.hand.length,
    inPlay: p.inPlay,
    isSheriff: p.role === 'sheriff',
    role: p.id === forId || !p.alive || p.role === 'sheriff' || over ? p.role : undefined,
    tintaUsed: p.tintaUsed,
  }));
  const cur = game.current;
  return {
    me: forId,
    players,
    hand: me ? me.hand : [],
    deckCount: game.deck.length,
    discardTop: game.discard[game.discard.length - 1] ?? null,
    discardCount: game.discard.length,
    turn: game.currentPlayer.id,
    step: game.step,
    shotsThisTurn: game.currentPlayer.shotsThisTurn,
    prompt: cur && cur.playerId === forId ? cur : null,
    waiting: cur ? { playerId: cur.playerId, type: cur.prompt.type } : null,
    store: game.store,
    log: game.log.filter((l) => !l.to || l.to.includes(forId)).slice(-80),
    fx: game.fx,
    winner: game.winner,
    round: game.turnCount,
  };
}
