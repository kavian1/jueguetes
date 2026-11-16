// Bots de Villa Moneda: compran con cabeza, completan barrios con tratos, construyen
// donde más renta, guardan un colchón según lo peligroso que esté el tablero y votan
// al partido que más les conviene.
import type { Action, Answer, CardId, CharId, PartyId, PlayerState, PromptReq, TradeSide } from './types';
import type { VillaGame } from './engine';
import {
  BOARD,
  BOARD_SIZE,
  salary,
  CHAR_IDS,
  DONATIONS,
  GROUPS,
  GROUP_ORDER,
  JAIL_FINE,
  LOAN,
  PARTY_IDS,
  buildCost,
  buyPrice,
  canBuild,
  groupSpaces,
  isProperty,
  maxLoans,
  paysInterest,
  rentFor,
  type Ctx,
} from './rules';

/** Probabilidad aproximada de sacar cada suma con dos dados. */
const P2 = (n: number) => (n < 2 || n > 12 ? 0 : (6 - Math.abs(7 - n)) / 36);

/** Preferencia de los bots al elegir personaje (con algo de azar para variar). */
const CHAR_PREF: Record<CharId, number> = { rita: 6, tomas: 6, nora: 5, ernesto: 5, clara: 4, mar: 5, abel: 4, lola: 4, pepe: 4, fortu: 4 };

const ownersIn = (g: VillaGame, ids: number[]) => ids.map((id) => g.owned.get(id)?.owner ?? null);

/** Lo que le puede costar caer en la peor casilla de los rivales. */
function danger(g: VillaGame, p: PlayerState): number {
  let worst = 0;
  for (const [id, o] of g.owned) {
    if (o.owner === p.id) continue;
    worst = Math.max(worst, rentFor(g.ctx, id, p.id, p.cash, 8));
  }
  return worst;
}

function reserve(g: VillaGame, p: PlayerState): number {
  const d = danger(g, p);
  return Math.max(90, Math.min(650, 70 + d * 0.55));
}

/** Cuántas del barrio (o del tipo) tiene ya cada uno. */
function groupInfo(g: VillaGame, id: number) {
  const s = BOARD[id];
  const ids = s.group ? groupSpaces(s.group) : BOARD.filter((x) => x.kind === s.kind).map((x) => x.id);
  return { ids, owners: ownersIn(g, ids) };
}

/** Valor estratégico de una propiedad para un jugador (si la tuviera). */
function propValue(g: VillaGame, pid: string, id: number, without?: number): number {
  const s = BOARD[id];
  const { ids, owners } = groupInfo(g, id);
  const others = ids.filter((x, i) => x !== id && x !== without && owners[i] === pid).length;
  const total = ids.length;
  let v = s.price ?? 0;
  if (s.kind === 'calle') {
    if (others === total - 1) v *= 2.6;
    else v *= 1 + 0.35 * others;
    const lvl = g.owned.get(id)?.level ?? 0;
    v += lvl * GROUPS[s.group!].house;
  } else if (s.kind === 'atraccion') v *= others ? 1.75 : 1.2;
  else if (s.kind === 'transporte' || s.kind === 'empresa' || s.kind === 'banco') v *= others ? 1.6 : 1.05;
  return v;
}

/** Alguien más ya tiene todas las demás de ese barrio: comprarla le bloquea. */
function blocks(g: VillaGame, pid: string, id: number): boolean {
  const s = BOARD[id];
  if (s.kind !== 'calle') return false;
  const { ids, owners } = groupInfo(g, id);
  const rest = owners.filter((o, i) => ids[i] !== id);
  return rest.length > 0 && rest.every((o) => o && o === rest[0] && o !== pid);
}

function completes(g: VillaGame, pid: string, id: number): boolean {
  const s = BOARD[id];
  if (s.kind !== 'calle') return false;
  const { ids, owners } = groupInfo(g, id);
  return owners.every((o, i) => ids[i] === id || o === pid);
}

// ───────────────────────── compras y construcción ─────────────────────────

function wantsToBuy(g: VillaGame, p: PlayerState, id: number, price: number): boolean {
  const s = BOARD[id];
  const res = reserve(g, p);
  const loansLeft = maxLoans(p.char) - p.loans;
  const key = completes(g, p.id, id) || blocks(g, p.id, id);
  if (key) return p.cash - price >= -LOAN * Math.min(2, loansLeft) + 40;
  const early = g.round <= 6;
  const late = g.round >= g.maxRounds - 2;
  // al final sólo compensa si cuesta menos de lo que suma al patrimonio (siempre suma su precio)
  if (late) return p.cash - price >= res;
  if (s.kind === 'banco' && p.loans) return p.cash - price >= -LOAN + 40;
  return p.cash - price >= (early ? 40 : res * 0.8);
}

function bestBuild(g: VillaGame, p: PlayerState): { id: number; cost: number; score: number } | null {
  let best: { id: number; cost: number; score: number } | null = null;
  for (const [id, o] of g.owned) {
    if (o.owner !== p.id || !canBuild(g.ctx, p.id, id)) continue;
    const s = BOARD[id];
    const cost = buildCost(g.ctx, s, p.id);
    const gainRent = s.rent![o.level + 1] - (o.level === 0 ? s.rent![0] * 2 : s.rent![o.level]);
    // preferir igualar el barrio y lo que más rinde por moneda
    const lowest = Math.min(...groupSpaces(s.group!).map((x) => g.owned.get(x)?.level ?? 0));
    const score = (gainRent / cost) * (o.level === lowest ? 1.3 : 0.8);
    if (!best || score > best.score) best = { id, cost, score };
  }
  return best;
}

// ───────────────────────── tratos ─────────────────────────

/** Diferencia de valor (para `pid`) de recibir unas cosas y dar otras. */
function tradeDelta(g: VillaGame, pid: string, gets: TradeSide, gives: TradeSide, partner: string): number {
  let d = gets.cash - gives.cash;
  for (const id of gets.props) d += propValue(g, pid, id);
  for (const id of gives.props) {
    d -= propValue(g, pid, id);
    // regalarle un barrio entero al otro es peligroso
    const after = groupInfo(g, id);
    const theirs = after.ids.filter((x, i) => x !== id && after.owners[i] === partner && !gives.props.includes(x)).length;
    if (BOARD[id].kind === 'calle' && theirs === after.ids.length - 1) d -= (BOARD[id].price ?? 0) * 1.6;
  }
  return d;
}

function proposeTrade(g: VillaGame, p: PlayerState): Action | null {
  if (g.trades > 0 || g.round > g.maxRounds - 2) return null;
  const res = reserve(g, p);
  for (const grp of GROUP_ORDER) {
    const ids = groupSpaces(grp);
    const owners = ownersIn(g, ids);
    const mine = owners.filter((o) => o === p.id).length;
    if (mine !== ids.length - 1) continue;
    const idx = owners.findIndex((o) => o !== p.id);
    const holder = owners[idx];
    if (!holder) continue;
    const target = ids[idx];
    if ((g.owned.get(target)?.level ?? 0) > 0) continue;
    const other = g.byId(holder)!;
    // ¿algo mío que le ayude a él? se lo ofrezco en el lote
    const sweet = [...g.owned]
      .filter(([id, o]) => o.owner === p.id && o.level === 0 && BOARD[id].group !== grp && BOARD[id].kind === 'calle')
      .map(([id]) => id)
      .find((id) => {
        const gi = groupInfo(g, id);
        return gi.owners.filter((o) => o === holder).length >= 1 && !gi.owners.some((o, i) => o === p.id && gi.ids[i] !== id);
      });
    const price = BOARD[target].price ?? 0;
    let cash = Math.round((price * (sweet !== undefined ? 1.4 : 2.9)) / 10) * 10;
    if (p.cash - cash < res * 0.6) cash = Math.max(0, Math.floor((p.cash - res * 0.6) / 10) * 10);
    const give: TradeSide = { props: sweet !== undefined ? [sweet] : [], cash };
    const want: TradeSide = { props: [target], cash: 0 };
    // no insistir: un trato rechazado no se repite hasta pasadas 3 rondas
    const last = g.rejected.get(`${p.id}>${other.id}:${target}`);
    if (last !== undefined && g.round - last < 3) continue;
    // con otro bot, sólo se propone lo que aceptaría
    if (other.isBot && !respondTrade(g, other, p.id, give, want)) continue;
    if (!give.props.length && cash <= 0) continue;
    return { kind: 'trade', to: other.id, give, want };
  }
  return null;
}

function respondTrade(g: VillaGame, p: PlayerState, from: string, give: TradeSide, want: TradeSide): boolean {
  // `give` es lo que me dan; `want`, lo que me piden
  if (want.cash > p.cash) return false;
  const d = tradeDelta(g, p.id, give, want, from);
  const scale = [...give.props, ...want.props].reduce((s, id) => s + (BOARD[id].price ?? 0), 0);
  return d > scale * 0.08;
}

// ───────────────────────── votos ─────────────────────────

/** Beneficio esperado (cobros menos pagos) de cada partido durante las 4 rondas que gobierna. */
function partyBenefit(g: VillaGame, p: PlayerState, party: PartyId): number {
  const alive = g.players.filter((x) => !x.bankrupt);
  const rivals = alive.length - 1;
  // probabilidad de que un jugador caiga en una casilla concreta en un turno, por 4 rondas
  const HIT = 0.033 * 4;
  /** lo que gano (o pierdo) si las rentas de ese tipo cambian en `f` (0.2 = +20 %) */
  const flow = (kind: 'calle' | 'transporte' | 'empresa', f: number) => {
    let net = 0;
    for (const [id, o] of g.owned) {
      if (BOARD[id].kind !== kind) continue;
      const r = rentFor(g.ctx, id, '', 0, 7);
      net += o.owner === p.id ? r * f * HIT * rivals : -r * f * HIT;
    }
    return net;
  };
  switch (party) {
    case 'rojo':
      // todos cobran más al pasar por la Salida: sólo ayuda de verdad a quien va justo
      return p.cash < 400 ? 25 : 8;
    case 'azul':
      return flow('calle', 0.2);
    case 'verde':
      return flow('transporte', 1) + flow('empresa', -0.5);
    case 'naranja': {
      let left = 0;
      for (const [id, o] of g.owned) if (o.owner === p.id && canBuild(g.ctx, p.id, id)) left += (4 - o.level) * GROUPS[BOARD[id].group!].house;
      return Math.min(left, Math.max(0, p.cash - 150)) * 0.3;
    }
  }
}

function vote(g: VillaGame, p: PlayerState): Answer {
  const scored = PARTY_IDS.map((k) => ({ k, v: partyBenefit(g, p, k) + g.rnd() * 20 })).sort((a, c) => c.v - a.v);
  const top = scored[0];
  const res = reserve(g, p);
  // dona según lo que se juega frente a la segunda opción (y algo por la alcaldía)
  const stake = top.v - scored[1].v + 40;
  const spare = p.cash - res;
  let donation = spare > 100 ? Math.min(stake * (p.char === 'clara' ? 1.2 : 0.8), spare * 0.4) : 0;
  donation = Math.round(donation / 50) * 50;
  donation = DONATIONS.filter((d) => d <= donation && d <= p.cash).pop() ?? 0;
  return { party: top.k, donation };
}

// ───────────────────────── movimiento y cartas ─────────────────────────

/** Lo bueno o malo que es acabar en una casilla. */
function landValue(g: VillaGame, p: PlayerState, pos: number, dice: number): number {
  const s = BOARD[pos];
  if (isProperty(s)) {
    const o = g.owned.get(pos);
    if (!o) return p.cash >= buyPrice(s, p.char) ? 40 + (completes(g, p.id, pos) ? 120 : 0) : 0;
    if (o.owner === p.id) return 5;
    return -rentFor(g.ctx, pos, p.id, p.cash, dice);
  }
  switch (s.kind) {
    case 'hacienda':
      return -(s.tax ?? 0);
    case 'arresto':
      return g.round < 10 ? -120 : -20;
    case 'plaza':
      return g.pot;
    case 'buzon':
      return 5;
    case 'bolsa':
      return 10;
    case 'subasta':
      return 25;
    case 'manifestacion':
      return 20;
    case 'metro':
      return 10;
    case 'ayuntamiento':
      return g.mayor === p.id ? 75 : 5;
    default:
      return 0;
  }
}

/** Lo que espera ganar o perder en su próxima tirada desde una casilla. */
function nextRollValue(g: VillaGame, p: PlayerState, from: number): number {
  let v = 0;
  for (let n = 2; n <= 12; n++) v += P2(n) * landValue(g, p, (from + n) % BOARD_SIZE, n);
  return v;
}

/** Puja secreta: algo menos de lo que le vale (más si le completa o bloquea un barrio). */
function auctionBid(g: VillaGame, p: PlayerState, id: number, min: number): number {
  const s = BOARD[id];
  let value = propValue(g, p.id, id);
  if (blocks(g, p.id, id)) value += (s.price ?? 0) * 0.6;
  const room = p.cash - reserve(g, p) * 0.5;
  let bid = Math.min(value * (0.62 + g.rnd() * 0.2), room);
  bid = Math.floor(bid / 5) * 5;
  return bid >= min ? bid : 0;
}

/** Manifestación: corta la propiedad rival que más le amenaza (o la del que va primero). */
function protestTarget(g: VillaGame, p: PlayerState, targets: number[]): number {
  const leader = g.ranking().find((r) => r.id !== p.id)?.id;
  let best = targets[0];
  let bestScore = -Infinity;
  for (const id of targets) {
    const rent = rentFor({ ...g.ctx, closed: undefined }, id, p.id, p.cash, 7);
    const dist = (id - p.pos + BOARD_SIZE) % BOARD_SIZE;
    const score = rent * (P2(dist) * 4 + 0.15) + (g.owned.get(id)?.owner === leader ? rent * 0.1 + 15 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** Metro: viaja si la zona de la otra estación le conviene más (sin perder la Salida). */
function wantsMetro(g: VillaGame, p: PlayerState, to: number, cost: number): boolean {
  const here = nextRollValue(g, p, p.pos);
  let there = nextRollValue(g, p, to);
  // si el viaje cruza la Salida, se pierde el sueldo de esta vuelta
  if (to < p.pos) there -= salary(g.ctx, p.id);
  else there += 25;
  return there - cost > here + 15;
}

/** Referéndum: lo convoca si el partido en el poder le perjudica bastante frente al que le conviene. */
function wantsReferendum(g: VillaGame, p: PlayerState, cost: number): boolean {
  if (p.cash - cost < reserve(g, p)) return false;
  const scored = PARTY_IDS.map((k) => ({ k, v: partyBenefit(g, p, k) })).sort((a, c) => c.v - a.v);
  const current = g.party ? partyBenefit(g, p, g.party) : 0;
  return scored[0].k !== g.party && scored[0].v - current > cost * 0.9 + 20;
}

const CARD_VALUE: Record<CardId, number> = {
  salida: 200,
  comisaria: -150,
  libre: 60,
  atras: -10,
  transporte: -40,
  plaza: 30,
  metro: 20,
  herencia: 100,
  error: 75,
  tartas: 50,
  multa: -40,
  reparaciones: -60,
  cumple: 50,
  ronda: -45,
  veterinario: -50,
  devolucion: 60,
  luna: -20,
};

// ───────────────────────── deudas ─────────────────────────

function debtAction(g: VillaGame, p: PlayerState, amount: number): Action {
  if (p.cash >= amount) return { kind: 'pay' };
  if (p.loans < maxLoans(p.char)) return { kind: 'loan' };
  const mine = [...g.owned].filter(([, o]) => o.owner === p.id);
  const built = mine.filter(([, o]) => o.level > 0).sort((x, y) => propValue(g, p.id, x[0]) - propValue(g, p.id, y[0]))[0];
  if (built) return { kind: 'sellBuilding', space: built[0] };
  const prop = mine.sort((x, y) => propValue(g, p.id, x[0]) - propValue(g, p.id, y[0]))[0];
  if (prop) return { kind: 'sellProp', space: prop[0] };
  return { kind: 'bankrupt' };
}

// ───────────────────────── turno ─────────────────────────

function turnAction(g: VillaGame, p: PlayerState, stage: 'pre' | 'post', error?: string): Action {
  if (error) return { kind: stage === 'pre' ? 'roll' : 'end' };
  const res = reserve(g, p);
  if (stage === 'pre' && p.jail) {
    const free = BOARD.filter((s) => isProperty(s) && !g.owned.has(s.id)).length;
    const wantOut = g.round <= 10 && free >= 5;
    if (wantOut && p.freeCards) return { kind: 'jailCard' };
    if (wantOut && p.cash - JAIL_FINE >= res) return { kind: 'jailPay' };
    return { kind: 'roll' };
  }
  // construir
  const late = g.round >= g.maxRounds - 1;
  const bb = bestBuild(g, p);
  if (bb && !late) {
    if (p.cash - bb.cost >= res * 0.85) return { kind: 'build', space: bb.id };
    const o = g.owned.get(bb.id)!;
    if (o.level < 3 && p.loans < maxLoans(p.char) - 1 && g.round <= g.maxRounds - 5 && p.cash + LOAN - bb.cost >= res * 0.85) return { kind: 'loan' };
  }
  // devolver préstamos que cuestan intereses
  if (p.loans && paysInterest(g.ctx, p.id) && p.cash - LOAN >= res + 350 && !bb) return { kind: 'repay' };
  if (stage === 'post') {
    const t = proposeTrade(g, p);
    if (t) return t;
    return { kind: 'end' };
  }
  return { kind: 'roll' };
}

export function botAnswer(g: VillaGame, req: PromptReq): Answer {
  const p = g.byId(req.playerId)!;
  const pr = req.prompt;
  switch (pr.type) {
    case 'character': {
      const best = [...pr.options].sort((a, c) => CHAR_PREF[c] + g.rnd() * 4 - (CHAR_PREF[a] + g.rnd() * 4))[0];
      return { char: best ?? CHAR_IDS[0] };
    }
    case 'turn':
      return { action: turnAction(g, p, pr.stage, pr.error) };
    case 'buy':
      return { accept: wantsToBuy(g, p, pr.space, pr.price) };
    case 'adjust': {
      // repite si caer donde va es bastante peor que caer en un sitio al azar
      const here = landValue(g, p, pr.to, pr.roll);
      let avg = 0;
      for (let n = 2; n <= 12; n++) avg += P2(n) * landValue(g, p, (p.pos + n) % BOARD_SIZE, n);
      return { accept: here < avg - 90 };
    }
    case 'bolsa':
      return { accept: p.cash - 100 >= reserve(g, p) + 80 };
    case 'pickCard':
      return { card: [...pr.cards].sort((a, c) => CARD_VALUE[c] - CARD_VALUE[a])[0] };
    case 'debt':
      return { action: pr.error && p.cash < pr.amount ? debtAction(g, p, pr.amount) : debtAction(g, p, pr.amount) };
    case 'vote':
      return vote(g, p);
    case 'tradeOffer':
      return { accept: respondTrade(g, p, pr.from, pr.give, pr.want) };
    case 'bid':
      return { bid: auctionBid(g, p, pr.space, pr.min) };
    case 'protest':
      return { space: protestTarget(g, p, pr.targets) };
    case 'metro':
      return { accept: wantsMetro(g, p, pr.to, pr.cost) };
    case 'referendum':
      return { accept: wantsReferendum(g, p, pr.cost) };
  }
}

/** Retardo de "pensar" de un bot, en milisegundos. */
export function botDelay(req: PromptReq): number {
  switch (req.prompt.type) {
    case 'turn':
      return req.prompt.stage === 'pre' ? 700 + Math.random() * 400 : 550 + Math.random() * 350;
    case 'vote':
    case 'bid':
      return 1200 + Math.random() * 1500;
    case 'tradeOffer':
      return 1100 + Math.random() * 900;
    case 'character':
      return 800 + Math.random() * 1200;
    default:
      return 600 + Math.random() * 400;
  }
}

/** Probabilidad de caer en una casilla desde otra con una tirada (para la interfaz). */
export function landChance(from: number, to: number): number {
  return P2((to - from + BOARD_SIZE) % BOARD_SIZE);
}

export type { Ctx };
