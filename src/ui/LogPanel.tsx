import { useEffect, useRef, useState } from 'react';
/** Entrada del registro (todos los juegos usan la misma forma). */
export interface LogEntry {
  id: number;
  text: string;
  kind?: string;
}
import type { Session, Snapshot } from '../net/protocol';
import { Rich } from './common';

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

export function GameLog({ log }: { log: LogEntry[] }) {
  const last = log[log.length - 1]?.id;
  const ref = useAutoScroll(last);
  return (
    <div className="log" ref={ref} aria-live="polite">
      {log.map((l) => (
        <div key={l.id} className={'log-entry ' + (l.kind ?? '')}>
          <Rich text={l.text} />
        </div>
      ))}
    </div>
  );
}

export function ChatBox({ snap, session, height }: { snap: Snapshot; session: Session; height?: number }) {
  const [text, setText] = useState('');
  const last = snap.chat[snap.chat.length - 1]?.id;
  const ref = useAutoScroll(last);
  const send = () => {
    if (!text.trim()) return;
    session.sendChat(text);
    setText('');
  };
  return (
    <>
      <div className="log" ref={ref} style={height ? { height, flex: 'none' } : undefined}>
        {snap.chat.length === 0 && <div className="log-entry system">Aquí podéis hablar mientras jugáis.</div>}
        {snap.chat.map((m) => (
          <div key={m.id} className={'log-entry ' + (m.system ? 'system' : 'chat')}>
            {m.system ? m.text : <Rich text={`**${m.from}:** ${m.text}`} />}
          </div>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="input" value={text} maxLength={200} placeholder="Escribe un mensaje…" onChange={(e) => setText(e.target.value)} />
        <button className="btn small blue" type="submit">
          Enviar
        </button>
      </form>
    </>
  );
}

export function SidePanel({ snap, session, log }: { snap: Snapshot; session: Session; log: LogEntry[] }) {
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const [seenChat, setSeenChat] = useState(0);
  const online = snap.mode !== 'solo';
  const lastChat = snap.chat[snap.chat.length - 1]?.id ?? 0;
  useEffect(() => {
    if (tab === 'chat') setSeenChat(lastChat);
  }, [tab, lastChat]);
  const unread = online && tab === 'log' && lastChat > seenChat && snap.chat.some((m) => m.id > seenChat && !m.system);

  return (
    <aside className="side panel">
      <div className="side-title">
        {online ? (
          <div className="row" style={{ gap: 2 }}>
            <button className={'btn small' + (tab === 'log' ? ' blue' : '')} onClick={() => setTab('log')}>
              Registro
            </button>
            <button className={'btn small' + (tab === 'chat' ? ' blue' : '')} onClick={() => setTab('chat')}>
              Chat{unread ? ' •' : ''}
            </button>
          </div>
        ) : (
          <span>Registro</span>
        )}
      </div>
      {tab === 'log' || !online ? <GameLog log={log} /> : <ChatBox snap={snap} session={session} />}
    </aside>
  );
}
