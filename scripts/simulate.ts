// Simula muchas partidas sólo con bots para comprobar que el motor no se rompe.
// Uso: npm run sim
import { Game } from '../src/game/engine';
import { botAnswer } from '../src/game/bot';
import { mulberry32 } from '../src/game/rng';
import type { Card } from '../src/game/types';

const GAMES = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GAMES ?? 2000);
const wins: Record<string, number> = {};
let turns = 0;
let stuck = 0;

function checkInvariants(g: Game, label: string) {
  const all: Card[] = [...g.deck, ...g.discard, ...(g.store ?? []), ...g.peek];
  for (const p of g.players) all.push(...p.hand, ...p.inPlay);
  const ids = new Set(all.map((c) => c.id));
  if (all.length !== 80 || ids.size !== 80) throw new Error(`${label}: hay ${all.length} cartas (${ids.size} únicas)`);
  for (const p of g.players) {
    if (p.alive && p.hp > p.maxHp) throw new Error(`${label}: ${p.name} tiene más vida que el máximo`);
    if (!p.alive && (p.hand.length || p.inPlay.length)) throw new Error(`${label}: ${p.name} eliminado conserva cartas`);
    const names = p.inPlay.map((c) => c.kind);
    if (new Set(names).size !== names.length) throw new Error(`${label}: ${p.name} tiene cartas repetidas en juego`);
  }
}

for (let i = 0; i < GAMES; i++) {
  const n = 4 + (i % 4);
  const seats = Array.from({ length: n }, (_, k) => ({ id: 'p' + k, name: 'Bot' + k, isBot: true }));
  let g!: Game;
  g = new Game(seats, {
    rnd: mulberry32(i + 1),
    maxTurns: 1500,
    onChange: () => checkInvariants(g, `partida ${i}`),
    ask: async (req) => botAnswer(g, req),
  });
  await g.run();
  checkInvariants(g, `partida ${i} (final)`);
  const team = g.winner?.team ?? 'ninguno';
  if (team === 'nadie') stuck++;
  wins[`${n}j ${team}`] = (wins[`${n}j ${team}`] ?? 0) + 1;
  turns += g.turnCount;
}

console.log(`Partidas: ${GAMES}, turnos medios: ${(turns / GAMES).toFixed(1)}, atascadas: ${stuck}`);
console.table(wins);
