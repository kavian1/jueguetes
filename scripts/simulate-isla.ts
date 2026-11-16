// Simula muchas partidas de Isla Cosecha sólo con bots para comprobar el motor.
// Uso: npm run sim:isla
import { IslaGame } from '../src/isla/engine';
import { botAnswer } from '../src/isla/bot';
import { mulberry32 } from '../src/game/rng';
import { RES } from '../src/isla/types';
import { BANK_START, PIECES, longestRoad } from '../src/isla/rules';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GAMES = Number(env.GAMES ?? 400);
let turns = 0;
let stuck = 0;
let trades = 0;
let sevens = 0;
const wins: Record<string, number> = {};
const vps: number[] = [];

function check(g: IslaGame, label: string) {
  for (const r of RES) {
    const sum = g.bank[r] + g.players.reduce((s, p) => s + p.res[r], 0);
    if (sum !== BANK_START) throw new Error(`${label}: ${r} suma ${sum}`);
    for (const p of g.players) if (p.res[r] < 0) throw new Error(`${label}: ${p.name} tiene ${r} negativo`);
  }
  const devs = g.devDeck.length + g.players.reduce((s, p) => s + p.dev.length + p.dogs, 0);
  if (devs > 25) throw new Error(`${label}: ${devs} cartas de aldea`);
  for (const p of g.players) {
    const cab = [...g.buildings.values()].filter((b) => b.owner === p.id && b.kind === 'cabana').length;
    const vil = [...g.buildings.values()].filter((b) => b.owner === p.id && b.kind === 'villa').length;
    const roads = [...g.roads.values()].filter((o) => o === p.id).length;
    if (cab + p.left.cabana !== PIECES.cabana || vil + p.left.villa !== PIECES.villa || roads + p.left.camino !== PIECES.camino)
      throw new Error(`${label}: piezas descuadradas de ${p.name}`);
    if (p.roadLen !== longestRoad(g.table, p.id)) throw new Error(`${label}: camino de ${p.name} desactualizado`);
  }
  for (const [v] of g.buildings) for (const a of g.board.verts[v].adj) if (g.buildings.has(a)) throw new Error(`${label}: cabañas pegadas`);
  const mine = g.prompts.map((p) => p.playerId);
  if (new Set(mine).size !== mine.length) throw new Error(`${label}: dos preguntas a la vez al mismo jugador`);
}

for (let i = 0; i < GAMES; i++) {
  const n = 3 + (i % 2);
  const seats = Array.from({ length: n }, (_, k) => ({ id: 'p' + k, name: 'Bot' + k, isBot: true }));
  let g!: IslaGame;
  g = new IslaGame(seats, {
    rnd: mulberry32(i + 7),
    maxTurns: 600,
    timer: () => new Promise(() => {}),
    onChange: () => check(g, `partida ${i}`),
    ask: async (req) => botAnswer(g, req),
  });
  const origLog = g.addLog.bind(g);
  g.addLog = (text, kind, to) => {
    if (text.includes('cierran el trato')) trades++;
    if (text.includes('siete')) sevens++;
    origLog(text, kind, to);
  };
  await g.run();
  check(g, `partida ${i} (final)`);
  if (!g.winner?.id) stuck++;
  else {
    const w = g.byId(g.winner.id)!;
    vps.push(g.vp(w));
  }
  const k = `${n}j asiento ${g.winner?.id ? g.players.findIndex((p) => p.id === g.winner!.id) : '-'}`;
  wins[k] = (wins[k] ?? 0) + 1;
  turns += g.turnCount;
}

console.log(`Partidas: ${GAMES}, turnos medios: ${(turns / GAMES).toFixed(1)}, atascadas: ${stuck}, tratos/partida: ${(trades / GAMES).toFixed(1)}, sietes/partida: ${(sevens / GAMES).toFixed(1)}`);
console.table(wins);
