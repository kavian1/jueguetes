import { Suspense, useEffect, useRef, useState } from 'react';
import { canShare, copyText } from './clipboard';
import type { Session, Snapshot } from '../net/protocol';
import { Sprite } from '../pixel/Sprite';
import { ChatBox } from '../ui/LogPanel';
import { VoiceBadge, VoiceButton } from '../ui/Voice';
import type { GameDef } from './games';

/** Sala de espera común a todos los juegos. */
export function Lobby({ def, snap, session, onLeave }: { def: GameDef; snap: Snapshot; session: Session; onLeave: () => void }) {
  const [copied, setCopied] = useState<'no' | 'ok' | 'manual'>('no');
  const [help, setHelp] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const isHost = snap.mode !== 'client';
  const n = snap.lobby.length;
  const { minPlayers: MIN, maxPlayers: MAX } = def.adapter;
  const link = `${location.origin}/?sala=${snap.code}`;
  const Help = def.Help;

  const copy = async () => {
    if (await copyText(link)) {
      setCopied('ok');
      setTimeout(() => setCopied((c) => (c === 'ok' ? 'no' : c)), 1800);
    } else setCopied('manual'); // el navegador no deja: se enseña el enlace para copiarlo a mano
  };

  const share = async () => {
    try {
      await navigator.share({ title: def.title, text: `¡Únete a mi partida de ${def.title}! Código ${snap.code}`, url: link });
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') void copy();
    }
  };

  // al aparecer el enlace para copiar a mano, queda seleccionado
  useEffect(() => {
    if (copied !== 'manual') return;
    linkRef.current?.focus();
    linkRef.current?.select();
  }, [copied]);

  return (
    <div className={'home home-' + def.id}>
      <h1 className="logo" style={{ fontSize: 'clamp(38px, 7vw, 60px)' }}>
        <small>★ {def.kicker} ★</small>
        {def.title}
      </h1>
      <div className="lobby panel">
        {snap.mode === 'solo' ? (
          <h2>Partida de práctica</h2>
        ) : (
          <div className="code-box">
            <div>
              <div style={{ fontSize: 13 }}>Código de la sala</div>
              <div className="code">{snap.code}</div>
            </div>
            <div className="row" style={{ gap: 2 }}>
              {canShare() && (
                <button className="btn primary" onClick={share}>
                  Compartir
                </button>
              )}
              <button className="btn blue" onClick={copy}>
                {copied === 'ok' ? '¡Enlace copiado!' : 'Copiar enlace de invitación'}
              </button>
            </div>
            {copied === 'manual' && (
              <div className="link-manual">
                <span>Tu navegador no deja copiar solo. Copia el enlace a mano (Ctrl+C, o mantén pulsado en el móvil):</span>
                <input ref={linkRef} className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
              </div>
            )}
          </div>
        )}

        {def.adapter.options?.map((opt) => {
          const cur = snap.options?.[opt.id] ?? opt.default;
          const chosen = opt.choices.find((c) => c.id === cur);
          return (
            <div key={opt.id} className="room-option">
              <h2>{opt.label}</h2>
              <div className="room-choices">
                {opt.choices.map((c) => (
                  <button
                    key={c.id}
                    className={'room-choice panel' + (c.id === cur ? ' on' : '')}
                    disabled={!isHost && c.id !== cur}
                    onClick={() => isHost && session.setOption?.(opt.id, c.id)}
                    title={c.hint}
                  >
                    <b>{c.label}</b>
                    {c.hint && <span>{c.hint}</span>}
                  </button>
                ))}
              </div>
              {!isHost && chosen && <div className="muted" style={{ fontSize: 13 }}>Lo elige el anfitrión.</div>}
            </div>
          );
        })}

        <div>
          <h2>
            Jugadores ({n}/{MAX})
          </h2>
          <div className="lobby-list">
            {snap.lobby.map((p) => (
              <div key={p.id} className="lobby-player">
                <Sprite name={p.isBot ? 'bot' : 'hat'} scale={p.isBot ? 3 : 2} />
                <span className="name">{p.name}</span>
                <VoiceBadge playerId={p.id} />
                {p.isHost && <span className="tag gold">Anfitrión</span>}
                {p.id === snap.myId && <span className="tag green">Tú</span>}
                {p.isBot && <span className="tag grey">Bot</span>}
                {!p.connected && <span className="tag red">Desconectado</span>}
                {isHost && !p.isHost && (
                  <button className="btn small" onClick={() => session.removePlayer?.(p.id)} aria-label={`Quitar a ${p.name}`}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {isHost ? (
          <>
            <div className="row">
              <button className="btn" disabled={n >= MAX} onClick={() => session.addBot?.()}>
                + Añadir bot
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn primary big" disabled={n < MIN} onClick={() => session.start?.()}>
                ¡Empezar partida!
              </button>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {n < MIN
                ? `Faltan ${MIN - n} jugador${MIN - n > 1 ? 'es' : ''}. Comparte el código o rellena con bots.`
                : snap.mode === 'host'
                  ? 'Todo listo. Si alguien se desconecta en mitad de la partida puede volver con el mismo enlace.'
                  : 'Todo listo.'}
            </div>
          </>
        ) : (
          <div className="muted dots">Esperando a que el anfitrión empiece la partida</div>
        )}

        {snap.mode !== 'solo' && (
          <div className="panel" style={{ margin: '6px 3px 3px', boxShadow: 'var(--pxb2)' }}>
            <div className="voice-lobby-head">
              <b>Charla</b>
              <VoiceButton snap={snap} session={session} />
            </div>
            <ChatBox snap={snap} session={session} height={130} />
          </div>
        )}

        <div className="row">
          <button className="btn small" onClick={() => setHelp(true)}>
            Cómo se juega
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn small danger" onClick={onLeave}>
            Salir
          </button>
        </div>
      </div>
      {help && (
        <Suspense fallback={null}>
          <Help onClose={() => setHelp(false)} />
        </Suspense>
      )}
    </div>
  );
}
