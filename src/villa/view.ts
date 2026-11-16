import type { GameView, Owned, PublicPlayer } from './types';
import type { VillaGame } from './engine';

/** En Villa Moneda casi todo es público: el dinero, las propiedades y los préstamos. Sólo los votos son secretos hasta el recuento. */
export function buildView(g: VillaGame, forId: string): GameView {
  const players: PublicPlayer[] = g.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    connected: p.connected,
    color: p.color,
    char: p.char,
    cash: p.cash,
    pos: p.pos,
    loans: p.loans,
    jail: p.jail,
    freeCards: p.freeCards,
    taxi: p.taxi,
    bankrupt: p.bankrupt,
    out: p.out,
    worth: g.worth(p),
  }));
  const owned: Record<number, Owned> = {};
  for (const [id, o] of g.owned) owned[id] = { ...o };
  const closed: Record<number, string> = {};
  for (const [id, who] of g.closed) closed[id] = who;
  return {
    me: forId,
    mode: g.mode,
    players,
    owned,
    closed,
    turn: g.current.id,
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    goal: g.goal,
    dice: g.dice,
    doubles: g.doubles,
    pot: g.pot,
    news: g.news,
    party: g.party,
    mayor: g.mayor,
    election: g.election,
    auction: g.auction,
    nextElection: g.nextElection(),
    prompt: g.prompts.find((p) => p.playerId === forId) ?? null,
    waiting: g.prompts.map((p) => ({ playerId: p.playerId, type: p.prompt.type })),
    log: g.log.slice(-90),
    fx: g.fx,
    winner: g.winner,
    ranking: g.ranking(),
  };
}
