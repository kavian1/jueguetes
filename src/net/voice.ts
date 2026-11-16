// Chat de voz del Rincón: cada jugador que entra en la voz llama directamente a los demás
// (malla WebRTC sobre el mismo PeerJS de la partida). El anfitrión sólo reparte la lista
// de quién está en la voz; el audio nunca pasa por él.
import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';

/** Quién está en la voz (lo reparte el anfitrión a todos). */
export interface VoiceMember {
  playerId: string;
  peerId: string;
  muted: boolean;
}

/** Lo que cada jugador cuenta de sí mismo al anfitrión. */
export interface VoiceState {
  on: boolean;
  muted: boolean;
}

export type VoiceLink = 'self' | 'connecting' | 'ok' | 'failed';

export interface VoicePeer {
  playerId: string;
  muted: boolean;
  speaking: boolean;
  link: VoiceLink;
  /** volumen local con el que oigo a esta persona (0–1) */
  volume: number;
}

export interface VoiceSnapshot {
  /** el navegador permite WebRTC */
  supported: boolean;
  state: 'off' | 'starting' | 'on';
  muted: boolean;
  /** sin micrófono (o sin permiso): sólo escucha */
  noMic: boolean;
  /** todos los que están en la voz, yo incluido */
  members: VoicePeer[];
  notice?: string;
}

interface Call {
  conn: MediaConnection;
  audio: HTMLAudioElement | null;
  stream: MediaStream | null;
  link: VoiceLink;
}

const SPEAK_ON = 0.022; // nivel RMS a partir del cual alguien «habla»
const SPEAK_HOLD_MS = 320;
const RETRY_MS = [1500, 3000, 6000, 12000, 20000];
/** clave del medidor de mi propio micrófono */
const SELF = '·yo·';

function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'No diste permiso al micrófono: puedes escuchar, pero no te oirán. Pulsa el micro para volver a intentarlo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se encuentra ningún micrófono: puedes escuchar, pero no te oirán.';
  if (name === 'NotReadableError') return 'Otro programa está usando el micrófono: puedes escuchar, pero no te oirán.';
  return 'No se pudo abrir el micrófono: puedes escuchar, pero no te oirán.';
}

export class VoiceChat {
  private snap: VoiceSnapshot;
  private listeners = new Set<() => void>();
  private peer: Peer | null = null;
  private roster: VoiceMember[] = [];
  private calls = new Map<string, Call>(); // por peerId
  private retries = new Map<string, { n: number; timer: ReturnType<typeof setTimeout> | null }>();
  private volumes = new Map<string, number>(); // por playerId
  private local: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private meters = new Map<string, { node: AnalyserNode; src: MediaStreamAudioSourceNode; buf: Float32Array; last: number }>();
  private speaking = new Set<string>(); // peerIds (y SELF)
  private poll: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(private report: (s: VoiceState) => void) {
    const supported = typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
    this.snap = { supported, state: 'off', muted: false, noMic: false, members: [] };
  }

  // ── tienda para React ──

  getSnapshot = () => this.snap;
  private state = () => this.snap.state;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private set(patch: Partial<VoiceSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.snap.members = this.buildMembers();
    for (const l of this.listeners) l();
  }

  private refresh() {
    this.set({});
  }

  private buildMembers(): VoicePeer[] {
    const me = this.peer?.id;
    return this.roster.map((m) => {
      const self = m.peerId === me;
      const call = this.calls.get(m.peerId);
      return {
        playerId: m.playerId,
        muted: self ? this.snap.muted : m.muted,
        speaking: this.speaking.has(self ? SELF : m.peerId),
        link: self ? 'self' : (call?.link ?? ((this.retries.get(m.peerId)?.n ?? 0) >= 3 ? 'failed' : 'connecting')),
        volume: this.volumes.get(m.playerId) ?? 1,
      };
    });
  }

  // ── lo que llama la sesión ──

  /** La sesión abrió (o reabrió) su conexión PeerJS. */
  attach(peer: Peer) {
    if (this.peer === peer) return;
    this.closeAll();
    this.peer = peer;
    peer.on('call', (conn) => this.onIncoming(conn));
  }

  /** Nueva lista de quién está en la voz. */
  setRoster(roster: VoiceMember[]) {
    this.roster = roster;
    this.reconcile();
    this.refresh();
  }

  /** Volver a contar mi estado (p. ej. tras reconectar con el anfitrión). */
  resend() {
    if (this.snap.state === 'on') this.report({ on: true, muted: this.snap.muted });
  }

  // ── lo que pulsa el jugador ──

  async join() {
    if (this.snap.state !== 'off' || !this.snap.supported || this.destroyed) return;
    this.set({ state: 'starting', notice: undefined });
    try {
      // se crea dentro del clic para que el navegador deje sonar el audio
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    let stream: MediaStream | null = null;
    let notice: string | undefined;
    try {
      stream = await this.openMic();
    } catch (e) {
      notice = navigator.mediaDevices ? micError(e) : 'Este navegador no deja usar el micrófono aquí: puedes escuchar, pero no te oirán.';
    }
    if (this.destroyed || this.state() !== 'starting') {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    const noMic = !stream;
    this.local = stream ?? this.silentStream();
    if (this.local) this.meter(SELF, this.local);
    this.startPoll();
    this.set({ state: 'on', muted: noMic, noMic, notice });
    this.report({ on: true, muted: noMic });
    this.reconcile();
  }

  leave() {
    if (this.snap.state === 'off') return;
    this.closeAll();
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.stopPoll();
    for (const m of this.meters.values()) m.src.disconnect();
    this.meters.clear();
    this.speaking.clear();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.set({ state: 'off', muted: false, noMic: false, notice: undefined });
    this.report({ on: false, muted: false });
  }

  async toggleMute() {
    if (this.snap.state !== 'on') return;
    if (this.snap.noMic) return this.retryMic();
    const muted = !this.snap.muted;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.set({ muted });
    this.report({ on: true, muted });
  }

  setVolume(playerId: string, v: number) {
    const vol = Math.max(0, Math.min(1, v));
    this.volumes.set(playerId, vol);
    const m = this.roster.find((r) => r.playerId === playerId);
    const call = m && this.calls.get(m.peerId);
    if (call?.audio) call.audio.volume = vol;
    this.refresh();
  }

  destroy() {
    this.leave();
    this.destroyed = true;
    this.listeners.clear();
  }

  // ── micrófono ──

  private openMic(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('sin mediaDevices'));
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  }

  /** Pista muda para poder llamar y escuchar aunque no haya micrófono. */
  private silentStream(): MediaStream | null {
    try {
      return this.ctx ? this.ctx.createMediaStreamDestination().stream : null;
    } catch {
      return null;
    }
  }

  private async retryMic() {
    let stream: MediaStream;
    try {
      stream = await this.openMic();
    } catch (e) {
      this.set({ notice: micError(e) });
      return;
    }
    if (this.snap.state !== 'on') {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = stream.getAudioTracks()[0];
    for (const call of this.calls.values()) {
      const sender = call.conn.peerConnection?.getSenders().find((s) => !s.track || s.track.kind === 'audio');
      void sender?.replaceTrack(track).catch(() => {});
    }
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = stream;
    this.meter(SELF, stream);
    this.set({ muted: false, noMic: false, notice: undefined });
    this.report({ on: true, muted: false });
  }

  // ── llamadas ──

  /** Abre las llamadas que faltan y cuelga las que sobran. */
  private reconcile() {
    const me = this.peer?.id;
    const wanted = new Set(this.roster.map((m) => m.peerId));
    for (const [pid, call] of this.calls) if (!wanted.has(pid) || this.snap.state !== 'on') this.hangUp(pid, call);
    for (const [pid, r] of this.retries)
      if (!wanted.has(pid)) {
        if (r.timer) clearTimeout(r.timer);
        this.retries.delete(pid);
      }
    if (this.snap.state !== 'on' || !me || !this.local || !this.peer || this.peer.destroyed) return;
    for (const m of this.roster) {
      // de cada pareja llama sólo uno (el de identificador menor) para no cruzar llamadas
      if (m.peerId === me || this.calls.has(m.peerId) || me > m.peerId) continue;
      if (this.retries.get(m.peerId)?.timer) continue;
      this.dial(m.peerId);
    }
  }

  private dial(peerId: string) {
    if (!this.peer || !this.local) return;
    let conn: MediaConnection;
    try {
      conn = this.peer.call(peerId, this.local);
    } catch {
      this.scheduleRetry(peerId);
      return;
    }
    if (!conn) return this.scheduleRetry(peerId);
    this.track(peerId, conn);
  }

  private onIncoming(conn: MediaConnection) {
    if (this.snap.state !== 'on' || !this.local) {
      conn.close();
      return;
    }
    const old = this.calls.get(conn.peer);
    if (old && old.conn !== conn) this.hangUp(conn.peer, old);
    this.track(conn.peer, conn);
    conn.answer(this.local);
  }

  private track(peerId: string, conn: MediaConnection) {
    const call: Call = { conn, audio: null, stream: null, link: 'connecting' };
    this.calls.set(peerId, call);
    const failTimer = setTimeout(() => {
      if (this.calls.get(peerId) === call && call.link === 'connecting') this.dropped(peerId, call);
    }, 15000);
    conn.on('stream', (stream) => {
      if (this.calls.get(peerId) !== call) return;
      clearTimeout(failTimer);
      call.stream = stream;
      if (!call.audio) {
        call.audio = new Audio();
        call.audio.autoplay = true;
      }
      call.audio.srcObject = stream;
      const pl = this.roster.find((m) => m.peerId === peerId)?.playerId;
      call.audio.volume = pl ? (this.volumes.get(pl) ?? 1) : 1;
      void call.audio.play().catch(() => {});
      call.link = 'ok';
      this.meter(peerId, stream);
      const r = this.retries.get(peerId);
      if (r) r.n = 0;
      this.refresh();
    });
    conn.on('iceStateChanged', (s) => {
      if (this.calls.get(peerId) !== call) return;
      if (s === 'failed' || s === 'closed') this.dropped(peerId, call);
    });
    conn.on('close', () => {
      clearTimeout(failTimer);
      if (this.calls.get(peerId) === call) this.dropped(peerId, call);
    });
    conn.on('error', () => {
      clearTimeout(failTimer);
      if (this.calls.get(peerId) === call) this.dropped(peerId, call);
    });
    this.refresh();
  }

  /** Una llamada se cortó sola: limpiar y, si sigue en la voz, volver a llamar. */
  private dropped(peerId: string, call: Call) {
    this.hangUp(peerId, call);
    const still = this.roster.some((m) => m.peerId === peerId);
    if (still && this.snap.state === 'on') {
      this.scheduleRetry(peerId);
      // el que no llama marca el enlace como caído hasta que el otro reintente
      this.refresh();
    }
  }

  private scheduleRetry(peerId: string) {
    const r = this.retries.get(peerId) ?? { n: 0, timer: null };
    if (r.timer) return;
    const wait = RETRY_MS[Math.min(r.n, RETRY_MS.length - 1)];
    r.n++;
    r.timer = setTimeout(() => {
      r.timer = null;
      this.reconcile();
      this.refresh();
    }, wait);
    this.retries.set(peerId, r);
  }

  private hangUp(peerId: string, call: Call) {
    if (this.calls.get(peerId) === call) this.calls.delete(peerId);
    try {
      call.conn.close();
    } catch {
      /* ya cerrada */
    }
    if (call.audio) {
      call.audio.pause();
      call.audio.srcObject = null;
    }
    this.meters.get(peerId)?.src.disconnect();
    this.meters.delete(peerId);
    this.speaking.delete(peerId);
  }

  private closeAll() {
    for (const [pid, call] of [...this.calls]) this.hangUp(pid, call);
    for (const r of this.retries.values()) if (r.timer) clearTimeout(r.timer);
    this.retries.clear();
  }

  // ── quién está hablando ──

  private meter(key: string, stream: MediaStream) {
    if (!this.ctx || !stream.getAudioTracks().length) return;
    this.meters.get(key)?.src.disconnect();
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const node = this.ctx.createAnalyser();
      node.fftSize = 512;
      src.connect(node);
      this.meters.set(key, { node, src, buf: new Float32Array(node.fftSize), last: 0 });
    } catch {
      /* sin medidor: no se resaltará a quien hable */
    }
  }

  private startPoll() {
    if (this.poll) return;
    this.poll = setInterval(() => this.measure(), 110);
  }

  private stopPoll() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private measure() {
    const now = performance.now();
    let changed = false;
    for (const [key, m] of this.meters) {
      m.node.getFloatTimeDomainData(m.buf);
      let sum = 0;
      for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
      const rms = Math.sqrt(sum / m.buf.length);
      const muted = key === SELF && this.snap.muted;
      if (rms > SPEAK_ON && !muted) m.last = now;
      const on = now - m.last < SPEAK_HOLD_MS;
      if (on !== this.speaking.has(key)) {
        if (on) this.speaking.add(key);
        else this.speaking.delete(key);
        changed = true;
      }
    }
    if (changed) this.refresh();
  }
}
