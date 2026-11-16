import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Session, Snapshot } from '../net/protocol';
import type { Action, Answer, CardId, Fx, GameView, NewsId, PartyId, PublicPlayer, TradeSide } from './types';
import {
  ATTRACTION_INCOME,
  BOARD,
  BOARD_SIZE,
  BOLSA_BET,
  CARDS,
  CHARACTERS,
  DONATIONS,
  GROUPS,
  KIND_INFO,
  LOAN,
  LOAN_INTEREST,
  MAYOR_PERKS,
  MODES,
  NEWS,
  PARTIES,
  PARTY_IDS,
  PLAYER_COLORS,
  TAXI_FARE,
  buildCost,
  inflation,
  canBuild,
  groupSpaces,
  isProperty,
  maxLoans,
  rentFor,
  sellBuildingValue,
  sellPropValue,
  type Ctx,
} from './rules';
import { charSprite, paintVillaScene } from './art';
import { Sprite } from '../pixel/Sprite';
import { Modal } from '../ui/common';
import { SidePanel } from '../ui/LogPanel';
import { VoiceBadge, VoiceButton } from '../ui/Voice';
import { Backdrop, PixelCanvas } from '../shell/Backdrop';
import { worldScale } from '../pixel/world';
import { VillaHelp } from './VillaHelp';
import './villa.css';

type Props = { snap: Snapshot<GameView>; session: Session<GameView, Answer>; onLeave: () => void };

const colorOf = (p?: PublicPlayer | null) => (p ? PLAYER_COLORS[p.color % PLAYER_COLORS.length].hex : '#9a8a7a');
const CORNER = 1.45;
/** casillas entre esquinas en cada lado */
const SIDE = BOARD_SIZE / 4 - 1;
const UNITS = SIDE + CORNER * 2;
const LAST = SIDE + 1;

/** Fila y columna de cada casilla: la Salida abajo a la derecha y se avanza en el sentido de las agujas del reloj. */
function cellOf(i: number): [number, number] {
  const q = LAST;
  if (i <= q) return [q, q - i];
  if (i <= 2 * q) return [2 * q - i, 0];
  if (i <= 3 * q) return [0, i - 2 * q];
  return [i - 3 * q, q];
}
type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';
const sideOf = (i: number): Side => (i % LAST === 0 ? 'corner' : i < LAST ? 'bottom' : i < 2 * LAST ? 'left' : i < 3 * LAST ? 'top' : 'right');
/** Centro de una fila o columna de la rejilla, en unidades. */
const mid = (k: number) => (k === 0 ? CORNER / 2 : k === LAST ? UNITS - CORNER / 2 : CORNER + k - 0.5);

function Coins({ n, big }: { n: number; big?: boolean }) {
  return (
    <span className={'vm-coins' + (big ? ' big' : '')}>
      <Sprite name="vm_moneda" scale={1} />
      {Math.round(n)}
    </span>
  );
}

// ───────────────────────── efectos ─────────────────────────

/** Llama a `on` con cada efecto nuevo (los que ya había al abrir la mesa no se repiten). */
function useFxStream(fx: Fx[], on: (f: Fx) => void) {
  const seen = useRef(fx.reduce((m, f) => Math.max(m, f.id), 0));
  const cb = useRef(on);
  cb.current = on;
  useEffect(() => {
    const fresh = fx.filter((f) => f.id > seen.current);
    if (!fresh.length) return;
    seen.current = Math.max(...fresh.map((f) => f.id));
    for (const f of fresh) cb.current(f);
  }, [fx]);
}

/** Posición mostrada de cada ficha: avanza casilla a casilla siguiendo los movimientos del motor. */
function useTokens(view: GameView) {
  const [pos, setPos] = useState<Record<string, number>>(() => Object.fromEntries(view.players.map((p) => [p.id, p.pos])));
  const [jumping, setJumping] = useState<Record<string, boolean>>({});
  const cur = useRef(pos);
  cur.current = pos;
  const queues = useRef(new Map<string, Fx[]>());
  const running = useRef(new Set<string>());

  const run = (pid: string) => {
    if (running.current.has(pid)) return;
    const q = queues.current.get(pid);
    const f = q?.shift();
    if (!f) return;
    running.current.add(pid);
    const done = () => {
      running.current.delete(pid);
      setJumping((j) => ({ ...j, [pid]: false }));
      run(pid);
    };
    const to = f.to!;
    if (f.jump) {
      setJumping((j) => ({ ...j, [pid]: true }));
      setPos((p) => ({ ...p, [pid]: to }));
      setTimeout(done, 650);
      return;
    }
    let at = f.from ?? cur.current[pid] ?? 0;
    const fwd = (to - at + BOARD_SIZE) % BOARD_SIZE;
    const dir = fwd <= 16 ? 1 : -1;
    let left = dir > 0 ? fwd : (at - to + BOARD_SIZE) % BOARD_SIZE;
    const step = () => {
      if (left <= 0) return done();
      at = (at + dir + BOARD_SIZE) % BOARD_SIZE;
      left--;
      setPos((p) => ({ ...p, [pid]: at }));
      setTimeout(step, 140);
    };
    step();
  };

  useFxStream(view.fx, (f) => {
    if (f.kind !== 'move' || !f.player || f.to === undefined) return;
    const q = queues.current.get(f.player) ?? [];
    q.push(f);
    queues.current.set(f.player, q);
    run(f.player);
  });

  // fichas quietas que no cuadran (al reconectar): se colocan directamente
  useEffect(() => {
    const t = setTimeout(() => {
      const fix: Record<string, number> = {};
      for (const p of view.players) if (!running.current.has(p.id) && !(queues.current.get(p.id)?.length) && cur.current[p.id] !== p.pos) fix[p.id] = p.pos;
      if (Object.keys(fix).length) setPos((p) => ({ ...p, ...fix }));
    }, 2500);
    return () => clearTimeout(t);
  }, [view.players]);

  return { pos, jumping };
}

interface Floater {
  id: number;
  player: string;
  text: string;
  good: boolean;
}
type Banner =
  | { id: number; kind: 'news'; news: NewsId }
  | { id: number; kind: 'card'; card: CardId; player?: string }
  | { id: number; kind: 'election' }
  | { id: number; kind: 'auction'; space: number; player?: string }
  | { id: number; kind: 'out'; player?: string };

// ───────────────────────── tablero ─────────────────────────

function Tile({ id, view, flash, target, onClick }: { id: number; view: GameView; flash: boolean; target: boolean; onClick: () => void }) {
  const s = BOARD[id];
  const side = sideOf(id);
  const [row, col] = cellOf(id);
  const o = view.owned[id];
  const owner = o ? view.players.find((p) => p.id === o.owner) : null;
  const band = s.group ? GROUPS[s.group].color : null;
  const style = { gridRow: row + 1, gridColumn: col + 1, '--band': band ?? 'transparent', '--own': owner ? colorOf(owner) : 'transparent' } as CSSProperties;
  const closed = view.closed[id] !== undefined;
  const cls = ['vm-tile', side, s.kind, band ? 'banded' : '', owner ? 'owned' : '', flash ? 'flash' : '', target ? 'target' : '', closed ? 'closed' : ''].filter(Boolean).join(' ');
  const price = s.price ? (o ? null : s.price) : s.tax ?? null;
  return (
    <button className={cls} style={style} onClick={onClick} title={s.name}>
      {band && (
        <span className="vm-band">
          {o && o.level > 0 && (o.level === 4 ? <Sprite name="vm_mini_edif" scale={1} /> : Array.from({ length: o.level }, (_, k) => <Sprite key={k} name="vm_mini_casa" scale={1} />))}
        </span>
      )}
      <span className="vm-tile-body">
        <Sprite name={s.icon} scale={side === 'corner' ? 2 : 1} className="vm-tile-icon" />
        <span className="vm-tile-name">{s.short}</span>
        {price !== null && <span className="vm-tile-price">{s.kind === 'hacienda' ? `−${price}` : price}</span>}
        {s.kind === 'plaza' && view.pot > 0 && <span className="vm-tile-price pot">{view.pot}</span>}
        {o && <span className="vm-owner-flag" title={`De ${owner?.name}`} />}
      </span>
      {closed && <Sprite name="vm_pancarta" scale={1} className="vm-closed" title="Manifestación: no cobra alquiler" />}
    </button>
  );
}

function Tokens({ view, size, pos, jumping }: { view: GameView; size: number; pos: Record<string, number>; jumping: Record<string, boolean> }) {
  const u = size / UNITS;
  const OFF: [number, number][] = [
    [0, 0],
    [-0.26, -0.2],
    [0.26, -0.2],
    [-0.26, 0.24],
    [0.26, 0.24],
  ];
  const byTile = new Map<number, string[]>();
  for (const p of view.players) {
    if (p.bankrupt) continue;
    const at = pos[p.id] ?? p.pos;
    byTile.set(at, [...(byTile.get(at) ?? []), p.id]);
  }
  return (
    <div className="vm-tokens">
      {view.players.map((p) => {
        if (p.bankrupt || !p.char) return null;
        const at = pos[p.id] ?? p.pos;
        const here = byTile.get(at) ?? [];
        const k = here.indexOf(p.id);
        const [row, col] = cellOf(at);
        const [ox, oy] = here.length > 1 ? OFF[(k + 1) % OFF.length] : OFF[0];
        const jail = p.jail > 0 && at === LAST;
        const x = (mid(col) + ox * (sideOf(at) === 'corner' ? 1.3 : 1) + (jail ? 0.25 : 0)) * u;
        const y = (mid(row) + oy * (sideOf(at) === 'corner' ? 1.3 : 1) - (jail ? 0.25 : 0)) * u;
        const cls = ['vm-token', p.id === view.turn && view.phase === 'main' ? 'turn' : '', jumping[p.id] ? 'jump' : '', jail ? 'jailed' : ''].filter(Boolean).join(' ');
        return (
          <div key={p.id} className={cls} style={{ left: x, top: y, '--pc': colorOf(p) } as CSSProperties} title={p.name}>
            <Sprite name={charSprite(p.char)} scale={u > 92 ? 2 : 1} />
          </div>
        );
      })}
    </div>
  );
}

function DiceView({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  const [face, setFace] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFace([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 80);
    return () => clearInterval(t);
  }, [rolling]);
  if (!dice) return null;
  const show = rolling ? face : dice;
  return (
    <div className={'vm-dice' + (rolling ? ' rolling' : '')}>
      <Sprite name={'vm_dado_' + show[0]} scale={3} />
      {dice[1] > 0 && <Sprite name={'vm_dado_' + show[1]} scale={3} />}
    </div>
  );
}

// ───────────────────────── mesa ─────────────────────────

export function VillaTable({ snap, session, onLeave }: Props) {
  const view = snap.view!;
  const players = view.players;
  const me = players.find((p) => p.id === view.me) ?? null;
  const byId = (id?: string | null) => players.find((p) => p.id === id) ?? null;
  const nameOf = (id?: string | null) => byId(id)?.name ?? '?';
  const prompt = view.prompt;
  const pr = prompt?.prompt;
  const isHost = snap.mode !== 'client';
  const ctx: Ctx = useMemo(
    () => ({ owned: view.owned, news: view.news, party: view.party, charOf: (id) => players.find((p) => p.id === id)?.char ?? null, closed: view.closed, boost: inflation(view.mode, view.round) }),
    [view.owned, view.news, view.party, players, view.closed, view.mode, view.round],
  );
  const modeInfo = MODES[view.mode];

  const [help, setHelp] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [hideWinner, setHideWinner] = useState(false);
  const [info, setInfo] = useState<number | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [trading, setTrading] = useState(false);
  const [confirmSell, setConfirmSell] = useState<number | null>(null);

  // ── tamaño del tablero ──
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(560);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const mobile = window.innerWidth < 860;
      setSize(Math.max(300, Math.floor(mobile ? r.width : Math.min(r.width, r.height))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── efectos ──
  const { pos, jumping } = useTokens(view);
  const [rolling, setRolling] = useState(false);
  const [diceShown, setDiceShown] = useState<[number, number] | null>(view.dice);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [flash, setFlash] = useState<Record<number, number>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useFxStream(view.fx, (f) => {
    switch (f.kind) {
      case 'dice':
        setDiceShown(f.dice ?? null);
        setRolling(true);
        later(620, () => setRolling(false));
        break;
      case 'money':
        if (f.player && f.amount) {
          const fl = { id: f.id, player: f.player, text: (f.amount > 0 ? '+' : '−') + Math.abs(f.amount), good: f.amount > 0 };
          setFloaters((x) => [...x, fl]);
          later(1700, () => setFloaters((x) => x.filter((y) => y.id !== fl.id)));
        }
        break;
      case 'news':
        if (f.news) {
          setBanner({ id: f.id, kind: 'news', news: f.news });
          later(3400, () => setBanner((b) => (b?.id === f.id ? null : b)));
        }
        break;
      case 'card':
        if (f.card) {
          setBanner({ id: f.id, kind: 'card', card: f.card, player: f.player });
          later(2600, () => setBanner((b) => (b?.id === f.id ? null : b)));
        }
        break;
      case 'election':
        setBanner({ id: f.id, kind: 'election' });
        later(6000, () => setBanner((b) => (b?.id === f.id ? null : b)));
        break;
      case 'auction':
        if (f.space !== undefined) {
          setBanner({ id: f.id, kind: 'auction', space: f.space, player: f.player });
          later(2400, () => setBanner((b) => (b?.id === f.id ? null : b)));
        }
        break;
      case 'bankrupt':
        setBanner({ id: f.id, kind: 'out', player: f.player });
        later(3200, () => setBanner((b) => (b?.id === f.id ? null : b)));
        break;
      case 'buy':
      case 'build':
      case 'sell':
      case 'protest':
        if (f.space !== undefined) {
          const sp = f.space;
          setFlash((x) => ({ ...x, [sp]: f.id }));
          later(1000, () => setFlash((x) => (x[sp] === f.id ? Object.fromEntries(Object.entries(x).filter(([k]) => Number(k) !== sp)) : x)));
        }
        break;
      case 'turn':
        setDiceShown(null);
        break;
    }
  });

  useEffect(() => {
    document.title = pr ? '¡Te toca! · Villa Moneda' : 'Villa Moneda';
  }, [pr]);
  useEffect(
    () => () => {
      document.title = 'Villa Moneda';
    },
    [],
  );
  useEffect(() => {
    setConfirmSell(null);
    if (pr?.type !== 'turn') setTrading(false);
  }, [prompt?.id, pr?.type]);

  const send = (a: Answer) => prompt && session.answer(prompt.id, a);
  const act = (action: Action) => send({ action });

  const myTurn = pr?.type === 'turn';
  const inDebt = pr?.type === 'debt';
  const canManage = myTurn || inDebt;
  const turnP = byId(view.turn);
  const mine = me ? BOARD.filter((s) => view.owned[s.id]?.owner === me.id).map((s) => s.id) : [];
  const waitingNames = [...new Set(view.waiting.filter((w) => w.playerId !== view.me).map((w) => nameOf(w.playerId)))];
  const scale = Math.max(2, Math.min(4, worldScale()));
  const center = size * (SIDE / UNITS);
  const protestTargets = pr?.type === 'protest' ? pr.targets : [];
  const leftRounds = view.mode === 'rapida' ? view.maxRounds - view.round : null;

  // ── panel central: lo que toca hacer ──
  let panel: ReactNode;
  if (view.phase === 'over') panel = <div className="vm-panel-title">¡Fin de la partida!</div>;
  else if (pr?.type === 'turn') {
    panel = (
      <>
        <div className="vm-panel-title">{pr.stage === 'pre' ? (view.doubles ? '¡Dobles! Vuelve a tirar' : '¡Tu turno!') : 'Cuando acabes, pasa el turno'}</div>
        {pr.error && <div className="vm-err">{pr.error}</div>}
        {pr.stage === 'pre' && me && me.jail > 0 && <div className="vm-note">Estás en la comisaría ({me.jail}.º turno). Saca dobles para salir o paga la multa.</div>}
        <div className="row vm-actions">
          {pr.stage === 'pre' ? (
            <>
              <button className="btn primary big" onClick={() => act({ kind: 'roll' })}>
                {me && me.jail > 0 ? 'Intentar dobles' : 'Tirar los dados'}
              </button>
              {me && me.jail > 0 && (
                <>
                  <button className="btn" disabled={me.cash < (me.char === 'abel' ? 0 : 50)} onClick={() => act({ kind: 'jailPay' })}>
                    {me.char === 'abel' ? 'Salir gratis' : 'Pagar 50'}
                  </button>
                  {me.freeCards > 0 && (
                    <button className="btn blue" onClick={() => act({ kind: 'jailCard' })}>
                      Usar la carta
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <button className="btn primary big" onClick={() => act({ kind: 'end' })}>
              Terminar turno
            </button>
          )}
        </div>
        <div className="vm-note">Puedes construir, vender, pedir préstamos o proponer tratos desde tu panel.</div>
      </>
    );
  } else if (pr?.type === 'buy') {
    const s = BOARD[pr.space];
    const short = me ? Math.max(0, pr.price - me.cash) : 0;
    const loansNeeded = Math.ceil(short / LOAN);
    panel = (
      <>
        <div className="vm-panel-title">¿Compras {s.name}?</div>
        <PropCard id={pr.space} ctx={ctx} view={view} compact />
        <div className="row vm-actions">
          <button className="btn primary big" onClick={() => send({ accept: true })}>
            Comprar por {pr.price}
          </button>
          <button className="btn" onClick={() => send({ accept: false })}>
            No, gracias
          </button>
        </div>
        {loansNeeded > 0 && <div className="vm-note">No te llega: se pedirá{loansNeeded > 1 ? `n ${loansNeeded} préstamos` : ' un préstamo'} de {LOAN} (paga {LOAN_INTEREST} de intereses cada vez que pasas por la Salida).</div>}
      </>
    );
  } else if (pr?.type === 'adjust') {
    panel = (
      <>
        <div className="vm-panel-title">Vas a caer en {BOARD[pr.to].name}</div>
        <div className="vm-note">Con tu atajo de taxista puedes pagar {TAXI_FARE} y repetir la tirada (una vez cada dos vueltas).</div>
        <div className="row vm-actions">
          <button className="btn blue" onClick={() => send({ accept: true })}>
            Repetir por {TAXI_FARE}
          </button>
          <button className="btn primary" onClick={() => send({ accept: false })}>
            Seguir
          </button>
        </div>
      </>
    );
  } else if (pr?.type === 'bolsa') {
    panel = (
      <>
        <div className="vm-panel-title">Bolsa de Valores</div>
        <div className="vm-note">
          ¿Inviertes {BOLSA_BET}? Tira un dado: con 1-2 lo pierdes, con 3-4 lo recuperas y con 5-6 ganas 150.
        </div>
        <div className="row vm-actions">
          <button className="btn primary" onClick={() => send({ accept: true })}>
            Invertir {BOLSA_BET}
          </button>
          <button className="btn" onClick={() => send({ accept: false })}>
            Mejor no
          </button>
        </div>
      </>
    );
  } else if (pr?.type === 'pickCard') {
    panel = (
      <>
        <div className="vm-panel-title">🍀 Elige carta del buzón</div>
        <div className="vm-cards">
          {pr.cards.map((c) => (
            <button key={c} className="vm-mail" onClick={() => send({ card: c })}>
              <Sprite name="vm_carta" scale={2} />
              <b>{CARDS[c].title}</b>
              <span>{CARDS[c].text}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (pr?.type === 'metro') {
    panel = (
      <>
        <div className="vm-panel-title">🚇 ¿Coges el metro?</div>
        <div className="vm-note">
          Viajas hasta {BOARD[pr.to].name}{pr.cost ? ` por ${pr.cost}` : ' gratis'}. El metro no pasa por la Salida.
        </div>
        <div className="row vm-actions">
          <button className="btn primary" onClick={() => send({ accept: true })}>
            Viajar{pr.cost ? ` (${pr.cost})` : ''}
          </button>
          <button className="btn" onClick={() => send({ accept: false })}>
            Me quedo
          </button>
        </div>
      </>
    );
  } else if (pr?.type === 'referendum') {
    panel = (
      <>
        <div className="vm-panel-title">🏛️ Ayuntamiento</div>
        <div className="vm-note">
          {pr.cost ? `Puedes pagar ${pr.cost} (al bote) para convocar un referéndum:` : 'Puedes convocar gratis un referéndum:'} se vota ahora mismo qué partido gobierna.
          {view.party ? ` Ahora gobierna el ${PARTIES[view.party].name}.` : ''}
        </div>
        <div className="row vm-actions">
          <button className="btn blue" onClick={() => send({ accept: true })}>
            Convocar{pr.cost ? ` (${pr.cost})` : ''}
          </button>
          <button className="btn" onClick={() => send({ accept: false })}>
            No
          </button>
        </div>
      </>
    );
  } else if (pr?.type === 'protest') {
    panel = (
      <>
        <div className="vm-panel-title">📣 Organiza una manifestación</div>
        <div className="vm-note">Elige una propiedad de un rival (en el tablero o en la lista): no cobrará alquiler hasta que su dueño vuelva a jugar.</div>
        <div className="vm-protest-list">
          {[...pr.targets]
            .sort((a, c) => rentFor({ ...ctx, closed: undefined }, c, view.me, me?.cash ?? 0, 7) - rentFor({ ...ctx, closed: undefined }, a, view.me, me?.cash ?? 0, 7))
            .map((id) => (
              <button key={id} className="vm-mini-prop" style={{ '--band': BOARD[id].group ? GROUPS[BOARD[id].group!].color : '#c8b8a0' } as CSSProperties} onClick={() => send({ space: id })}>
                {BOARD[id].short} · {nameOf(view.owned[id]?.owner)} · {rentFor({ ...ctx, closed: undefined }, id, view.me, me?.cash ?? 0, 7)}
              </button>
            ))}
        </div>
      </>
    );
  } else if (pr?.type === 'bid') {
    panel = (
      <>
        <div className="vm-panel-title">🔨 Subasta en marcha</div>
        <div className="vm-note">Haz tu puja secreta en la ventana.</div>
      </>
    );
  } else if (pr?.type === 'debt') {
    const left = me ? maxLoans(me.char) - me.loans : 0;
    panel = (
      <>
        <div className="vm-panel-title bad">Te faltan {me ? Math.max(0, pr.amount - me.cash) : pr.amount} monedas</div>
        <div className="vm-note">
          Tienes que pagar {pr.amount} por {pr.reason}
          {pr.to ? ` a ${nameOf(pr.to)}` : ''}. Pide un préstamo o vende casas o propiedades desde tu panel.
        </div>
        {pr.error && <div className="vm-err">{pr.error}</div>}
        <div className="row vm-actions">
          <button className="btn blue" disabled={left <= 0} onClick={() => act({ kind: 'loan' })}>
            Pedir préstamo ({LOAN})
          </button>
          <button className="btn primary" disabled={!me || me.cash < pr.amount} onClick={() => act({ kind: 'pay' })}>
            Pagar {pr.amount}
          </button>
        </div>
      </>
    );
  } else {
    panel = (
      <>
        <div className="vm-panel-title">{turnP ? `Turno de ${turnP.name}` : ''}</div>
        {waitingNames.length > 0 && <div className="vm-note dots">Esperando a {waitingNames.join(', ')}</div>}
      </>
    );
  }

  const ranking = view.ranking.map((r) => ({ ...r, p: byId(r.id)! }));

  return (
    <div className="villa-game">
      <Backdrop paint={paintVillaScene} className="vm-bg" />
      <header className="topbar">
        <span className="logo mini">Villa Moneda</span>
        <span className="turn-pill" title={modeInfo.text}>
          {modeInfo.short} · ronda <b>{Math.max(1, view.round)}</b>
          {view.mode === 'rapida' ? ` de ${view.maxRounds}` : ''}
        </span>
        {view.goal && (
          <span className="vm-pill" style={{ '--pc': '#f7d65a' } as CSSProperties} title="Gana quien llegue antes a esta cifra de patrimonio al terminar un turno">
            ⭐ Meta {view.goal}
          </span>
        )}
        {view.mode === 'final' && inflation(view.mode, view.round) > 1 && (
          <span className="vm-pill" style={{ '--pc': '#e8484d' } as CSSProperties} title="Cada 5 rondas los alquileres suben un 25 %">
            📈 Alquileres +{Math.round((inflation(view.mode, view.round) - 1) * 100)} %
          </span>
        )}
        <span className="vm-pill" style={{ '--pc': view.party ? PARTIES[view.party].color : '#bbb' } as CSSProperties} title={view.party ? PARTIES[view.party].policy : 'Aún no ha habido elecciones'}>
          <Sprite name="vm_urna" scale={1} />
          {view.party ? PARTIES[view.party].name : 'Sin gobierno'}
        </span>
        {view.news && (
          <span className="vm-pill news" title={NEWS[view.news].text}>
            <Sprite name="vm_periodico" scale={1} />
            {NEWS[view.news].title}
          </span>
        )}
        <span className="spacer" />
        <VoiceButton snap={snap} session={session} />
        <button className="btn small" onClick={() => setHelp(true)}>
          Cómo se juega
        </button>
        {isHost && view.phase !== 'over' && (
          <button className="btn small" onClick={() => session.backToLobby?.()}>
            Volver a la sala
          </button>
        )}
        <button className="btn small danger" onClick={() => (snap.mode === 'host' && view.phase !== 'over' ? setConfirmLeave(true) : onLeave())}>
          Salir
        </button>
      </header>

      <div className="vm-players">
        {players.map((p) => (
          <button
            key={p.id}
            className={'vm-chip panel' + (p.id === view.turn && view.phase === 'main' ? ' turn' : '') + (p.id === view.me ? ' me' : '') + (p.bankrupt ? ' broke' : '')}
            style={{ '--pc': colorOf(p) } as CSSProperties}
            onClick={() => setWho(p.id)}
          >
            <span className="vm-chip-face">{p.char ? <Sprite name={charSprite(p.char)} scale={1} /> : <Sprite name="vm_carta" scale={1} />}</span>
            <span className="vm-chip-main">
              <span className="vm-chip-name">
                {p.name}
                {p.id === view.me && <span className="tag green">Tú</span>}
                <VoiceBadge playerId={p.id} />
              </span>
              <span className="vm-chip-stats">
                <Coins n={p.cash} />
                <span className="vm-worth" title="Patrimonio">
                  ⭐ {p.worth}
                </span>
                {p.loans > 0 && (
                  <span title={`${p.loans} préstamo${p.loans > 1 ? 's' : ''}`}>
                    <Sprite name="vm_billete" scale={1} />×{p.loans}
                  </span>
                )}
                {p.jail > 0 && <Sprite name="vm_rejas" scale={1} title="En la comisaría" />}
                {view.mayor === p.id && <Sprite name="vm_medalla" scale={1} title="Alcaldía" />}
                {p.freeCards > 0 && <Sprite name="vm_llave" scale={1} title="Carta para salir de la comisaría" />}
              </span>
            </span>
            {p.bankrupt && <span className="tag red">Eliminado{p.out ? ` (ronda ${p.out})` : ''}</span>}
            {!p.connected && !p.isBot && !p.bankrupt && <span className="tag red">Sin conexión</span>}
            {view.waiting.some((w) => w.playerId === p.id) && p.id !== view.me && <span className="vm-think dots">💭</span>}
            {floaters
              .filter((f) => f.player === p.id)
              .map((f) => (
                <span key={f.id} className={'vm-floater ' + (f.good ? 'good' : 'bad')}>
                  {f.text}
                </span>
              ))}
          </button>
        ))}
      </div>

      <div className="vm-main">
        <div className="vm-board-wrap" ref={wrap}>
          <div className={'vm-board' + (size / UNITS < 48 ? ' tiny' : '')} style={{ width: size, height: size, '--u': `${size / UNITS}px` } as CSSProperties}>
            {BOARD.map((s) => (
              <Tile
                key={s.id}
                id={s.id}
                view={view}
                flash={!!flash[s.id]}
                target={protestTargets.includes(s.id)}
                onClick={() => (protestTargets.includes(s.id) ? send({ space: s.id }) : setInfo(s.id))}
              />
            ))}
            <div className="vm-center" style={{ gridRow: `2 / ${LAST + 1}`, gridColumn: `2 / ${LAST + 1}` }}>
              <PixelCanvas paint={paintVillaScene} w={Math.max(40, Math.round(center / scale))} h={Math.max(40, Math.round(center / scale))} scale={scale} className="vm-center-bg" key={Math.round(center / scale)} />
              <div className="vm-center-ui">
                <div className="vm-center-top">
                  <span className="vm-pot" title="Lo recaudado por Hacienda y las multas: se lo lleva quien caiga en la Plaza Mayor">
                    Bote de la Plaza: <Coins n={view.pot} />
                  </span>
                  {view.nextElection && <span className="vm-pot">🗳️ Elecciones en la ronda {view.nextElection}</span>}
                  {leftRounds !== null && leftRounds <= 3 && leftRounds >= 0 && <span className="vm-pot hot">⏳ {leftRounds ? `Quedan ${leftRounds} rondas` : 'Última ronda'}</span>}
                </div>
                <DiceView dice={diceShown} rolling={rolling} />
                <div className={'vm-panel panel' + (prompt ? ' mine' : '')}>{panel}</div>
              </div>
              {banner && <BannerView banner={banner} view={view} nameOf={nameOf} onClose={() => setBanner(null)} />}
            </div>
            <Tokens view={view} size={size} pos={pos} jumping={jumping} />
          </div>
        </div>

        <aside className="vm-side">
          {me && (
            <div className="vm-me panel" style={{ '--pc': colorOf(me) } as CSSProperties}>
              <div className="vm-me-head">
                {me.char && (
                  <span className="vm-face big">
                    <Sprite name={charSprite(me.char)} scale={2} />
                  </span>
                )}
                <div className="vm-me-info">
                  <b>{me.name}</b>
                  {me.char && (
                    <span className="vm-me-char">
                      {CHARACTERS[me.char].name}, {CHARACTERS[me.char].trade}
                    </span>
                  )}
                  <span className="vm-me-money">
                    <Coins n={me.cash} big /> <span className="vm-worth">⭐ {me.worth}</span>
                  </span>
                </div>
              </div>
              {me.char && (
                <div className="vm-power">
                  <b>{CHARACTERS[me.char].power}:</b> {CHARACTERS[me.char].text}
                </div>
              )}
              <div className="vm-loans">
                <span>
                  <Sprite name="vm_billete" scale={1} /> Préstamos: <b>{me.loans}</b>/{maxLoans(me.char)}
                </span>
                <button className="btn small blue" disabled={!canManage || me.loans >= maxLoans(me.char)} onClick={() => act({ kind: 'loan' })} title={`Recibes ${LOAN}; pagas ${LOAN_INTEREST} de intereses cada vez que pasas por la Salida (salvo si tienes un banco)`}>
                  Pedir {LOAN}
                </button>
                <button className="btn small" disabled={!myTurn || me.loans <= 0 || me.cash < LOAN} onClick={() => act({ kind: 'repay' })}>
                  Devolver
                </button>
              </div>
              <button className="btn small vm-trade-btn" disabled={!myTurn || players.filter((p) => p.id !== me.id && !p.bankrupt).length === 0} onClick={() => setTrading(true)}>
                🤝 Proponer un trato
              </button>
            </div>
          )}

          {me && (
            <div className="vm-props panel">
              <div className="vm-props-title">Tus propiedades {mine.length > 0 && <span className="muted">({mine.length})</span>}</div>
              {mine.length === 0 && <div className="vm-note">Aún no tienes ninguna. Cae en una casilla libre para comprarla.</div>}
              {mine.map((id) => {
                const s = BOARD[id];
                const o = view.owned[id];
                const can = myTurn && canBuild(ctx, me.id, id);
                const cost = s.group ? buildCost(ctx, s, me.id) : 0;
                return (
                  <div key={id} className="vm-prop" style={{ '--band': s.group ? GROUPS[s.group].color : '#c8b8a0' } as CSSProperties}>
                    <button className="vm-prop-name" onClick={() => setInfo(id)}>
                      <Sprite name={s.icon} scale={1} />
                      {s.name}
                    </button>
                    <span className="vm-prop-level">{o.level === 4 ? <Sprite name="vm_mini_edif" scale={1} /> : Array.from({ length: o.level }, (_, k) => <Sprite key={k} name="vm_mini_casa" scale={1} />)}</span>
                    <span className="vm-prop-btns">
                      {s.group && (
                        <button className="btn small primary" disabled={!can || me.cash < cost} onClick={() => act({ kind: 'build', space: id })} title={can ? `${o.level === 3 ? 'Edificio' : 'Casa'} por ${cost}` : 'Necesitas todo el barrio y que sea tu turno'}>
                          +{o.level >= 3 ? '🏢' : '🏠'} {can ? cost : ''}
                        </button>
                      )}
                      {o.level > 0 && (
                        <button className="btn small" disabled={!canManage} onClick={() => act({ kind: 'sellBuilding', space: id })} title={`Vender ${o.level === 4 ? 'el edificio' : 'una casa'} por ${sellBuildingValue(s)}`}>
                          −
                        </button>
                      )}
                      {confirmSell === id ? (
                        <button
                          className="btn small danger"
                          onClick={() => {
                            setConfirmSell(null);
                            act({ kind: 'sellProp', space: id });
                          }}
                        >
                          ¿Seguro? +{sellPropValue(s, o.level)}
                        </button>
                      ) : (
                        <button className="btn small" disabled={!canManage} onClick={() => setConfirmSell(id)} title={`Vender al banco por ${sellPropValue(s, o.level)}`}>
                          Vender
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <SidePanel snap={snap} session={session} log={view.log} />
        </aside>
      </div>

      {/* ── ventanas ── */}

      {pr?.type === 'character' && (
        <Modal>
          <h2>Elige a tu vecino</h2>
          <p>Cada vecino tiene un poder que dura toda la partida.</p>
          <div className="vm-char-pick">
            {pr.options.map((c) => (
              <button key={c} className="vm-char-card panel" onClick={() => send({ char: c })}>
                <span className="vm-face huge">
                  <Sprite name={'fig_' + charSprite(c)} scale={3} />
                </span>
                <b className="vm-char-name">
                  {CHARACTERS[c].name}, {CHARACTERS[c].trade}
                </b>
                <span className="vm-char-power">{CHARACTERS[c].power}</span>
                <span>{CHARACTERS[c].text}</span>
                <span className="btn primary">Elegir</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {pr?.type === 'vote' && me && <VoteModal key={prompt!.id} early={pr.early} view={view} cash={me.cash} isClara={me.char === 'clara'} onVote={(party, donation) => send({ party, donation })} />}

      {pr?.type === 'bid' && me && <BidModal key={prompt!.id} space={pr.space} min={pr.min} host={nameOf(pr.host)} cash={me.cash} ctx={ctx} view={view} onBid={(bid) => send({ bid })} />}

      {pr?.type === 'tradeOffer' && (
        <Modal narrow>
          <h2>🤝 {nameOf(pr.from)} te propone un trato</h2>
          <div className="vm-trade-cols">
            <div>
              <h3>Te da</h3>
              <TradeList side={pr.give} />
            </div>
            <div>
              <h3>Te pide</h3>
              <TradeList side={pr.want} />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary big" disabled={!me || me.cash < pr.want.cash} onClick={() => send({ accept: true })}>
              Aceptar
            </button>
            <button className="btn danger" onClick={() => send({ accept: false })}>
              Rechazar
            </button>
          </div>
        </Modal>
      )}

      {trading && myTurn && me && (
        <TradeBuilder
          view={view}
          me={me}
          onClose={() => setTrading(false)}
          onSend={(to, give, want) => {
            setTrading(false);
            act({ kind: 'trade', to, give, want });
          }}
        />
      )}

      {info !== null && (
        <Modal narrow onClose={() => setInfo(null)}>
          <PropCard id={info} ctx={ctx} view={view} />
        </Modal>
      )}

      {who && byId(who) && (
        <Modal narrow onClose={() => setWho(null)}>
          <PlayerCard p={byId(who)!} view={view} />
        </Modal>
      )}

      {view.winner && !hideWinner && (
        <Modal narrow onClose={() => setHideWinner(true)}>
          <h2 style={{ textAlign: 'center' }}>{view.winner.id === view.me ? '¡Has ganado!' : `¡Gana ${nameOf(view.winner.id)}!`}</h2>
          <p style={{ textAlign: 'center' }}>{view.winner.text}</p>
          <div className="vm-ranking">
            {ranking.map((r, i) => (
              <div key={r.id} className={'vm-rank' + (r.id === view.winner!.id ? ' won' : '')} style={{ '--pc': colorOf(r.p) } as CSSProperties}>
                <span>{i + 1}.</span>
                {r.p.char && <Sprite name={charSprite(r.p.char)} scale={1} />}
                <b style={{ flex: 1 }}>{r.p.name}</b>
                <span>{r.p.bankrupt ? `eliminado${r.p.out ? ` en la ronda ${r.p.out}` : ''}` : `⭐ ${r.worth}`}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {isHost && (
              <button className="btn primary" onClick={() => session.backToLobby?.()}>
                Volver a la sala
              </button>
            )}
            <button className="btn" onClick={() => setHideWinner(true)}>
              Ver el tablero
            </button>
            <button className="btn danger" onClick={onLeave}>
              Salir
            </button>
          </div>
        </Modal>
      )}

      {confirmLeave && (
        <Modal narrow onClose={() => setConfirmLeave(false)}>
          <h2>¿Salir de la partida?</h2>
          <p>Eres el anfitrión: si sales, la partida se acaba para todos.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn danger" onClick={onLeave}>
              Salir
            </button>
            <button className="btn" onClick={() => setConfirmLeave(false)}>
              Seguir jugando
            </button>
          </div>
        </Modal>
      )}

      {help && <VillaHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

// ───────────────────────── piezas ─────────────────────────

function BannerView({ banner, view, nameOf, onClose }: { banner: Banner; view: GameView; nameOf: (id?: string | null) => string; onClose: () => void }) {
  if (banner.kind === 'news') {
    const n = NEWS[banner.news];
    return (
      <button className="vm-banner news panel" onClick={onClose}>
        <Sprite name="vm_periodico" scale={3} />
        <span className="vm-banner-kicker">Noticias de la Villa</span>
        <b>{n.title}</b>
        <span>{n.text}</span>
      </button>
    );
  }
  if (banner.kind === 'card') {
    const c = CARDS[banner.card];
    return (
      <button className="vm-banner card panel" onClick={onClose}>
        <Sprite name="vm_carta" scale={3} />
        <span className="vm-banner-kicker">Buzón de {nameOf(banner.player)}</span>
        <b>{c.title}</b>
        <span>{c.text}</span>
      </button>
    );
  }
  if (banner.kind === 'auction') {
    const sp = BOARD[banner.space];
    return (
      <button className="vm-banner card panel" onClick={onClose}>
        <Sprite name="vm_martillo" scale={3} />
        <span className="vm-banner-kicker">Casa de Subastas · la abre {nameOf(banner.player)}</span>
        <b>{sp.name}</b>
        <span>Todos pujan en secreto. Precio de salida en el banco: {sp.price}.</span>
      </button>
    );
  }
  if (banner.kind === 'out') {
    return (
      <button className="vm-banner news panel" onClick={onClose}>
        <Sprite name="vm_billete" scale={3} />
        <span className="vm-banner-kicker">Quiebra</span>
        <b>{nameOf(banner.player)} se ha arruinado</b>
        <span>{view.mode === 'rapida' ? 'La partida termina: ¡recuento de patrimonio!' : 'Queda eliminado de la partida.'}</span>
      </button>
    );
  }
  const e = view.election;
  if (!e) return null;
  const max = Math.max(1, ...PARTY_IDS.map((k) => e.support[k]));
  return (
    <button className="vm-banner election panel" onClick={onClose}>
      <Sprite name="vm_urna" scale={3} />
      <span className="vm-banner-kicker">Resultado de las elecciones</span>
      <b>{e.party ? `Gana el ${PARTIES[e.party].name}` : 'Nadie ha votado'}</b>
      {e.party && <span>{PARTIES[e.party].policy}</span>}
      <span className="vm-bars">
        {PARTY_IDS.map((k) => (
          <span key={k} className="vm-bar-row">
            <span className="vm-bar-name">{PARTIES[k].name.replace('Partido ', '')}</span>
            <span className="vm-bar" style={{ width: `${(e.support[k] / max) * 100}%`, background: PARTIES[k].color }} />
            <span className="vm-bar-n">{Math.round(e.support[k])}</span>
          </span>
        ))}
      </span>
      {e.mayor && <span>Alcaldía: {nameOf(e.mayor)}</span>}
    </button>
  );
}

function PropCard({ id, ctx, view, compact }: { id: number; ctx: Ctx; view: GameView; compact?: boolean }) {
  const s = BOARD[id];
  const o = view.owned[id];
  const owner = o ? view.players.find((p) => p.id === o.owner) : null;
  const band = s.group ? GROUPS[s.group].color : null;
  const kindKey = (isProperty(s) ? s.kind : null) as keyof typeof KIND_INFO | null;
  return (
    <div className={'vm-propcard' + (compact ? ' compact' : '')} style={{ '--band': band ?? '#c8b8a0' } as CSSProperties}>
      <div className="vm-propcard-head">
        <Sprite name={s.icon} scale={2} />
        <div>
          <b>{s.name}</b>
          {s.group && <span>{GROUPS[s.group].name}</span>}
          {kindKey && !s.group && <span>{KIND_INFO[kindKey].name}</span>}
        </div>
      </div>
      {s.price !== undefined && (
        <div className="vm-propcard-row">
          Precio: <b>{s.price}</b>
          {owner ? (
            <span className="vm-owner" style={{ '--pc': colorOf(owner) } as CSSProperties}>
              de {owner.name}
            </span>
          ) : (
            <span className="muted">· a la venta</span>
          )}
        </div>
      )}
      {s.rent && !compact && (
        <table className="vm-rents">
          <tbody>
            <tr className={o?.level === 0 ? 'now' : ''}>
              <td>Solar</td>
              <td>{s.rent[0]}</td>
            </tr>
            <tr>
              <td>Con todo el barrio</td>
              <td>{s.rent[0] * 2}</td>
            </tr>
            {[1, 2, 3].map((k) => (
              <tr key={k} className={o?.level === k ? 'now' : ''}>
                <td>
                  {k} casa{k > 1 ? 's' : ''}
                </td>
                <td>{s.rent![k]}</td>
              </tr>
            ))}
            <tr className={o?.level === 4 ? 'now' : ''}>
              <td>Edificio</td>
              <td>{s.rent[4]}</td>
            </tr>
          </tbody>
        </table>
      )}
      {s.rent && compact && (
        <div className="vm-propcard-row">
          Alquiler: {s.rent[0]} · con el barrio {s.rent[0] * 2} · con casas hasta {s.rent[4]}
        </div>
      )}
      {s.group && !compact && (
        <div className="vm-propcard-row">
          Cada casa (y el edificio): <b>{GROUPS[s.group].house}</b>. Barrio: {groupSpaces(s.group).map((x) => BOARD[x].name).join(', ')}.
        </div>
      )}
      {kindKey && !s.group && <div className="vm-propcard-row">{KIND_INFO[kindKey].text}</div>}
      {s.kind === 'atraccion' && !compact && (
        <div className="vm-propcard-row muted">Taquilla por ronda: {ATTRACTION_INCOME[0]} con una atracción, {ATTRACTION_INCOME[1]} cada una con las dos.</div>
      )}
      {view.closed[id] !== undefined && <div className="vm-propcard-row bad">📣 Hay una manifestación: ahora no cobra alquiler.</div>}
      {!isProperty(s) && <div className="vm-propcard-row">{SPACE_TEXT[s.kind] ?? ''}</div>}
      {o && view.me !== o.owner && view.players.find((p) => p.id === view.me) && (
        <div className="vm-propcard-row muted">Si caes ahora pagarías {rentFor(ctx, id, view.me, view.players.find((p) => p.id === view.me)!.cash, 7)}{s.kind === 'empresa' ? ' (con un 7)' : ''}.</div>
      )}
    </div>
  );
}

const SPACE_TEXT: Partial<Record<string, string>> = {
  salida: 'Cada vez que pasas cobras 200 (y pagas los intereses de tus préstamos).',
  buzon: 'Saca una carta del buzón: puede ser buena o mala.',
  hacienda: 'Pagas el impuesto: va al bote de la Plaza Mayor.',
  bolsa: `Puedes invertir ${BOLSA_BET}: con 1-2 lo pierdes, con 3-4 lo recuperas y con 5-6 ganas 150.`,
  comisaria: 'Si sólo pasas, saludas. Si te encierran, sales sacando dobles o pagando 50 (al tercer turno pagas y sales).',
  plaza: 'Te llevas el bote: lo recaudado por Hacienda y las multas.',
  arresto: '¡Directo a la comisaría, sin pasar por la Salida!',
  subasta: 'El banco subasta una propiedad libre al azar: todos pujan en secreto y gana la puja más alta. Quien cae se lleva el 10 % de comisión.',
  metro: 'Puedes pagar 30 y viajar a la otra estación de metro (no pasa por la Salida). Con huelga de transporte, está cerrado.',
  manifestacion: 'Elige una propiedad de un rival: no cobrará alquiler hasta que su dueño vuelva a jugar.',
  ayuntamiento: `Si ocupas la alcaldía cobras ${MAYOR_PERKS} de dietas. Si no, puedes pagar 100 para convocar un referéndum.`,
};

function PlayerCard({ p, view }: { p: PublicPlayer; view: GameView }) {
  const props = BOARD.filter((s) => view.owned[s.id]?.owner === p.id);
  return (
    <div className="vm-playercard">
      <div className="vm-me-head">
        {p.char && (
          <span className="vm-face big">
            <Sprite name={charSprite(p.char)} scale={2} />
          </span>
        )}
        <div className="vm-me-info">
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          {p.char && (
            <span>
              {CHARACTERS[p.char].name}, {CHARACTERS[p.char].trade}
            </span>
          )}
          <span className="vm-me-money">
            <Coins n={p.cash} big /> <span className="vm-worth">⭐ {p.worth}</span>
          </span>
        </div>
      </div>
      {p.char && (
        <p>
          <b>{CHARACTERS[p.char].power}:</b> {CHARACTERS[p.char].text}
        </p>
      )}
      <p>
        Préstamos: <b>{p.loans}</b>
        {p.jail > 0 && ' · en la comisaría'}
        {view.mayor === p.id && ' · ocupa la alcaldía'}
      </p>
      <div className="vm-chips-list">
        {props.length === 0 && <span className="muted">Sin propiedades.</span>}
        {props.map((s) => (
          <span key={s.id} className="vm-mini-prop" style={{ '--band': s.group ? GROUPS[s.group].color : '#c8b8a0' } as CSSProperties}>
            {s.short}
            {view.owned[s.id].level > 0 && <small>{view.owned[s.id].level === 4 ? ' 🏢' : ' ' + '🏠'.repeat(view.owned[s.id].level)}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

function TradeList({ side }: { side: TradeSide }) {
  return (
    <div className="vm-chips-list">
      {side.props.map((id) => (
        <span key={id} className="vm-mini-prop" style={{ '--band': BOARD[id].group ? GROUPS[BOARD[id].group!].color : '#c8b8a0' } as CSSProperties}>
          {BOARD[id].name}
        </span>
      ))}
      {side.cash > 0 && <Coins n={side.cash} />}
      {!side.props.length && !side.cash && <span className="muted">Nada</span>}
    </div>
  );
}

function VoteModal({ early, view, cash, isClara, onVote }: { early: boolean; view: GameView; cash: number; isClara: boolean; onVote: (p: PartyId | null, d: number) => void }) {
  const [party, setParty] = useState<PartyId | null>(view.party);
  const [don, setDon] = useState(0);
  return (
    <Modal>
      <h2>🗳️ {early ? 'Elecciones anticipadas' : 'Elecciones municipales'}</h2>
      <p>
        Vota en secreto al partido que quieres en el Ayuntamiento. Cada voto suma 25 apoyos y cada moneda donada suma uno más{isClara ? ' (las tuyas, un 50 % más)' : ''}. Quien más aporte al ganador ocupa la alcaldía y cobra 30 cada ronda.
      </p>
      <div className="vm-parties">
        {PARTY_IDS.map((k) => (
          <button key={k} className={'vm-party panel' + (party === k ? ' on' : '')} style={{ '--pc': PARTIES[k].color } as CSSProperties} onClick={() => setParty(k)}>
            <b>{PARTIES[k].name}</b>
            <span>{PARTIES[k].policy}</span>
            {view.party === k && <span className="tag gold">Gobierna ahora</span>}
          </button>
        ))}
      </div>
      <div className="vm-donate">
        <span>Donación:</span>
        {DONATIONS.map((d) => (
          <button key={d} className={'btn small' + (don === d ? ' blue' : '')} disabled={d > cash || !party} onClick={() => setDon(d)}>
            {d}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary big" disabled={!party} onClick={() => onVote(party, party ? don : 0)}>
          Votar{party && don ? ` y donar ${don}` : ''}
        </button>
        <button className="btn" onClick={() => onVote(null, 0)}>
          Abstenerme
        </button>
      </div>
    </Modal>
  );
}

function BidModal({ space, min, host, cash, ctx, view, onBid }: { space: number; min: number; host: string; cash: number; ctx: Ctx; view: GameView; onBid: (bid: number) => void }) {
  const s = BOARD[space];
  const [bid, setBid] = useState(Math.min(cash, Math.max(min, Math.round(((s.price ?? 0) * 0.6) / 10) * 10)));
  const step = (d: number) => setBid((b) => Math.max(min, Math.min(cash, b + d)));
  return (
    <Modal narrow>
      <h2>🔨 Subasta: {s.name}</h2>
      <p>
        La abre <b>{host}</b>. Pujad todos en secreto a la vez: gana la puja más alta (mínimo {min}) y paga lo que ha pujado.
      </p>
      <PropCard id={space} ctx={ctx} view={view} compact />
      {cash < min ? (
        <p className="vm-err">No tienes dinero suficiente para pujar.</p>
      ) : (
        <div className="vm-bid">
          <button className="btn small" onClick={() => step(-50)}>
            −50
          </button>
          <button className="btn small" onClick={() => step(-10)}>
            −10
          </button>
          <Coins n={bid} big />
          <button className="btn small" onClick={() => step(10)}>
            +10
          </button>
          <button className="btn small" onClick={() => step(50)}>
            +50
          </button>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary big" disabled={cash < min} onClick={() => onBid(bid)}>
          Pujar {bid}
        </button>
        <button className="btn" onClick={() => onBid(0)}>
          Paso
        </button>
      </div>
    </Modal>
  );
}

function TradeBuilder({ view, me, onClose, onSend }: { view: GameView; me: PublicPlayer; onClose: () => void; onSend: (to: string, give: TradeSide, want: TradeSide) => void }) {
  const others = view.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [give, setGive] = useState<number[]>([]);
  const [want, setWant] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [wantCash, setWantCash] = useState(0);
  const other = view.players.find((p) => p.id === to);
  const built = (id: number) => {
    const g = BOARD[id].group;
    return !!g && groupSpaces(g).some((x) => (view.owned[x]?.level ?? 0) > 0);
  };
  const list = (pid: string, sel: number[], set: (v: number[]) => void) => (
    <div className="vm-trade-pick">
      {BOARD.filter((s) => view.owned[s.id]?.owner === pid).map((s) => (
        <label key={s.id} className={'vm-trade-item' + (built(s.id) ? ' off' : '')} style={{ '--band': s.group ? GROUPS[s.group].color : '#c8b8a0' } as CSSProperties} title={built(s.id) ? 'Primero hay que vender las casas de ese barrio' : s.name}>
          <input type="checkbox" disabled={built(s.id)} checked={sel.includes(s.id)} onChange={(e) => set(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />
          {s.name}
        </label>
      ))}
      {!BOARD.some((s) => view.owned[s.id]?.owner === pid) && <span className="muted">Sin propiedades</span>}
    </div>
  );
  const stepper = (v: number, set: (n: number) => void, max: number) => (
    <span className="vm-stepper">
      <button className="btn small" onClick={() => set(Math.max(0, v - 50))}>
        −50
      </button>
      <Coins n={v} />
      <button className="btn small" disabled={v + 50 > max} onClick={() => set(Math.min(max, v + 50))}>
        +50
      </button>
    </span>
  );
  const ok = !!other && (give.length > 0 || want.length > 0) && giveCash <= me.cash && wantCash <= (other?.cash ?? 0);
  return (
    <Modal onClose={onClose}>
      <h2>🤝 Proponer un trato</h2>
      <div className="vm-donate">
        <span>Con:</span>
        {others.map((p) => (
          <button
            key={p.id}
            className={'btn small' + (to === p.id ? ' blue' : '')}
            onClick={() => {
              setTo(p.id);
              setWant([]);
              setWantCash(0);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="vm-trade-cols">
        <div>
          <h3>Tú das</h3>
          {list(me.id, give, setGive)}
          {stepper(giveCash, setGiveCash, me.cash)}
        </div>
        <div>
          <h3>Pides a {other?.name}</h3>
          {other && list(other.id, want, setWant)}
          {stepper(wantCash, setWantCash, other?.cash ?? 0)}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary big" disabled={!ok} onClick={() => onSend(to, { props: give, cash: giveCash }, { props: want, cash: wantCash })}>
          Proponer
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
        Puedes proponer hasta 3 tratos por turno. Las calles de un barrio con casas no se pueden cambiar.
      </p>
    </Modal>
  );
}

