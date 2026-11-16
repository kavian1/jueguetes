import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Session, Snapshot } from '../net/protocol';
import type { Action, Answer, DevKind, GameView, PublicPlayer, Res, ResMap } from './types';
import { RES, emptyRes } from './types';
import { COST, DEV_INFO, PLAYER_COLORS, RES_INFO, bankRatio, cabanaSpots, has, roadSpots, total, villaSpots, type Table } from './rules';
import { BH, BW, edgeInfo, hexPos, paintIsland, paintOcean, tokenPos, vertPos } from './art';
import { Sprite } from '../pixel/Sprite';
import { Modal } from '../ui/common';
import { SidePanel } from '../ui/LogPanel';
import { VoiceBadge, VoiceButton } from '../ui/Voice';
import { Backdrop } from '../shell/Backdrop';
import { CostRow, IslaHelp } from './IslaHelp';
import { IslaFx, type Anchors } from './IslaFx';
import './isla.css';

type Mode = null | 'camino' | 'cabana' | 'villa';
type AnchorFn = (key: string) => (el: HTMLElement | null) => void;

const WAIT_LABEL: Record<string, string> = {
  setup: 'está fundando su aldea',
  turn: 'está pensando',
  discard: 'está descartando',
  robber: 'está moviendo al zorro',
  steal: 'elige a quién robar',
  freeRoad: 'abre caminos',
  offer: 'se lo está pensando',
  tradeWait: 'espera respuestas',
};

const colorOf = (p?: PublicPlayer) => (p ? PLAYER_COLORS[p.color % PLAYER_COLORS.length].hex : '#999');

function toTable(v: GameView): Table {
  const buildings = new Map(Object.entries(v.buildings).map(([k, b]) => [Number(k), b]));
  const roads = new Map(Object.entries(v.roads).map(([k, o]) => [Number(k), o]));
  return { board: v.board, buildings, roads };
}

/** Escala entera (o de medio en medio si no cabe) para que la isla llene su hueco sin emborronarse. */
function useFit(ref: React.RefObject<HTMLElement>) {
  const [k, setK] = useState(3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const fit = Math.min(el.clientWidth / BW, el.clientHeight / BH);
      const next = fit >= 3 ? Math.floor(fit) : fit >= 2 ? Math.floor(fit * 2) / 2 : Math.max(0.8, Math.floor(fit * 10) / 10);
      setK((old) => (Math.abs(old - next) > 0.01 ? next : old));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return k;
}

const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ left: Math.round(x - w / 2), top: Math.round(y - h / 2), width: w, height: h });

// ───────────────────────── la isla ─────────────────────────

interface BoardProps {
  view: GameView;
  k: number;
  anchor: AnchorFn;
  targets: { verts?: number[]; edges?: number[]; hexes?: number[] };
  onVertex: (v: number) => void;
  onEdge: (e: number) => void;
  onHex: (h: number) => void;
  ghost: Mode;
}

function IslandBoard({ view, k, anchor, targets, onVertex, onEdge, onHex, ghost }: BoardProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const b = view.board;
  const key = b.hexes.map((h) => h.terrain + h.num).join(',');
  useEffect(() => {
    const c = canvas.current!;
    paintIsland(c.getContext('2d')!, b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const players = view.players;
  const byId = (id: string) => players.find((p) => p.id === id);
  const sum = view.dice ? view.dice[0] + view.dice[1] : 0;
  const hotNum = view.phase === 'main' && view.rolled && sum !== 7 ? sum : 0;
  const robberHex = b.hexes[view.robber];
  const rp = hexPos(robberHex);
  const fox = robberHex.num ? { x: rp.x - 9, y: rp.y - 1 } : { x: rp.x, y: rp.y - 2 };
  const myColor = byId(view.me)?.color ?? 0;

  return (
    <div className="isla-board" style={{ width: Math.round(BW * k), height: Math.round(BH * k) }} ref={anchor('board')}>
      <div className="isla-world" style={{ width: BW, height: BH, transform: `scale(${k})` }}>
        <canvas ref={canvas} width={BW} height={BH} className="isla-canvas" />

        {b.ports.map((port) => {
          const e = b.edges[port.edge];
          const pa = vertPos(b.verts[e.a]);
          const pb = vertPos(b.verts[e.b]);
          const x = (pa.x + pb.x) / 2 + port.dx * 14;
          const y = (pa.y + pb.y) / 2 + port.dy * 14;
          const w = port.kind === 'any' ? 15 : 22;
          const bx = (pa.x + pb.x) / 2 + port.dx * 7 - port.dy * 10;
          const by = (pa.y + pb.y) / 2 + port.dy * 7 + port.dx * 10;
          return (
            <Fragment key={port.id}>
              <div className="isla-boat" style={box(bx, by - 2, 14, 14)}>
                <Sprite name="isla_boat" scale={1} />
              </div>
              <div
                className="isla-port"
                style={box(x, y, w, 11)}
                title={port.kind === 'any' ? 'Muelle: cambia 3 iguales por 1' : `Muelle de ${RES_INFO[port.kind].one}: cambia 2 por 1`}
              >
                <Sprite name={'isla_port_' + port.kind} scale={1} />
              </div>
            </Fragment>
          );
        })}

        {b.hexes.map((h) => {
          if (!h.num) return null;
          const p = tokenPos(h);
          const cls = 'isla-token' + (h.num === hotNum && h.id !== view.robber ? ' hot' : '') + (h.id === view.robber ? ' robbed' : '');
          return (
            <div key={h.id} className={cls} style={box(p.x, p.y, 13, 13)} ref={anchor('hex:' + h.id)} title={`${RES_INFO[h.terrain as Res].terrain} · ${h.num}`}>
              <Sprite name={'isla_num_' + h.num} scale={1} />
            </div>
          );
        })}

        {Object.entries(view.roads).map(([eid, owner]) => {
          const info = edgeInfo(b, b.edges[Number(eid)]);
          const p = byId(owner);
          const [w, hh] = info.dir === 'v' ? [5, 16] : [16, 10];
          return (
            <div key={'r' + eid} className="isla-road" style={box(info.x, info.y, w, hh)} ref={anchor('e:' + eid)}>
              <Sprite name={`isla_road_${info.dir}_${p?.color ?? 0}`} scale={1} />
            </div>
          );
        })}

        {Object.entries(view.buildings).map(([vid, bd]) => {
          const pos = vertPos(b.verts[Number(vid)]);
          const p = byId(bd.owner);
          const big = bd.kind === 'villa';
          return (
            <div key={'b' + vid + bd.kind} className={'isla-piece ' + bd.kind} style={box(pos.x, pos.y - (big ? 4 : 3), big ? 16 : 12, big ? 16 : 12)} ref={anchor('v:' + vid)}>
              <Sprite name={`isla_${bd.kind}_${p?.color ?? 0}`} scale={1} />
            </div>
          );
        })}

        <div className="isla-fox" style={box(fox.x, fox.y, 17, 16)} ref={anchor('fox')}>
          <Sprite name="isla_zorro" scale={1} title="El zorro" />
        </div>

        {targets.hexes?.map((hid) => {
          const p = hexPos(b.hexes[hid]);
          return <button key={'h' + hid} className="isla-hex-target" style={box(p.x, p.y, 34, 36)} onClick={() => onHex(hid)} aria-label="Llevar al zorro aquí" />;
        })}
        {targets.edges?.map((eid) => {
          const info = edgeInfo(b, b.edges[eid]);
          const [w, hh] = info.dir === 'v' ? [5, 16] : [16, 10];
          return (
            <button key={'te' + eid} className="isla-edge-target" style={box(info.x, info.y, w, hh)} onClick={() => onEdge(eid)} aria-label="Construir camino aquí">
              <Sprite name={`isla_road_${info.dir}_ghost`} scale={1} />
              <span className="isla-edge-hover">
                <Sprite name={`isla_road_${info.dir}_${myColor}`} scale={1} />
              </span>
            </button>
          );
        })}
        {targets.verts?.map((vid) => {
          const pos = vertPos(b.verts[vid]);
          return (
            <button key={'tv' + vid} className={'isla-vert-target' + (ghost === 'villa' ? ' villa' : '')} style={box(pos.x, pos.y, 9, 9)} onClick={() => onVertex(vid)} aria-label="Construir aquí">
              <span className="isla-vert-hover" style={box(4.5, ghost === 'villa' ? 0.5 : 1.5, ghost === 'villa' ? 16 : 12, ghost === 'villa' ? 16 : 12)}>
                <Sprite name={`isla_${ghost === 'villa' ? 'villa' : 'cabana'}_${myColor}`} scale={1} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── paneles ─────────────────────────

function PlayerCard({ p, view, anchor, waiting }: { p: PublicPlayer; view: GameView; anchor: AnchorFn; waiting?: string }) {
  const turn = view.turn === p.id && view.phase !== 'over';
  const me = p.id === view.me;
  return (
    <div className={'isla-player panel' + (turn ? ' turn' : '') + (me ? ' me' : '')} style={{ '--pc': colorOf(p) } as CSSProperties} ref={anchor('player:' + p.id)}>
      <div className="ip-head">
        <Sprite name={'isla_flag_' + p.color} scale={2} />
        <span className="ip-name">
          {p.name}
          {me && <span className="tag green">Tú</span>}
          {p.isBot && <span className="tag grey">Bot</span>}
          {!p.connected && <span className="tag red">Sin conexión</span>}
          <VoiceBadge playerId={p.id} />
        </span>
        <span className="ip-vp" title="Puntos">
          {p.vp}
          <small>pts</small>
        </span>
      </div>
      <div className="ip-stats">
        <span className="ip-stat" title="Recursos en la mano">
          <Sprite name="isla_mano" scale={1} />
          {p.cards}
        </span>
        <span className="ip-stat" title="Cartas de aldea sin jugar">
          <Sprite name="isla_cartas" scale={1} />
          {p.devCount}
        </span>
        <span className={'ip-stat' + (view.army === p.id ? ' gold' : '')} title="Perros guardianes jugados">
          <Sprite name="dev_perro" scale={1} />
          {p.dogs}
        </span>
        <span className={'ip-stat' + (view.longest === p.id ? ' gold' : '')} title="Camino seguido más largo">
          <Sprite name="isla_sendero" scale={1} />
          {p.roadLen}
        </span>
      </div>
      {(view.longest === p.id || view.army === p.id) && (
        <div className="ip-badges">
          {view.longest === p.id && <span className="ip-badge">Gran Sendero +2</span>}
          {view.army === p.id && <span className="ip-badge">Gran Jauría +2</span>}
        </div>
      )}
      {waiting && <div className="ip-wait dots">{waiting}</div>}
      {turn && <span className="ip-turn">▶</span>}
    </div>
  );
}

function Dice({ view, anchor }: { view: GameView; anchor: AnchorFn }) {
  const d = view.dice;
  return (
    <div className="isla-dice panel" ref={anchor('dice')}>
      <div className="isla-dice-faces">
        {d ? (
          <>
            <Sprite name={'isla_die_' + d[0]} scale={4} />
            <Sprite name={'isla_die_' + d[1]} scale={4} />
          </>
        ) : (
          <span className="muted">{view.phase === 'setup' ? 'Fundación' : 'Sin tirar'}</span>
        )}
      </div>
      {d && <div className={'isla-dice-sum' + (d[0] + d[1] === 7 ? ' seven' : '')}>{d[0] + d[1]}</div>}
    </div>
  );
}

function Bank({ view, anchor }: { view: GameView; anchor: AnchorFn }) {
  return (
    <div className="isla-bank panel" ref={anchor('bank')}>
      <div className="isla-bank-title">
        <Sprite name="isla_granero" scale={2} /> Granero
      </div>
      <div className="isla-bank-row">
        {RES.map((r) => (
          <span key={r} className="isla-bank-cell" title={RES_INFO[r].name}>
            <Sprite name={'mini_' + r} scale={2} />
            {view.bank[r]}
          </span>
        ))}
        <span className="isla-bank-cell" title="Cartas de aldea">
          <Sprite name="isla_cartas" scale={1} />
          {view.devLeft}
        </span>
      </div>
    </div>
  );
}

function Costs() {
  const rows: [string, string, Partial<ResMap>, string][] = [
    ['isla_road_a_0', 'Camino', COST.camino, ''],
    ['isla_cabana_0', 'Cabaña', COST.cabana, '1 pt'],
    ['isla_villa_0', 'Villa', COST.villa, '2 pts'],
    ['isla_cartas', 'Carta', COST.carta, '?'],
  ];
  return (
    <div className="isla-costs panel">
      {rows.map(([s, n, c, pts]) => (
        <div key={n} className="isla-cost">
          <span className="isla-cost-icon">
            <Sprite name={s} scale={1} />
          </span>
          <span className="isla-cost-name">{n}</span>
          <CostRow cost={c} />
          {pts && <small>{pts}</small>}
        </div>
      ))}
    </div>
  );
}

function ResCard({ r, n, onClick, selected, small }: { r: Res; n: number; onClick?: () => void; selected?: boolean; small?: boolean }) {
  return (
    <button type="button" className={'res-card r-' + r + (n ? '' : ' empty') + (selected ? ' selected' : '') + (small ? ' small' : '')} onClick={onClick} disabled={!onClick} title={RES_INFO[r].name}>
      <Sprite name={'res_' + r} scale={small ? 2 : 3} />
      <span className="res-name">{RES_INFO[r].name}</span>
      <span className="res-count">{n}</span>
    </button>
  );
}

function Stepper({ value, onChange, max, min = 0 }: { value: number; onChange: (v: number) => void; max: number; min?: number }) {
  return (
    <span className="stepper">
      <button className="btn small" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <b>{value}</b>
      <button className="btn small" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

function ResPicker({ value, onChange, limit, totalMax }: { value: ResMap; onChange: (m: ResMap) => void; limit: (r: Res) => number; totalMax?: number }) {
  const sum = total(value);
  return (
    <div className="res-picker">
      {RES.map((r) => (
        <div key={r} className="res-pick">
          <Sprite name={'res_' + r} scale={2} />
          <span className="res-pick-name">{RES_INFO[r].name}</span>
          <Stepper value={value[r]} max={Math.min(limit(r), totalMax !== undefined ? value[r] + totalMax - sum : 99)} onChange={(v) => onChange({ ...value, [r]: v })} />
        </div>
      ))}
    </div>
  );
}

const ResInline = ({ m }: { m: Partial<ResMap> }) => (
  <span className="res-inline">
    {RES.filter((r) => (m[r] ?? 0) > 0).map((r) => (
      <span key={r} className="res-inline-item">
        {m[r]}
        <Sprite name={'mini_' + r} scale={2} />
      </span>
    ))}
  </span>
);

// ───────────────────────── mesa ─────────────────────────

export function IslaTable({ snap, session, onLeave }: { snap: Snapshot<GameView>; session: Session<GameView, Answer>; onLeave: () => void }) {
  const view = snap.view!;
  const players = view.players;
  const me = players.find((p) => p.id === view.me);
  const nameOf = (id?: string | null) => players.find((p) => p.id === id)?.name ?? '?';
  const prompt = view.prompt;
  const pr = prompt?.prompt;
  const isHost = snap.mode !== 'client';
  const t = useMemo(() => toTable(view), [view]);

  const [mode, setMode] = useState<Mode>(null);
  const [trade, setTrade] = useState(false);
  const [devPick, setDevPick] = useState<null | 'cosecha' | 'mercader'>(null);
  const [help, setHelp] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [hideWinner, setHideWinner] = useState(false);

  const anchors: Anchors = useRef(new Map<string, HTMLElement>());
  const anchor: AnchorFn = (key) => (el) => {
    if (el) anchors.current.set(key, el);
    else anchors.current.delete(key);
  };

  const wrap = useRef<HTMLDivElement>(null);
  const k = useFit(wrap);
  const bgScale = Math.max(2, Math.min(4, Math.round(k)));

  useEffect(() => {
    document.title = pr ? '¡Te toca! · Isla Cosecha' : 'Isla Cosecha';
  }, [pr]);
  useEffect(
    () => () => {
      document.title = 'Isla Cosecha';
    },
    [],
  );

  // cada pregunta nueva cancela el modo de construcción
  useEffect(() => {
    setMode(null);
    if (pr?.type !== 'turn') {
      setTrade(false);
      setDevPick(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.id]);

  const send = (a: Answer) => {
    if (prompt) session.answer(prompt.id, a);
    setMode(null);
  };
  const act = (action: Action) => send({ action });

  const myTurn = pr?.type === 'turn';
  const canBuild = myTurn && pr.rolled;
  const spots = useMemo(
    () => ({
      camino: me ? roadSpots(t, me.id) : [],
      cabana: me ? cabanaSpots(t, me.id) : [],
      villa: me ? villaSpots(t, me.id) : [],
    }),
    [t, me],
  );
  const can = (piece: 'camino' | 'cabana' | 'villa') => !!me && canBuild && me.left[piece] > 0 && has(view.res, COST[piece]) && spots[piece].length > 0;
  const canBuy = !!me && canBuild && view.devLeft > 0 && has(view.res, COST.carta);

  // qué se puede señalar en la isla
  let targets: BoardProps['targets'] = {};
  if (pr?.type === 'setup') {
    if (pr.step === 'cabana') targets = { verts: cabanaSpots(t, view.me, true) };
    else targets = { edges: view.board.verts[pr.vertex!].edges.filter((e) => !(e in view.roads)) };
  } else if (pr?.type === 'freeRoad') targets = { edges: spots.camino };
  else if (pr?.type === 'robber') targets = { hexes: view.board.hexes.filter((h) => h.id !== view.robber).map((h) => h.id) };
  else if (myTurn && mode === 'camino') targets = { edges: spots.camino };
  else if (myTurn && mode === 'cabana') targets = { verts: spots.cabana };
  else if (myTurn && mode === 'villa') targets = { verts: spots.villa };
  const ghost: Mode = pr?.type === 'setup' ? 'cabana' : mode;

  const onVertex = (v: number) => {
    if (pr?.type === 'setup') send({ vertex: v });
    else if (mode === 'cabana') act({ kind: 'cabana', vertex: v });
    else if (mode === 'villa') act({ kind: 'villa', vertex: v });
  };
  const onEdge = (e: number) => {
    if (pr?.type === 'setup' || pr?.type === 'freeRoad') send({ edge: e });
    else if (mode === 'camino') act({ kind: 'road', edge: e });
  };
  const onHex = (h: number) => pr?.type === 'robber' && send({ hex: h });

  // a quién estamos esperando
  const waitingOn = new Map<string, string>();
  for (const w of view.waiting) waitingOn.set(w.playerId, WAIT_LABEL[w.type] ?? 'está pensando');

  const playableDev = (kind: DevKind) =>
    myTurn && kind !== 'tesoro' && !view.devPlayed && view.dev.some((d) => d.kind === kind && d.bought < view.round) && (kind !== 'cuadrilla' || (me!.left.camino > 0 && spots.camino.length > 0));
  const playDev = (kind: DevKind) => {
    if (kind === 'cosecha' || kind === 'mercader') setDevPick(kind);
    else act({ kind: 'dev', card: kind });
  };

  // ── barra de instrucciones ──
  let promptText: ReactNode = null;
  let buttons: ReactNode = null;
  const turnP = players.find((p) => p.id === view.turn);
  if (view.phase === 'over') promptText = <b>¡Partida terminada!</b>;
  else if (!pr) {
    const w = view.waiting.find((x) => x.playerId !== view.me);
    promptText = (
      <span className="dots">
        {w ? (
          <>
            <b>{nameOf(w.playerId)}</b> {WAIT_LABEL[w.type] ?? 'está pensando'}
          </>
        ) : (
          <>
            Turno de <b>{turnP?.name}</b>
          </>
        )}
      </span>
    );
  } else if (pr.type === 'setup') {
    promptText =
      pr.step === 'cabana' ? (
        <>
          Elige un cruce para tu <b>{pr.round === 1 ? 'primera' : 'segunda'} cabaña</b>
          {pr.round === 2 ? ' (te dará un recurso de cada casilla que toque)' : ''}.
        </>
      ) : (
        <>
          Ahora elige dónde va su <b>camino</b>.
        </>
      );
  } else if (pr.type === 'turn') {
    if (mode) {
      promptText = (
        <>
          Elige en la isla dónde construir {mode === 'camino' ? 'el camino' : mode === 'cabana' ? 'la cabaña' : 'la villa'}.
        </>
      );
      buttons = (
        <button className="btn small" onClick={() => setMode(null)}>
          Cancelar
        </button>
      );
    } else if (!pr.rolled) {
      promptText = (
        <>
          <b>¡Tu turno!</b> Tira los dados{view.dev.some((d) => d.kind === 'perro') ? ' (o suelta antes un perro)' : ''}.
        </>
      );
      buttons = (
        <button className="btn primary big roll-btn" onClick={() => act({ kind: 'roll' })}>
          <Sprite name="isla_die_5" scale={2} /> Tirar dados
        </button>
      );
    } else {
      promptText = null;
      buttons = (
        <>
          <button className="btn build" disabled={!can('camino')} onClick={() => setMode('camino')} title="Madera + arcilla">
            <Sprite name={`isla_road_a_${me?.color ?? 0}`} scale={2} /> Camino
          </button>
          <button className="btn build" disabled={!can('cabana')} onClick={() => setMode('cabana')} title="Madera + arcilla + lana + trigo">
            <Sprite name={`isla_cabana_${me?.color ?? 0}`} scale={2} /> Cabaña
          </button>
          <button className="btn build" disabled={!can('villa')} onClick={() => setMode('villa')} title="2 trigo + 3 piedra">
            <Sprite name={`isla_villa_${me?.color ?? 0}`} scale={2} /> Villa
          </button>
          <button className="btn build" disabled={!canBuy} onClick={() => act({ kind: 'buy' })} title="Lana + trigo + piedra">
            <Sprite name="isla_cartas" scale={2} /> Carta
          </button>
          <button className="btn blue build" disabled={total(view.res) === 0} onClick={() => setTrade(true)}>
            <Sprite name="isla_granero" scale={2} /> Comerciar
          </button>
          <button className="btn primary end-btn" onClick={() => act({ kind: 'end' })}>
            Pasar turno
          </button>
        </>
      );
    }
    if (pr.error)
      promptText = (
        <>
          {promptText} <span className="err">{pr.error}</span>
        </>
      );
    else if (pr.rolled && !mode) promptText = null;
  } else if (pr.type === 'robber') {
    promptText = (
      <>
        <b>{pr.reason === 'perro' ? 'Tu perro espanta al zorro:' : '¡Un siete!'}</b> Elige la casilla a la que se va el zorro.
      </>
    );
  } else if (pr.type === 'steal') {
    promptText = <>¿A quién le roba el zorro?</>;
    buttons = pr.targets.map((id) => {
      const p = players.find((q) => q.id === id)!;
      return (
        <button key={id} className="btn" style={{ '--pc': colorOf(p) } as CSSProperties} onClick={() => send({ target: id })}>
          <Sprite name={'isla_flag_' + p.color} scale={2} /> {p.name} ({p.cards})
        </button>
      );
    });
  } else if (pr.type === 'freeRoad') {
    promptText = (
      <>
        <b>Cuadrilla:</b> elige dónde va el camino gratis ({pr.left === 2 ? '1 de 2' : '2 de 2'}).
      </>
    );
  } else if (pr.type === 'tradeWait' && view.trade) {
    const tr = view.trade;
    const accepted = Object.entries(tr.responses).filter(([, r]) => r === 'accept');
    promptText = (
      <span className="trade-line">
        Ofreces <ResInline m={tr.give} /> por <ResInline m={tr.want} />
        {Object.entries(tr.responses).map(([id, r]) => (
          <span key={id} className={'trade-resp ' + r}>
            {nameOf(id)} {r === 'accept' ? '✓' : r === 'reject' ? '✗' : '…'}
          </span>
        ))}
      </span>
    );
    buttons = (
      <>
        {accepted.map(([id]) => (
          <button key={id} className="btn primary" onClick={() => send({ partner: id })}>
            Cerrar trato con {nameOf(id)}
          </button>
        ))}
        <button className="btn small" onClick={() => send({ partner: null })}>
          Retirar oferta
        </button>
      </>
    );
  } else if (pr.type === 'discard') promptText = <>El siete te obliga a descartar {pr.count} recursos.</>;
  else if (pr.type === 'offer') promptText = <>{nameOf(pr.from)} te propone un trato.</>;

  const urgent = !!pr && pr.type !== 'tradeWait' && pr.type !== 'turn';
  const mine = pr?.type === 'turn';
  const devGroups = new Map<DevKind, { n: number; ready: boolean }>();
  for (const d of view.dev) {
    const g = devGroups.get(d.kind) ?? { n: 0, ready: false };
    g.n++;
    if (d.bought < view.round) g.ready = true;
    devGroups.set(d.kind, g);
  }
  const ranking = [...players].sort((a, b) => b.vp - a.vp);
  const others = view.trade && view.trade.from !== view.me && pr?.type !== 'offer' ? view.trade : null;

  return (
    <div className="isla-game">
      <Backdrop paint={paintOcean} scale={bgScale} className="ocean" />
      <OceanLife scale={bgScale} />

      <header className="topbar">
        <span className="logo mini">Isla Cosecha</span>
        <span className="turn-pill" style={{ '--pc': colorOf(turnP) } as CSSProperties}>
          {view.phase === 'setup' ? 'Fundación · ' : view.phase === 'main' ? `Turno ${view.round} · ` : ''}
          {view.phase === 'over' ? 'Fin de la partida' : <>le toca a <b>{turnP?.name}</b></>}
        </span>
        <span className="goal-pill">
          Meta: <b>{view.goal} puntos</b>
        </span>
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

      <div className="isla-main">
        <aside className="isla-players">
          {players.map((p) => (
            <PlayerCard key={p.id} p={p} view={view} anchor={anchor} waiting={p.id !== view.me ? waitingOn.get(p.id) : undefined} />
          ))}
        </aside>
        <div className="isla-board-wrap" ref={wrap}>
          <IslandBoard view={view} k={k} anchor={anchor} targets={targets} onVertex={onVertex} onEdge={onEdge} onHex={onHex} ghost={ghost} />
          {others && (
            <div className="isla-offer-banner panel">
              <b>{nameOf(others.from)}</b> ofrece <ResInline m={others.give} /> por <ResInline m={others.want} />
              {Object.entries(others.responses).map(([id, r]) => (
                <span key={id} className={'trade-resp ' + r}>
                  {nameOf(id)} {r === 'accept' ? '✓' : r === 'reject' ? '✗' : '…'}
                </span>
              ))}
            </div>
          )}
        </div>
        <aside className="isla-right">
          <Dice view={view} anchor={anchor} />
          <Bank view={view} anchor={anchor} />
          <Costs />
        </aside>
      </div>

      <div className="isla-bottom">
        <div className={'isla-me panel' + (view.turn === view.me && view.phase !== 'over' ? ' turn' : '')} style={{ '--pc': colorOf(me) } as CSSProperties} ref={anchor('me')}>
          <div className="ip-head">
            <Sprite name={'isla_flag_' + (me?.color ?? 0)} scale={3} />
            <span className="ip-name big">{me?.name}</span>
            {me && <VoiceBadge playerId={me.id} />}
            <span className="ip-vp big">
              {me?.vp ?? 0}
              <small>/{view.goal}</small>
            </span>
          </div>
          <div className="me-pieces">
            <span title="Caminos que te quedan">
              <Sprite name={`isla_road_a_${me?.color ?? 0}`} scale={2} /> {me?.left.camino}
            </span>
            <span title="Cabañas que te quedan">
              <Sprite name={`isla_cabana_${me?.color ?? 0}`} scale={2} /> {me?.left.cabana}
            </span>
            <span title="Villas que te quedan">
              <Sprite name={`isla_villa_${me?.color ?? 0}`} scale={2} /> {me?.left.villa}
            </span>
          </div>
          <div className="me-badges">
            {view.longest === view.me && <span className="ip-badge">Gran Sendero +2</span>}
            {view.army === view.me && <span className="ip-badge">Gran Jauría +2</span>}
            {view.dev.some((d) => d.kind === 'tesoro') && <span className="ip-badge">Tesoros: {view.dev.filter((d) => d.kind === 'tesoro').length}</span>}
          </div>
        </div>

        <div className="isla-hand-col">
          <div className={'prompt-bar panel' + (urgent ? ' urgent' : mine ? ' mine' : '')}>
            {promptText && <div className="prompt-text">{promptText}</div>}
            {buttons && <div className="prompt-buttons">{buttons}</div>}
          </div>
          <div className="isla-hand" ref={anchor('hand')}>
            {RES.map((r) => (
              <ResCard key={r} r={r} n={view.res[r]} />
            ))}
            {devGroups.size > 0 && <span className="hand-sep" />}
            {[...devGroups.entries()].map(([kind, g]) => {
              const ok = playableDev(kind);
              return (
                <button key={kind} className={'dev-card' + (ok ? ' ready' : '') + (kind === 'tesoro' ? ' treasure' : '')} disabled={!ok} onClick={() => playDev(kind)} title={`${DEV_INFO[kind].name}: ${DEV_INFO[kind].text}${!g.ready && kind !== 'tesoro' ? ' (recién comprada: el próximo turno)' : ''}`}>
                  <Sprite name={'dev_' + kind} scale={3} />
                  <span className="res-name">{DEV_INFO[kind].name}</span>
                  {g.n > 1 && <span className="res-count">{g.n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <SidePanel snap={snap} session={session} log={view.log} />
      </div>

      {/* ── ventanas ── */}

      {trade && myTurn && pr.rolled && me && <TradeModal view={view} t={t} onClose={() => setTrade(false)} act={act} />}

      {devPick && myTurn && (
        <DevPickModal
          kind={devPick}
          view={view}
          onClose={() => setDevPick(null)}
          onPick={(res) => {
            setDevPick(null);
            act({ kind: 'dev', card: devPick, res });
          }}
        />
      )}

      {pr?.type === 'discard' && <DiscardModal key={prompt!.id} count={pr.count} res={view.res} onDone={(m) => send({ res: m })} />}

      {pr?.type === 'offer' && (
        <Modal narrow>
          <h2>¡Te ofrecen un trato!</h2>
          <p>
            <b>{nameOf(pr.from)}</b> te da <ResInline m={pr.give} /> si tú le das <ResInline m={pr.want} />.
          </p>
          {!has(view.res, pr.want) && <p className="err">No tienes lo que te pide.</p>}
          <div className="offer-timer" />
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary big" disabled={!has(view.res, pr.want)} onClick={() => send({ accept: true })}>
              Aceptar
            </button>
            <button className="btn danger" onClick={() => send({ accept: false })}>
              Rechazar
            </button>
          </div>
        </Modal>
      )}

      {view.winner && !hideWinner && (
        <Modal narrow onClose={() => setHideWinner(true)}>
          <h2 style={{ textAlign: 'center' }}>{view.winner.id === view.me ? '¡Has ganado!' : view.winner.id ? `¡Gana ${nameOf(view.winner.id)}!` : 'Partida terminada'}</h2>
          <p style={{ textAlign: 'center' }}>{view.winner.text}</p>
          <div className="winner-list">
            {ranking.map((p, i) => (
              <div key={p.id} className={'winner-row' + (p.id === view.winner!.id ? ' won' : '')} style={{ '--pc': colorOf(p) } as CSSProperties}>
                <span>{i + 1}.</span>
                <Sprite name={'isla_flag_' + p.color} scale={2} />
                <b style={{ flex: 1 }}>{p.name}</b>
                <span>{p.vp} pts</span>
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
              Ver la isla
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

      {help && <IslaHelp onClose={() => setHelp(false)} />}
      <IslaFx view={view} anchors={anchors} scale={Math.max(2, Math.min(4, Math.round(k)))} />
    </div>
  );
}

// ───────────────────────── ventanas ─────────────────────────

function TradeModal({ view, t, onClose, act }: { view: GameView; t: Table; onClose: () => void; act: (a: Action) => void }) {
  const [tab, setTab] = useState<'bank' | 'players'>('bank');
  const [give, setGive] = useState<Res | null>(null);
  const [offerGive, setOfferGive] = useState<ResMap>(emptyRes());
  const [offerWant, setOfferWant] = useState<ResMap>(emptyRes());
  const ratio = (r: Res) => bankRatio(t, view.me, r);
  const okOffer = total(offerGive) > 0 && total(offerWant) > 0 && RES.every((r) => !(offerGive[r] && offerWant[r]));
  return (
    <Modal onClose={onClose}>
      <h2>Comerciar</h2>
      <div className="row">
        <button className={'btn small' + (tab === 'bank' ? ' blue' : '')} onClick={() => setTab('bank')}>
          Con el granero
        </button>
        <button className={'btn small' + (tab === 'players' ? ' blue' : '')} onClick={() => setTab('players')}>
          Con los vecinos
        </button>
      </div>
      {tab === 'bank' ? (
        <>
          <h3>1. Lo que entregas</h3>
          <div className="trade-grid">
            {RES.map((r) => (
              <button key={r} className={'res-card small r-' + r + (give === r ? ' selected' : '') + (view.res[r] >= ratio(r) ? '' : ' empty')} disabled={view.res[r] < ratio(r)} onClick={() => setGive(r)}>
                <Sprite name={'res_' + r} scale={2} />
                <span className="res-name">
                  {ratio(r)} {RES_INFO[r].one}
                </span>
                <span className="res-count">{view.res[r]}</span>
              </button>
            ))}
          </div>
          <h3>2. Lo que recibes (1)</h3>
          <div className="trade-grid">
            {RES.map((r) => (
              <button
                key={r}
                className={'res-card small r-' + r + (!give || give === r || view.bank[r] <= 0 ? ' empty' : '')}
                disabled={!give || give === r || view.bank[r] <= 0}
                onClick={() => {
                  if (!give) return;
                  act({ kind: 'bank', give, get: r });
                  if (view.res[give] - ratio(give) < ratio(give)) setGive(null);
                }}
              >
                <Sprite name={'res_' + r} scale={2} />
                <span className="res-name">1 {RES_INFO[r].one}</span>
              </button>
            ))}
          </div>
          <p className="muted">Normalmente 4 iguales por 1. Con un edificio en un muelle: 3 por 1, o 2 por 1 del recurso del muelle.</p>
        </>
      ) : (
        <>
          <div className="offer-cols">
            <div>
              <h3>Das</h3>
              <ResPicker value={offerGive} onChange={setOfferGive} limit={(r) => view.res[r]} />
            </div>
            <div>
              <h3>Pides</h3>
              <ResPicker value={offerWant} onChange={setOfferWant} limit={() => 5} />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn primary"
              disabled={!okOffer}
              onClick={() => {
                act({ kind: 'offer', give: offerGive, want: offerWant });
                onClose();
              }}
            >
              Ofrecer a todos
            </button>
          </div>
          <p className="muted">Los demás tienen 30 segundos para aceptar; luego eliges con quién cerrar el trato.</p>
        </>
      )}
    </Modal>
  );
}

function DevPickModal({ kind, view, onClose, onPick }: { kind: 'cosecha' | 'mercader'; view: GameView; onClose: () => void; onPick: (r: Res[]) => void }) {
  const [m, setM] = useState<ResMap>(emptyRes());
  const need = kind === 'cosecha' ? 2 : 1;
  const list: Res[] = [];
  for (const r of RES) for (let i = 0; i < m[r]; i++) list.push(r);
  return (
    <Modal narrow onClose={onClose}>
      <h2>{DEV_INFO[kind].name}</h2>
      <p>{DEV_INFO[kind].text}</p>
      {kind === 'cosecha' ? (
        <ResPicker value={m} onChange={setM} limit={(r) => view.bank[r]} totalMax={2} />
      ) : (
        <div className="trade-grid">
          {RES.map((r) => (
            <button key={r} className={'res-card small r-' + r + (m[r] ? ' selected' : '')} onClick={() => setM({ ...emptyRes(), [r]: 1 })}>
              <Sprite name={'res_' + r} scale={2} />
              <span className="res-name">{RES_INFO[r].name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={list.length !== need} onClick={() => onPick(list)}>
          Jugar la carta
        </button>
      </div>
    </Modal>
  );
}

function DiscardModal({ count, res, onDone }: { count: number; res: ResMap; onDone: (m: ResMap) => void }) {
  const [m, setM] = useState<ResMap>(emptyRes());
  const n = total(m);
  return (
    <Modal narrow>
      <h2>¡Siete! Descarta {count}</h2>
      <p>Tienes demasiados recursos y el zorro anda cerca: elige {count} para devolver al granero.</p>
      <ResPicker value={m} onChange={setM} limit={(r) => res[r]} totalMax={count} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <span className="muted">
          {n}/{count}
        </span>
        <button className="btn primary" disabled={n !== count} onClick={() => onDone(m)}>
          Descartar
        </button>
      </div>
    </Modal>
  );
}

/** Olitas que se mecen, destellos y alguna gaviota que cruza. */
function OceanLife({ scale }: { scale: number }) {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    let tm: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(tm);
      tm = setTimeout(() => setVp({ w: window.innerWidth, h: window.innerHeight }), 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(tm);
    };
  }, []);
  const items = useMemo(() => {
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    return Array.from({ length: 26 }, () => ({ x: rnd(), y: rnd(), d: rnd(), s: rnd() }));
  }, []);
  return (
    <div className="ocean-life" aria-hidden="true">
      {items.map((it, i) => (
        <span
          key={i}
          className={i % 3 === 0 ? 'ocean-spark' : 'ocean-wave'}
          style={{
            left: Math.round((it.x * vp.w) / scale) * scale,
            top: Math.round((it.y * vp.h) / scale) * scale,
            animationDelay: `${-it.d * 6}s`,
            animationDuration: `${3 + it.s * 3}s`,
          }}
        >
          {i % 3 === 0 ? null : <Sprite name="isla_wave" scale={scale} />}
        </span>
      ))}
      <div className="gull-lane">
        <span className="gull">
          <Sprite name="isla_gull" scale={scale} />
        </span>
      </div>
    </div>
  );
}

