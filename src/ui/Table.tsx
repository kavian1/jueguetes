import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Answer, Card, GameView, PlayAction, PublicPlayer } from '../game/types';
import type { Session, Snapshot } from '../net/protocol';
import { CARD_DEFS, cardName } from '../game/cards';
import { CHARACTERS, ROLE_INFO } from '../game/characters';
import {
  distance,
  hurtoRange,
  needsCardTarget,
  needsPlayerTarget,
  shotLimit,
  targetError,
  validatePlay,
  validTargets,
  weaponName,
  weaponOf,
  weaponRange,
  type PlayContext,
} from '../game/rules';
import { Sprite } from '../pixel/Sprite';
import { CardBack, CardView, Chip, Hearts, Modal, Portrait, RoleBadge } from './common';
import { Help } from './Help';
import { SidePanel } from './LogPanel';
import { VoiceBadge, VoiceButton } from './Voice';
import { PovTableCanvas, SaloonAmbience, SceneBackground, TableCanvas } from './Scenery';
import { FxLayer } from './FxLayer';
import { POV, worldScale } from '../pixel/world';
import { FIG_H, FIG_W } from '../pixel/chibi';

type AnchorFn = (key: string) => (el: HTMLElement | null) => void;

const WAIT_LABEL: Record<string, string> = {
  play: 'está pensando su jugada',
  discard: 'está descartando',
  shot: 'decide si esquiva',
  beer: 'decide si se toma un Whisky',
  duel: 'responde al Duelo',
  estampida: 'responde a la Estampida',
  store: 'elige en la Subasta',
  olmo: 'elige sus cartas',
};

const KIND_ORDER = Object.keys(CARD_DEFS);

export function Table({ snap, session, onLeave }: { snap: Snapshot<GameView>; session: Session<GameView, Answer>; onLeave: () => void }) {
  const view = snap.view!;
  const players = view.players;
  const me = players.find((p) => p.id === view.me);
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.name ?? '?';
  const myIdx = players.findIndex((p) => p.id === view.me);
  const opponents = myIdx >= 0 ? [...players.slice(myIdx + 1), ...players.slice(0, myIdx)] : players;
  const prompt = view.prompt;
  const pr = prompt?.prompt;
  const ctx: PlayContext = { players, meId: view.me, hand: view.hand, shotsThisTurn: view.shotsThisTurn };
  const isHost = snap.mode !== 'client';
  const hand = [...view.hand].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id - b.id);

  const [selected, setSelected] = useState<number[]>([]);
  const [armed, setArmed] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ cardId: number; targetId: string } | null>(null);
  const [ability, setAbility] = useState(false);
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [hideEnd, setHideEnd] = useState(false);

  // tamaño de la mesa para decidir si los asientos caben en círculo
  const boardRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBoard({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSelected([]);
    setArmed(null);
    setPicker(null);
    setAbility(false);
  }, [prompt?.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // título de la pestaña: avisa cuando te toca
  useEffect(() => {
    document.title = prompt ? '¡Te toca! · Polvo y Pólvora' : 'Polvo y Pólvora';
    return () => {
      document.title = 'Polvo y Pólvora';
    };
  }, [prompt?.id]);

  // anclajes: elementos de la mesa desde/hacia donde vuelan las animaciones
  const anchors = useRef(new Map<string, HTMLElement>());
  const anchor = (key: string) => (el: HTMLElement | null) => {
    if (el) anchors.current.set(key, el);
    else if (anchors.current.get(key)?.isConnected === false) anchors.current.delete(key);
  };
  const gameRef = useRef<HTMLDivElement>(null);

  // ── acciones ──

  const reset = () => {
    setSelected([]);
    setArmed(null);
    setPicker(null);
    setAbility(false);
  };

  const answer = (a: Answer) => {
    if (prompt) session.answer(prompt.id, a);
    reset();
  };

  const playAction = (action: PlayAction) => {
    const err = validatePlay(ctx, action);
    if (err) {
      setToast(err);
      return;
    }
    answer({ action });
  };

  const toggleSelect = (id: number, max: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? (max === 1 ? [id] : s) : [...s, id]));

  /** ¿Se puede jugar esta carta ahora? Si no, por qué. */
  const playError = (card: Card): string | null => {
    if (!me) return 'No estás en la partida.';
    if (needsPlayerTarget(card.kind)) {
      if (card.kind === 'disparo' && view.shotsThisTurn >= shotLimit(me)) return 'Ya has disparado este turno.';
      for (const t of validTargets(ctx, card.kind)) {
        const tp = players.find((p) => p.id === t)!;
        const tc = needsCardTarget(card.kind) ? (tp.handCount > 0 ? 'hand' : tp.inPlay[0]?.id) : undefined;
        if (!validatePlay(ctx, { kind: 'card', cardId: card.id, target: t, targetCard: tc })) return null;
      }
      switch (card.kind) {
        case 'disparo':
          return `Nadie está a tu alcance (${weaponRange(me)}).`;
        case 'hurto':
          return `Nadie con cartas a distancia ${hurtoRange(me)}.`;
        case 'calabozo':
          return 'No hay nadie a quien encerrar.';
        default:
          return 'Nadie tiene cartas.';
      }
    }
    return validatePlay(ctx, { kind: 'card', cardId: card.id });
  };

  const armedCard = view.hand.find((c) => c.id === armed) ?? null;
  const targeting = pr?.type === 'play' && !!armedCard && needsPlayerTarget(armedCard.kind);
  const validT = targeting ? validTargets(ctx, armedCard!.kind) : [];

  const onCardClick = (card: Card) => {
    if (!pr) return;
    switch (pr.type) {
      case 'play': {
        if (ability) return toggleSelect(card.id, 2);
        if (armed === card.id) {
          if (!needsPlayerTarget(card.kind)) playAction({ kind: 'card', cardId: card.id });
          else setArmed(null);
          return;
        }
        const err = playError(card);
        if (err) {
          setToast(err);
          setArmed(null);
          return;
        }
        setArmed(card.id);
        return;
      }
      case 'discard':
        return toggleSelect(card.id, pr.count);
      case 'duel':
      case 'estampida':
        if (card.kind === 'disparo') answer({ cards: [card.id] });
        return;
      case 'shot':
        if (card.kind === 'esquiva') toggleSelect(card.id, pr.needed);
        return;
      case 'beer':
        if (card.kind === 'manzanilla') toggleSelect(card.id, pr.needed);
        return;
    }
  };

  const onSeatClick = (p: PublicPlayer) => {
    if (targeting && armedCard) {
      if (!validT.includes(p.id)) {
        setToast(targetError(ctx, armedCard.kind, p.id) ?? 'Ese objetivo no vale.');
        return;
      }
      if (needsCardTarget(armedCard.kind) && p.inPlay.length > 0) {
        setPicker({ cardId: armedCard.id, targetId: p.id });
        return;
      }
      playAction({ kind: 'card', cardId: armedCard.id, target: p.id, targetCard: needsCardTarget(armedCard.kind) ? 'hand' : undefined });
      return;
    }
    setInfo(p.id);
  };

  const pickOf = (kind: Card['kind'], n: number) =>
    [...selected.filter((id) => view.hand.find((c) => c.id === id)?.kind === kind), ...view.hand.filter((c) => c.kind === kind && !selected.includes(c.id)).map((c) => c.id)].slice(0, n);

  // ── barra de acciones ──

  let text: ReactNode = null;
  let buttons: ReactNode = null;
  let urgent = false;
  if (!me) text = 'Estás mirando la partida.';
  else if (view.winner) text = <b>{view.winner.text}</b>;
  else if (!pr) {
    if (!me.alive) text = 'Has quedado fuera. Sigue la partida desde la orilla.';
    else if (view.waiting)
      text = (
        <span className="dots">
          <b>{nameOf(view.waiting.playerId)}</b> {WAIT_LABEL[view.waiting.type]}
        </span>
      );
    else
      text = (
        <>
          Turno de <b>{nameOf(view.turn)}</b>
        </>
      );
  } else if (pr.type === 'play') {
    const excess = view.hand.length - me.hp;
    if (ability) {
      text = (
        <>
          <b>Remedio casero:</b> elige 2 cartas para descartar y recuperar 1 vida ({selected.length}/2).
        </>
      );
      buttons = (
        <>
          <button className="btn primary" disabled={selected.length !== 2} onClick={() => playAction({ kind: 'ability', cards: selected })}>
            Confirmar
          </button>
          <button className="btn" onClick={reset}>
            Cancelar
          </button>
        </>
      );
    } else if (armedCard && targeting) {
      text = (
        <>
          <b>{cardName(armedCard)}</b>: toca a un jugador marcado en rojo.
        </>
      );
      buttons = (
        <button className="btn" onClick={() => setArmed(null)}>
          Cancelar
        </button>
      );
    } else if (armedCard) {
      text = (
        <>
          ¿Jugar <b>{cardName(armedCard)}</b>? <span className="muted">{CARD_DEFS[armedCard.kind].text}</span>
        </>
      );
      buttons = (
        <>
          <button className="btn primary" onClick={() => playAction({ kind: 'card', cardId: armedCard.id })}>
            Jugar
          </button>
          <button className="btn" onClick={() => setArmed(null)}>
            Cancelar
          </button>
        </>
      );
    } else {
      text = (
        <>
          <b>¡Tu turno!</b> Toca una carta para jugarla.
          {excess > 0 && <span className="muted"> Al terminar descartarás {excess}.</span>}
          {pr.error && <span className="err">{pr.error}</span>}
        </>
      );
      buttons = (
        <>
          {me.character === 'nuez' && me.hp < me.maxHp && view.hand.length >= 2 && (
            <button className="btn" onClick={() => setAbility(true)}>
              Remedio casero
            </button>
          )}
          <button className="btn blue" onClick={() => answer({ action: { kind: 'end' } })}>
            Terminar turno
          </button>
        </>
      );
    }
  } else if (pr.type === 'discard') {
    text = (
      <>
        Tienes <b>{pr.count}</b> carta{pr.count > 1 ? 's' : ''} de más: elige cuál{pr.count > 1 ? 'es' : ''} descartar ({selected.length}/{pr.count}).
      </>
    );
    buttons = (
      <button className="btn primary" disabled={selected.length !== pr.count} onClick={() => answer({ cards: selected })}>
        Descartar
      </button>
    );
  } else if (pr.type === 'shot') {
    urgent = true;
    text = (
      <>
        ¡<b>{nameOf(pr.attacker)}</b> te dispara{pr.cause === 'rafaga' ? ' con su Ráfaga' : ''}!{' '}
        {pr.needed > 1 ? 'Necesitas 2 Esquivas.' : '¿Usas una Esquiva?'}
      </>
    );
    buttons = (
      <>
        <button className="btn primary" onClick={() => answer({ cards: pickOf('esquiva', pr.needed) })}>
          Esquivar
        </button>
        <button className="btn danger" onClick={() => answer({ cards: [] })}>
          Recibir el golpe
        </button>
      </>
    );
  } else if (pr.type === 'beer') {
    urgent = true;
    text = (
      <>
        <b>¡Vas a caer!</b> Tómate {pr.needed > 1 ? `${pr.needed} Whiskies` : "un Whisky"} para seguir en pie.
      </>
    );
    buttons = (
      <>
        <button className="btn primary" onClick={() => answer({ cards: pickOf('manzanilla', pr.needed) })}>
          Beber
        </button>
        <button className="btn danger" onClick={() => answer({ cards: [] })}>
          Caer
        </button>
      </>
    );
  } else if (pr.type === 'duel' || pr.type === 'estampida') {
    urgent = true;
    text =
      pr.type === 'duel' ? (
        <>
          Duelo contra <b>{nameOf(pr.opponent)}</b>: descarta un Disparo o pierde 1 vida.
        </>
      ) : (
        <>
          ¡Estampida de <b>{nameOf(pr.attacker)}</b>! Descarta un Disparo o pierde 1 vida.
        </>
      );
    buttons = (
      <>
        <button className="btn primary" onClick={() => answer({ cards: pickOf('disparo', 1) })}>
          Descartar Disparo
        </button>
        <button className="btn danger" onClick={() => answer({ cards: [] })}>
          Perder 1 vida
        </button>
      </>
    );
  } else if (pr.type === 'store') text = <b>Subasta: elige una carta.</b>;
  else if (pr.type === 'olmo') text = <b>Bola de cristal: elige 2 de las 3 cartas.</b>;

  const glowKind = pr?.type === 'shot' ? 'esquiva' : pr?.type === 'beer' ? 'manzanilla' : pr?.type === 'duel' || pr?.type === 'estampida' ? 'disparo' : null;
  const pov = povLayout(board.w, board.h, opponents.length);
  const infoPlayer = info ? players.find((p) => p.id === info) : null;
  const pickerTarget = picker ? players.find((p) => p.id === picker.targetId) : null;
  const iWon = !!view.winner && view.winner.ids.includes(view.me);

  const seatProps = (p: PublicPlayer) => ({
    p,
    me,
    players,
    anchor,
    isTurn: view.turn === p.id && !view.winner,
    waiting: view.waiting?.playerId === p.id,
    targetable: targeting && validT.includes(p.id),
    dim: targeting && !validT.includes(p.id),
    onClick: () => onSeatClick(p),
  });

  const centerPiles = (
    <>
      <div className="pile" ref={anchor('deck')}>
        <CardBack label={`${view.deckCount} cartas en el mazo`} />
        <span>Mazo · {view.deckCount}</span>
      </div>
      <div className="pile" ref={anchor('discard')}>
        {view.discardTop ? <CardView key={view.discardTop.id} card={view.discardTop} size="small" /> : <div className="card small empty" />}
        <span>Descarte</span>
      </div>
      {view.store ? (
        <div className="store panel" ref={anchor('store')}>
          <div className="store-title">Subasta</div>
          {view.store.map((c) => (
            <CardView key={c.id} card={c} size="small" glow={pr?.type === 'store'} onClick={pr?.type === 'store' ? () => answer({ cards: [c.id] }) : undefined} />
          ))}
        </div>
      ) : (
        <div className="spot-anchor" ref={anchor('center')} />
      )}
    </>
  );

  return (
    <div className="game" ref={gameRef}>
      <SceneBackground variant="saloon" />
      <SaloonAmbience />
      <div className="topbar">
        <h1 className="logo mini">Polvo y Pólvora</h1>
        {snap.mode !== 'solo' && (
          <span className="tag">
            Sala <b>{snap.code}</b>
          </span>
        )}
        <span className="turn-pill">
          {view.winner ? 'Partida terminada' : view.turn === view.me ? <b>¡Tu turno!</b> : <>Turno de <b>{nameOf(view.turn)}</b></>}
        </span>
        <span className="tag grey">Mazo {view.deckCount}</span>
        <span className="spacer" />
        <VoiceButton snap={snap} session={session} />
        {view.winner && hideEnd && (
          <button className="btn small primary" onClick={() => setHideEnd(false)}>
            Ver resultado
          </button>
        )}
        <button className="btn small" onClick={() => setHelp(true)}>
          Reglas
        </button>
        <button className="btn small danger" onClick={() => setConfirmLeave(true)}>
          Salir
        </button>
      </div>

      <div className="game-main">
        <div className={'board ' + (pov ? 'pov' : 'compact')} ref={boardRef}>
        {!board.w ? null : pov ? (
          <>
            {/* 1. rivales sentados (la mesa les tapa la cintura) */}
            <div className="pov-layer">
              {opponents.map((p, i) => (
                <PovFigure key={p.id} s={pov.seats[i]} {...seatProps(p)} />
              ))}
            </div>
            {/* 2. la mesa */}
            <PovTableCanvas />
            {/* 3. lo que hay encima de la mesa */}
            <div className="pov-layer">
              {opponents.map((p, i) => (
                <PovTableItems key={p.id} s={pov.seats[i]} {...seatProps(p)} />
              ))}
              <div className="pov-center" style={{ left: pov.cx, top: pov.centerY }}>
                {centerPiles}
              </div>
              {me && (
                <div className="pov-mine" style={{ left: pov.cx, top: board.h - 8 }} ref={anchor('play:' + me.id)}>
                  {me.inPlay.map((c) => (
                    <MiniCard key={c.id} card={c} />
                  ))}
                </div>
              )}
            </div>
            {/* 4. carteles con nombre, vida y punto de mira */}
            <div className="pov-layer labels">
              {opponents.map((p, i) => (
                <PovPlate key={p.id} s={pov.seats[i]} {...seatProps(p)} />
              ))}
            </div>
          </>
        ) : (
          <>
            <TableCanvas />
            <div className="board-inner">
              <div className="ring">
                {opponents.map((p) => (
                  <Seat key={p.id} {...seatProps(p)} />
                ))}
              </div>
              <div className="center">{centerPiles}</div>
            </div>
          </>
        )}
        </div>
      </div>

      <div className="me-area">
        {me ? (
          <MyCard p={me} isTurn={view.turn === me.id && !view.winner} anchor={anchor} showInPlay={!pov} />
        ) : (
          <div className="me-card panel">Espectador</div>
        )}
        <div className="hand-col">
          <div className={'prompt-bar panel' + (urgent ? ' urgent' : '')}>
            <div className="prompt-text">
              {text}
              {toast && <span className="err">{toast}</span>}
            </div>
            {buttons}
          </div>
          <div className="hand fan" ref={anchor('hand:' + view.me)} style={{ ['--overlap' as string]: `${22 + Math.max(0, hand.length - 6) * 7}px` }}>
            {hand.length === 0 && <span className="hand-empty">No tienes cartas en la mano.</span>}
            {hand.map((c, i) => {
              const dim = pr?.type === 'play' && !ability ? playError(c) !== null : glowKind ? c.kind !== glowKind : false;
              const off = i - (hand.length - 1) / 2;
              const rot = hand.length > 1 ? off * Math.min(4, 26 / hand.length) : 0;
              return (
                <CardView
                  key={c.id}
                  style={{ ['--rot' as string]: `${rot}deg`, ['--lift' as string]: `${Math.abs(off) ** 2 * 1.3}px`, animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  card={c}
                  selected={selected.includes(c.id) || armed === c.id}
                  dim={dim}
                  glow={!!glowKind && c.kind === glowKind}
                  onClick={() => onCardClick(c)}
                  onDoubleClick={() => pr?.type === 'play' && !ability && !needsPlayerTarget(c.kind) && playAction({ kind: 'card', cardId: c.id })}
                />
              );
            })}
          </div>
        </div>
        <SidePanel snap={snap} session={session} log={view.log} />
      </div>

      {/* ── modales ── */}

      {pr?.type === 'olmo' && (
        <Modal narrow>
          <h2>Bola de cristal</h2>
          <p>Elige 2 cartas para quedártelas. La otra vuelve a lo alto del mazo.</p>
          <div className="card-row">
            {pr.cards.map((c) => (
              <CardView key={c.id} card={c} selected={selected.includes(c.id)} onClick={() => toggleSelect(c.id, 2)} />
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" disabled={selected.length !== 2} onClick={() => answer({ cards: selected })}>
              Quedármelas
            </button>
          </div>
        </Modal>
      )}

      {pr?.type === 'store' && (
        <Modal narrow>
          <h2>Subasta</h2>
          <p>Elige una carta para tu mano.</p>
          <div className="card-row">
            {pr.cards.map((c) => (
              <CardView key={c.id} card={c} glow onClick={() => answer({ cards: [c.id] })} />
            ))}
          </div>
        </Modal>
      )}

      {picker && pickerTarget && (
        <Modal narrow onClose={() => setPicker(null)}>
          <h2>
            {cardName(view.hand.find((c) => c.id === picker.cardId)?.kind ?? 'hurto')} a {pickerTarget.name}
          </h2>
          <p>¿Qué carta quieres {view.hand.find((c) => c.id === picker.cardId)?.kind === 'hurto' ? 'quitarle' : 'tirarle'}?</p>
          <div className="picker">
            {pickerTarget.handCount > 0 && (
              <button className="btn" onClick={() => playAction({ kind: 'card', cardId: picker.cardId, target: pickerTarget.id, targetCard: 'hand' })}>
                <Sprite name="cardBack" scale={3} /> Una carta al azar de su mano ({pickerTarget.handCount})
              </button>
            )}
            {pickerTarget.inPlay.map((c) => (
              <button key={c.id} className="btn" onClick={() => playAction({ kind: 'card', cardId: picker.cardId, target: pickerTarget.id, targetCard: c.id })}>
                <Sprite name={c.kind} scale={2} /> {cardName(c)} <span className="muted">(en juego)</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {infoPlayer && (
        <Modal narrow onClose={() => setInfo(null)}>
          <PlayerInfo p={infoPlayer} me={me} players={players} />
        </Modal>
      )}

      {view.winner && !hideEnd && (
        <Modal narrow>
          <h2>{view.winner.text}</h2>
          <p>{iWon ? '¡Has ganado! 🎉' : me ? 'Esta vez no ha podido ser.' : ''}</p>
          <div className="winner-list">
            {players.map((p) => (
              <div key={p.id} className={'winner-row' + (view.winner!.ids.includes(p.id) ? ' won' : '')}>
                <Sprite name={p.character} scale={2} />
                <b style={{ flex: 1 }}>{p.name}</b>
                {p.role && <RoleBadge role={p.role} />}
                {!p.alive && <span className="tag grey">eliminado</span>}
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {isHost ? (
              <button className="btn primary" onClick={() => session.backToLobby?.()}>
                Volver a la sala
              </button>
            ) : (
              <span className="muted dots">Esperando a que el anfitrión vuelva a la sala</span>
            )}
            <button className="btn small" onClick={() => setHideEnd(true)}>
              Ver la mesa
            </button>
          </div>
        </Modal>
      )}

      {confirmLeave && (
        <Modal narrow onClose={() => setConfirmLeave(false)}>
          <h2>¿Salir de la partida?</h2>
          <p>{snap.mode === 'host' ? 'Eres el anfitrión: si sales, la partida se acaba para todos.' : 'Podrás volver a entrar con el mismo código mientras dure la partida.'}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirmLeave(false)}>
              Seguir jugando
            </button>
            <button className="btn danger" onClick={onLeave}>
              Salir
            </button>
          </div>
        </Modal>
      )}

      {help && <Help onClose={() => setHelp(false)} />}

      <FxLayer fx={view.fx} round={view.round} me={view.me} players={players} anchors={anchors} shakeRef={gameRef} />
    </div>
  );
}

// ───────────────────────── asientos ─────────────────────────

const PLATE_W = 128;
const PLATE_H = 48;
/** parte de la figura que queda oculta tras el borde de la mesa */
const SINK = 0.25;

interface PovSeatPos {
  x: number;
  y: number;
  scale: number;
  qx: number;
  qy: number;
}

/**
 * Vista en primera persona: los rivales se sientan al fondo de la mesa, repartidos por el borde
 * de una elipse aplastada (empezando por tu izquierda, en el sentido del turno).
 * Devuelve null si no caben y entonces se usa la cuadrícula compacta.
 */
function povLayout(w: number, h: number, n: number) {
  if (w < 660 || h < 360 || window.innerWidth <= 860) return null;
  const cx = w * POV.cx;
  const cy = h * POV.cy;
  const rx = w * POV.rx;
  const ry = h * POV.ry;
  const span = n <= 3 ? 112 : n === 4 ? 126 : 134;
  const centerY = h * 0.62;
  for (const scale of [...new Set([worldScale(), 3])]) {
    const seats: PovSeatPos[] = Array.from({ length: n }, (_, i) => {
      const deg = 270 - span / 2 + (n === 1 ? span / 2 : (i * span) / (n - 1));
      const th = (deg * Math.PI) / 180;
      const x = Math.min(w - PLATE_W / 2 - 4, Math.max(PLATE_W / 2 + 4, cx + rx * Math.cos(th)));
      const y = cy + ry * Math.sin(th);
      return { x, y, scale, qx: x + (cx - x) * 0.3, qy: y + (centerY - y) * 0.42 };
    });
    // los carteles no pueden pisarse ni salirse por arriba, ni las figuras chocar entre sí
    let fits = seats.every((s) => s.y + FIG_H * scale * SINK - FIG_H * scale - PLATE_H >= 0);
    for (let i = 1; i < n && fits; i++) {
      const a = seats[i - 1];
      const b = seats[i];
      if (Math.abs(a.x - b.x) < PLATE_W + 6 && Math.abs(a.y - b.y) < 62) fits = false;
      if (Math.abs(a.x - b.x) < FIG_W * scale + 4 && Math.abs(a.y - b.y) < FIG_H * scale * 0.7) fits = false;
    }
    if (fits) return { cx, cy, centerY, seats };
  }
  return null;
}

interface SeatProps {
  p: PublicPlayer;
  me?: PublicPlayer;
  players: PublicPlayer[];
  anchor: AnchorFn;
  isTurn: boolean;
  waiting: boolean;
  targetable: boolean;
  dim: boolean;
  onClick: () => void;
}

/** Cuerpo del rival sentado al otro lado de la mesa. */
function PovFigure({ p, s, isTurn, targetable, dim, anchor }: SeatProps & { s: PovSeatPos }) {
  const blink = useBlink();
  const sink = FIG_H * s.scale * SINK;
  const cls = ['fig-wrap', isTurn && 'turn', targetable && 'target', dim && 'dim', !p.alive && 'dead'].filter(Boolean).join(' ');
  return (
    <div className="pov-fig" style={{ left: s.x, top: s.y + sink }}>
      <div className={cls} ref={anchor('seat:' + p.id)} style={{ animationDelay: `${(p.id.charCodeAt(p.id.length - 1) % 7) * 0.23}s`, ['--px' as string]: `${s.scale}px` }}>
        <Sprite name={'fig_' + p.character + (blink || !p.alive ? '_blink' : '')} scale={s.scale} />
      </div>
    </div>
  );
}

/** Parpadeo aleatorio cada pocos segundos. */
function useBlink() {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        t = setTimeout(() => {
          setBlink(false);
          loop();
        }, 150);
      }, 2500 + Math.random() * 4500);
    };
    loop();
    return () => clearTimeout(t);
  }, []);
  return blink;
}

/** Lo que el rival tiene sobre la mesa: su abanico de cartas y su equipo. */
function PovTableItems({ p, s, isTurn, anchor, onClick }: SeatProps & { s: PovSeatPos }) {
  const shown = Math.min(p.handCount, 9);
  return (
    <>
      {isTurn && <div className="pov-glow" style={{ left: s.x, top: s.y + 6 }} />}
      {p.alive && (
        <div className="pov-fan" style={{ left: s.x, top: s.y + 2, width: 15 + Math.max(0, shown - 1) * 7 }} ref={anchor('hand:' + p.id)} title={`${p.handCount} cartas en la mano`}>
          {Array.from({ length: shown }, (_, i) => {
            const off = i - (shown - 1) / 2;
            return (
              <span key={i} style={{ left: i * 7, top: Math.abs(off) ** 2 * 0.9 }}>
                <Sprite name="cardBackMini" scale={3} />
              </span>
            );
          })}
          {p.handCount > 9 && <b className="fan-count">{p.handCount}</b>}
        </div>
      )}
      <div className="pov-inplay" style={{ left: s.qx, top: s.qy }} ref={anchor('play:' + p.id)} onClick={onClick}>
        {p.inPlay.map((c) => (
          <MiniCard key={c.id} card={c} />
        ))}
      </div>
    </>
  );
}

/** Cartel con nombre, vida y rol sobre la cabeza del rival (y zona clicable sobre su figura). */
function PovPlate({ p, s, me, players, isTurn, waiting, targetable, dim, anchor, onClick }: SeatProps & { s: PovSeatPos }) {
  const ch = CHARACTERS[p.character];
  const sink = FIG_H * s.scale * SINK;
  const figTop = s.y + sink - FIG_H * s.scale;
  const dist = me && me.alive && p.alive ? distance(players, me.id, p.id) : null;
  const inRange = dist !== null && me ? dist <= weaponRange(me) : false;
  const cls = ['plate', isTurn && 'turn', targetable && 'target', dim && 'dim', !p.alive && 'dead'].filter(Boolean).join(' ');
  return (
    <>
      <button
        className="fig-hit"
        style={{ left: s.x, top: figTop, width: FIG_W * s.scale, height: FIG_H * s.scale * (1 - SINK) }}
        onClick={onClick}
        aria-label={`${p.name}, ${ch.name}`}
      >
        {targetable && <Sprite name="crosshair" scale={4} className="aim" />}
      </button>
      <button
        className={cls}
        style={{ left: s.x, top: figTop - 2 }}
        onClick={onClick}
        title={`${ch.name} (${ch.trade}) · ${ch.power}: ${ch.ability}${p.role ? ` · ${ROLE_INFO[p.role].name}` : ''}`}
      >
        {isTurn && <Sprite name="arrowDown" scale={3} className="turn-arrow" />}
        <span className="plate-name">
          {p.role && <Sprite name={p.role} scale={1} title={ROLE_INFO[p.role].name} />}
          <span className="plate-label">{p.name}</span>
          {p.isBot && <Sprite name="bot" scale={2} />}
          <VoiceBadge playerId={p.id} />
        </span>
        <span className="plate-row" ref={anchor('hearts:' + p.id)}>
          {p.alive ? <Hearts hp={p.hp} max={p.maxHp} /> : <span className="plate-dead">fuera</span>}
          {dist !== null && (
            <span className={'stat' + (inRange ? ' in-range' : '')} title={inRange ? 'A tu alcance' : 'Fuera de tu alcance'}>
              {inRange && <Sprite name="crosshair" scale={1} />}
              {dist}
            </span>
          )}
        </span>
        {!p.connected && !p.isBot && <span className="tag red">desconectado</span>}
        {waiting && <span className="thinking dots">💭</span>}
      </button>
    </>
  );
}

/** Carta en miniatura tumbada sobre la mesa. */
function MiniCard({ card }: { card: Card }) {
  const def = CARD_DEFS[card.kind];
  const danger = card.kind === 'calabozo' || card.kind === 'dinamita';
  return (
    <span className={'mini-card ' + (danger ? 'danger' : def.color)} title={`${def.name}: ${def.text}`}>
      <Sprite name={card.kind} scale={2} />
    </span>
  );
}

/** Asiento compacto (móvil o pantallas pequeñas). */
function Seat({ p, me, players, anchor, isTurn, waiting, targetable, dim, onClick }: SeatProps) {
  const ch = CHARACTERS[p.character];
  const dist = me && me.alive && p.alive ? distance(players, me.id, p.id) : null;
  const inRange = dist !== null && me ? dist <= weaponRange(me) : false;
  const cls = ['seat', 'panel', isTurn && 'turn', targetable && 'targetable', dim && 'dim', !p.alive && 'dead'].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="seat-head">
        <div ref={anchor('seat:' + p.id)}>
          <Portrait character={p.character} dead={!p.alive} />
        </div>
        <div className="seat-info">
          <div className="seat-name">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            {p.isBot && <Sprite name="bot" scale={2} title="Bot" />}
            <VoiceBadge playerId={p.id} />
          </div>
          <div className="seat-char" title={`${ch.power}: ${ch.ability}`}>
            {ch.name} · {ch.power}
          </div>
          <div ref={anchor('hearts:' + p.id)}>{p.alive && <Hearts hp={p.hp} max={p.maxHp} />}</div>
        </div>
      </div>
      <div className="seat-stats">
        {p.role && <RoleBadge role={p.role} />}
        {p.alive && (
          <span className="stat" title={`${p.handCount} cartas en la mano`} ref={anchor('hand:' + p.id)}>
            <Sprite name="cardBackMini" scale={2} /> {p.handCount}
          </span>
        )}
        {dist !== null && (
          <span className={'stat' + (inRange ? ' in-range' : '')} title={inRange ? 'A tu alcance' : 'Fuera de tu alcance'}>
            {inRange && <Sprite name="crosshair" scale={1} />}
            dist. {dist}
          </span>
        )}
        {!p.connected && !p.isBot && <span className="tag red">desconectado</span>}
      </div>
      <div className="inplay" ref={anchor('play:' + p.id)}>
        {p.inPlay.map((c) => (
          <Chip key={c.id} card={c} />
        ))}
      </div>
      {waiting && <span className="thinking dots">💭</span>}
    </div>
  );
}

function MyCard({ p, isTurn, anchor, showInPlay }: { p: PublicPlayer; isTurn: boolean; anchor: AnchorFn; showInPlay: boolean }) {
  const ch = CHARACTERS[p.character];
  const w = weaponOf(p);
  return (
    <div className={'me-card panel' + (isTurn ? ' turn' : '')}>
      <div className="seat-head">
        <div ref={anchor('seat:' + p.id)}>
          <Portrait character={p.character} big dead={!p.alive} />
        </div>
        <div className="seat-info">
          <div className="seat-name">
            {p.name} <span className="tag green">Tú</span>
            <VoiceBadge playerId={p.id} />
          </div>
          <div className="seat-char">
            {ch.name}, {ch.trade}
          </div>
          <div ref={anchor('hearts:' + p.id)}>
            <Hearts hp={p.hp} max={p.maxHp} />
          </div>
          {p.role && <RoleBadge role={p.role} />}
        </div>
      </div>
      <div className="me-ability">
        <b>{ch.power}:</b> {ch.ability}
        {p.character === 'tinta' && p.tintaUsed && <i> (ya usada)</i>}
      </div>
      {p.role && (
        <div className="goal">
          <b>Objetivo:</b> {ROLE_INFO[p.role].goal}
        </div>
      )}
      <div className="seat-stats">
        <span className="stat">
          <Sprite name={w ? w.kind : 'tirachinas'} scale={1} /> {weaponName(p)} · alcance {weaponRange(p)}
        </span>
      </div>
      {showInPlay && (
        <div className="inplay" ref={anchor('play:' + p.id)}>
          {p.inPlay.map((c) => (
            <Chip key={c.id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerInfo({ p, me, players }: { p: PublicPlayer; me?: PublicPlayer; players: PublicPlayer[] }) {
  const ch = CHARACTERS[p.character];
  const dist = me && me.alive && p.alive && me.id !== p.id ? distance(players, me.id, p.id) : null;
  return (
    <>
      <div className="seat-head">
        <Portrait character={p.character} big dead={!p.alive} />
        <div>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <div>
            {ch.name}, {ch.trade}
          </div>
          {p.alive && <Hearts hp={p.hp} max={p.maxHp} />}
        </div>
      </div>
      <p>
        <b>{ch.power}:</b> {ch.ability}
      </p>
      <p>
        {p.role ? (
          <>
            Rol: <RoleBadge role={p.role} />
          </>
        ) : (
          'Rol: oculto'
        )}
      </p>
      <p>
        Cartas en la mano: <b>{p.handCount}</b> · Arma: <b>{weaponName(p)}</b> (alcance {weaponRange(p)})
        {dist !== null && (
          <>
            {' '}
            · Distancia desde ti: <b>{dist}</b>
          </>
        )}
      </p>
      {p.inPlay.length > 0 && (
        <div className="card-row">
          {p.inPlay.map((c) => (
            <CardView key={c.id} card={c} size="small" />
          ))}
        </div>
      )}
    </>
  );
}
