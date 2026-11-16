import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { ClientSession, HostSession } from '../net/session';
import type { GameId, Session } from '../net/protocol';
import { paintTown } from '../pixel/world';
import { GAMES, gameById, type GameDef, type Theme } from './games';
import { Backdrop } from './Backdrop';
import { paintHub, paintIslaScene } from './hubArt';
import { paintVillaScene } from '../villa/art';
import { Hub } from './Hub';
import { GameHome } from './GameHome';
import { Lobby } from './Lobby';
import { PAGES, pageForGame, pageForPath } from '../site';
import { VoiceContext } from '../ui/Voice';
import './shell.css';

function readParam(name: string, re: RegExp, max: number): string {
  try {
    return (new URLSearchParams(location.search).get(name) ?? '').replace(re, '').slice(0, max);
  } catch {
    return '';
  }
}

/** Juego de la URL actual: /isla-cosecha/, /polvo-y-polvora/ o el antiguo ?juego=. */
function gameFromUrl(): GameDef | null {
  const byPath = pageForPath(location.pathname)?.game;
  return gameById(byPath ?? (readParam('juego', /[^a-z]/g, 10) as GameId));
}

function setUrl(game: GameId | null, push: boolean) {
  try {
    const path = pageForGame(game).path;
    if (location.pathname === path && !location.search) return;
    if (push) history.pushState(null, '', path);
    else history.replaceState(null, '', path);
  } catch {
    /* sin historial */
  }
}

const PAINT: Record<Theme | 'hub', (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  hub: paintHub,
  oeste: paintTown,
  isla: paintIslaScene,
  villa: paintVillaScene,
};

export function ThemeBackdrop({ theme }: { theme: Theme | 'hub' }) {
  return <Backdrop paint={PAINT[theme]} className={'bg-' + theme} />;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialCode] = useState(() => readParam('sala', /[^A-Z0-9]/g, 5).toUpperCase());
  const [picked, setPicked] = useState<GameDef | null>(gameFromUrl);

  // el botón «atrás» del navegador vuelve del juego al Rincón
  useEffect(() => {
    const onPop = () => !session && setPicked(gameFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [session]);

  // título de la pestaña según la pantalla
  useEffect(() => {
    if (!session) document.title = (picked ? pageForGame(picked.id) : PAGES[0]).title;
  }, [picked, session]);

  const leave = () => {
    session?.leave();
    setSession(null);
    setUrl(picked?.id ?? null, false);
  };

  const pick = (def: GameDef | null) => {
    setPicked(def);
    setUrl(def?.id ?? null, true);
    window.scrollTo(0, 0);
  };

  if (session) return <SessionView session={session} onLeave={leave} />;

  return (
    <>
      <ThemeBackdrop theme={picked ? picked.theme : 'hub'} />
      <div className={'app theme-' + (picked ? picked.theme : 'hub')}>
        {picked ? (
          <GameHome
            def={picked}
            onBack={() => pick(null)}
            onHost={(name) => setSession(new HostSession(picked.adapter, name, false))}
            onSolo={(name) => setSession(new HostSession(picked.adapter, name, true))}
          />
        ) : (
          <Hub games={GAMES} initialCode={initialCode} onPick={pick} onJoin={(name, code) => setSession(new ClientSession(name, code))} />
        )}
      </div>
    </>
  );
}

function SessionView({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const def = gameById(snap.game);

  // avisar antes de cerrar la pestaña si eres el anfitrión de una partida online
  useEffect(() => {
    if (snap.mode !== 'host') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [snap.mode]);

  const theme: Theme | 'hub' = def?.theme ?? 'hub';
  const inGame = snap.status === 'game' && snap.view && def;

  useEffect(() => {
    if (inGame) return; // la mesa pone su propio título
    document.title = def ? (snap.code ? `Sala ${snap.code} · ${def.title}` : def.title) : PAGES[0].title;
  }, [inGame, def, snap.code]);

  let body;
  if (snap.status === 'connecting')
    body = (
      <div className="center-screen">
        <div className="panel">
          <h2 style={{ margin: 0 }} className="dots">
            {snap.mode === 'client' ? `Conectando con la sala ${snap.code}` : 'Preparando la sala'}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Se abre una conexión directa entre navegadores.
          </p>
          <button className="btn" onClick={onLeave}>
            Cancelar
          </button>
        </div>
      </div>
    );
  else if (snap.status === 'error' || !def)
    body = (
      <div className="center-screen">
        <div className="panel">
          <h2 style={{ margin: 0 }}>Vaya…</h2>
          <p style={{ margin: 0 }}>{snap.error ?? 'No se reconoce el juego de esta sala.'}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {session.retry && (
              <button className="btn blue" onClick={() => session.retry!()}>
                Reintentar
              </button>
            )}
            <button className="btn" onClick={onLeave}>
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  else if (!inGame) body = <Lobby def={def} snap={snap} session={session} onLeave={onLeave} />;
  else
    body = (
      <Suspense
        fallback={
          <div className="center-screen">
            <div className="panel">
              <h2 className="dots" style={{ margin: 0 }}>
                Preparando la mesa
              </h2>
            </div>
          </div>
        }
      >
        <def.Table snap={snap} session={session} onLeave={onLeave} />
      </Suspense>
    );

  return (
    <VoiceContext.Provider value={session.voice ?? null}>
      {!inGame && <ThemeBackdrop theme={theme} />}
      <div className={'app theme-' + theme}>{body}</div>
    </VoiceContext.Provider>
  );
}
