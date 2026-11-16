import type { Building, Fx, GameView, PublicPlayer } from './types';
import { emptyRes } from './types';
import type { IslaGame } from './engine';
import { GOAL, publicVp } from './rules';

/** Lo que ve cada jugador: sus recursos y cartas, y sólo el número de los de los demás. */
export function buildView(g: IslaGame, forId: string): GameView {
  const over = g.phase === 'over';
  const t = g.table;
  const players: PublicPlayer[] = g.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    connected: p.connected,
    color: p.color,
    cards: Object.values(p.res).reduce((a, b) => a + b, 0),
    devCount: p.dev.length,
    dogs: p.dogs,
    roadLen: p.roadLen,
    vp: p.id === forId || over ? g.vp(p) : publicVp(t, p, g.longest, g.army),
    left: { ...p.left },
  }));
  const me = g.byId(forId);
  const buildings: Record<number, Building> = {};
  for (const [v, bd] of g.buildings) buildings[v] = bd;
  const roads: Record<number, string> = {};
  for (const [e, o] of g.roads) roads[e] = o;
  const fx: Fx[] = g.fx.map((f) => {
    if (!f.secret || f.secret.includes(forId)) return f;
    const copy = { ...f };
    delete copy.res;
    delete copy.card;
    return copy;
  });
  return {
    me: forId,
    board: g.board,
    buildings,
    roads,
    robber: g.robber,
    players,
    res: me ? { ...me.res } : emptyRes(),
    dev: me ? me.dev.map((d) => ({ ...d })) : [],
    bank: { ...g.bank },
    devLeft: g.devDeck.length,
    dice: g.dice,
    turn: g.current.id,
    phase: g.phase,
    rolled: g.rolled,
    devPlayed: g.devPlayed,
    round: g.turnCount,
    prompt: g.prompts.find((p) => p.playerId === forId) ?? null,
    waiting: g.prompts.map((p) => ({ playerId: p.playerId, type: p.prompt.type })),
    trade: g.trade ? { ...g.trade, responses: { ...g.trade.responses } } : null,
    longest: g.longest,
    army: g.army,
    log: g.log.filter((l) => !l.to || l.to.includes(forId)).slice(-90),
    fx,
    winner: g.winner,
    goal: GOAL,
  };
}
