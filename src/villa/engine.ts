// Motor de Villa Moneda. Lo ejecuta el anfitrión: pregunta a cada jugador (persona o bot)
// con `ask` y avisa de cada cambio con `onChange`. Las elecciones y la elección de
// personaje preguntan a todos a la vez.
import type {
  Action,
  Answer,
  Auction,
  CardId,
  Election,
  Fx,
  LogEntry,
  Mode,
  NewsId,
  Owned,
  PartyId,
  Phase,
  PlayerState,
  Prompt,
  PromptReq,
  TradeSide,
  Winner,
} from './types';
import type { SeatInfo } from '../net/protocol';
import { shuffle } from '../game/rng';
import {
  AUCTION_FEE,
  BOARD,
  BOARD_SIZE,
  BOLSA_BET,
  CARDS,
  CARD_IDS,
  CHARACTERS,
  CHAR_IDS,
  DONATIONS,
  ELECTION_ROUNDS,
  GROUPS,
  JAIL_FINE,
  JAIL_SPACE,
  LOAN,
  LOAN_INTEREST,
  MAGNATE_GOAL,
  MAYOR_PAY,
  MAYOR_PERKS,
  MODES,
  NEWS,
  NEWS_IDS,
  PARTIES,
  PARTY_IDS,
  PLAZA_SPACE,
  PROPERTIES,
  REFERENDUM_COST,
  SEAT_BONUS,
  TAXI_FARE,
  START_CASH,
  VOTE_BASE,
  ahead,
  attractionIncome,
  inflation,
  buildCost,
  buyPrice,
  canBuild,
  groupSpaces,
  isProperty,
  kindSpaces,
  liquidity,
  maxLoans,
  metroFare,
  money,
  otherMetro,
  paysInterest,
  rentFor,
  salary,
  sellBuildingValue,
  sellPropValue,
  worth,
  type Ctx,
} from './rules';

export class GameOver extends Error {}

export interface VillaOptions {
  ask: (req: PromptReq) => Promise<Answer>;
  cancel?: (promptId: number) => void;
  onChange: () => void;
  /** pausa para que se vean las animaciones */
  pause?: (ms: number) => Promise<void>;
  rnd?: () => number;
  /** modo de juego (rápida por defecto) */
  mode?: Mode;
  /** sólo para simulaciones: cambia el tope de rondas del modo */
  maxRounds?: number;
}

const b = (s: string) => `**${s}**`;
const MAX_TRADES = 3;

export class VillaGame {
  mode: Mode;
  players: PlayerState[];
  owned = new Map<number, Owned>();
  /** propiedades cortadas por una manifestación → dueño (hasta que vuelva a jugar) */
  closed = new Map<number, string>();
  auction: Auction | null = null;
  turnIdx = 0;
  phase: Phase = 'choose';
  round = 0;
  maxRounds: number;
  dice: [number, number] | null = null;
  doubles = 0;
  pot = 0;
  news: NewsId | null = null;
  party: PartyId | null = null;
  mayor: string | null = null;
  election: Election | null = null;
  prompts: PromptReq[] = [];
  log: LogEntry[] = [];
  fx: Fx[] = [];
  winner: Winner | null = null;
  turnCount = 0;
  trades = 0;
  /** tratos rechazados: «quién>a quién:propiedades» → ronda (para que los bots no insistan) */
  rejected = new Map<string, number>();
  rnd: () => number;
  private deck: CardId[] = [];
  private newsDeck: NewsId[] = [];
  private seq = 1;
  private promptSeq = 1;

  constructor(seats: SeatInfo[], private opts: VillaOptions) {
    this.rnd = opts.rnd ?? Math.random;
    this.mode = opts.mode && MODES[opts.mode] ? opts.mode : 'rapida';
    this.maxRounds = opts.maxRounds ?? MODES[this.mode].maxRounds;
    const order = shuffle([...seats], this.rnd);
    this.players = order.map((s, i) => ({
      id: s.id,
      name: s.name,
      isBot: s.isBot,
      connected: true,
      color: i,
      char: null,
      cash: START_CASH + i * SEAT_BONUS,
      pos: 0,
      loans: 0,
      jail: 0,
      freeCards: 0,
      taxi: true,
      taxiLaps: 0,
      bankrupt: false,
      out: 0,
    }));
  }

  // ───────────────────────── utilidades ─────────────────────────

  get ctx(): Ctx {
    return { owned: this.owned, news: this.news, party: this.party, charOf: (id) => this.byId(id)?.char ?? null, closed: this.closed, boost: inflation(this.mode, this.round) };
  }
  get alive(): PlayerState[] {
    return this.players.filter((p) => !p.bankrupt);
  }
  get goal(): number | null {
    return this.mode === 'magnate' ? MAGNATE_GOAL : null;
  }
  get current(): PlayerState {
    return this.players[this.turnIdx % this.players.length];
  }
  byId(id: string | undefined | null): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }
  worth(p: PlayerState) {
    return worth(this.ctx, p);
  }
  /** En juego por patrimonio; detrás, los quebrados (el último en caer, mejor). */
  ranking() {
    const inGame = this.alive.map((p) => ({ id: p.id, worth: this.worth(p) })).sort((a, c) => c.worth - a.worth);
    const out = this.players.filter((p) => p.bankrupt).sort((a, c) => c.out - a.out).map((p) => ({ id: p.id, worth: 0 }));
    return [...inGame, ...out];
  }
  nextElection(): number | null {
    return ELECTION_ROUNDS.find((r) => r > this.round) ?? null;
  }

  addLog(text: string, kind?: LogEntry['kind']) {
    this.log.push({ id: this.seq++, text, kind });
    if (this.log.length > 240) this.log.splice(0, this.log.length - 240);
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

  private ask(playerId: string, prompt: Prompt): Promise<Answer> {
    const req: PromptReq = { id: this.promptSeq++, playerId, prompt };
    this.prompts.push(req);
    this.changed();
    return this.opts.ask(req).then((a) => {
      this.prompts = this.prompts.filter((p) => p !== req);
      return a ?? {};
    });
  }

  private roll(): [number, number] {
    return [1 + Math.floor(this.rnd() * 6), 1 + Math.floor(this.rnd() * 6)];
  }

  /** Cambia el dinero de un jugador y lo anima. */
  private give(p: PlayerState, amount: number) {
    if (!amount) return;
    p.cash += amount;
    this.addFx({ kind: 'money', player: p.id, amount });
  }

  // ───────────────────────── partida ─────────────────────────

  async run() {
    try {
      await this.chooseCharacters();
      this.phase = 'main';
      this.addLog(`¡Bienvenidos a Villa Moneda! Modo ${b(MODES[this.mode].name)}: ${MODES[this.mode].text}`, 'turn');
      for (;;) {
        this.turnIdx = 0;
        await this.startRound();
        for (; this.turnIdx < this.players.length; this.turnIdx++) await this.playTurn();
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    this.phase = 'over';
    for (const p of [...this.prompts]) this.opts.cancel?.(p.id);
    this.prompts = [];
    this.changed();
  }

  private async chooseCharacters() {
    const pool = shuffle([...CHAR_IDS], this.rnd);
    const answers = await Promise.all(
      this.players.map((p, i) => {
        const options = [pool[(i * 2) % pool.length], pool[(i * 2 + 1) % pool.length]];
        return this.ask(p.id, { type: 'character', options }).then((a) => ({ p, options, a }));
      }),
    );
    for (const { p, options, a } of answers) {
      p.char = a.char && options.includes(a.char) ? a.char : options[0];
      const c = CHARACTERS[p.char];
      this.addLog(`${b(p.name)} juega con ${b(c.name)}, ${c.trade}: ${c.text}`, 'info');
    }
    this.changed();
  }

  private finish(text?: string) {
    const rank = this.ranking();
    const top = rank[0];
    const w = this.byId(top.id)!;
    this.winner = { id: w.id, text: text ?? `${w.name} es la persona más rica de Villa Moneda con ${money(top.worth)} de patrimonio.` };
    this.addLog(this.alive.length === 1 && MODES[this.mode].elimination ? `${b(w.name)} es el último vecino en pie y gana la partida.` : `${b(w.name)} gana con ${money(top.worth)} de patrimonio.`, 'end');
    this.addFx({ kind: 'win', player: w.id });
    this.changed();
    throw new GameOver();
  }

  // ───────────────────────── rondas: noticias, elecciones y alcaldía ─────────────────────────

  private async startRound() {
    if (this.round >= this.maxRounds) {
      this.addLog(`Se acabó la ronda ${this.maxRounds}: ¡recuento de patrimonio!`, 'end');
      this.finish();
    }
    this.round++;
    this.addLog(this.mode === 'rapida' ? `Empieza la ronda ${b(String(this.round))} de ${this.maxRounds}.` : `Empieza la ronda ${b(String(this.round))}.`, 'turn');
    if (this.round > 1 && inflation(this.mode, this.round) > inflation(this.mode, this.round - 1))
      this.addLog(`📈 Inflación: los alquileres suben y ya valen un ${Math.round((inflation(this.mode, this.round) - 1) * 100)} % más que al principio.`, 'news');
    this.news = null;
    let early = false;
    if (this.round >= 2) {
      const id = this.drawNews();
      this.news = id;
      const n = NEWS[id];
      this.addLog(`📰 ${b(n.title)}: ${n.text}`, 'news');
      this.addFx({ kind: 'news', news: id });
      this.changed();
      await this.pause(1800);
      early = id === 'anticipadas';
      await this.applyNews(id);
    }
    if (ELECTION_ROUNDS.includes(this.round) || early) await this.runElection(early && !ELECTION_ROUNDS.includes(this.round) ? 'anticipadas' : 'municipales');
    const m = this.byId(this.mayor);
    if (m && !m.bankrupt) {
      const pay = MAYOR_PAY * (m.char === 'clara' ? 1.5 : 1);
      this.give(m, pay);
      this.addLog(`${b(m.name)} cobra ${money(pay)} de sueldo de alcaldía.`, 'good');
    }
    // taquilla de las atracciones
    for (const p of this.alive) {
      const t = attractionIncome(this.ctx, p.id);
      if (t) {
        this.give(p, t);
        this.addLog(`🎡 ${b(p.name)} cobra ${money(t)} de taquilla.`, 'good');
      }
    }
    this.changed();
  }

  private drawNews(): NewsId {
    if (!this.newsDeck.length) {
      const deck: NewsId[] = [];
      for (const id of NEWS_IDS) for (let i = 0; i < NEWS[id].weight; i++) deck.push(id);
      this.newsDeck = shuffle(deck, this.rnd);
    }
    let id = this.newsDeck.pop()!;
    // no se adelantan elecciones si ya tocan esta ronda o la siguiente
    if (id === 'anticipadas' && (ELECTION_ROUNDS.includes(this.round) || ELECTION_ROUNDS.includes(this.round + 1))) id = 'calma';
    return id;
  }

  private async applyNews(id: NewsId) {
    const alive = this.alive;
    const pepe = (p: PlayerState) => p.char === 'pepe';
    switch (id) {
      case 'dividendos':
        for (const p of alive) {
          const n = [...this.owned.values()].filter((o) => o.owner === p.id).length;
          if (n) this.give(p, n * 10 * (pepe(p) ? 2 : 1));
        }
        break;
      case 'festival':
        for (const p of alive) this.give(p, 50 * (pepe(p) ? 2 : 1));
        break;
      case 'subvencion': {
        const poor = [...alive].sort((a, c) => this.worth(a) - this.worth(c))[0];
        if (poor) {
          this.give(poor, 150 * (pepe(poor) ? 2 : 1));
          this.addLog(`${b(poor.name)} recibe la subvención.`, 'good');
        }
        break;
      }
      case 'loteria': {
        const lucky = alive[Math.floor(this.rnd() * alive.length)];
        if (lucky) {
          this.give(lucky, 150 * (pepe(lucky) ? 2 : 1));
          this.addLog(`¡A ${b(lucky.name)} le toca la lotería!`, 'good');
        }
        break;
      }
      case 'inspeccion':
        for (const p of alive) {
          if (pepe(p)) continue;
          const t = Math.round((p.cash * 0.1) / 5) * 5;
          if (t > 0) {
            this.give(p, -t);
            this.pot += t;
          }
        }
        break;
      case 'tormenta':
        for (const p of alive) {
          if (pepe(p)) continue;
          let cost = 0;
          for (const [, o] of this.owned) if (o.owner === p.id) cost += o.level === 4 ? 50 : o.level * 15;
          if (cost) await this.charge(p, null, cost, 'las reparaciones de la tormenta');
          if (this.phase === 'over') return;
        }
        break;
    }
    this.changed();
  }

  private async runElection(kind: 'municipales' | 'anticipadas' | 'referendum') {
    const alive = this.alive;
    const title = kind === 'referendum' ? 'Referéndum' : kind === 'anticipadas' ? 'Elecciones anticipadas' : 'Elecciones municipales';
    this.addLog(`🗳️ ${title}: cada uno vota en secreto y puede donar a su partido.`, 'vote');
    this.changed();
    const answers = await Promise.all(alive.map((p) => this.ask(p.id, { type: 'vote', early: kind !== 'municipales' }).then((a) => ({ p, a }))));
    const support: Record<PartyId, number> = { rojo: 0, azul: 0, verde: 0, naranja: 0 };
    const votes: Election['votes'] = {};
    const given = new Map<string, number>();
    for (const { p, a } of answers) {
      const party = a.party && PARTY_IDS.includes(a.party) ? a.party : null;
      let donation = DONATIONS.includes(a.donation ?? 0) ? (a.donation ?? 0) : 0;
      if (!party || donation > p.cash) donation = party ? DONATIONS.filter((d) => d <= p.cash).pop()! : 0;
      votes[p.id] = { party, donation };
      if (!party) continue;
      if (donation) this.give(p, -donation);
      const pts = VOTE_BASE + donation * (p.char === 'clara' ? 1.5 : 1);
      support[party] += pts;
      given.set(p.id, pts);
    }
    const best = Math.max(...PARTY_IDS.map((k) => support[k]));
    let winner: PartyId | null = null;
    let mayor: string | null = null;
    if (best > 0) {
      const tied = PARTY_IDS.filter((k) => support[k] === best);
      winner = tied[Math.floor(this.rnd() * tied.length)];
      const backers = alive.filter((p) => votes[p.id]?.party === winner).sort((a, c) => (given.get(c.id) ?? 0) - (given.get(a.id) ?? 0));
      mayor = backers[0]?.id ?? null;
      this.party = winner;
      this.mayor = mayor;
      const pa = PARTIES[winner];
      this.addLog(`Gana el ${b(pa.name)}: ${pa.policy}`, 'vote');
      if (mayor) this.addLog(`${b(this.byId(mayor)!.name)} es ${this.byId(mayor)!.char === 'clara' ? 'la nueva alcaldesa' : 'quien ocupa la alcaldía'} y cobrará ${money(MAYOR_PAY)} cada ronda.`, 'vote');
    } else this.addLog('Nadie ha votado: todo sigue igual.', 'vote');
    this.election = { round: this.round, party: winner, mayor, support, votes };
    this.addFx({ kind: 'election', party: winner, player: mayor ?? undefined });
    this.changed();
    await this.pause(2600);
  }

  // ───────────────────────── turno ─────────────────────────

  private async playTurn() {
    const p = this.current;
    if (p.bankrupt) return;
    this.turnCount++;
    this.doubles = 0;
    this.dice = null;
    this.trades = 0;
    this.addLog(`Turno de ${b(p.name)}.`, 'turn');
    this.addFx({ kind: 'turn', player: p.id });
    // las manifestaciones contra sus propiedades se disuelven cuando vuelve a jugar
    for (const [id, owner] of [...this.closed]) if (owner === p.id) this.closed.delete(id);
    let stage: 'pre' | 'post' = 'pre';
    let error: string | undefined;
    for (;;) {
      if (p.bankrupt) return;
      const ans = await this.ask(p.id, { type: 'turn', stage, error });
      error = undefined;
      const action: Action = ans.action ?? { kind: stage === 'pre' ? 'roll' : 'end' };
      if (action.kind === 'end') {
        if (stage === 'pre') {
          error = 'Primero tira los dados.';
          continue;
        }
        this.checkGoal();
        return;
      }
      if (action.kind === 'roll') {
        if (stage === 'post') {
          error = 'Ya has tirado este turno.';
          continue;
        }
        stage = (await this.rollAndMove(p)) ? 'pre' : 'post';
        this.changed();
        continue;
      }
      error = await this.manage(p, action, stage === 'pre');
      this.changed();
    }
  }

  /** Tira y mueve. Devuelve true si le toca volver a tirar (dobles). */
  private async rollAndMove(p: PlayerState): Promise<boolean> {
    const d = this.roll();
    this.dice = d;
    const isDouble = d[0] === d[1];
    this.addFx({ kind: 'dice', player: p.id, dice: d });
    this.changed();
    await this.pause(900);
    let steps = d[0] + d[1];

    if (p.jail) {
      if (isDouble) {
        p.jail = 0;
        this.addLog(`${b(p.name)} saca dobles y sale de la comisaría.`, 'good');
      } else if (p.jail >= 3) {
        p.jail = 0;
        this.addLog(`${b(p.name)} cumple su tercer turno en la comisaría y paga la multa.`);
        await this.charge(p, 'pot', this.fine(p), 'la multa de la comisaría');
      } else {
        p.jail++;
        this.addLog(`${b(p.name)} no saca dobles y se queda en la comisaría.`);
        return false;
      }
      await this.moveBy(p, steps);
      await this.land(p, steps);
      return false;
    }

    let double = isDouble;
    if (p.char === 'lola' && p.taxi && p.cash >= TAXI_FARE) {
      const a = await this.ask(p.id, { type: 'adjust', roll: steps, to: (p.pos + steps) % BOARD_SIZE });
      if (a.accept) {
        p.taxi = false;
        this.give(p, -TAXI_FARE);
        this.pot += TAXI_FARE;
        const d2 = this.roll();
        this.dice = d2;
        double = d2[0] === d2[1];
        steps = d2[0] + d2[1];
        this.addLog(`${b(p.name)} da otra vuelta a la manzana y vuelve a tirar: ${steps}.`, 'info');
        this.addFx({ kind: 'dice', player: p.id, dice: d2 });
        this.changed();
        await this.pause(900);
      }
    }
    if (double) {
      this.doubles++;
      if (this.doubles >= 3) {
        this.addLog(`¡${b(p.name)} saca dobles tres veces seguidas y acaba en la comisaría!`, 'bad');
        await this.goToJail(p);
        return false;
      }
    }
    await this.moveBy(p, steps);
    await this.land(p, steps);
    return double && !p.jail && !p.bankrupt;
  }

  /** Modo magnate: gana quien llegue a la meta de patrimonio al terminar un turno. */
  private checkGoal() {
    const goal = this.goal;
    if (!goal) return;
    const rich = this.alive.filter((p) => this.worth(p) >= goal).sort((a, c) => this.worth(c) - this.worth(a))[0];
    if (rich) this.finish(`${rich.name} llega a ${money(this.worth(rich))} de patrimonio y se convierte en el gran magnate de la Villa.`);
  }

  /** Multa para salir de la comisaría (Abel sale gratis cuando quiere). */
  fine(p: PlayerState) {
    return p.char === 'abel' ? 0 : JAIL_FINE;
  }

  private async goToJail(p: PlayerState) {
    this.addFx({ kind: 'move', player: p.id, from: p.pos, to: JAIL_SPACE, jump: true });
    p.pos = JAIL_SPACE;
    p.jail = 1;
    this.addFx({ kind: 'jail', player: p.id });
    const abel = this.players.find((o) => o !== p && o.char === 'abel' && !o.bankrupt);
    if (abel) {
      this.give(abel, 100);
      this.addLog(`${b(abel.name)} cobra ${money(100)} de minuta: alguien necesita un abogado.`, 'good');
    }
    this.changed();
    await this.pause(900);
  }

  /** Avanza (o retrocede) casilla a casilla cobrando si pasa por la Salida. */
  private async moveBy(p: PlayerState, steps: number) {
    const from = p.pos;
    const to = (((from + steps) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
    this.addFx({ kind: 'move', player: p.id, from, to });
    p.pos = to;
    this.changed();
    await this.pause(260 + Math.abs(steps) * 150);
    if (steps > 0 && to < from) await this.passSalida(p);
  }

  /** Salto directo (cartas): cobra la Salida si la cruza hacia delante. */
  private async jumpTo(p: PlayerState, to: number) {
    const from = p.pos;
    this.addFx({ kind: 'move', player: p.id, from, to, jump: true });
    p.pos = to;
    this.changed();
    await this.pause(900);
    if (to < from || to === 0) await this.passSalida(p);
  }

  private async passSalida(p: PlayerState) {
    let pay = salary(this.ctx, p.id);
    if (!p.taxi && ++p.taxiLaps >= 2) {
      p.taxi = true;
      p.taxiLaps = 0;
    }
    const luck = 1 + Math.floor(this.rnd() * 6);
    if (p.char === 'fortu' && luck >= 4) {
      pay *= 2;
      this.addLog(`🍀 ¡A ${b(p.name)} le sale un ${luck} y cobra doble en la Salida!`, 'good');
    }
    this.give(p, pay);
    this.addLog(`${b(p.name)} pasa por la Salida y cobra ${money(pay)}.`, 'good');
    if (p.loans && paysInterest(this.ctx, p.id)) {
      const interest = p.loans * LOAN_INTEREST * (this.news === 'tipos' ? 2 : 1);
      this.addLog(`${b(p.name)} paga ${money(interest)} de intereses por ${p.loans === 1 ? 'su préstamo' : `sus ${p.loans} préstamos`}.`);
      await this.charge(p, null, interest, 'los intereses');
    }
    this.changed();
  }

  // ───────────────────────── casillas ─────────────────────────

  private async land(p: PlayerState, dice: number, doubleRent = false): Promise<void> {
    if (p.bankrupt) return;
    const s = BOARD[p.pos];
    this.changed();
    if (isProperty(s)) {
      const o = this.owned.get(s.id);
      if (!o) return this.offerBuy(p, s.id);
      if (o.owner === p.id) return;
      const owner = this.byId(o.owner)!;
      const rent = rentFor(this.ctx, s.id, p.id, p.cash, dice, doubleRent);
      if (rent <= 0) {
        this.addLog(`${b(p.name)} cae en ${b(s.name)}, de ${b(owner.name)}, pero hoy no paga nada.`);
        return;
      }
      this.addLog(`${b(p.name)} cae en ${b(s.name)} y paga ${money(rent)} a ${b(owner.name)}.`, 'bad');
      await this.charge(p, owner, rent, `el alquiler de ${s.name}`);
      return;
    }
    switch (s.kind) {
      case 'buzon':
        return this.mailbox(p);
      case 'hacienda': {
        const tax = p.char === 'abel' ? s.tax! / 2 : s.tax!;
        this.addLog(`${b(p.name)} paga ${money(tax)} en ${b(s.name)} (al bote de la Plaza).`, 'bad');
        return this.charge(p, 'pot', tax, s.name);
      }
      case 'bolsa':
        return this.bolsa(p);
      case 'plaza':
        if (this.pot > 0) {
          this.addLog(`${b(p.name)} llega a la Plaza Mayor y se lleva el bote: ${money(this.pot)}.`, 'good');
          this.give(p, this.pot);
          this.pot = 0;
        } else this.addLog(`${b(p.name)} descansa en la Plaza Mayor.`);
        return;
      case 'arresto':
        this.addLog(`¡${b(p.name)} va directo a la comisaría!`, 'bad');
        return this.goToJail(p);
      case 'comisaria':
        this.addLog(`${b(p.name)} saluda a los agentes de la comisaría.`);
        return;
      case 'subasta':
        return this.runAuction(p);
      case 'manifestacion':
        return this.protest(p);
      case 'metro':
        return this.metro(p, metroFare(p.char));
      case 'ayuntamiento':
        return this.townHall(p);
    }
  }

  /** Casa de Subastas: el banco subasta una propiedad libre; todos pujan en secreto a la vez. */
  private async runAuction(host: PlayerState) {
    const free = PROPERTIES.filter((id) => !this.owned.has(id));
    if (!free.length) {
      this.give(host, 50);
      this.addLog(`🔨 No queda nada que subastar: ${b(host.name)} cobra ${money(50)} por tasar antigüedades.`, 'good');
      return;
    }
    const id = free[Math.floor(this.rnd() * free.length)];
    const s = BOARD[id];
    const min = Math.max(20, Math.round((s.price! * 0.3) / 5) * 5);
    this.addLog(`🔨 ${b(host.name)} abre una subasta: ${b(s.name)} (precio ${s.price}). Todos pujan en secreto; mínimo ${min}.`, 'info');
    this.addFx({ kind: 'auction', player: host.id, space: id });
    this.changed();
    const order = [...this.alive.slice(this.alive.indexOf(host)), ...this.alive.slice(0, this.alive.indexOf(host))];
    const answers = await Promise.all(order.map((p) => this.ask(p.id, { type: 'bid', space: id, min, host: host.id }).then((a) => ({ p, a }))));
    const bids: Record<string, number> = {};
    let best: { p: PlayerState; bid: number } | null = null;
    for (const { p, a } of answers) {
      if (p.bankrupt) continue;
      const bid = Math.round((a.bid ?? 0) / 5) * 5;
      bids[p.id] = bid >= min && bid <= p.cash ? bid : 0;
      if (bids[p.id] && (!best || bids[p.id] > best.bid)) best = { p, bid: bids[p.id] };
    }
    if (!best || this.owned.has(id)) {
      this.auction = { space: id, winner: null, price: 0, bids };
      this.addLog(`Nadie puja por ${b(s.name)}: sigue a la venta.`);
    } else {
      this.give(best.p, -best.bid);
      this.owned.set(id, { owner: best.p.id, level: 0 });
      this.auction = { space: id, winner: best.p.id, price: best.bid, bids };
      this.addFx({ kind: 'buy', player: best.p.id, space: id });
      this.addLog(`🔨 ¡Adjudicado! ${b(best.p.name)} se lleva ${b(s.name)} por ${money(best.bid)}.`, 'good');
      const fee = Math.round((best.bid * AUCTION_FEE) / 5) * 5;
      if (fee) {
        this.give(host, fee);
        this.addLog(`${b(host.name)} cobra ${money(fee)} de comisión.`, 'good');
      }
    }
    this.changed();
    await this.pause(2200);
  }

  /** Plaza de las Pancartas: una propiedad rival deja de cobrar hasta que su dueño vuelva a jugar. */
  private async protest(p: PlayerState) {
    const targets = [...this.owned].filter(([id, o]) => o.owner !== p.id && !this.closed.has(id)).map(([id]) => id);
    if (!targets.length) {
      this.addLog(`${b(p.name)} llega a la Plaza de las Pancartas, pero no hay nada contra lo que protestar.`);
      return;
    }
    const a = await this.ask(p.id, { type: 'protest', targets });
    const id = a.space !== undefined && targets.includes(a.space) ? a.space : targets[0];
    const owner = this.byId(this.owned.get(id)!.owner)!;
    this.closed.set(id, owner.id);
    this.addFx({ kind: 'protest', player: p.id, space: id });
    this.addLog(`📣 ${b(p.name)} organiza una manifestación en ${b(BOARD[id].name)}: no cobrará alquiler hasta que ${b(owner.name)} vuelva a jugar.`, 'info');
    this.changed();
    await this.pause(900);
  }

  /** Metro: viaje a la otra estación (no pasa por la Salida). */
  private async metro(p: PlayerState, cost: number) {
    if (this.news === 'huelga') {
      this.addLog(`🚇 El metro está cerrado por la huelga.`);
      return;
    }
    if (p.cash < cost) return;
    const to = otherMetro(p.pos);
    const a = await this.ask(p.id, { type: 'metro', to, cost });
    if (!a.accept) return;
    if (cost) this.give(p, -cost);
    this.addFx({ kind: 'move', player: p.id, from: p.pos, to, jump: true });
    p.pos = to;
    this.addLog(`🚇 ${b(p.name)} coge el metro hasta ${b(BOARD[to].name)}${cost ? ` (${money(cost)})` : ''}.`);
    this.changed();
    await this.pause(900);
  }

  /** Ayuntamiento: dietas para quien ocupa la alcaldía; los demás pueden pagar un referéndum. */
  private async townHall(p: PlayerState) {
    if (this.mayor === p.id) {
      this.give(p, MAYOR_PERKS);
      this.addLog(`🏛️ ${b(p.name)} pasa por su despacho y cobra ${money(MAYOR_PERKS)} de dietas.`, 'good');
      return;
    }
    const cost = p.char === 'clara' ? 0 : REFERENDUM_COST;
    if (p.cash < cost) {
      this.addLog(`🏛️ ${b(p.name)} visita el Ayuntamiento.`);
      return;
    }
    const a = await this.ask(p.id, { type: 'referendum', cost });
    if (!a.accept) {
      this.addLog(`🏛️ ${b(p.name)} visita el Ayuntamiento.`);
      return;
    }
    if (cost) {
      this.give(p, -cost);
      this.pot += cost;
    }
    this.addLog(`🏛️ ${b(p.name)} convoca un referéndum${cost ? ` (${money(cost)} al bote)` : ''}.`, 'vote');
    await this.runElection('referendum');
  }

  private async offerBuy(p: PlayerState, id: number) {
    const s = BOARD[id];
    const price = buyPrice(s, p.char);
    const room = p.cash + (maxLoans(p.char) - p.loans) * LOAN;
    if (room < price) {
      this.addLog(`${b(p.name)} cae en ${b(s.name)}, pero no le llega para comprarla.`);
      return;
    }
    const a = await this.ask(p.id, { type: 'buy', space: id, price });
    if (!a.accept || this.owned.has(id)) {
      this.addLog(`${b(p.name)} pasa de comprar ${b(s.name)}.`);
      return;
    }
    while (p.cash < price && p.loans < maxLoans(p.char)) this.takeLoan(p);
    if (p.cash < price) return;
    this.give(p, -price);
    this.owned.set(id, { owner: p.id, level: 0 });
    this.addFx({ kind: 'buy', player: p.id, space: id });
    this.addLog(`${b(p.name)} compra ${b(s.name)} por ${money(price)}.`, 'good');
    this.changed();
    await this.pause(500);
  }

  private async bolsa(p: PlayerState) {
    if (p.cash < BOLSA_BET) {
      this.addLog(`${b(p.name)} mira los números de la Bolsa, pero no tiene para invertir.`);
      return;
    }
    const a = await this.ask(p.id, { type: 'bolsa' });
    if (!a.accept) {
      this.addLog(`${b(p.name)} prefiere no invertir en Bolsa.`);
      return;
    }
    const die = 1 + Math.floor(this.rnd() * 6);
    this.addFx({ kind: 'dice', player: p.id, dice: [die, 0] });
    this.changed();
    await this.pause(900);
    if (die <= 2) {
      this.give(p, -BOLSA_BET);
      this.addLog(`📉 Sale un ${die}: ${b(p.name)} pierde los ${money(BOLSA_BET)} invertidos.`, 'bad');
    } else if (die <= 4) this.addLog(`Sale un ${die}: ${b(p.name)} recupera lo invertido.`);
    else {
      this.give(p, 150);
      this.addLog(`📈 ¡Sale un ${die}! ${b(p.name)} gana ${money(150)} en Bolsa.`, 'good');
    }
  }

  private drawCard(): CardId {
    if (!this.deck.length) this.deck = shuffle([...CARD_IDS], this.rnd);
    return this.deck.pop()!;
  }

  private async mailbox(p: PlayerState): Promise<void> {
    let card = this.drawCard();
    if (p.char === 'fortu') {
      const other = this.drawCard();
      const a = await this.ask(p.id, { type: 'pickCard', cards: [card, other] });
      const keep = a.card === other ? other : card;
      const back = keep === card ? other : card;
      this.deck.unshift(back);
      card = keep;
    }
    const c = CARDS[card];
    this.addLog(`📮 ${b(p.name)} abre el buzón: ${b(c.title)}. ${c.text}`, 'info');
    this.addFx({ kind: 'card', player: p.id, card });
    this.changed();
    await this.pause(1300);
    const others = this.players.filter((o) => o !== p && !o.bankrupt);
    switch (card) {
      case 'salida':
        return this.jumpTo(p, 0);
      case 'comisaria':
        return this.goToJail(p);
      case 'libre':
        p.freeCards++;
        return;
      case 'atras':
        await this.moveBy(p, -3);
        return this.land(p, this.dice ? this.dice[0] + this.dice[1] : 7);
      case 'transporte': {
        const targets = kindSpaces('transporte');
        const to = targets.sort((x, y) => ahead(p.pos, x) - ahead(p.pos, y))[0];
        await this.jumpTo(p, to);
        return this.land(p, 7, true);
      }
      case 'plaza':
        await this.jumpTo(p, PLAZA_SPACE);
        return this.land(p, 7);
      case 'metro': {
        const to = kindSpaces('metro').sort((x, y) => ahead(p.pos, x) - ahead(p.pos, y))[0];
        await this.jumpTo(p, to);
        return this.metro(p, 0);
      }
      case 'luna':
        await this.jumpTo(p, 39);
        return this.land(p, 7);
      case 'herencia':
        return this.give(p, 100);
      case 'error':
        return this.give(p, 75);
      case 'tartas':
        return this.give(p, 50);
      case 'devolucion':
        return this.give(p, 60);
      case 'multa':
        return this.charge(p, 'pot', p.char === 'abel' ? 20 : 40, 'la multa');
      case 'veterinario':
        return this.charge(p, 'pot', 50, 'el veterinario');
      case 'reparaciones': {
        let cost = 0;
        for (const [, o] of this.owned) if (o.owner === p.id) cost += o.level === 4 ? 75 : o.level * 25;
        if (cost) return this.charge(p, null, cost, 'las goteras');
        return;
      }
      case 'cumple':
        for (const o of others) {
          await this.charge(o, p, 20, 'el regalo de cumpleaños');
          if (this.phase === 'over') return;
        }
        return;
      case 'ronda':
        for (const o of others) {
          await this.charge(p, o, 15, 'la merienda');
          if (p.bankrupt) return;
        }
        return;
    }
  }

  // ───────────────────────── pagos, deudas y quiebra ─────────────────────────

  /** Cobra `amount` a `p` para `to` (un jugador, el bote o el banco si es null). Si no le llega, tendrá que reunirlo. */
  async charge(p: PlayerState, to: PlayerState | 'pot' | null, amount: number, reason: string) {
    amount = Math.round(amount);
    if (amount <= 0 || p.bankrupt) return;
    if (p.cash < amount) {
      const ok = await this.raise(p, amount, to, reason);
      if (!ok) return this.bankrupt(p, to, amount);
    }
    this.give(p, -amount);
    if (to === 'pot') this.pot += amount;
    else if (to) this.give(to, amount);
    this.changed();
  }

  /** Pide al jugador que venda o se endeude hasta tener `amount`. Devuelve false si quiebra. */
  private async raise(p: PlayerState, amount: number, to: PlayerState | 'pot' | null, reason: string): Promise<boolean> {
    let error: string | undefined;
    for (let guard = 0; guard < 60; guard++) {
      if (p.cash >= amount) return true;
      if (liquidity(this.ctx, p) < amount) return false;
      const a = await this.ask(p.id, { type: 'debt', amount, to: to && to !== 'pot' ? to.id : null, reason, error });
      error = undefined;
      const act = a.action;
      if (!act || act.kind === 'bankrupt') {
        if (act?.kind === 'bankrupt') return false;
        // sin respuesta: se pide préstamo o se vende lo menos valioso
        this.autoRaise(p);
        continue;
      }
      if (act.kind === 'pay') {
        if (p.cash < amount) error = `Aún te faltan ${money(amount - p.cash)}.`;
        continue;
      }
      if (act.kind === 'loan' || act.kind === 'sellBuilding' || act.kind === 'sellProp') error = await this.manage(p, act, false);
      else error = 'Ahora sólo puedes vender o pedir préstamos.';
      this.changed();
    }
    while (p.cash < amount && this.autoRaise(p));
    return p.cash >= amount;
  }

  /** Reúne dinero automáticamente: préstamo, luego edificios, luego propiedades. */
  autoRaise(p: PlayerState): boolean {
    if (p.loans < maxLoans(p.char)) {
      this.takeLoan(p);
      return true;
    }
    const mine = [...this.owned].filter(([, o]) => o.owner === p.id);
    const built = mine.filter(([, o]) => o.level > 0).sort((x, y) => BOARD[x[0]].price! - BOARD[y[0]].price!)[0];
    if (built) {
      this.sellBuilding(p, built[0]);
      return true;
    }
    const prop = mine.sort((x, y) => BOARD[x[0]].price! - BOARD[y[0]].price!)[0];
    if (prop) {
      this.sellProp(p, prop[0]);
      return true;
    }
    return false;
  }

  private bankrupt(p: PlayerState, to: PlayerState | 'pot' | null, amount: number) {
    if (MODES[this.mode].elimination) return this.eliminate(p, to, amount);
    // el acreedor se queda con lo que se pueda sacar de sus bienes (sin préstamos nuevos)
    let value = p.cash;
    for (const [id, o] of this.owned) if (o.owner === p.id) value += sellPropValue(BOARD[id], o.level);
    const paid = Math.min(value, amount);
    if (to && to !== 'pot') this.give(to, paid);
    for (const [id, o] of [...this.owned]) if (o.owner === p.id) this.owned.delete(id);
    p.cash = 0;
    p.bankrupt = true;
    this.addFx({ kind: 'bankrupt', player: p.id });
    this.addLog(`💸 ${b(p.name)} no puede pagar ${money(amount)} y ${b('quiebra')}.`, 'end');
    this.changed();
    this.finish();
  }

  /** Modos con eliminación: quien quiebra sale; sus bienes pasan a quien le arruinó (o vuelven al banco). */
  private eliminate(p: PlayerState, to: PlayerState | 'pot' | null, amount: number) {
    const creditor = to && to !== 'pot' && !to.bankrupt ? to : null;
    if (creditor && p.cash > 0) this.give(creditor, p.cash);
    let n = 0;
    for (const [id, o] of [...this.owned]) {
      if (o.owner !== p.id) continue;
      n++;
      this.closed.delete(id);
      if (creditor) {
        o.owner = creditor.id;
        this.addFx({ kind: 'buy', player: creditor.id, space: id });
      } else this.owned.delete(id);
    }
    p.cash = 0;
    p.loans = 0;
    p.jail = 0;
    p.bankrupt = true;
    p.out = this.round;
    if (this.mayor === p.id) this.mayor = null;
    this.addFx({ kind: 'bankrupt', player: p.id });
    this.addLog(
      `💸 ${b(p.name)} no puede pagar ${money(amount)} y ${b('queda eliminado')}.` +
        (n ? (creditor ? ` Sus propiedades pasan a ${b(creditor.name)}.` : ' Sus propiedades vuelven al banco.') : ''),
      'end',
    );
    this.changed();
    if (this.alive.length <= 1) this.finish(`${this.alive[0]?.name ?? 'Nadie'} es el último vecino en pie: ¡toda la Villa es suya!`);
  }

  // ───────────────────────── gestión (construir, vender, préstamos, tratos) ─────────────────────────

  takeLoan(p: PlayerState) {
    p.loans++;
    this.give(p, LOAN);
    this.addLog(`${b(p.name)} pide un préstamo de ${money(LOAN)} (lleva ${p.loans}).`, 'info');
  }

  private sellBuilding(p: PlayerState, id: number) {
    const o = this.owned.get(id)!;
    const v = sellBuildingValue(BOARD[id]);
    o.level--;
    this.give(p, v);
    this.addFx({ kind: 'sell', player: p.id, space: id, level: o.level });
    this.addLog(`${b(p.name)} vende ${o.level === 3 ? 'el edificio' : 'una casa'} de ${b(BOARD[id].name)} por ${money(v)}.`);
  }

  private sellProp(p: PlayerState, id: number) {
    const o = this.owned.get(id)!;
    const v = sellPropValue(BOARD[id], o.level);
    this.owned.delete(id);
    this.give(p, v);
    this.addFx({ kind: 'sell', player: p.id, space: id, level: -1 });
    this.addLog(`${b(p.name)} vende ${b(BOARD[id].name)} al banco por ${money(v)}.`);
  }

  /** Acciones de gestión. Devuelve un texto de error o ''. */
  private async manage(p: PlayerState, a: Action, pre: boolean): Promise<string> {
    switch (a.kind) {
      case 'build': {
        const s = BOARD[a.space];
        if (!s || !canBuild(this.ctx, p.id, a.space)) return 'Para construir necesitas todo el barrio (y no pasar del edificio).';
        const cost = buildCost(this.ctx, s, p.id);
        if (p.cash < cost) return `Construir ahí cuesta ${money(cost)}.`;
        const o = this.owned.get(a.space)!;
        o.level++;
        this.give(p, -cost);
        this.addFx({ kind: 'build', player: p.id, space: a.space, level: o.level });
        this.addLog(`${b(p.name)} construye ${o.level === 4 ? 'un edificio' : 'una casa'} en ${b(s.name)} por ${money(cost)}.`, 'good');
        const rita = this.players.find((x) => x !== p && x.char === 'rita' && !x.bankrupt);
        if (rita) this.give(rita, 10);
        return '';
      }
      case 'sellBuilding': {
        const o = this.owned.get(a.space);
        if (!o || o.owner !== p.id || o.level <= 0) return 'Ahí no tienes nada construido.';
        this.sellBuilding(p, a.space);
        return '';
      }
      case 'sellProp': {
        const o = this.owned.get(a.space);
        if (!o || o.owner !== p.id) return 'Esa propiedad no es tuya.';
        this.sellProp(p, a.space);
        return '';
      }
      case 'loan':
        if (p.loans >= maxLoans(p.char)) return `Ya tienes ${p.loans} préstamos: es el máximo.`;
        this.takeLoan(p);
        return '';
      case 'repay':
        if (!p.loans) return 'No tienes préstamos.';
        if (p.cash < LOAN) return `Devolver un préstamo cuesta ${money(LOAN)}.`;
        p.loans--;
        this.give(p, -LOAN);
        this.addLog(`${b(p.name)} devuelve un préstamo (le quedan ${p.loans}).`, 'info');
        return '';
      case 'jailPay': {
        if (!p.jail) return 'No estás en la comisaría.';
        if (!pre) return 'Ya has tirado este turno.';
        const f = this.fine(p);
        if (p.cash < f) return `La multa es de ${money(f)}.`;
        this.give(p, -f);
        this.pot += f;
        p.jail = 0;
        this.addLog(f ? `${b(p.name)} paga ${money(f)} y sale de la comisaría.` : `${b(p.name)} sale de la comisaría sin pagar: conoce bien la ley.`);
        return '';
      }
      case 'jailCard':
        if (!p.jail) return 'No estás en la comisaría.';
        if (!pre) return 'Ya has tirado este turno.';
        if (!p.freeCards) return 'No tienes ninguna carta para salir.';
        p.freeCards--;
        p.jail = 0;
        this.addLog(`${b(p.name)} usa su carta y sale de la comisaría.`);
        return '';
      case 'trade':
        return this.trade(p, a.to, a.give, a.want);
      default:
        return '';
    }
  }

  private tradeError(p: PlayerState, other: PlayerState, give: TradeSide, want: TradeSide): string {
    const okSide = (who: PlayerState, side: TradeSide) =>
      side.cash >= 0 && side.cash <= who.cash && side.props.every((id) => this.owned.get(id)?.owner === who.id) && new Set(side.props).size === side.props.length;
    if (!okSide(p, give) || !okSide(other, want)) return 'Ese trato ya no es posible.';
    if (!give.props.length && !want.props.length) return 'Un trato tiene que incluir alguna propiedad.';
    for (const id of [...give.props, ...want.props]) {
      const g = BOARD[id].group;
      if (g && groupSpaces(g).some((s) => (this.owned.get(s)?.level ?? 0) > 0)) return `Para cambiar calles de ${GROUPS[g].name} hay que vender antes sus casas.`;
    }
    return '';
  }

  private async trade(p: PlayerState, toId: string, give: TradeSide, want: TradeSide): Promise<string> {
    const other = this.byId(toId);
    if (!other || other === p || other.bankrupt) return 'Elige con quién quieres tratar.';
    give = { props: [...(give?.props ?? [])], cash: Math.max(0, Math.round(give?.cash ?? 0)) };
    want = { props: [...(want?.props ?? [])], cash: Math.max(0, Math.round(want?.cash ?? 0)) };
    const err = this.tradeError(p, other, give, want);
    if (err) return err;
    if (this.trades >= MAX_TRADES) return 'Ya has propuesto 3 tratos este turno.';
    this.trades++;
    this.addLog(`${b(p.name)} propone un trato a ${b(other.name)}.`, 'info');
    const a = await this.ask(other.id, { type: 'tradeOffer', from: p.id, give, want });
    if (!a.accept) {
      this.addLog(`${b(other.name)} rechaza el trato.`);
      this.rejected.set(`${p.id}>${other.id}:${[...want.props].sort((x, y) => x - y).join(',')}`, this.round);
      return '';
    }
    const again = this.tradeError(p, other, give, want);
    if (again) return again;
    for (const id of give.props) this.owned.get(id)!.owner = other.id;
    for (const id of want.props) this.owned.get(id)!.owner = p.id;
    if (give.cash) {
      this.give(p, -give.cash);
      this.give(other, give.cash);
    }
    if (want.cash) {
      this.give(other, -want.cash);
      this.give(p, want.cash);
    }
    const desc = (side: TradeSide) => [...side.props.map((id) => BOARD[id].name), side.cash ? money(side.cash) : ''].filter(Boolean).join(', ') || 'nada';
    this.addLog(`🤝 Trato hecho: ${b(p.name)} da ${desc(give)} y recibe ${desc(want)} de ${b(other.name)}.`, 'good');
    for (const id of [...give.props, ...want.props]) this.addFx({ kind: 'buy', player: this.owned.get(id)!.owner, space: id });
    return '';
  }

  /** Para la simulación: comprueba que el dinero y las propiedades cuadran. */
  check(label: string) {
    for (const p of this.players) {
      if (!p.bankrupt && p.cash < 0) throw new Error(`${label}: ${p.name} tiene dinero negativo (${p.cash})`);
      if (p.loans < 0 || p.loans > maxLoans(p.char)) throw new Error(`${label}: préstamos raros de ${p.name}`);
    }
    for (const [id, o] of this.owned) {
      if (!isProperty(BOARD[id])) throw new Error(`${label}: ${BOARD[id].name} no se puede tener`);
      if (o.level < 0 || o.level > 4 || (o.level > 0 && BOARD[id].kind !== 'calle')) throw new Error(`${label}: nivel raro en ${BOARD[id].name}`);
      if (this.byId(o.owner)?.bankrupt) throw new Error(`${label}: un quebrado tiene propiedades`);
    }
    if (this.pot < 0) throw new Error(`${label}: bote negativo`);
    for (const [id, owner] of this.closed) if (!this.owned.has(id) && !this.byId(owner)) throw new Error(`${label}: manifestación rara en ${BOARD[id].name}`);
    if (this.alive.length === 0) throw new Error(`${label}: no queda nadie`);
  }
}
