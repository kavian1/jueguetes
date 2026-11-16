// Motor de Isla Cosecha. Lo ejecuta el anfitrión: pregunta a cada jugador (persona o bot)
// con `ask` y avisa de cada cambio con `onChange`. Puede tener varias preguntas abiertas
// a la vez (descartes con el siete y respuestas a una oferta de comercio).
import type {
  Action,
  Answer,
  Board,
  Building,
  DevCard,
  DevKind,
  Fx,
  LogEntry,
  Phase,
  Piece,
  PlayerState,
  Prompt,
  PromptReq,
  Res,
  ResMap,
  Trade,
  Winner,
} from './types';
import { RES, emptyRes } from './types';
import type { SeatInfo } from '../net/protocol';
import { makeBoard } from './board';
import { shuffle } from '../game/rng';
import {
  BANK_START,
  COST,
  DEV_DECK,
  DEV_INFO,
  GOAL,
  PIECES,
  RES_INFO,
  bankRatio,
  cabanaSpots,
  canCabana,
  canRoad,
  gain,
  has,
  longestRoad,
  pay,
  resList,
  roadSpots,
  total,
  totalVp,
  villaSpots,
  type Table,
} from './rules';

export class GameOver extends Error {}

export interface IslaOptions {
  ask: (req: PromptReq) => Promise<Answer>;
  cancel?: (promptId: number) => void;
  onChange: () => void;
  /** pausa para que se vean las animaciones */
  pause?: (ms: number) => Promise<void>;
  /** temporizador real para los plazos de las ofertas */
  timer?: (ms: number) => Promise<void>;
  rnd?: () => number;
  /** sólo para simulaciones */
  maxTurns?: number;
}

const b = (s: string) => `**${s}**`;
const OFFER_TIMEOUT = 30000;
const MAX_OFFERS = 6;

interface Pending {
  req: PromptReq;
  promise: Promise<Answer>;
  cancel: () => void;
}

export class IslaGame {
  board: Board;
  players: PlayerState[];
  buildings = new Map<number, Building>();
  roads = new Map<number, string>();
  robber: number;
  bank: ResMap;
  devDeck: DevCard[];
  turnIdx = 0;
  phase: Phase = 'setup';
  rolled = false;
  devPlayed = false;
  dice: [number, number] | null = null;
  turnCount = 0;
  prompts: PromptReq[] = [];
  trade: Trade | null = null;
  longest: string | null = null;
  army: string | null = null;
  log: LogEntry[] = [];
  fx: Fx[] = [];
  winner: Winner | null = null;
  offers = 0;
  rnd: () => number;
  private seq = 1;
  private promptSeq = 1;
  private tradeSeq = 1;

  constructor(seats: SeatInfo[], private opts: IslaOptions) {
    this.rnd = opts.rnd ?? Math.random;
    this.board = makeBoard(this.rnd);
    const order = shuffle([...seats], this.rnd);
    this.players = order.map((s, i) => ({
      id: s.id,
      name: s.name,
      isBot: s.isBot,
      connected: true,
      color: i,
      res: emptyRes(),
      dev: [],
      dogs: 0,
      roadLen: 0,
      left: { ...PIECES },
    }));
    this.robber = this.board.hexes.find((h) => h.terrain === 'duna')!.id;
    this.bank = { madera: BANK_START, arcilla: BANK_START, lana: BANK_START, trigo: BANK_START, piedra: BANK_START };
    let id = 1;
    this.devDeck = shuffle(
      DEV_DECK.map((kind) => ({ id: id++, kind, bought: -1 })),
      this.rnd,
    );
  }

  // ───────────────────────── utilidades ─────────────────────────

  get table(): Table {
    return { board: this.board, buildings: this.buildings, roads: this.roads };
  }
  get current(): PlayerState {
    return this.players[this.turnIdx];
  }
  byId(id: string | undefined | null): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }
  vp(p: PlayerState) {
    return totalVp(this.table, p, this.longest, this.army);
  }

  addLog(text: string, kind?: LogEntry['kind'], to?: string[]) {
    this.log.push({ id: this.seq++, text, kind, to });
    if (this.log.length > 220) this.log.splice(0, this.log.length - 220);
  }
  addFx(fx: Omit<Fx, 'id'>) {
    this.fx.push({ ...fx, id: this.seq++ });
    if (this.fx.length > 150) this.fx.splice(0, this.fx.length - 150);
  }
  private changed() {
    this.opts.onChange();
  }
  private pause(ms: number) {
    return this.opts.pause ? this.opts.pause(ms) : Promise.resolve();
  }
  private timer(ms: number) {
    return this.opts.timer ? this.opts.timer(ms) : new Promise<void>((r) => setTimeout(r, ms));
  }

  private request(playerId: string, prompt: Prompt): Pending {
    const req: PromptReq = { id: this.promptSeq++, playerId, prompt };
    this.prompts.push(req);
    let done = false;
    const remove = () => {
      this.prompts = this.prompts.filter((p) => p !== req);
    };
    this.changed();
    const promise = this.opts.ask(req).then((a) => {
      if (!done) {
        done = true;
        remove();
      }
      return a ?? {};
    });
    return {
      req,
      promise,
      cancel: () => {
        if (done) return;
        done = true;
        remove();
        this.opts.cancel?.(req.id);
        this.changed();
      },
    };
  }
  private ask(playerId: string, prompt: Prompt): Promise<Answer> {
    return this.request(playerId, prompt).promise;
  }

  // ───────────────────────── partida ─────────────────────────

  async run() {
    try {
      this.addLog(`¡Bienvenidos a la isla! Gana quien llegue a ${b(GOAL + ' puntos')}.`, 'turn');
      await this.setup();
      this.phase = 'main';
      this.addLog('Las aldeas ya están fundadas. ¡Que empiece la cosecha!', 'good');
      for (;;) {
        await this.playTurn();
        this.turnIdx = (this.turnIdx + 1) % this.players.length;
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    this.phase = 'over';
    for (const p of [...this.prompts]) this.opts.cancel?.(p.id);
    this.prompts = [];
    this.trade = null;
    this.changed();
  }

  private async setup() {
    const n = this.players.length;
    const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
    for (let k = 0; k < order.length; k++) {
      this.turnIdx = order[k];
      const p = this.current;
      const round = k < n ? 1 : 2;
      this.turnCount = 0;
      this.addFx({ kind: 'turn', player: p.id });
      if (round === 1 && k === 0) this.addLog(`Cada uno funda una cabaña con su camino; luego, en orden inverso, la segunda.`, 'info');

      const spots = cabanaSpots(this.table, p.id, true);
      const a1 = await this.ask(p.id, { type: 'setup', step: 'cabana', round });
      const v = a1.vertex !== undefined && spots.includes(a1.vertex) ? a1.vertex : spots[Math.floor(this.rnd() * spots.length)];
      this.place(p, 'cabana', v, true);
      this.addLog(`${b(p.name)} funda una cabaña.`);
      if (round === 2) {
        const got = emptyRes();
        for (const h of this.board.verts[v].hexes) {
          const hex = this.board.hexes[h];
          if (hex.terrain === 'duna') continue;
          got[hex.terrain]++;
          this.bank[hex.terrain]--;
          this.addFx({ kind: 'produce', player: p.id, hex: h, res: hex.terrain, amount: 1 });
        }
        gain(p.res, got);
        if (total(got)) this.addLog(`${b(p.name)} recibe ${resList(got)}.`, 'good');
      }
      this.changed();
      await this.pause(350);

      const edges = this.board.verts[v].edges.filter((e) => !this.roads.has(e));
      const a2 = await this.ask(p.id, { type: 'setup', step: 'camino', vertex: v, round });
      const e = a2.edge !== undefined && edges.includes(a2.edge) ? a2.edge : edges[0];
      if (e !== undefined) this.place(p, 'camino', e, true);
      this.changed();
      await this.pause(250);
    }
    this.turnIdx = 0;
    this.turnCount = 0;
  }

  private async playTurn() {
    const p = this.current;
    this.turnCount++;
    if (this.opts.maxTurns && this.turnCount > this.opts.maxTurns) {
      this.winner = { id: '', text: 'La partida se ha alargado demasiado.' };
      throw new GameOver();
    }
    this.rolled = false;
    this.devPlayed = false;
    this.dice = null;
    this.offers = 0;
    this.addLog(`Turno de ${b(p.name)}.`, 'turn');
    this.addFx({ kind: 'turn', player: p.id });
    let error: string | undefined;
    for (;;) {
      const ans = await this.ask(p.id, { type: 'turn', rolled: this.rolled, error });
      error = undefined;
      const action: Action = ans.action ?? { kind: this.rolled ? 'end' : 'roll' };
      const res = await this.doAction(p, action);
      if (res === 'end') return;
      if (res) error = res;
      this.checkWin(p);
      this.changed();
    }
  }

  private checkWin(p: PlayerState) {
    if (this.phase !== 'main' || p !== this.current) return;
    const vp = this.vp(p);
    if (vp < GOAL) return;
    const hidden = p.dev.filter((d) => d.kind === 'tesoro').length;
    this.winner = { id: p.id, text: `${p.name} llega a ${vp} puntos y se convierte en el alma de la isla.` };
    this.addLog(`${b(p.name)} gana con ${vp} puntos${hidden ? ` (${hidden} de tesoros escondidos)` : ''}.`, 'end');
    this.addFx({ kind: 'win', player: p.id });
    this.changed();
    throw new GameOver();
  }

  /** Devuelve 'end' al terminar el turno, un texto de error o '' si todo fue bien. */
  private async doAction(p: PlayerState, a: Action): Promise<string> {
    const t = this.table;
    const needRoll = () => (this.rolled ? '' : 'Primero tira los dados.');
    switch (a.kind) {
      case 'roll':
        if (this.rolled) return 'Ya has tirado los dados este turno.';
        await this.roll(p);
        return '';
      case 'end':
        if (!this.rolled) return 'Tira los dados antes de pasar el turno.';
        return 'end';
      case 'road': {
        const err = needRoll();
        if (err) return err;
        if (p.left.camino <= 0) return 'No te quedan caminos.';
        if (!has(p.res, COST.camino)) return 'Un camino cuesta 1 madera y 1 arcilla.';
        if (!canRoad(t, p.id, a.edge)) return 'Ahí no puedes construir un camino.';
        this.place(p, 'camino', a.edge, false);
        this.addLog(`${b(p.name)} construye un camino.`);
        return '';
      }
      case 'cabana': {
        const err = needRoll();
        if (err) return err;
        if (p.left.cabana <= 0) return 'No te quedan cabañas: mejora alguna a villa.';
        if (!has(p.res, COST.cabana)) return 'Una cabaña cuesta madera, arcilla, lana y trigo.';
        if (!canCabana(t, p.id, a.vertex)) return 'Ahí no puedes construir una cabaña.';
        this.place(p, 'cabana', a.vertex, false);
        this.addLog(`${b(p.name)} construye una cabaña.`, 'good');
        return '';
      }
      case 'villa': {
        const err = needRoll();
        if (err) return err;
        if (p.left.villa <= 0) return 'No te quedan villas.';
        if (!has(p.res, COST.villa)) return 'Una villa cuesta 2 trigo y 3 piedra.';
        if (!villaSpots(t, p.id).includes(a.vertex)) return 'Sólo puedes mejorar tus propias cabañas.';
        this.place(p, 'villa', a.vertex, false);
        this.addLog(`${b(p.name)} convierte una cabaña en villa.`, 'good');
        return '';
      }
      case 'buy': {
        const err = needRoll();
        if (err) return err;
        if (!this.devDeck.length) return 'Ya no quedan cartas de aldea.';
        if (!has(p.res, COST.carta)) return 'Una carta de aldea cuesta lana, trigo y piedra.';
        pay(p.res, COST.carta);
        gain(this.bank, COST.carta);
        const card = this.devDeck.pop()!;
        card.bought = this.turnCount;
        p.dev.push(card);
        this.addLog(`${b(p.name)} compra una carta de aldea.`);
        this.addLog(`Te ha tocado: ${b(DEV_INFO[card.kind].name)}.`, 'good', [p.id]);
        this.addFx({ kind: 'buy', player: p.id, card: card.kind, secret: [p.id] });
        return '';
      }
      case 'bank': {
        const err = needRoll();
        if (err) return err;
        if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get) return 'Cambio no válido.';
        const ratio = bankRatio(t, p.id, a.give);
        if (p.res[a.give] < ratio) return `Necesitas ${ratio} de ${RES_INFO[a.give].one} para ese cambio.`;
        if (this.bank[a.get] <= 0) return `En el granero no queda ${RES_INFO[a.get].one}.`;
        p.res[a.give] -= ratio;
        this.bank[a.give] += ratio;
        p.res[a.get]++;
        this.bank[a.get]--;
        this.addLog(`${b(p.name)} cambia ${ratio} ${RES_INFO[a.give].one} por 1 ${RES_INFO[a.get].one} en el granero.`);
        this.addFx({ kind: 'bank', player: p.id, give: { [a.give]: ratio }, get: { [a.get]: 1 } });
        return '';
      }
      case 'offer': {
        const err = needRoll();
        if (err) return err;
        const give = clean(a.give);
        const want = clean(a.want);
        if (!total(give) || !total(want)) return 'Elige qué das y qué pides.';
        if (RES.some((k) => (give[k] ?? 0) > 0 && (want[k] ?? 0) > 0)) return 'No puedes dar y pedir el mismo recurso.';
        if (!has(p.res, give)) return 'No tienes lo que ofreces.';
        if (this.offers >= MAX_OFFERS) return 'Ya has hecho muchas ofertas este turno.';
        this.offers++;
        await this.runTrade(p, give, want);
        return '';
      }
      case 'dev':
        return this.playDev(p, a.card, a.res ?? []);
      default:
        return 'Acción desconocida.';
    }
  }

  private place(p: PlayerState, piece: Piece, at: number, free: boolean) {
    if (!free) {
      pay(p.res, COST[piece]);
      gain(this.bank, COST[piece]);
    }
    if (piece === 'camino') {
      this.roads.set(at, p.id);
      p.left.camino--;
    } else if (piece === 'cabana') {
      this.buildings.set(at, { owner: p.id, kind: 'cabana' });
      p.left.cabana--;
    } else {
      this.buildings.set(at, { owner: p.id, kind: 'villa' });
      p.left.villa--;
      p.left.cabana++;
    }
    this.addFx({ kind: 'build', player: p.id, piece, at });
    if (piece !== 'villa') this.updateLongest();
  }

  private updateLongest() {
    for (const p of this.players) p.roadLen = longestRoad(this.table, p.id);
    const max = Math.max(...this.players.map((p) => p.roadLen));
    const holder = this.byId(this.longest);
    let next: string | null;
    if (holder && holder.roadLen >= 5 && holder.roadLen === max) next = holder.id;
    else {
      const top = max >= 5 ? this.players.filter((p) => p.roadLen === max) : [];
      next = top.length === 1 ? top[0].id : null;
    }
    if (next === this.longest) return;
    const prev = holder;
    this.longest = next;
    const np = this.byId(next);
    if (np) {
      this.addLog(`${b(np.name)} tiene el ${b('Gran Sendero')} (${np.roadLen} caminos seguidos): +2 puntos.`, 'good');
      this.addFx({ kind: 'bonus', player: np.id, bonus: 'sendero', target: prev?.id });
    } else if (prev) this.addLog(`${b(prev.name)} pierde el Gran Sendero.`, 'bad');
  }

  private updateArmy(p: PlayerState) {
    if (p.dogs < 3 || this.army === p.id) return;
    const holder = this.byId(this.army);
    if (holder && holder.dogs >= p.dogs) return;
    this.army = p.id;
    this.addLog(`${b(p.name)} lidera la ${b('Gran Jauría')} (${p.dogs} perros): +2 puntos.`, 'good');
    this.addFx({ kind: 'bonus', player: p.id, bonus: 'jauria', target: holder?.id });
  }

  // ───────────────────────── dados y cosecha ─────────────────────────

  private async roll(p: PlayerState) {
    const d1 = 1 + Math.floor(this.rnd() * 6);
    const d2 = 1 + Math.floor(this.rnd() * 6);
    this.dice = [d1, d2];
    this.rolled = true;
    const sum = d1 + d2;
    this.addLog(`${b(p.name)} tira los dados: ${b(String(sum))}.`);
    this.addFx({ kind: 'dice', player: p.id, dice: [d1, d2] });
    this.changed();
    await this.pause(1250);
    if (sum === 7) await this.seven(p);
    else this.produce(sum);
  }

  private produce(sum: number) {
    type Claim = { pid: string; res: Res; amt: number; hex: number };
    const claims: Claim[] = [];
    let robbed = false;
    for (const hex of this.board.hexes) {
      if (hex.num !== sum || hex.terrain === 'duna') continue;
      if (hex.id === this.robber) {
        if (hex.verts.some((v) => this.buildings.has(v))) robbed = true;
        continue;
      }
      for (const v of hex.verts) {
        const bd = this.buildings.get(v);
        if (bd) claims.push({ pid: bd.owner, res: hex.terrain, amt: bd.kind === 'villa' ? 2 : 1, hex: hex.id });
      }
    }
    const got = new Map<string, ResMap>();
    for (const res of RES) {
      const cs = claims.filter((c) => c.res === res);
      if (!cs.length) continue;
      const demand = cs.reduce((s, c) => s + c.amt, 0);
      const owners = new Set(cs.map((c) => c.pid));
      let give = cs;
      if (this.bank[res] < demand) {
        if (owners.size > 1 || this.bank[res] === 0) {
          this.addLog(`No queda bastante ${RES_INFO[res].one} en el granero: nadie la recibe.`, 'bad');
          continue;
        }
        let left = this.bank[res];
        give = cs.map((c) => {
          const amt = Math.min(c.amt, left);
          left -= amt;
          return { ...c, amt };
        });
      }
      for (const c of give) {
        if (!c.amt) continue;
        const p = this.byId(c.pid)!;
        p.res[res] += c.amt;
        this.bank[res] -= c.amt;
        const m = got.get(c.pid) ?? emptyRes();
        m[res] += c.amt;
        got.set(c.pid, m);
        this.addFx({ kind: 'produce', player: c.pid, hex: c.hex, res, amount: c.amt });
      }
    }
    if (robbed) this.addLog('El zorro se zampa la cosecha de su casilla.', 'bad');
    if (!got.size) this.addLog('Esta vez no cosecha nadie.');
    for (const [pid, m] of got) this.addLog(`${b(this.byId(pid)!.name)} recibe ${resList(m)}.`, 'good');
  }

  private async seven(p: PlayerState) {
    this.addLog(`¡Un ${b('siete')}! El zorro sale de su madriguera.`, 'bad');
    const victims = this.players.filter((q) => total(q.res) > 7);
    await Promise.all(
      victims.map(async (q) => {
        const count = Math.floor(total(q.res) / 2);
        const ans = await this.ask(q.id, { type: 'discard', count });
        const chosen = this.fixDiscard(q, ans.res ?? {}, count);
        pay(q.res, chosen);
        gain(this.bank, chosen);
        this.addLog(`${b(q.name)} pierde ${count} recursos.`, 'bad');
        this.addFx({ kind: 'discard', player: q.id, amount: count, give: chosen });
        this.changed();
      }),
    );
    await this.moveRobber(p, 'siete');
  }

  private fixDiscard(q: PlayerState, want: Partial<ResMap>, count: number): ResMap {
    const out = emptyRes();
    let n = 0;
    for (const k of RES) {
      const c = Math.max(0, Math.min(q.res[k], Math.floor(Number(want[k] ?? 0))));
      const take = Math.min(c, count - n);
      out[k] = take;
      n += take;
    }
    // si faltan, se completan al azar
    while (n < count) {
      const pool = RES.filter((k) => q.res[k] - out[k] > 0);
      if (!pool.length) break;
      out[pool[Math.floor(this.rnd() * pool.length)]]++;
      n++;
    }
    return out;
  }

  private async moveRobber(p: PlayerState, reason: 'siete' | 'perro') {
    const ans = await this.ask(p.id, { type: 'robber', reason });
    let h = ans.hex;
    if (h === undefined || h === this.robber || !this.board.hexes[h]) {
      const others = this.board.hexes.filter((x) => x.id !== this.robber);
      h = others[Math.floor(this.rnd() * others.length)].id;
    }
    this.robber = h;
    const hex = this.board.hexes[h];
    const place = hex.terrain === 'duna' ? 'a las dunas' : `${hex.terrain === 'piedra' ? 'a la' : 'al'} ${RES_INFO[hex.terrain].terrain.toLowerCase()} del ${hex.num}`;
    this.addLog(`${b(p.name)} lleva al zorro ${place}.`);
    this.addFx({ kind: 'robber', player: p.id, hex: h });
    this.changed();
    await this.pause(700);

    const targets = [...new Set(hex.verts.map((v) => this.buildings.get(v)?.owner).filter((o): o is string => !!o && o !== p.id))].filter(
      (id) => total(this.byId(id)!.res) > 0,
    );
    if (!targets.length) return;
    let victim = targets[0];
    if (targets.length > 1) {
      const a = await this.ask(p.id, { type: 'steal', targets });
      if (a.target && targets.includes(a.target)) victim = a.target;
    }
    const v = this.byId(victim)!;
    const pool: Res[] = [];
    for (const k of RES) for (let i = 0; i < v.res[k]; i++) pool.push(k);
    const res = pool[Math.floor(this.rnd() * pool.length)];
    v.res[res]--;
    p.res[res]++;
    this.addLog(`El zorro le roba un recurso a ${b(v.name)} para ${b(p.name)}.`);
    this.addLog(`Se lleva 1 ${b(RES_INFO[res].one)}.`, 'info', [p.id, v.id]);
    this.addFx({ kind: 'steal', player: p.id, target: v.id, res, secret: [p.id, v.id] });
  }

  // ───────────────────────── cartas de aldea ─────────────────────────

  private async playDev(p: PlayerState, kind: DevKind, res: Res[]): Promise<string> {
    if (this.devPlayed) return 'Sólo puedes jugar una carta de aldea por turno.';
    if (kind === 'tesoro') return 'Los tesoros no se juegan: cuentan solos.';
    const card = p.dev.find((d) => d.kind === kind && d.bought < this.turnCount);
    if (!card) return p.dev.some((d) => d.kind === kind) ? 'Espera al próximo turno para usar la carta que acabas de comprar.' : 'No tienes esa carta.';
    if (kind === 'cosecha') {
      if (res.length !== 2 || !res.every((r) => RES.includes(r))) return 'Elige dos recursos.';
      const need = emptyRes();
      for (const r of res) need[r]++;
      if (!has(this.bank, need)) return 'El granero no tiene esos recursos.';
    }
    if (kind === 'mercader' && (!res[0] || !RES.includes(res[0]))) return 'Elige un recurso.';
    if (kind === 'cuadrilla' && (p.left.camino <= 0 || !roadSpots(this.table, p.id).length)) return 'No tienes dónde construir caminos.';
    p.dev = p.dev.filter((d) => d !== card);
    this.devPlayed = true;
    this.addLog(`${b(p.name)} juega ${b(DEV_INFO[kind].name)}.`, 'info');
    this.addFx({ kind: 'dev', player: p.id, card: kind });
    this.changed();
    await this.pause(500);

    if (kind === 'perro') {
      p.dogs++;
      this.updateArmy(p);
      await this.moveRobber(p, 'perro');
    } else if (kind === 'cuadrilla') {
      for (let i = 0; i < 2; i++) {
        const spots = roadSpots(this.table, p.id);
        if (p.left.camino <= 0 || !spots.length) break;
        const a = await this.ask(p.id, { type: 'freeRoad', left: 2 - i });
        const e = a.edge !== undefined && spots.includes(a.edge) ? a.edge : spots[0];
        this.place(p, 'camino', e, true);
        this.changed();
      }
      this.addLog(`${b(p.name)} abre dos caminos nuevos.`);
    } else if (kind === 'cosecha') {
      const got = emptyRes();
      for (const r of res) got[r]++;
      pay(this.bank, got);
      gain(p.res, got);
      this.addLog(`${b(p.name)} coge ${resList(got)} del granero.`, 'good');
      this.addFx({ kind: 'gain', player: p.id, get: got });
    } else if (kind === 'mercader') {
      const r = res[0];
      let n = 0;
      for (const o of this.players) {
        if (o === p || !o.res[r]) continue;
        const c = o.res[r];
        o.res[r] = 0;
        p.res[r] += c;
        n += c;
        this.addFx({ kind: 'gain', player: p.id, target: o.id, get: { [r]: c } });
      }
      this.addLog(`${b(p.name)} se queda con toda la ${RES_INFO[r].one} de la isla: ${n}.`, n ? 'good' : 'info');
    }
    return '';
  }

  // ───────────────────────── comercio entre jugadores ─────────────────────────

  private async runTrade(p: PlayerState, give: Partial<ResMap>, want: Partial<ResMap>) {
    const others = this.players.filter((o) => o !== p);
    const trade: Trade = {
      id: this.tradeSeq++,
      from: p.id,
      give,
      want,
      responses: Object.fromEntries(others.map((o) => [o.id, 'pending' as const])),
    };
    this.trade = trade;
    this.addLog(`${b(p.name)} ofrece ${resList(give)} a cambio de ${resList(want)}.`, 'info');
    // a quien no tiene lo que se pide ni se le pregunta
    const able = others.filter((o) => has(o.res, want));
    for (const o of others) if (!able.includes(o)) trade.responses[o.id] = 'reject';
    const asks = able.map((o) => this.request(o.id, { type: 'offer', from: p.id, give, want }));
    const responses = asks.map((r, i) => {
      const o = able[i];
      const late = this.timer(OFFER_TIMEOUT).then(() => {
        r.cancel();
        return { accept: false } as Answer;
      });
      return Promise.race([r.promise, late]).then((a) => {
        if (this.trade !== trade) return;
        trade.responses[o.id] = a.accept && has(o.res, want) ? 'accept' : 'reject';
        this.changed();
      });
    });
    const allDone = Promise.all(responses);
    const st: { picked: string | null | undefined } = { picked: undefined };

    if (p.isBot) {
      await allDone;
      const acc = others.filter((o) => trade.responses[o.id] === 'accept').sort((x, y) => this.vp(x) - this.vp(y));
      st.picked = acc[0]?.id ?? null;
    } else {
      const wait = this.request(p.id, { type: 'tradeWait' });
      const picked = wait.promise.then((a) => {
        st.picked = a.partner ?? null;
      });
      await Promise.race([picked, allDone]);
      if (st.picked === undefined) {
        if (Object.values(trade.responses).includes('accept')) await picked;
        else {
          wait.cancel();
          st.picked = null;
        }
      }
      for (const r of asks) r.cancel();
    }

    const partner = st.picked ? this.byId(st.picked) : undefined;
    if (partner && trade.responses[partner.id] === 'accept' && has(p.res, give) && has(partner.res, want)) {
      pay(p.res, give);
      gain(partner.res, give);
      pay(partner.res, want);
      gain(p.res, want);
      this.addLog(`${b(p.name)} y ${b(partner.name)} cierran el trato.`, 'good');
      this.addFx({ kind: 'trade', player: p.id, target: partner.id, give, get: want });
    } else if (Object.values(trade.responses).includes('accept')) this.addLog(`${b(p.name)} retira la oferta.`);
    else this.addLog('Nadie acepta el trato.');
    this.trade = null;
    this.changed();
    await this.pause(300);
  }
}

function clean(r: Partial<ResMap> | undefined): Partial<ResMap> {
  const out: Partial<ResMap> = {};
  for (const k of RES) {
    const v = Math.floor(Number(r?.[k] ?? 0));
    if (v > 0) out[k] = Math.min(v, 19);
  }
  return out;
}

export type { Res };
