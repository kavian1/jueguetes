import type {
  Answer,
  Card,
  CardKind,
  Fx,
  LogEntry,
  PlayAction,
  PlayerState,
  Prompt,
  PromptReq,
  SeatInfo,
  Step,
  Winner,
} from './types';
import { CARD_DEFS, buildDeck, cardName, cardValueLabel, isBlue, isWeapon } from './cards';
import { CHARACTERS, ROLE_INFO, rolesFor } from './characters';
import { countsAsHeart, distance, dynamiteExplodes, hasInPlay, validatePlay, type TablePlayer } from './rules';
import { shuffle } from './rng';

export class GameOver extends Error {}

export type Asker = (req: PromptReq, game: Game) => Promise<Answer>;

export interface GameOptions {
  ask: Asker;
  onChange: () => void;
  pause?: (ms: number) => Promise<void>;
  rnd?: () => number;
  /** sólo para simulaciones */
  maxTurns?: number;
}

const b = (name: string) => `**${name}**`;

export class Game {
  players: PlayerState[] = [];
  deck: Card[] = [];
  discard: Card[] = [];
  turnIdx = 0;
  step: Step = 'inicio';
  log: LogEntry[] = [];
  fx: Fx[] = [];
  store: Card[] | null = null;
  /** cartas que Olmo está mirando (fuera del mazo temporalmente) */
  peek: Card[] = [];
  current: PromptReq | null = null;
  winner: Winner | null = null;
  /** hostilidad[a][b]: cuánto ha atacado a a b (lo usan los bots para deducir roles) */
  hostility: Record<string, Record<string, number>> = {};
  turnCount = 0;
  rnd: () => number;
  private seq = 1;
  private promptSeq = 1;

  constructor(seats: SeatInfo[], private opts: GameOptions) {
    this.rnd = opts.rnd ?? Math.random;
    this.setup(seats);
  }

  // ───────────────────────── utilidades ─────────────────────────

  get currentPlayer(): PlayerState {
    return this.players[this.turnIdx];
  }

  byId(id: string | undefined): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  alive(): PlayerState[] {
    return this.players.filter((p) => p.alive);
  }

  table(): TablePlayer[] {
    return this.players.map((p) => ({
      id: p.id,
      alive: p.alive,
      character: p.character,
      inPlay: p.inPlay,
      isSheriff: p.role === 'sheriff',
      hp: p.hp,
      maxHp: p.maxHp,
      handCount: p.hand.length,
    }));
  }

  dist(from: PlayerState, to: PlayerState): number {
    return distance(this.table(), from.id, to.id);
  }

  /** Jugadores vivos empezando por el siguiente a `p` en el sentido del turno. */
  othersInOrder(p: PlayerState): PlayerState[] {
    const n = this.players.length;
    const start = this.players.indexOf(p);
    const out: PlayerState[] = [];
    for (let k = 1; k < n; k++) {
      const q = this.players[(start + k) % n];
      if (q.alive) out.push(q);
    }
    return out;
  }

  addLog(text: string, kind?: LogEntry['kind'], to?: string[]) {
    this.log.push({ id: this.seq++, text, kind, to });
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
  }

  addFx(fx: Omit<Fx, 'id'>) {
    this.fx.push({ ...fx, id: this.seq++ });
    if (this.fx.length > 150) this.fx.splice(0, this.fx.length - 150);
  }

  changed() {
    this.opts.onChange();
  }

  async pause(ms: number) {
    this.changed();
    if (this.opts.pause) await this.opts.pause(ms);
  }

  private hostile(a: PlayerState | null, t: PlayerState, amount: number) {
    if (!a || a === t) return;
    this.hostility[a.id] ??= {};
    this.hostility[a.id][t.id] = (this.hostility[a.id][t.id] ?? 0) + amount;
  }

  // ───────────────────────── cartas ─────────────────────────

  private reshuffle() {
    if (!this.discard.length) return;
    this.deck = shuffle(this.discard, this.rnd);
    this.discard = [];
    this.addLog('Se baraja el descarte para formar un nuevo mazo.', 'info');
  }

  drawOne(): Card | null {
    if (!this.deck.length) this.reshuffle();
    return this.deck.pop() ?? null;
  }

  drawN(n: number): Card[] {
    const out: Card[] = [];
    for (let i = 0; i < n; i++) {
      const c = this.drawOne();
      if (c) out.push(c);
    }
    return out;
  }

  private removeFromHand(p: PlayerState, id: number): Card | null {
    const i = p.hand.findIndex((c) => c.id === id);
    if (i < 0) return null;
    return p.hand.splice(i, 1)[0];
  }

  private removeFromPlay(p: PlayerState, id: number): Card | null {
    const i = p.inPlay.findIndex((c) => c.id === id);
    if (i < 0) return null;
    return p.inPlay.splice(i, 1)[0];
  }

  private randomFromHand(p: PlayerState): Card | null {
    if (!p.hand.length) return null;
    const i = Math.floor(this.rnd() * p.hand.length);
    return p.hand.splice(i, 1)[0];
  }

  /** Filtra los ids que respondió un jugador: deben estar en su mano, sin repetir y del tipo pedido. */
  private validIds(p: PlayerState, ids: number[] | undefined, kinds?: CardKind[]): number[] {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<number>();
    return ids.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      const c = p.hand.find((x) => x.id === id);
      return !!c && (!kinds || kinds.includes(c.kind));
    });
  }

  private discardFromHand(p: PlayerState, ids: number[]): Card[] {
    const cards = ids.map((id) => this.removeFromHand(p, id)).filter((c): c is Card => !!c);
    this.discard.push(...cards);
    return cards;
  }

  /** "Desenfundar": se gira la carta superior del mazo y se comprueba. */
  private async drawCheck(p: PlayerState, reason: string, test: (c: Card) => boolean): Promise<boolean> {
    const c = this.drawOne();
    if (!c) return false;
    this.discard.push(c);
    const ok = test(c);
    this.addLog(`${b(p.name)} desenfunda por ${reason}: ${cardValueLabel(c)} ${ok ? '✔' : '✘'}`, ok ? 'good' : 'bad');
    this.addFx({ kind: 'check', player: p.id, card: c, reason, success: ok });
    await this.pause(1400);
    return ok;
  }

  // ───────────────────────── preguntas ─────────────────────────

  async request(playerId: string, prompt: Prompt): Promise<Answer> {
    const req: PromptReq = { id: this.promptSeq++, playerId, prompt };
    this.current = req;
    this.changed();
    let ans: Answer = {};
    try {
      ans = (await this.opts.ask(req, this)) ?? {};
    } catch {
      ans = {};
    }
    if (this.current === req) this.current = null;
    return ans;
  }

  // ───────────────────────── preparación ─────────────────────────

  private setup(seats: SeatInfo[]) {
    const order = shuffle([...seats], this.rnd);
    const roles = shuffle(rolesFor(order.length), this.rnd);
    const chars = shuffle(Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[], this.rnd);
    this.players = order.map((s, i) => {
      const ch = CHARACTERS[chars[i]];
      const role = roles[i];
      const maxHp = ch.hp + (role === 'sheriff' ? 1 : 0);
      return {
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        connected: true,
        character: ch.id,
        role,
        hp: maxHp,
        maxHp,
        hand: [],
        inPlay: [],
        alive: true,
        shotsThisTurn: 0,
        tintaUsed: false,
      };
    });
    this.deck = buildDeck(this.rnd);
    for (const p of this.players) p.hand.push(...this.drawN(p.hp));
    this.turnIdx = this.players.findIndex((p) => p.role === 'sheriff');
    this.addLog(`¡Empieza el duelo! El Sheriff es ${b(this.currentPlayer.name)}.`, 'info');
  }

  // ───────────────────────── bucle principal ─────────────────────────

  async run() {
    try {
      // reparto inicial (sólo para la animación: las cartas ya están en las manos)
      for (const p of this.players) this.addFx({ kind: 'draw', player: p.id, amount: p.hand.length, reason: 'deal' });
      await this.pause(1800);
      for (;;) {
        this.turnCount++;
        if (this.opts.maxTurns && this.turnCount > this.opts.maxTurns) {
          this.winner = { team: 'nadie', ids: [], text: 'Partida detenida' };
          throw new GameOver();
        }
        await this.playTurn(this.currentPlayer);
        this.turnIdx = this.nextAliveIdx(this.turnIdx);
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    this.current = null;
    this.changed();
  }

  private nextAliveIdx(i: number): number {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (i + k) % n;
      if (this.players[j].alive) return j;
    }
    return i;
  }

  private async playTurn(p: PlayerState) {
    p.shotsThisTurn = 0;
    this.step = 'inicio';
    this.addLog(`Turno de ${b(p.name)}`, 'turn');
    this.addFx({ kind: 'turn', player: p.id });
    await this.pause(900);

    // Dinamita
    const dyn = p.inPlay.find((c) => c.kind === 'dinamita');
    if (dyn) {
      const boom = await this.drawCheck(p, 'la Dinamita', dynamiteExplodes);
      this.removeFromPlay(p, dyn.id);
      if (boom) {
        this.discard.push(dyn);
        this.addLog(`¡BUM! La Dinamita explota en la cara de ${b(p.name)}.`, 'bad');
        this.addFx({ kind: 'explode', player: p.id });
        await this.pause(900);
        await this.damage(p, 3, null);
        if (!p.alive) return;
      } else {
        const next = this.othersInOrder(p)[0];
        if (next) {
          next.inPlay.push(dyn);
          this.addLog(`La Dinamita pasa a ${b(next.name)}.`, 'info');
          this.addFx({ kind: 'pass', player: p.id, target: next.id, card: dyn });
          await this.pause(800);
        } else this.discard.push(dyn);
      }
    }

    // Calabozo
    const jail = p.inPlay.find((c) => c.kind === 'calabozo');
    if (jail) {
      const free = await this.drawCheck(p, 'el Calabozo', (c) => countsAsHeart(p.character, c));
      this.removeFromPlay(p, jail.id);
      this.discard.push(jail);
      if (!free) {
        this.addLog(`${b(p.name)} sigue en el Calabozo y pierde el turno.`, 'bad');
        await this.pause(600);
        return;
      }
      this.addLog(`${b(p.name)} escapa del Calabozo.`, 'good');
    }

    // Fase 1: robar
    this.step = 'robo';
    if (p.character === 'olmo') {
      const three = this.drawN(3);
      if (three.length === 3) {
        this.peek = three;
        const ans = await this.request(p.id, { type: 'olmo', cards: three });
        this.peek = [];
        let keep = (ans.cards ?? []).filter((id, i, a) => three.some((c) => c.id === id) && a.indexOf(id) === i).slice(0, 2);
        if (keep.length < 2) keep = three.slice(0, 2).map((c) => c.id);
        const back = three.find((c) => !keep.includes(c.id))!;
        p.hand.push(...three.filter((c) => keep.includes(c.id)));
        this.deck.push(back);
        this.addLog(`${b(p.name)} mira 3 cartas, se queda 2 y devuelve 1 al mazo.`);
      } else p.hand.push(...three);
      this.addFx({ kind: 'draw', player: p.id, amount: 2 });
    } else {
      p.hand.push(...this.drawN(2));
      this.addLog(`${b(p.name)} roba 2 cartas.`);
      this.addFx({ kind: 'draw', player: p.id, amount: 2 });
    }
    await this.pause(650);

    // Fase 2: jugar cartas
    this.step = 'juego';
    let error: string | undefined;
    let strikes = 0;
    while (p.alive) {
      const ans = await this.request(p.id, { type: 'play', error });
      const action = ans.action;
      if (!action || action.kind === 'end') break;
      error = (await this.doAction(p, action)) ?? undefined;
      if (error) {
        if (++strikes > 25) break;
      } else strikes = 0;
    }
    if (!p.alive) return;

    // Fase 3: descartar el exceso
    this.step = 'descarte';
    const excess = p.hand.length - Math.max(0, p.hp);
    if (excess > 0) {
      const ans = await this.request(p.id, { type: 'discard', count: excess });
      const ids = this.validIds(p, ans.cards).slice(0, excess);
      for (const c of [...p.hand].reverse()) {
        if (ids.length >= excess) break;
        if (!ids.includes(c.id)) ids.push(c.id);
      }
      const cards = this.discardFromHand(p, ids);
      for (const c of cards) this.addFx({ kind: 'discard', player: p.id, card: c });
      this.addLog(`${b(p.name)} descarta ${cards.map(cardName).join(', ')}.`);
      await this.pause(500);
    }
    await this.pause(300);
  }

  // ───────────────────────── jugadas ─────────────────────────

  private async doAction(p: PlayerState, action: PlayAction): Promise<string | null> {
    const err = validatePlay({ players: this.table(), meId: p.id, hand: p.hand, shotsThisTurn: p.shotsThisTurn }, action);
    if (err) return err;
    if (action.kind === 'end') return null;

    if (action.kind === 'ability') {
      const cards = this.discardFromHand(p, action.cards);
      for (const c of cards) this.addFx({ kind: 'discard', player: p.id, card: c });
      this.addLog(`${b(p.name)} prepara un Remedio casero con ${cards.map(cardName).join(" y ")} y recupera 1 vida.`, 'good');
      this.heal(p, 1);
      await this.pause(700);
      return null;
    }

    const card = this.removeFromHand(p, action.cardId)!;
    const kind = card.kind;
    const target = this.byId(action.target);
    if (isBlue(kind)) this.addFx({ kind: 'equip', player: p.id, target: target?.id ?? p.id, card });
    else this.addFx({ kind: 'play', player: p.id, target: target?.id, card });

    // Cartas azules: se quedan en juego
    if (isBlue(kind)) {
      if (kind === 'calabozo' && target) {
        target.inPlay.push(card);
        this.hostile(p, target, 2);
        this.addLog(`${b(p.name)} mete a ${b(target.name)} en el Calabozo.`);
      } else {
        if (isWeapon(kind)) {
          const old = p.inPlay.find((c) => isWeapon(c.kind));
          if (old) {
            this.removeFromPlay(p, old.id);
            this.discard.push(old);
          }
        }
        p.inPlay.push(card);
        this.addLog(`${b(p.name)} pone en juego ${CARD_DEFS[kind].name}.`);
      }
      await this.pause(800);
      return null;
    }

    this.discard.push(card);

    switch (kind) {
      case 'disparo': {
        p.shotsThisTurn++;
        this.addLog(`${b(p.name)} dispara a ${b(target!.name)}.`);
        this.hostile(p, target!, 3);
        await this.pause(700);
        await this.shoot(p, target!, 'disparo');
        break;
      }
      case 'manzanilla': {
        const amount = p.character === 'miel' ? 2 : 1;
        this.addLog(`${b(p.name)} se toma un Whisky.`, 'good');
        this.heal(p, amount);
        await this.pause(700);
        break;
      }
      case 'picnic': {
        this.addLog(`${b(p.name)} enciende una Fogata: todos recuperan 1 vida.`, 'good');
        for (const q of this.alive()) this.heal(q, 1);
        await this.pause(900);
        break;
      }
      case 'correo':
      case 'encomienda': {
        const n = kind === 'correo' ? 2 : 3;
        await this.pause(600);
        p.hand.push(...this.drawN(n));
        this.addLog(`${b(p.name)} juega ${CARD_DEFS[kind].name} y roba ${n} cartas.`);
        this.addFx({ kind: 'draw', player: p.id, amount: n });
        await this.pause(700);
        break;
      }
      case 'mercadillo':
        this.addLog(`${b(p.name)} organiza una Subasta.`);
        await this.runStore(p);
        break;
      case 'hurto':
      case 'travesura':
        await this.takeCard(p, target!, kind, action.targetCard ?? 'hand');
        break;
      case 'rafaga': {
        this.addLog(`${b(p.name)} suelta una Ráfaga contra todos.`);
        await this.pause(700);
        for (const q of this.othersInOrder(p)) {
          if (!q.alive) continue;
          this.hostile(p, q, 1);
          if (q.character === 'pipa') {
            this.addLog(`${b(q.name)} se tira cuerpo a tierra y esquiva la Ráfaga.`, 'good');
            continue;
          }
          await this.shoot(p, q, 'rafaga');
        }
        break;
      }
      case 'estampida': {
        this.addLog(`${b(p.name)} provoca una Estampida.`);
        await this.pause(700);
        for (const q of this.othersInOrder(p)) {
          if (!q.alive) continue;
          this.hostile(p, q, 1);
          if (q.character === 'pipa') {
            this.addLog(`${b(q.name)} se tira cuerpo a tierra y la Estampida le pasa por encima.`, 'good');
            continue;
          }
          let saved = false;
          if (q.hand.some((c) => c.kind === 'disparo')) {
            const ans = await this.request(q.id, { type: 'estampida', attacker: p.id });
            const ids = this.validIds(q, ans.cards, ['disparo']).slice(0, 1);
            if (ids.length) {
              for (const c of this.discardFromHand(q, ids)) this.addFx({ kind: 'discard', player: q.id, card: c });
              this.addLog(`${b(q.name)} descarta un Disparo y se aparta.`);
              await this.pause(500);
              saved = true;
            }
          }
          if (!saved) await this.damage(q, 1, p);
        }
        break;
      }
      case 'duelo': {
        this.addLog(`${b(p.name)} reta a ${b(target!.name)} a un Duelo.`);
        this.hostile(p, target!, 3);
        this.addFx({ kind: 'duel', player: p.id, target: target!.id });
        await this.pause(1200);
        await this.duel(p, target!);
        break;
      }
      default:
        break;
    }
    return null;
  }

  private async takeCard(p: PlayerState, t: PlayerState, kind: 'hurto' | 'travesura', tc: number | 'hand') {
    this.hostile(p, t, 2);
    let card: Card | null = null;
    let fromHand = false;
    if (tc === 'hand') {
      card = this.randomFromHand(t);
      fromHand = true;
    } else card = this.removeFromPlay(t, tc);
    if (!card) return;
    const from = fromHand ? 'hand' : 'inplay';
    if (kind === 'hurto') this.addFx({ kind: 'steal', player: p.id, target: t.id, card: fromHand ? undefined : card, from });
    else this.addFx({ kind: 'lasso', player: p.id, target: t.id, card, from });
    if (kind === 'hurto') {
      p.hand.push(card);
      if (fromHand) {
        this.addLog(`${b(p.name)} le quita una carta de la mano a ${b(t.name)}.`);
        this.addLog(`(Era ${cardName(card)})`, 'info', [p.id, t.id]);
      } else this.addLog(`${b(p.name)} le quita ${cardName(card)} a ${b(t.name)}.`);
    } else {
      this.discard.push(card);
      this.addLog(
        fromHand
          ? `${b(p.name)} lanza el Lazo: ${b(t.name)} suelta ${cardName(card)} de su mano.`
          : `${b(p.name)} lanza el Lazo y le arranca a ${b(t.name)} su ${cardName(card)}.`,
      );
    }
    await this.pause(1100);
  }

  private async runStore(p: PlayerState) {
    const order = [p, ...this.othersInOrder(p)];
    this.store = this.drawN(order.length);
    this.addFx({ kind: 'store', player: p.id, amount: this.store.length });
    await this.pause(900);
    for (const q of order) {
      if (!this.store.length) break;
      if (!q.alive) continue;
      let chosen: Card;
      if (this.store.length === 1) chosen = this.store[0];
      else {
        const ans = await this.request(q.id, { type: 'store', cards: [...this.store] });
        const id = ans.cards?.[0];
        chosen = this.store.find((c) => c.id === id) ?? this.store[0];
      }
      this.store = this.store.filter((c) => c.id !== chosen.id);
      q.hand.push(chosen);
      this.addLog(`${b(q.name)} se lleva ${cardName(chosen)} de la Subasta.`);
      this.addFx({ kind: 'pick', player: q.id, card: chosen });
      await this.pause(650);
    }
    if (this.store.length) this.discard.push(...this.store);
    this.store = null;
  }

  private async shoot(att: PlayerState, t: PlayerState, cause: 'disparo' | 'rafaga') {
    if (!t.alive) return;
    let needed = 1;
    if (cause === 'disparo' && att.character === 'cardo' && this.dist(att, t) === 1) needed = 2;

    this.addFx({ kind: 'shot', player: att.id, target: t.id });
    await this.pause(450);

    let barrel = false;
    if (hasInPlay(t, 'barril')) {
      const ok = await this.drawCheck(t, 'el Barril', (c) => countsAsHeart(t.character, c));
      if (ok) {
        needed--;
        barrel = true;
      }
    }

    let dodgeCard: Card | undefined;
    if (needed > 0) {
      const dodges = t.hand.filter((c) => c.kind === 'esquiva');
      if (dodges.length >= needed) {
        const ans = await this.request(t.id, { type: 'shot', attacker: att.id, needed, cause });
        const ids = this.validIds(t, ans.cards, ['esquiva']);
        if (ids.length >= needed) {
          dodgeCard = this.discardFromHand(t, ids.slice(0, needed))[0];
          needed = 0;
        }
      }
    }

    if (needed <= 0) {
      this.addLog(`${b(t.name)} esquiva el disparo.`, 'good');
      this.addFx({ kind: 'dodge', player: t.id, card: dodgeCard, reason: barrel && !dodgeCard ? 'barril' : undefined });
      await this.pause(700);
    } else {
      await this.damage(t, 1, att);
    }
  }

  private async duel(att: PlayerState, def: PlayerState) {
    let resp = def;
    let other = att;
    for (;;) {
      let discarded = false;
      if (resp.alive && resp.hand.some((c) => c.kind === 'disparo')) {
        const ans = await this.request(resp.id, { type: 'duel', opponent: other.id });
        const ids = this.validIds(resp, ans.cards, ['disparo']).slice(0, 1);
        if (ids.length) {
          this.discardFromHand(resp, ids);
          this.addLog(`${b(resp.name)} descarta un Disparo en el Duelo.`);
          this.addFx({ kind: 'play', player: resp.id, target: other.id, card: this.discard[this.discard.length - 1] });
          discarded = true;
          await this.pause(600);
        }
      }
      if (!discarded) {
        this.addLog(`${b(resp.name)} pierde el Duelo.`, 'bad');
        await this.damage(resp, 1, other);
        return;
      }
      [resp, other] = [other, resp];
    }
  }

  private heal(p: PlayerState, amount: number) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    if (p.hp > before) this.addFx({ kind: 'heal', player: p.id, amount: p.hp - before });
  }

  async damage(t: PlayerState, amount: number, src: PlayerState | null) {
    if (!t.alive) return;
    t.hp -= amount;
    this.hostile(src, t, 2);
    this.addLog(`${b(t.name)} pierde ${amount} vida${amount > 1 ? 's' : ''}.`, 'bad');
    this.addFx({ kind: 'damage', player: t.id, amount });

    if (t.character === 'pincho' && src && src !== t && src.alive && src.hand.length) {
      const c = this.randomFromHand(src)!;
      this.discard.push(c);
      this.addFx({ kind: 'discard', player: src.id, card: c });
      this.addLog(`¡Mala espina! ${b(src.name)} se distrae y suelta ${cardName(c)}.`);
    }
    await this.pause(900);

    if (t.hp > 0) return;

    if (t.character === 'tinta' && !t.tintaUsed) {
      t.tintaUsed = true;
      t.hp = 1;
      this.addLog(`¡Siete vidas! ${b(t.name)} cae de pie y se queda con 1 vida.`, 'good');
      this.addFx({ kind: 'heal', player: t.id, amount: 1 });
      await this.pause(800);
      return;
    }

    if (this.alive().length > 2) {
      const per = t.character === 'miel' ? 2 : 1;
      const needed = Math.ceil((1 - t.hp) / per);
      const beers = t.hand.filter((c) => c.kind === 'manzanilla');
      if (beers.length >= needed) {
        const ans = await this.request(t.id, { type: 'beer', needed });
        const ids = this.validIds(t, ans.cards, ['manzanilla']);
        if (ids.length >= needed) {
          for (const c of this.discardFromHand(t, ids.slice(0, needed))) this.addFx({ kind: 'discard', player: t.id, card: c });
          const before = t.hp;
          t.hp = Math.min(t.maxHp, t.hp + needed * per);
          this.addLog(`${b(t.name)} se toma ${needed > 1 ? `${needed} Whiskies` : "un Whisky"} justo a tiempo.`, 'good');
          this.addFx({ kind: 'heal', player: t.id, amount: t.hp - before });
          await this.pause(700);
        }
      }
    }

    if (t.hp <= 0) await this.eliminate(t, src);
  }

  private async eliminate(t: PlayerState, killer: PlayerState | null) {
    t.alive = false;
    t.hp = 0;
    this.addLog(`${b(t.name)} queda fuera de la partida. Era ${ROLE_INFO[t.role].name}.`, 'end');
    this.addFx({ kind: 'elim', player: t.id, role: t.role });

    const vulture = this.players.find((p) => p.alive && p.character === 'ceniza');
    if (vulture && t.hand.length) {
      this.addFx({ kind: 'steal', player: vulture.id, target: t.id, amount: t.hand.length, from: 'hand' });
      vulture.hand.push(...t.hand);
      this.addLog(`${b(vulture.name)} se queda con las ${t.hand.length} cartas de la mano de ${b(t.name)}.`);
      t.hand = [];
    }
    this.discard.push(...t.hand, ...t.inPlay);
    t.hand = [];
    t.inPlay = [];
    await this.pause(1200);

    this.checkEnd();

    if (killer && killer.alive && killer !== t) {
      if (t.role === 'forajido') {
        killer.hand.push(...this.drawN(3));
        this.addFx({ kind: 'draw', player: killer.id, amount: 3 });
        this.addLog(`${b(killer.name)} cobra la recompensa: roba 3 cartas.`, 'good');
      }
      if (t.role === 'ayudante' && killer.role === 'sheriff') {
        this.addFx({ kind: 'discard', player: killer.id, amount: killer.hand.length + killer.inPlay.length });
        this.discard.push(...killer.hand, ...killer.inPlay);
        killer.hand = [];
        killer.inPlay = [];
        this.addLog(`¡El Sheriff ha eliminado a su Ayudante! Pierde todas sus cartas.`, 'bad');
      }
      await this.pause(600);
    }
  }

  private checkEnd() {
    const sheriff = this.players.find((p) => p.role === 'sheriff')!;
    const alive = this.alive();
    const idsOf = (...roles: string[]) => this.players.filter((p) => roles.includes(p.role)).map((p) => p.id);
    if (!sheriff.alive) {
      if (alive.length === 1 && alive[0].role === 'renegado') {
        this.winner = { team: 'renegado', ids: [alive[0].id], text: `¡${alive[0].name}, el Renegado, se queda solo en el pueblo!` };
      } else {
        this.winner = { team: 'forajidos', ids: idsOf('forajido'), text: '¡Los Forajidos han derrocado al Sheriff!' };
      }
    } else if (!alive.some((p) => p.role === 'forajido' || p.role === 'renegado')) {
      this.winner = { team: 'sheriff', ids: idsOf('sheriff', 'ayudante'), text: '¡El Sheriff y sus Ayudantes ponen orden en el pueblo!' };
    }
    if (this.winner) {
      this.addLog(this.winner.text, 'end');
      throw new GameOver();
    }
  }
}
