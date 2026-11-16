// Bots de Isla Cosecha: eligen buenos cruces, persiguen un objetivo (villa, cabaña,
// camino o carta), comercian para conseguirlo y mandan al zorro al líder.
import type { Action, Answer, Piece, PlayerState, PromptReq, Res, ResMap } from './types';
import { RES, emptyRes } from './types';
import type { IslaGame } from './engine';
import { PIPS, otherEnd } from './board';
import { COST, bankRatio, cabanaSpots, freeSpot, has, longestRoad, roadSpots, total, villaSpots } from './rules';

const pips = (n: number | null) => (n ? PIPS[n] : 0);
const BASE_W: Record<Res, number> = { madera: 1.1, arcilla: 1.05, lana: 0.85, trigo: 1.1, piedra: 1.0 };

/** Producción esperada (en puntitos) de cada recurso para un jugador. */
function production(g: IslaGame, pid: string): ResMap {
  const out = emptyRes();
  for (const [v, b] of g.buildings) {
    if (b.owner !== pid) continue;
    for (const h of g.board.verts[v].hexes) {
      const hex = g.board.hexes[h];
      if (hex.terrain === 'duna' || h === g.robber) continue;
      out[hex.terrain] += pips(hex.num) * (b.kind === 'villa' ? 2 : 1);
    }
  }
  return out;
}

function vertexValue(g: IslaGame, v: number, pid: string, prod = production(g, pid)): number {
  const vert = g.board.verts[v];
  let score = 0;
  const kinds = new Set<Res>();
  for (const h of vert.hexes) {
    const hex = g.board.hexes[h];
    if (hex.terrain === 'duna') continue;
    const lacking = prod[hex.terrain] === 0 ? 1.45 : prod[hex.terrain] < 4 ? 1.15 : 1;
    let s = pips(hex.num) * BASE_W[hex.terrain] * lacking;
    if (h === g.robber) s *= 0.5;
    score += s;
    kinds.add(hex.terrain);
  }
  score += kinds.size * 0.7;
  if (vert.port !== undefined) {
    const kind = g.board.ports[vert.port].kind;
    score += kind === 'any' ? 1.3 : 0.4 + prod[kind] * 0.25;
  }
  return score;
}

interface Target {
  vertex: number;
  firstEdge: number;
  dist: number;
  value: number;
}

/** Busca, desde la red de caminos del jugador, buenos cruces libres a los que llegar. */
function expansionTargets(g: IslaGame, pid: string): Target[] {
  const t = g.table;
  const dist = new Map<number, number>();
  const first = new Map<number, number>();
  const queue: number[] = [];
  const blocked = (v: number) => {
    const b = g.buildings.get(v);
    return !!b && b.owner !== pid;
  };
  for (const v of g.board.verts) {
    const mine = g.buildings.get(v.id)?.owner === pid || v.edges.some((e) => g.roads.get(e) === pid);
    if (mine && !blocked(v.id)) {
      dist.set(v.id, 0);
      queue.push(v.id);
    }
  }
  while (queue.length) {
    const v = queue.shift()!;
    const d = dist.get(v)!;
    if (d >= 3) continue;
    for (const e of g.board.verts[v].edges) {
      if (g.roads.has(e)) continue;
      const u = otherEnd(g.board.edges[e], v);
      if (dist.has(u)) continue;
      dist.set(u, d + 1);
      first.set(u, d === 0 ? e : first.get(v)!);
      if (!blocked(u)) queue.push(u);
    }
  }
  const prod = production(g, pid);
  const out: Target[] = [];
  for (const [v, d] of dist) {
    if (d < 1 || !freeSpot(t, v)) continue;
    out.push({ vertex: v, firstEdge: first.get(v)!, dist: d, value: vertexValue(g, v, pid, prod) / (1 + (d - 1) * 0.55) });
  }
  return out.sort((a, b) => b.value - a.value);
}

type Goal = Piece | 'carta';

function chooseGoal(g: IslaGame, p: PlayerState): { goal: Goal; road?: number; vertex?: number } {
  const t = g.table;
  const prod = production(g, p.id);
  const vs = villaSpots(t, p.id);
  if (p.left.villa > 0 && vs.length && (prod.piedra > 0 || p.res.piedra >= 2) && (prod.trigo > 0 || p.res.trigo >= 1)) {
    const best = vs.sort((a, b) => vertexValue(g, b, p.id, prod) - vertexValue(g, a, p.id, prod))[0];
    // si hay un buen sitio libre para cabaña y se está más cerca de él, se prefiere la cabaña
    const cs = p.left.cabana > 0 ? cabanaSpots(t, p.id) : [];
    const missV = missing(p.res, COST.villa);
    const missC = missing(p.res, COST.cabana);
    if (!cs.length || missV <= missC) return { goal: 'villa', vertex: best };
  }
  if (p.left.cabana > 0) {
    const cs = cabanaSpots(t, p.id).sort((a, b) => vertexValue(g, b, p.id, prod) - vertexValue(g, a, p.id, prod));
    const far = p.left.camino > 0 ? expansionTargets(g, p.id) : [];
    if (cs.length && (!far.length || vertexValue(g, cs[0], p.id, prod) >= far[0].value * 0.8)) return { goal: 'cabana', vertex: cs[0] };
    if (far.length) return { goal: 'camino', road: far[0].firstEdge, vertex: far[0].vertex };
  }
  if (p.left.villa > 0 && vs.length) return { goal: 'villa', vertex: vs[0] };
  return { goal: 'carta' };
}

const missing = (have: ResMap, cost: Partial<ResMap>) => RES.reduce((s, k) => s + Math.max(0, (cost[k] ?? 0) - have[k]), 0);
const missingMap = (have: ResMap, cost: Partial<ResMap>) => {
  const m = emptyRes();
  for (const k of RES) m[k] = Math.max(0, (cost[k] ?? 0) - have[k]);
  return m;
};
const costOf = (goal: Goal) => (goal === 'carta' ? COST.carta : COST[goal]);

/** Mejor camino para alargar el Gran Sendero. */
function bestLongRoad(g: IslaGame, p: PlayerState): number | undefined {
  const spots = roadSpots(g.table, p.id);
  let best: number | undefined;
  let bestLen = p.roadLen;
  for (const e of spots) {
    g.roads.set(e, p.id);
    const len = longestRoad(g.table, p.id);
    g.roads.delete(e);
    if (len > bestLen) {
      bestLen = len;
      best = e;
    }
  }
  return best;
}

function robberOnMe(g: IslaGame, pid: string): boolean {
  const hex = g.board.hexes[g.robber];
  return !!hex.num && hex.verts.some((v) => g.buildings.get(v)?.owner === pid);
}

function playable(g: IslaGame, p: PlayerState, kind: string) {
  return !g.devPlayed && p.dev.some((d) => d.kind === kind && d.bought < g.turnCount);
}

function turnAction(g: IslaGame, p: PlayerState, rolled: boolean, error?: string): Action {
  if (error) return { kind: rolled ? 'end' : 'roll' };
  const t = g.table;
  if (!rolled) {
    if (playable(g, p, 'perro') && robberOnMe(g, p.id)) return { kind: 'dev', card: 'perro' };
    return { kind: 'roll' };
  }
  const plan = chooseGoal(g, p);

  // 1. construir lo que se pueda, por orden de valor
  if (p.left.villa > 0 && has(p.res, COST.villa)) {
    const vs = villaSpots(t, p.id);
    if (vs.length) {
      const prod = production(g, p.id);
      return { kind: 'villa', vertex: vs.sort((a, b) => vertexValue(g, b, p.id, prod) - vertexValue(g, a, p.id, prod))[0] };
    }
  }
  if (p.left.cabana > 0 && has(p.res, COST.cabana)) {
    const cs = cabanaSpots(t, p.id);
    if (cs.length) {
      const prod = production(g, p.id);
      return { kind: 'cabana', vertex: cs.sort((a, b) => vertexValue(g, b, p.id, prod) - vertexValue(g, a, p.id, prod))[0] };
    }
  }
  if (p.left.camino > 0 && has(p.res, COST.camino)) {
    if (plan.goal === 'camino' && plan.road !== undefined) return { kind: 'road', edge: plan.road };
    // sin sitio para cabañas: alargar el camino si hay recursos de sobra
    if (plan.goal !== 'cabana' && (total(p.res) > 6 || p.roadLen >= 4) && p.left.camino > 2) {
      const e = bestLongRoad(g, p);
      if (e !== undefined) return { kind: 'road', edge: e };
    }
  }

  // 2. cartas de aldea
  if (playable(g, p, 'perro') && (robberOnMe(g, p.id) || (p.dogs >= 2 && g.army !== p.id))) return { kind: 'dev', card: 'perro' };
  const miss = missingMap(p.res, costOf(plan.goal));
  if (playable(g, p, 'cosecha') && total(miss) >= 1 && total(miss) <= 2) {
    const want: Res[] = [];
    for (const k of RES) for (let i = 0; i < miss[k]; i++) want.push(k);
    while (want.length < 2) want.push(scarcest(g, p));
    if (has(g.bank, toMap(want))) return { kind: 'dev', card: 'cosecha', res: want.slice(0, 2) };
  }
  if (playable(g, p, 'cuadrilla') && p.left.camino >= 2 && (plan.goal === 'camino' || p.roadLen >= 3)) return { kind: 'dev', card: 'cuadrilla' };
  if (playable(g, p, 'mercader') && total(miss) >= 1) {
    const r = RES.filter((k) => miss[k] > 0).sort((a, b) => othersProduction(g, p.id, b) - othersProduction(g, p.id, a))[0];
    if (r && othersProduction(g, p.id, r) >= 6) return { kind: 'dev', card: 'mercader', res: [r] };
  }
  if (playable(g, p, 'perro') && g.rnd() < 0.35) return { kind: 'dev', card: 'perro' };

  // 3. comprar cartas cuando sobra
  const cost = costOf(plan.goal);
  if (g.devDeck.length && has(p.res, COST.carta)) {
    const after = { ...p.res };
    for (const k of RES) after[k] -= COST.carta[k] ?? 0;
    if (plan.goal === 'carta' || missing(after, cost) <= missing(p.res, cost) || total(p.res) >= 8) return { kind: 'buy' };
  }

  // 4. comerciar para acercarse al objetivo
  const need = RES.filter((k) => miss[k] > 0);
  if (need.length && total(miss) <= 3) {
    for (const want of need) {
      for (const give of RES) {
        if (give === want) continue;
        const ratio = bankRatio(t, p.id, give);
        const spare = p.res[give] - (cost[give] ?? 0);
        if (spare >= ratio && g.bank[want] > 0) return { kind: 'bank', give, get: want };
      }
    }
    // una oferta por turno como mucho, y no siempre (para no agobiar a nadie)
    if (g.offers < 1 && total(miss) <= 2 && g.rnd() < 0.55) {
      const spareRes = RES.filter((k) => p.res[k] - (cost[k] ?? 0) > 0).sort((a, b) => p.res[b] - (cost[b] ?? 0) - (p.res[a] - (cost[a] ?? 0)));
      if (spareRes.length) {
        const give = spareRes[0];
        const extra = p.res[give] - (cost[give] ?? 0);
        const n = extra >= 3 ? 2 : 1;
        return { kind: 'offer', give: { [give]: n }, want: { [need[0]]: 1 } };
      }
    }
  }
  // demasiadas cartas con el siete acechando: cambiar algo con el granero
  if (total(p.res) > 7) {
    for (const give of RES) {
      const ratio = bankRatio(t, p.id, give);
      if (p.res[give] - (cost[give] ?? 0) >= ratio) {
        const want = need[0] ?? scarcest(g, p);
        if (want !== give && g.bank[want] > 0) return { kind: 'bank', give, get: want };
      }
    }
  }
  return { kind: 'end' };
}

function toMap(list: Res[]): ResMap {
  const m = emptyRes();
  for (const r of list) m[r]++;
  return m;
}

function scarcest(g: IslaGame, p: PlayerState): Res {
  const prod = production(g, p.id);
  return [...RES].sort((a, b) => prod[a] + p.res[a] - (prod[b] + p.res[b]))[0];
}

function othersProduction(g: IslaGame, pid: string, r: Res) {
  let s = 0;
  for (const o of g.players) if (o.id !== pid) s += production(g, o.id)[r];
  return s;
}

function robberHex(g: IslaGame, p: PlayerState): number {
  let best = -1;
  let bestScore = -Infinity;
  for (const hex of g.board.hexes) {
    if (hex.id === g.robber) continue;
    let score = 0;
    let mine = false;
    for (const v of hex.verts) {
      const b = g.buildings.get(v);
      if (!b) continue;
      if (b.owner === p.id) mine = true;
      else {
        const o = g.byId(b.owner)!;
        score += pips(hex.num) * (b.kind === 'villa' ? 2 : 1) * (1 + g.vp(o) / 4) + (total(o.res) > 0 ? 0.5 : 0);
      }
    }
    if (mine) score -= 20;
    if (score > bestScore) {
      bestScore = score;
      best = hex.id;
    }
  }
  return best;
}

function discardChoice(g: IslaGame, p: PlayerState, count: number): ResMap {
  const plan = chooseGoal(g, p);
  const cost = costOf(plan.goal);
  const left = { ...p.res };
  const out = emptyRes();
  for (let i = 0; i < count; i++) {
    const pick = [...RES].filter((k) => left[k] > 0).sort((a, b) => left[b] - (cost[b] ?? 0) * 1.5 - (left[a] - (cost[a] ?? 0) * 1.5))[0];
    if (!pick) break;
    left[pick]--;
    out[pick]++;
  }
  return out;
}

function respondOffer(g: IslaGame, p: PlayerState, from: string, give: Partial<ResMap>, want: Partial<ResMap>): boolean {
  if (!has(p.res, want)) return false;
  const other = g.byId(from);
  if (!other || g.vp(other) >= 8) return false;
  const plan = chooseGoal(g, p);
  const cost = costOf(plan.goal);
  let value = 0;
  for (const k of RES) {
    const got = give[k] ?? 0;
    const lose = want[k] ?? 0;
    const lacking = Math.max(0, (cost[k] ?? 0) - p.res[k]);
    value += Math.min(got, lacking) * 2 + Math.max(0, got - lacking) * 0.6;
    const spare = Math.max(0, p.res[k] - (cost[k] ?? 0));
    value -= Math.min(lose, spare) * 0.7 + Math.max(0, lose - spare) * 2;
  }
  return value > 0.15;
}

function setupCabana(g: IslaGame, p: PlayerState): number {
  const spots = cabanaSpots(g.table, p.id, true);
  const prod = production(g, p.id);
  let best = spots[0];
  let bestScore = -Infinity;
  for (const v of spots) {
    const s = vertexValue(g, v, p.id, prod) + g.rnd() * 0.4;
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

function setupCamino(g: IslaGame, p: PlayerState, v: number): number {
  const vert = g.board.verts[v];
  let best = vert.edges.find((e) => !g.roads.has(e))!;
  let bestScore = -Infinity;
  for (const e of vert.edges) {
    if (g.roads.has(e)) continue;
    const w = otherEnd(g.board.edges[e], v);
    let s = 0;
    for (const u of g.board.verts[w].adj) if (u !== v && freeSpot(g.table, u)) s = Math.max(s, vertexValue(g, u, p.id));
    s += g.rnd() * 0.2;
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}

export function botAnswer(g: IslaGame, req: PromptReq): Answer {
  const p = g.byId(req.playerId)!;
  const pr = req.prompt;
  switch (pr.type) {
    case 'setup':
      return pr.step === 'cabana' ? { vertex: setupCabana(g, p) } : { edge: setupCamino(g, p, pr.vertex!) };
    case 'turn':
      return { action: turnAction(g, p, pr.rolled, pr.error) };
    case 'discard':
      return { res: discardChoice(g, p, pr.count) };
    case 'robber':
      return { hex: robberHex(g, p) };
    case 'steal': {
      const best = [...pr.targets].sort((a, b) => g.vp(g.byId(b)!) - g.vp(g.byId(a)!) || total(g.byId(b)!.res) - total(g.byId(a)!.res))[0];
      return { target: best };
    }
    case 'freeRoad': {
      const plan = chooseGoal(g, p);
      const spots = roadSpots(g.table, p.id);
      const far = expansionTargets(g, p.id).find((t) => spots.includes(t.firstEdge));
      const e = far?.firstEdge ?? (plan.road !== undefined && spots.includes(plan.road) ? plan.road : (bestLongRoad(g, p) ?? spots[0]));
      return { edge: e };
    }
    case 'offer':
      return { accept: respondOffer(g, p, pr.from, pr.give, pr.want) };
    case 'tradeWait': {
      const acc = g.trade ? Object.entries(g.trade.responses).find(([, r]) => r === 'accept') : undefined;
      return { partner: acc ? acc[0] : null };
    }
  }
}

/** Retardo de "pensar" de un bot, en milisegundos. */
export function botDelay(req: PromptReq): number {
  switch (req.prompt.type) {
    case 'turn':
      return req.prompt.rolled ? 650 + Math.random() * 450 : 750 + Math.random() * 500;
    case 'offer':
      return 900 + Math.random() * 1400;
    case 'setup':
      return 700 + Math.random() * 500;
    default:
      return 600 + Math.random() * 400;
  }
}
