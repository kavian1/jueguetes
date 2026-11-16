// Chat de voz: botón para la barra de arriba (o la sala) y el iconito que sale junto
// al nombre de quien está en la voz (y se mueve cuando habla).
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Session, Snapshot } from '../net/protocol';
import type { VoiceChat, VoicePeer, VoiceSnapshot } from '../net/voice';
import { C, custom, ell, minus, or, rect, registerIcons, ring, rrect, seg, type Ico, type Ramp } from '../pixel/icons';
import { Sprite } from '../pixel/Sprite';
import './voice.css';

// ───────────────────────── iconos ─────────────────────────

const grille = (_x: number, y: number, t: number) => (t === 2 && [3, 5, 7].includes(Math.floor(y)) ? 1 : t);
const coral = custom('#8a2e3e', '#c8485a', '#f06a6a', '#ff9c8a', '#ffd8c4');

/** soporte en U, pie y base */
function micStand(i: Ico, col: Ramp) {
  i.add(ring(8, 6.2, 5.0, 5.9, 0, 180), col, { light: false });
  i.add(rect(7.4, 12, 8.6, 13.6), col);
  i.add(rrect(4.6, 13.6, 11.4, 15, 0.6), col);
}
/** cápsula con rejilla */
function micHead(i: Ico, col: Ramp) {
  i.add(rrect(4.6, 0.8, 11.4, 10.2, 3.2), col, { spot: [6.2, 2.4], tone: grille });
}

registerIcons({
  /** micrófono abierto */
  voz_mic: (i) => {
    micStand(i, C.wood);
    micHead(i, C.sky);
  },
  /** micrófono silenciado */
  voz_mute: (i) => {
    micStand(i, C.tan);
    micHead(i, C.steel);
    i.add(seg(2.2, 1.8, 13.8, 13.6, 1), coral, { inner: false });
  },
  /** micrófono con rayitas: está hablando */
  voz_habla: (i) => {
    const rays = or(seg(13.4, 2.6, 14.8, 1.4, 0.5), seg(13.6, 5.4, 15.2, 5.4, 0.5), seg(2.6, 2.6, 1.2, 1.4, 0.5), seg(2.4, 5.4, 0.8, 5.4, 0.5));
    i.add(rays, C.gold, { inner: false, base: 3, light: false, shade: false });
    micStand(i, C.wood);
    micHead(i, C.green);
  },
  /** auriculares (sólo escucha) */
  voz_cascos: (i) => {
    i.add(minus(ell(8, 8.6, 6.4, 6.8), ell(8, 9.4, 4.8, 6)), C.violet, { spot: [4.4, 4] });
    i.add(rrect(1.4, 8.6, 4.4, 14.4, 1.2), coral, { spot: [2.4, 9.6] });
    i.add(rrect(11.6, 8.6, 14.6, 14.4, 1.2), coral, { spot: [12.6, 9.6] });
  },
});

// ───────────────────────── estado ─────────────────────────

/** El chat de voz de la sesión en curso (nulo en las partidas de práctica). */
export const VoiceContext = createContext<VoiceChat | null>(null);

const OFF: VoiceSnapshot = { supported: false, state: 'off', muted: false, noMic: false, members: [] };
const noSub = () => () => {};
const offSnap = () => OFF;

export function useVoice(voice: VoiceChat | null | undefined): VoiceSnapshot {
  return useSyncExternalStore(voice ? voice.subscribe : noSub, voice ? voice.getSnapshot : offSnap);
}

function memberIcon(m: VoicePeer) {
  return m.muted ? 'voz_mute' : m.speaking ? 'voz_habla' : 'voz_mic';
}

/** Iconito junto al nombre: está en la voz, silenciado o hablando. */
export function VoiceBadge({ playerId }: { playerId: string }) {
  const v = useVoice(useContext(VoiceContext));
  const m = v.members.find((x) => x.playerId === playerId);
  if (!m) return null;
  const title = m.muted ? 'En la voz (micro apagado)' : m.speaking ? 'Hablando' : 'En la voz';
  return (
    <span className={'voice-badge' + (m.speaking ? ' speaking' : '') + (m.muted ? ' muted' : '')} title={title} aria-label={title}>
      <Sprite name={memberIcon(m)} scale={1} />
    </span>
  );
}

// ───────────────────────── botón y panel ─────────────────────────

const LINK_TXT: Record<string, string> = { connecting: 'conectando…', failed: 'sin conexión' };

export function VoiceButton({ snap, session }: { snap: Snapshot; session: Session }) {
  const voice = session.voice;
  const v = useVoice(voice);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // si hay un aviso (p. ej. no hay micro), se abre el panel para que se lea
  useEffect(() => {
    if (v.notice) setOpen(true);
  }, [v.notice]);

  // el panel se pinta fuera de la mesa (para quedar por encima del tablero) junto al botón
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      // alineado a la derecha del botón, pero sin salirse de la pantalla (deja 10 px por cada lado)
      const vw = document.documentElement.clientWidth;
      const width = Math.min(290, vw - 20);
      const left = Math.max(10, Math.min(r.right - width, vw - width - 10));
      setPos({ top: r.bottom + 8, left, width });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, v.state]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!voice || snap.mode === 'solo') return null;

  const nameOf = (id: string) => snap.lobby.find((p) => p.id === id)?.name ?? 'Alguien';
  const inside = v.members.filter((m) => m.playerId !== snap.myId).length;
  const on = v.state === 'on';

  return (
    <div className="voice-ctl" ref={anchor}>
      {on ? (
        <>
          <button
            className={'btn small voice-mic ' + (v.noMic ? '' : v.muted ? 'danger' : 'primary')}
            onClick={() => void voice.toggleMute()}
            title={v.noMic ? 'Sin micrófono: pulsa para volver a intentarlo' : v.muted ? 'Encender el micro' : 'Silenciar el micro'}
            aria-pressed={v.muted}
          >
            <Sprite name={v.noMic ? 'voz_cascos' : v.muted ? 'voz_mute' : 'voz_mic'} scale={1} />
            <span className="voice-mic-txt">{v.noMic ? 'Escuchando' : v.muted ? 'Silenciado' : 'Micro'}</span>
          </button>
          <button className={'btn small' + (open ? ' blue' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Quién está en la voz">
            Voz · {v.members.length}
          </button>
        </>
      ) : (
        <button
          className="btn small blue voice-join"
          disabled={!v.supported || v.state === 'starting'}
          onClick={() => void voice.join()}
          title={v.supported ? 'Hablar con los demás jugadores' : 'Este navegador no permite chat de voz'}
        >
          <Sprite name="voz_mic" scale={1} />
          {v.state === 'starting' ? <span className="dots">Abriendo micro</span> : <span>Voz{inside ? ` · ${inside}` : ''}</span>}
        </button>
      )}

      {open &&
        on &&
        pos &&
        createPortal(
          <div className="voice-pop panel" ref={pop} style={{ top: pos.top, left: pos.left, width: pos.width }} role="dialog" aria-label="Chat de voz">
            <div className="voice-pop-title">Chat de voz</div>
            {v.notice && <div className="voice-notice">{v.notice}</div>}
            <div className="voice-list">
              {v.members.map((m) => {
                const me = m.playerId === snap.myId;
                return (
                  <div key={m.playerId} className={'voice-row' + (m.speaking ? ' speaking' : '')}>
                    <span className={'voice-badge' + (m.speaking ? ' speaking' : '') + (m.muted ? ' muted' : '')}>
                      <Sprite name={me && v.noMic ? 'voz_cascos' : memberIcon(m)} scale={1} />
                    </span>
                    <span className="voice-name">
                      {nameOf(m.playerId)}
                      {me && <span className="tag green">Tú</span>}
                    </span>
                    {!me && LINK_TXT[m.link] ? (
                      <span className={'voice-link ' + m.link}>{LINK_TXT[m.link]}</span>
                    ) : !me ? (
                      <input
                        className="voice-range"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={m.volume}
                        onChange={(e) => voice.setVolume(m.playerId, Number(e.target.value))}
                        aria-label={`Volumen de ${nameOf(m.playerId)}`}
                        title="Volumen"
                      />
                    ) : null}
                  </div>
                );
              })}
              {v.members.length < 2 && <div className="voice-empty">Aún no hay nadie más. Cuando alguien entre, os oiréis.</div>}
            </div>
            <div className="voice-tip">Con auriculares se oye mejor y no hay eco.</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btn small danger"
                onClick={() => {
                  voice.leave();
                  setOpen(false);
                }}
              >
                Salir de la voz
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
