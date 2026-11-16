// Simula muchas partidas de Villa Moneda sólo con bots para comprobar el motor y el equilibrio.
// Uso: npm run sim:villa   (GAMES=1000 para más partidas, MODE=rapida|final|magnate)
import { VillaGame } from '../src/villa/engine';
import { botAnswer } from '../src/villa/bot';
import { buildView } from '../src/villa/view';
import { mulberry32 } from '../src/game/rng';
import { CHAR_IDS, PARTY_IDS } from '../src/villa/rules';
import type { CharId, Mode, PartyId } from '../src/villa/types';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GAMES = Number(env.GAMES ?? 600);
const MODE = (env.MODE ?? 'rapida') as Mode;

const charPlays: Record<string, number> = {};
const charWins: Record<string, number> = {};
const partyWins: Record<string, number> = {};
const seatWins: Record<string, number> = {};
const counts: Record<string, number> = {};
const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
let rounds = 0;
let capped = 0;
let bankrupt = 0;
const lengths: number[] = [];
const margins: number[] = [];
const worths: number[] = [];

for (let i = 0; i < GAMES; i++) {
  const n = 3 + (i % 3);
  const seats = Array.from({ length: n }, (_, k) => ({ id: 'p' + k, name: 'Bot' + k, isBot: true }));
  // personajes al azar (no los preferidos por los bots) para medir el equilibrio
  const randomChars = env.SIM_PICK !== '1';
  let g!: VillaGame;
  const rnd = mulberry32(i * 31 + 5);
  g = new VillaGame(seats, {
    rnd,
    mode: MODE,
    onChange: () => {
      g.check(`partida ${i}`);
      if (i % 10 === 0) for (const p of g.players) buildView(g, p.id);
    },
    ask: async (req) => {
      if (randomChars && req.prompt.type === 'character') return { char: req.prompt.options[Math.floor(rnd() * 2)] };
      return botAnswer(g, req);
    },
  });
  const origLog = g.addLog.bind(g);
  g.addLog = (text, kind) => {
    if (text.includes('Trato hecho')) count('tratos');
    if (text.includes(' construye ')) count('casas');
    if (text.includes('pide un préstamo')) count('préstamos');
    if (text.includes('¡Adjudicado!')) count('subastas');
    if (text.includes('organiza una manifestación')) count('manifestaciones');
    if (text.includes('coge el metro')) count('metro');
    if (text.includes('convoca un referéndum')) count('referéndums');
    if (text.includes('de taquilla')) count('taquillas');
    if (text.startsWith('Gana el ')) {
      count('elecciones');
      const k = PARTY_IDS.find((id) => text.includes(['Obrero', 'Mercado', 'Verde', 'Progreso'][PARTY_IDS.indexOf(id)]));
      if (k) partyWins[k] = (partyWins[k] ?? 0) + 1;
    }
    origLog(text, kind);
  };
  await g.run();
  if (g.players.some((p) => p.bankrupt)) bankrupt++;
  const r = Math.min(g.round, g.maxRounds);
  rounds += r;
  lengths.push(r);
  if (g.round >= g.maxRounds && g.alive.length > 1 && !(MODE === 'magnate' && g.worth(g.byId(g.winner!.id)!) >= g.goal!)) capped++;
  const rank = g.ranking();
  margins.push(rank[0].worth - rank[1].worth);
  worths.push(rank[0].worth);
  const w = g.byId(g.winner!.id)!;
  if (randomChars) {
    for (const p of g.players) charPlays[p.char!] = (charPlays[p.char!] ?? 0) + 1 / n;
    charWins[w.char!] = (charWins[w.char!] ?? 0) + 1;
  }
  const seat = `${n}j asiento ${g.players.indexOf(w)}`;
  seatWins[seat] = (seatWins[seat] ?? 0) + 1;
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
console.log(`Modo: ${MODE} · partidas: ${GAMES} · rondas medias: ${(rounds / GAMES).toFixed(1)} (mediana ${pct(lengths, 0.5)}, 90 % ≤ ${pct(lengths, 0.9)}) · llegan al tope: ${((capped / GAMES) * 100).toFixed(0)} % · con quiebras: ${((bankrupt / GAMES) * 100).toFixed(0)} %`);
console.log('Por partida: ' + Object.entries(counts).map(([k, v]) => `${k} ${(v / GAMES).toFixed(1)}`).join(' · '));
console.log(`Patrimonio del ganador: ${avg(worths).toFixed(0)} · ventaja sobre el segundo: ${avg(margins).toFixed(0)}`);
console.log('\nPersonajes (personaje al azar): victorias / esperadas por número de jugadores');
const table: Record<string, string> = {};
for (const c of CHAR_IDS as CharId[]) table[c] = `${(((charWins[c] ?? 0) / (charPlays[c] || 1)) * 100).toFixed(0)} %  (${charWins[c] ?? 0} victorias)`;
console.table(table);
console.log('Partidos ganadores:');
console.table(Object.fromEntries((PARTY_IDS as PartyId[]).map((k) => [k, partyWins[k] ?? 0])));
console.log('Asientos:');
console.table(seatWins);
