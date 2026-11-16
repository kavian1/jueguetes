import Peer, { type DataConnection } from 'peerjs';
import {
  PEER_PREFIX,
  cleanName,
  getClientId,
  randomCode,
  sleep,
  type ChatMsg,
  type BasePrompt,
  type ClientMsg,
  type GameAdapter,
  type HostMsg,
  type LobbyPlayer,
  type RoomOptions,
  type Session,
  type Snapshot,
} from './protocol';
import { VoiceChat, type VoiceMember, type VoiceState } from './voice';

const BOT_NAMES = ['Jacinto', 'Dolores', 'Elías', 'Paquita', 'Ramiro', 'Carmela', 'Teodoro', 'Inés', 'Gaspar', 'Rufina'];
/** segundos que se espera a un jugador desconectado antes de que un bot juegue por él */
const RECONNECT_GRACE_MS = 20000;

type Answer = unknown;

abstract class BaseSession {
  protected snap: Snapshot;
  private listeners = new Set<() => void>();

  constructor(initial: Snapshot) {
    this.snap = initial;
  }

  getSnapshot = () => this.snap;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  protected update(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }
}

// ═══════════════════════════ ANFITRIÓN ═══════════════════════════

export class HostSession extends BaseSession implements Session {
  private adapter: GameAdapter<unknown, unknown, unknown, BasePrompt>;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private connPlayer = new Map<DataConnection, string>();
  private clientIds = new Map<string, string>();
  private disconnectedAt = new Map<string, number>();
  private lobby: LobbyPlayer[];
  private options: RoomOptions;
  private game: unknown = null;
  private gameToken = 0;
  private pending = new Map<number, { playerId: string; resolve: (a: Answer) => void; timer: ReturnType<typeof setInterval> }>();
  private chat: ChatMsg[] = [];
  private chatSeq = 1;
  private nextId = 1;
  private queued = false;
  private destroyed = false;
  private voiceMembers = new Map<string, VoiceMember>(); // por playerId
  readonly voice?: VoiceChat;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(adapter: GameAdapter<any, any, any, any>, myName: string, solo: boolean) {
    super({ game: adapter.id, mode: solo ? 'solo' : 'host', status: solo ? 'lobby' : 'connecting', code: '', myId: 'host', lobby: [], view: null, chat: [] });
    this.adapter = adapter;
    this.lobby = [{ id: 'host', name: cleanName(myName), isBot: false, isHost: true, connected: true }];
    this.options = Object.fromEntries((adapter.options ?? []).map((o) => [o.id, o.default]));
    this.snap = { ...this.snap, options: { ...this.options } };
    if (solo) {
      for (let i = 0; i < adapter.minPlayers - 1; i++) this.addBot();
      this.flush();
    } else {
      this.voice = new VoiceChat((s) => this.setVoice('host', this.peer?.id ?? '', s));
      this.openPeer(0);
    }
  }

  // ── red ──

  private openPeer(attempt: number) {
    const code = randomCode();
    const peer = new Peer(PEER_PREFIX + code, { debug: 1 });
    this.peer = peer;
    this.voice?.attach(peer);
    peer.on('open', () => {
      if (this.destroyed) return;
      this.update({ code, status: this.game ? 'game' : 'lobby', error: undefined });
      this.flush();
    });
    peer.on('connection', (conn) => this.handleConn(conn));
    peer.on('disconnected', () => {
      // se perdió el servidor de señalización; las conexiones ya abiertas siguen funcionando
      if (!this.destroyed && !peer.destroyed) setTimeout(() => peer.reconnect(), 1500);
    });
    peer.on('error', (err: { type?: string; message?: string }) => {
      if (this.destroyed) return;
      if (err.type === 'unavailable-id' && attempt < 5) {
        peer.destroy();
        this.openPeer(attempt + 1);
        return;
      }
      if (err.type === 'peer-unavailable' || err.type === 'network' || err.type === 'server-error') {
        if (this.snap.status === 'connecting') this.update({ status: 'error', error: 'No se pudo contactar con el servidor de conexión. Revisa tu internet y vuelve a intentarlo.' });
        return;
      }
      if (this.snap.status === 'connecting') this.update({ status: 'error', error: `No se pudo crear la sala (${err.type ?? err.message}).` });
    });
  }

  retry() {
    if (this.peer) this.peer.destroy();
    this.update({ status: 'connecting', error: undefined });
    this.openPeer(0);
  }

  private handleConn(conn: DataConnection) {
    conn.on('data', (raw) => this.onClientMsg(conn, raw as ClientMsg));
    conn.on('close', () => this.onConnClose(conn));
    conn.on('error', () => this.onConnClose(conn));
  }

  private send(conn: DataConnection, msg: HostMsg) {
    try {
      if (conn.open) conn.send(msg);
    } catch {
      /* conexión cerrada */
    }
  }

  private onClientMsg(conn: DataConnection, msg: ClientMsg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') return this.onJoin(conn, msg.name, String(msg.clientId ?? ''));
    const pid = this.connPlayer.get(conn);
    if (!pid) return;
    if (msg.t === 'answer') {
      const entry = this.pending.get(msg.promptId);
      if (entry && entry.playerId === pid) this.resolvePending(msg.promptId, msg.answer ?? {});
    } else if (msg.t === 'chat') {
      const seat = this.lobby.find((p) => p.id === pid);
      if (seat) this.pushChat(seat.name, String(msg.text ?? ''));
    } else if (msg.t === 'voice') {
      this.setVoice(pid, conn.peer, { on: !!msg.on, muted: !!msg.muted });
    }
  }

  private onJoin(conn: DataConnection, rawName: string, clientId: string) {
    const name = cleanName(rawName);
    let seat: LobbyPlayer | undefined;
    if (this.game) {
      // sólo se puede volver a entrar a un asiento existente
      seat = this.lobby.find((p) => !p.isBot && !p.isHost && this.clientIds.get(p.id) === clientId);
      seat ??= this.lobby.find((p) => !p.isBot && !p.isHost && !p.connected && p.name.toLowerCase() === name.toLowerCase());
      if (!seat) {
        this.send(conn, { t: 'reject', reason: 'La partida ya ha empezado. Espera a que el anfitrión vuelva a la sala.' });
        setTimeout(() => conn.close(), 800);
        return;
      }
    } else {
      seat = this.lobby.find((p) => !p.isHost && this.clientIds.get(p.id) === clientId);
      if (!seat) {
        if (this.lobby.length >= this.adapter.maxPlayers) {
          this.send(conn, { t: 'reject', reason: `La sala está llena (máximo ${this.adapter.maxPlayers} jugadores).` });
          setTimeout(() => conn.close(), 800);
          return;
        }
        seat = { id: 'p' + this.nextId++, name: this.uniqueName(name), isBot: false, isHost: false, connected: true };
        this.lobby.push(seat);
      }
    }
    const old = this.conns.get(seat.id);
    if (old && old !== conn) {
      this.connPlayer.delete(old);
      old.close();
    }
    this.conns.set(seat.id, conn);
    this.connPlayer.set(conn, seat.id);
    this.clientIds.set(seat.id, clientId);
    const wasDisconnected = !seat.connected;
    seat.connected = true;
    this.disconnectedAt.delete(seat.id);
    const gp = this.game ? this.adapter.player(this.game, seat.id) : undefined;
    if (gp) gp.connected = true;
    this.send(conn, { t: 'welcome', playerId: seat.id, code: this.snap.code, game: this.adapter.id });
    this.pushChat('', wasDisconnected ? `${seat.name} ha vuelto.` : `${seat.name} se ha unido.`, true);
    // la conexión anterior (si la había) ya no vale para la voz: el invitado vuelve a decir si está dentro
    if (this.voiceMembers.delete(seat.id)) this.broadcastVoice();
    else this.send(conn, { t: 'voice', roster: [...this.voiceMembers.values()] });
    this.flush();
  }

  private onConnClose(conn: DataConnection) {
    const pid = this.connPlayer.get(conn);
    if (!pid) return;
    this.connPlayer.delete(conn);
    if (this.conns.get(pid) !== conn) return;
    this.conns.delete(pid);
    if (this.voiceMembers.delete(pid)) this.broadcastVoice();
    const seat = this.lobby.find((p) => p.id === pid);
    if (!seat) return;
    if (!this.game) {
      this.lobby = this.lobby.filter((p) => p.id !== pid);
      this.pushChat('', `${seat.name} se ha ido.`, true);
    } else {
      seat.connected = false;
      this.disconnectedAt.set(pid, Date.now());
      const gp = this.adapter.player(this.game, pid);
      if (gp) gp.connected = false;
      this.pushChat('', `${seat.name} se ha desconectado. Si no vuelve en ${RECONNECT_GRACE_MS / 1000}s, un bot jugará por él.`, true);
    }
    this.flush();
  }

  private uniqueName(name: string): string {
    let n = name;
    let i = 2;
    while (this.lobby.some((p) => p.name.toLowerCase() === n.toLowerCase())) n = `${name} ${i++}`;
    return n;
  }

  // ── sala ──

  addBot() {
    if (this.game || this.lobby.length >= this.adapter.maxPlayers) return;
    const used = new Set(this.lobby.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.nextId}`;
    this.lobby.push({ id: 'b' + this.nextId++, name, isBot: true, isHost: false, connected: true });
    this.flush();
  }

  removePlayer(id: string) {
    if (this.game || id === 'host') return;
    const conn = this.conns.get(id);
    if (conn) {
      this.send(conn, { t: 'reject', reason: 'El anfitrión te ha sacado de la sala.' });
      this.connPlayer.delete(conn);
      this.conns.delete(id);
      setTimeout(() => conn.close(), 500);
    }
    if (this.voiceMembers.delete(id)) this.broadcastVoice();
    this.lobby = this.lobby.filter((p) => p.id !== id);
    this.flush();
  }

  start() {
    const A = this.adapter;
    if (this.game || this.lobby.length < A.minPlayers || this.lobby.length > A.maxPlayers) return;
    const token = ++this.gameToken;
    let game: unknown = null;
    game = A.create(
      this.lobby.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
      {
        ask: (req) => this.ask(req, game, token),
        cancel: (id) => this.cancelPending(id),
        onChange: () => this.flush(),
        pause: (ms) => sleep(ms),
      },
      { ...this.options },
    );
    for (const l of this.lobby) {
      const gp = A.player(game, l.id);
      if (gp) gp.connected = l.connected;
    }
    this.game = game;
    this.flush();
    A.run(game).then(() => this.flush());
  }

  backToLobby() {
    this.gameToken++;
    for (const [id, e] of this.pending) {
      clearInterval(e.timer);
      this.pending.delete(id);
    }
    this.game = null;
    this.lobby = this.lobby.filter((p) => p.isBot || p.isHost || p.connected);
    this.flush();
  }

  // ── preguntas a los jugadores ──

  private ask(req: BasePrompt, game: unknown, token: number): Promise<Answer> {
    const A = this.adapter;
    if (token !== this.gameToken) return new Promise(() => {});
    const p = A.player(game, req.playerId)!;
    if (p.isBot) {
      return sleep(A.botDelay(req)).then(() => (token === this.gameToken ? A.bot(game, req) : new Promise<Answer>(() => {})));
    }
    return new Promise<Answer>((resolve) => {
      const timer = setInterval(() => {
        if (token !== this.gameToken) return clearInterval(timer);
        const since = this.disconnectedAt.get(req.playerId);
        if (!p.connected && since && Date.now() - since > RECONNECT_GRACE_MS) {
          clearInterval(timer);
          setTimeout(() => {
            if (this.pending.has(req.id)) this.resolvePending(req.id, A.bot(game, req));
          }, A.botDelay(req) * 0.5);
        }
      }, 1000);
      this.pending.set(req.id, { playerId: req.playerId, resolve, timer });
    });
  }

  private cancelPending(id: number) {
    const e = this.pending.get(id);
    if (!e) return;
    clearInterval(e.timer);
    this.pending.delete(id);
  }

  private resolvePending(id: number, ans: Answer) {
    const e = this.pending.get(id);
    if (!e) return;
    clearInterval(e.timer);
    this.pending.delete(id);
    e.resolve(ans);
  }

  answer(promptId: number, answer: Answer) {
    const e = this.pending.get(promptId);
    if (e && e.playerId === 'host') this.resolvePending(promptId, answer);
  }

  // ── chat ──

  private pushChat(from: string, text: string, system = false) {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    this.chat = [...this.chat, { id: this.chatSeq++, from, text: t, system }].slice(-60);
    for (const conn of this.conns.values()) this.send(conn, { t: 'chat', chat: this.chat });
    this.update({ chat: this.chat });
  }

  sendChat(text: string) {
    this.pushChat(this.lobby[0].name, text);
  }

  // ── voz: el anfitrión sólo reparte la lista; el audio va directo entre jugadores ──

  private setVoice(playerId: string, peerId: string, s: VoiceState) {
    if (!peerId) return;
    const prev = this.voiceMembers.get(playerId);
    if (!s.on) {
      if (!prev) return;
      this.voiceMembers.delete(playerId);
    } else {
      if (prev && prev.peerId === peerId && prev.muted === s.muted) return;
      this.voiceMembers.set(playerId, { playerId, peerId, muted: s.muted });
    }
    this.broadcastVoice();
  }

  private broadcastVoice() {
    const roster = [...this.voiceMembers.values()];
    for (const conn of this.conns.values()) this.send(conn, { t: 'voice', roster });
    this.voice?.setRoster(roster);
  }

  // ── difusión del estado ──

  private flush() {
    if (this.queued || this.destroyed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.broadcast();
    });
  }

  /** Cambia una opción de la sala (sólo antes de empezar). */
  setOption(id: string, value: string) {
    const def = this.adapter.options?.find((o) => o.id === id);
    if (this.game || !def || !def.choices.some((c) => c.id === value)) return;
    this.options = { ...this.options, [id]: value };
    this.flush();
  }

  private broadcast() {
    const lobby = this.lobby.map((p) => ({ ...p }));
    const options = { ...this.options };
    const view = this.game ? structuredClone(this.adapter.view(this.game, 'host')) : null;
    const status = this.snap.status === 'connecting' || this.snap.status === 'error' ? this.snap.status : this.game ? 'game' : 'lobby';
    this.update({ lobby, view, status, options });
    for (const [pid, conn] of this.conns) {
      if (this.game) this.send(conn, { t: 'state', view: this.adapter.view(this.game, pid), lobby, options });
      else this.send(conn, { t: 'lobby', lobby, options });
    }
  }

  leave() {
    this.destroyed = true;
    this.gameToken++;
    this.voice?.destroy();
    for (const conn of this.conns.values()) conn.close();
    this.peer?.destroy();
  }
}

// ═══════════════════════════ INVITADO ═══════════════════════════

export class ClientSession extends BaseSession implements Session {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private destroyed = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  readonly voice = new VoiceChat((s) => this.send({ t: 'voice', on: s.on, muted: s.muted }));

  constructor(private name: string, code: string) {
    super({ game: null, mode: 'client', status: 'connecting', code: code.toUpperCase(), myId: '', lobby: [], view: null, chat: [] });
    this.connect();
  }

  private fail(error: string) {
    if (this.destroyed) return;
    if (this.timeout) clearTimeout(this.timeout);
    // sin anfitrión no hay lista de voz: se cuelga y se apaga el micro
    this.voice.leave();
    this.voice.setRoster([]);
    this.update({ status: 'error', error });
  }

  private connect() {
    this.peer?.destroy();
    const peer = new Peer({ debug: 1 });
    this.peer = peer;
    this.voice.attach(peer);
    this.timeout = setTimeout(() => {
      if (this.snap.status === 'connecting') this.fail('No se pudo conectar con la sala. Comprueba el código o pide al anfitrión que la vuelva a crear.');
    }, 20000);
    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + this.snap.code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => this.send({ t: 'join', name: this.name, clientId: getClientId() }));
      conn.on('data', (raw) => this.onMsg(raw as HostMsg));
      conn.on('close', () => {
        if (this.conn === conn && this.snap.status !== 'error') this.fail('Se ha perdido la conexión con el anfitrión.');
      });
      conn.on('error', () => this.fail('Error en la conexión con el anfitrión.'));
    });
    peer.on('error', (err: { type?: string }) => {
      if (err.type === 'peer-unavailable') this.fail(`No existe ninguna sala con el código ${this.snap.code} (o el anfitrión cerró la pestaña).`);
      else if (this.snap.status === 'connecting') this.fail(`No se pudo conectar (${err.type ?? 'error desconocido'}).`);
    });
  }

  retry() {
    this.update({ status: 'connecting', error: undefined });
    this.connect();
  }

  private send(msg: ClientMsg) {
    try {
      if (this.conn?.open) this.conn.send(msg);
    } catch {
      /* conexión cerrada */
    }
  }

  private onMsg(msg: HostMsg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        if (this.timeout) clearTimeout(this.timeout);
        this.update({ game: msg.game ?? 'polvo', myId: msg.playerId, code: msg.code || this.snap.code, status: this.snap.view ? 'game' : 'lobby' });
        this.voice.resend();
        break;
      case 'lobby':
        this.update({ lobby: msg.lobby, view: null, status: 'lobby', options: msg.options });
        break;
      case 'state':
        this.update({ lobby: msg.lobby, view: msg.view, status: 'game', options: msg.options });
        break;
      case 'chat':
        this.update({ chat: msg.chat });
        break;
      case 'voice':
        if (Array.isArray(msg.roster)) this.voice.setRoster(msg.roster);
        break;
      case 'reject':
        this.conn = null;
        this.fail(msg.reason);
        break;
    }
  }

  answer(promptId: number, answer: Answer) {
    this.send({ t: 'answer', promptId, answer });
  }

  sendChat(text: string) {
    this.send({ t: 'chat', text });
  }

  leave() {
    this.destroyed = true;
    if (this.timeout) clearTimeout(this.timeout);
    this.voice.destroy();
    this.conn?.close();
    this.peer?.destroy();
  }
}
