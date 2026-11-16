// Villa Moneda: tablero, modos, personajes, partidos, noticias, cartas del Buzón y cálculos de reglas.
import type { CardId, CharId, Group, Mode, NewsId, Owned, PartyId, PlayerState, Space } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;
export const START_CASH = 1500;
/** quien empieza más tarde recibe algo más para compensar */
export const SEAT_BONUS = 150;
export const SALARY = 200;
export const JAIL_FINE = 50;
export const LOAN = 200;
export const LOAN_INTEREST = 20;
export const MAX_LOANS = 3;
export const BOLSA_BET = 100;
/** lo que paga Lola por repetir la tirada */
export const TAXI_FARE = 60;
export const MAYOR_PAY = 30;
export const VOTE_BASE = 25;
export const DONATIONS = [0, 50, 100, 150, 200];
export const ELECTION_ROUNDS = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56];
export const BOARD_SIZE = 40;
export const JAIL_SPACE = 10;
export const PLAZA_SPACE = 20;
export const METRO_FARE = 30;
export const REFERENDUM_COST = 100;
export const MAYOR_PERKS = 75;
/** comisión del subastador: lo que se lleva quien cae en la Casa de Subastas */
export const AUCTION_FEE = 0.1;
/** taquilla de cada atracción al empezar la ronda (con una / con las dos) */
export const ATTRACTION_INCOME = [25, 40];

// ───────────────────────── modos ─────────────────────────

export interface ModeInfo {
  name: string;
  short: string;
  text: string;
  /** última ronda (tope de seguridad en los modos que terminan de otra forma) */
  maxRounds: number;
  /** quebrar elimina al jugador y la partida sigue */
  elimination: boolean;
}

export const MODES: Record<Mode, ModeInfo> = {
  rapida: {
    name: 'Partida rápida',
    short: 'Rápida',
    text: 'Termina en cuanto alguien quiebra o al acabar la ronda 20. Gana el mayor patrimonio.',
    maxRounds: 20,
    elimination: false,
  },
  final: {
    name: 'Hasta el final',
    short: 'Hasta el final',
    text: 'Quien quiebra queda eliminado y sus propiedades pasan a quien le arruinó. Gana el último que quede en pie. Cada 5 rondas los alquileres suben un 25 %.',
    maxRounds: 60,
    elimination: true,
  },
  magnate: {
    name: 'Magnate',
    short: 'Magnate',
    text: 'Gana el primero que llegue a 5000 de patrimonio al terminar un turno. Quien quiebra queda eliminado.',
    maxRounds: 30,
    elimination: true,
  },
};
export const MODE_IDS = Object.keys(MODES) as Mode[];
export const MAGNATE_GOAL = 5000;
/** «hasta el final»: cada cuántas rondas suben los alquileres, y cuánto */
export const INFLATION_EVERY = 5;
export const INFLATION_STEP = 0.25;
/** multiplicador de los alquileres por la inflación en una ronda */
export const inflation = (mode: Mode, round: number) => (mode === 'final' ? 1 + INFLATION_STEP * Math.floor(Math.max(0, round - 1) / INFLATION_EVERY) : 1);

export const PLAYER_COLORS = [
  { name: 'Rojo', hex: '#e8484d' },
  { name: 'Azul', hex: '#3a86ec' },
  { name: 'Verde', hex: '#3fae5a' },
  { name: 'Morado', hex: '#a25ce0' },
  { name: 'Naranja', hex: '#f5922a' },
];

// ───────────────────────── barrios ─────────────────────────

export const GROUPS: Record<Group, { name: string; color: string; house: number }> = {
  viejo: { name: 'Barrio Viejo', color: '#c8643c', house: 50 },
  puerto: { name: 'El Puerto', color: '#4fb8e0', house: 50 },
  flores: { name: 'Las Flores', color: '#ee6aa0', house: 100 },
  huertas: { name: 'Las Huertas', color: '#d8b832', house: 100 },
  feria: { name: 'La Feria', color: '#f5822a', house: 150 },
  bosque: { name: 'El Bosque', color: '#4fae5a', house: 150 },
  mirador: { name: 'El Mirador', color: '#8a5ae0', house: 200 },
};
export const GROUP_ORDER: Group[] = ['viejo', 'puerto', 'flores', 'huertas', 'feria', 'bosque', 'mirador'];

const calle = (id: number, name: string, short: string, group: Group, price: number, rent: number[]): Space => ({ id, kind: 'calle', name, short, group, price, rent, icon: 'vm_casa_' + group });

export const BOARD: Space[] = [
  { id: 0, kind: 'salida', name: 'Salida', short: 'Salida', icon: 'vm_salida' },
  calle(1, 'Callejón del Pozo', 'C. del Pozo', 'viejo', 60, [4, 20, 60, 180, 320]),
  { id: 2, kind: 'buzon', name: 'Buzón', short: 'Buzón', icon: 'vm_buzon' },
  calle(3, 'Calle del Horno', 'C. del Horno', 'viejo', 80, [6, 30, 90, 270, 450]),
  { id: 4, kind: 'hacienda', name: 'Hacienda', short: 'Hacienda', tax: 100, icon: 'vm_hacienda' },
  { id: 5, kind: 'transporte', name: 'Estación del Tren', short: 'Estación', price: 200, icon: 'vm_tren' },
  calle(6, 'Muelle Chico', 'Muelle Chico', 'puerto', 100, [8, 40, 110, 320, 500]),
  { id: 7, kind: 'subasta', name: 'Casa de Subastas', short: 'Subastas', icon: 'vm_martillo' },
  calle(8, 'Paseo de las Gaviotas', 'P. Gaviotas', 'puerto', 100, [8, 40, 110, 320, 500]),
  calle(9, 'Calle de la Lonja', 'C. Lonja', 'puerto', 120, [10, 50, 140, 400, 600]),
  { id: 10, kind: 'comisaria', name: 'Comisaría', short: 'Comisaría', icon: 'vm_rejas' },
  calle(11, 'Calle Amapola', 'C. Amapola', 'flores', 140, [12, 60, 180, 500, 750]),
  { id: 12, kind: 'empresa', name: 'Central Eléctrica', short: 'Eléctrica', price: 150, icon: 'vm_rayo' },
  calle(13, 'Plaza de las Lilas', 'Pl. Lilas', 'flores', 140, [12, 60, 180, 500, 750]),
  calle(14, 'Avenida Jazmín', 'Av. Jazmín', 'flores', 160, [14, 70, 200, 550, 800]),
  { id: 15, kind: 'metro', name: 'Metro Oeste', short: 'Metro O.', icon: 'vm_metro' },
  calle(16, 'Camino de las Huertas', 'C. Huertas', 'huertas', 180, [16, 80, 220, 600, 850]),
  { id: 17, kind: 'atraccion', name: 'La Noria', short: 'Noria', price: 220, icon: 'vm_noria' },
  calle(18, 'Calle del Membrillo', 'C. Membrillo', 'huertas', 180, [16, 80, 220, 600, 850]),
  calle(19, 'Plaza del Granero', 'Pl. Granero', 'huertas', 200, [18, 90, 250, 700, 950]),
  { id: 20, kind: 'plaza', name: 'Plaza Mayor', short: 'Plaza Mayor', icon: 'vm_fuente' },
  calle(21, 'Calle del Tiovivo', 'C. Tiovivo', 'feria', 220, [20, 100, 300, 750, 1050]),
  { id: 22, kind: 'buzon', name: 'Buzón', short: 'Buzón', icon: 'vm_buzon' },
  calle(23, 'Paseo de los Farolillos', 'P. Farolillos', 'feria', 220, [20, 100, 300, 750, 1050]),
  calle(24, 'Plaza del Circo', 'Pl. Circo', 'feria', 240, [22, 110, 330, 800, 1100]),
  { id: 25, kind: 'transporte', name: 'Puerto de Ferris', short: 'Ferris', price: 200, icon: 'vm_barco' },
  { id: 26, kind: 'banco', name: 'Caja de Ahorros', short: 'Caja', price: 200, icon: 'vm_banco' },
  { id: 27, kind: 'manifestacion', name: 'Plaza de las Pancartas', short: 'Pancartas', icon: 'vm_pancarta' },
  { id: 28, kind: 'empresa', name: 'Fábrica de Galletas', short: 'Galletas', price: 150, icon: 'vm_fabrica' },
  { id: 29, kind: 'ayuntamiento', name: 'Ayuntamiento', short: 'Ayto.', icon: 'vm_ayto' },
  { id: 30, kind: 'arresto', name: '¡A la comisaría!', short: '¡Arresto!', icon: 'vm_silbato' },
  calle(31, 'Avenida de los Robles', 'Av. Robles', 'bosque', 260, [24, 120, 360, 850, 1150]),
  calle(32, 'Camino del Molino', 'C. Molino', 'bosque', 260, [24, 120, 360, 850, 1150]),
  { id: 33, kind: 'bolsa', name: 'Bolsa de Valores', short: 'Bolsa', icon: 'vm_bolsa' },
  calle(34, 'Plaza del Arce', 'Pl. Arce', 'bosque', 280, [26, 130, 390, 900, 1200]),
  { id: 35, kind: 'metro', name: 'Metro Este', short: 'Metro E.', icon: 'vm_metro' },
  { id: 36, kind: 'atraccion', name: 'Museo de la Villa', short: 'Museo', price: 240, icon: 'vm_museo' },
  calle(37, 'Paseo del Mirador', 'P. Mirador', 'mirador', 350, [35, 175, 500, 1100, 1500]),
  { id: 38, kind: 'banco', name: 'Banco de la Villa', short: 'Banco', price: 200, icon: 'vm_banco' },
  calle(39, 'Avenida de la Luna', 'Av. Luna', 'mirador', 400, [45, 200, 600, 1300, 1800]),
];

export const PROPERTY_KINDS = ['calle', 'transporte', 'empresa', 'banco', 'atraccion'] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];
export const isProperty = (s: Space) => (PROPERTY_KINDS as readonly string[]).includes(s.kind);
export const PROPERTIES = BOARD.filter(isProperty).map((s) => s.id);
export const groupSpaces = (g: Group) => BOARD.filter((s) => s.group === g).map((s) => s.id);
export const kindSpaces = (k: Space['kind']) => BOARD.filter((s) => s.kind === k).map((s) => s.id);
/** La otra estación de metro. */
export const otherMetro = (id: number) => kindSpaces('metro').find((m) => m !== id)!;

export const KIND_INFO: Record<PropertyKind, { name: string; text: string }> = {
  calle: { name: 'Calles', text: 'Con todo el barrio cobras el doble y puedes construir casas (hasta 3) y luego un edificio.' },
  transporte: { name: 'Transporte', text: 'Estación y Ferris: 50 con uno, 125 con los dos.' },
  empresa: { name: 'Empresas', text: 'Cobran los dados × 5 con una, o × 12 con las dos.' },
  banco: { name: 'Bancos', text: 'Cobran el 10 % del dinero de quien cae por cada banco (mín. 25). Si tienes un banco, tus préstamos no pagan intereses.' },
  atraccion: {
    name: 'Atracciones',
    text: 'La Noria y el Museo: quien cae paga la entrada (40, u 80 con las dos) y su dueño cobra la taquilla al empezar cada ronda (25 por atracción, 40 con las dos).',
  },
};

// ───────────────────────── personajes ─────────────────────────

export interface CharInfo {
  name: string;
  trade: string;
  power: string;
  text: string;
}

export const CHARACTERS: Record<CharId, CharInfo> = {
  rita: { name: 'Rita', trade: 'constructora', power: 'Manos a la obra', text: 'Construir le cuesta un 25 % menos y cobra 10 cada vez que otro jugador construye (la contratan a ella).' },
  nora: { name: 'Nora', trade: 'agente inmobiliaria', power: 'Ojo para las gangas', text: 'Compra propiedades al banco un 30 % más baratas.' },
  tomas: { name: 'Tomás', trade: 'casero', power: 'Alquiler de lujo', text: 'Cobra un 40 % más de alquiler en sus calles.' },
  ernesto: { name: 'Ernesto', trade: 'banquero', power: 'Buen crédito', text: 'Sus préstamos no pagan intereses, puede pedir hasta 4 y cobra 40 más en la Salida.' },
  lola: { name: 'Lola', trade: 'taxista', power: 'Atajo', text: 'Una vez cada dos vueltas puede pagar 60 y repetir la tirada si no le gusta dónde iba a caer.' },
  abel: { name: 'Abel', trade: 'abogado', power: 'Siempre libre', text: 'Sale gratis de la comisaría cuando quiere, paga la mitad en Hacienda y en las multas y cobra 100 cada vez que otro acaba en la comisaría.' },
  clara: { name: 'Clara', trade: 'concejala', power: 'Don de gentes', text: 'Sus donaciones electorales valen un 50 % más, los referéndums le salen gratis y, si ocupa la alcaldía, cobra un 50 % más.' },
  pepe: { name: 'Pepe', trade: 'periodista', power: 'Primicia', text: 'Las noticias nunca le hacen pagar y cobra el doble cuando reparten dinero.' },
  fortu: { name: 'Fortunata', trade: 'la afortunada', power: 'Trébol', text: 'En el Buzón saca dos cartas y elige una; al pasar por la Salida tira un dado y, con un 4, 5 o 6, cobra el doble.' },
  mar: { name: 'Mar', trade: 'viajera', power: 'Abono de transporte', text: 'No paga en la Estación ni en Ferris, viaja gratis en metro y cobra 60 más en la Salida.' },
};
export const CHAR_IDS = Object.keys(CHARACTERS) as CharId[];

// ───────────────────────── partidos ─────────────────────────

export const PARTIES: Record<PartyId, { name: string; color: string; policy: string }> = {
  rojo: { name: 'Partido Obrero', color: '#e8484d', policy: 'La Salida paga 250 en vez de 200.' },
  azul: { name: 'Partido del Mercado', color: '#3a86ec', policy: 'Los alquileres de las calles suben un 20 %.' },
  verde: { name: 'Partido Verde', color: '#3fae5a', policy: 'Estación y Ferris cobran el doble; las empresas, la mitad.' },
  naranja: { name: 'Partido del Progreso', color: '#f5922a', policy: 'Construir cuesta un 30 % menos.' },
};
export const PARTY_IDS = Object.keys(PARTIES) as PartyId[];

// ───────────────────────── noticias ─────────────────────────

export interface NewsInfo {
  title: string;
  text: string;
  /** dura toda la ronda o pasa al momento */
  lasts: boolean;
  weight: number;
}

export const NEWS: Record<NewsId, NewsInfo> = {
  boom: { title: 'Boom inmobiliario', text: 'Esta ronda los alquileres de las calles suben un 50 %.', lasts: true, weight: 2 },
  crisis: { title: 'Crisis económica', text: 'Esta ronda los alquileres de las calles bajan a la mitad.', lasts: true, weight: 2 },
  inflacion: { title: 'Inflación', text: 'Esta ronda construir cuesta un 50 % más.', lasts: true, weight: 1 },
  rebajas: { title: 'Rebajas de ladrillo', text: 'Esta ronda construir cuesta la mitad.', lasts: true, weight: 1 },
  tipos: { title: 'Suben los tipos', text: 'Esta ronda los intereses de los préstamos se pagan dobles.', lasts: true, weight: 1 },
  huelga: { title: 'Huelga de transporte', text: 'Esta ronda la Estación y Ferris no cobran y el metro no funciona.', lasts: true, weight: 1 },
  turismo: { title: 'Temporada turística', text: 'Esta ronda la Estación, Ferris y las atracciones cobran el doble.', lasts: true, weight: 1 },
  frio: { title: 'Ola de frío', text: 'Esta ronda las empresas cobran el doble.', lasts: true, weight: 1 },
  panico: { title: 'Pánico bancario', text: 'Esta ronda los bancos no cobran.', lasts: true, weight: 1 },
  calma: { title: 'Un día tranquilo', text: 'No pasa nada en la Villa. Los vecinos dan de comer a los patos.', lasts: true, weight: 2 },
  dividendos: { title: 'Reparto de dividendos', text: 'Cada jugador cobra 10 por cada propiedad que tenga.', lasts: false, weight: 1 },
  inspeccion: { title: 'Inspección de Hacienda', text: 'Cada jugador paga el 10 % de su dinero (va al bote de la Plaza).', lasts: false, weight: 1 },
  subvencion: { title: 'Subvención municipal', text: 'Quien tenga menos patrimonio cobra 150.', lasts: false, weight: 1 },
  tormenta: { title: 'Tormenta', text: 'Cada jugador paga 15 por cada casa y 50 por cada edificio en reparaciones.', lasts: false, weight: 1 },
  festival: { title: 'Festival de la Villa', text: 'Todos cobran 50 de la venta de churros.', lasts: false, weight: 1 },
  anticipadas: { title: 'Elecciones anticipadas', text: 'Se vota ahora mismo un nuevo partido en el Ayuntamiento.', lasts: false, weight: 1 },
  loteria: { title: 'Lotería de Navidad', text: 'A un jugador al azar le toca 150.', lasts: false, weight: 1 },
};
export const NEWS_IDS = Object.keys(NEWS) as NewsId[];

// ───────────────────────── Buzón ─────────────────────────

export const CARDS: Record<CardId, { title: string; text: string }> = {
  salida: { title: 'Viaje en globo', text: 'Avanza hasta la Salida y cobra.' },
  comisaria: { title: 'Te pillan sin pagar el bus', text: 'Ve directamente a la comisaría.' },
  libre: { title: 'Amigo en comisaría', text: 'Guárdala: te saca gratis de la comisaría.' },
  atras: { title: 'Te dejas las llaves', text: 'Retrocede 3 casillas.' },
  transporte: { title: 'Prisa', text: 'Avanza hasta el transporte más cercano. Si tiene dueño, le pagas el doble.' },
  plaza: { title: 'Mercadillo en la Plaza', text: 'Avanza hasta la Plaza Mayor.' },
  metro: { title: 'Bonometro', text: 'Avanza hasta el metro más cercano: el viaje te sale gratis.' },
  herencia: { title: 'Herencia de la tía Remedios', text: 'Cobra 100.' },
  error: { title: 'Error del banco a tu favor', text: 'Cobra 75.' },
  tartas: { title: 'Ganas el concurso de tartas', text: 'Cobra 50.' },
  multa: { title: 'Multa de aparcamiento', text: 'Paga 40 al bote de la Plaza.' },
  reparaciones: { title: 'Goteras', text: 'Paga 25 por cada casa y 75 por cada edificio.' },
  cumple: { title: '¡Es tu cumpleaños!', text: 'Cada jugador te regala 20.' },
  ronda: { title: 'Invitas a merendar', text: 'Paga 15 a cada jugador.' },
  veterinario: { title: 'El gato se ha comido un calcetín', text: 'Paga 50 de veterinario al bote de la Plaza.' },
  devolucion: { title: 'Devolución de Hacienda', text: 'Cobra 60.' },
  luna: { title: 'Paseo romántico', text: 'Avanza hasta la Avenida de la Luna.' },
};
export const CARD_IDS = Object.keys(CARDS) as CardId[];

// ───────────────────────── cálculos ─────────────────────────

type Table<T> = Map<number, T> | Record<number, T>;

/** Lo que el motor necesita saber para calcular precios y alquileres. */
export interface Ctx {
  owned: Table<Owned>;
  news: NewsId | null;
  party: PartyId | null;
  charOf: (pid: string) => CharId | null;
  /** propiedades cortadas por una manifestación */
  closed?: Table<string>;
  /** inflación de los alquileres (modo «hasta el final») */
  boost?: number;
}

const at = <T>(t: Table<T> | undefined, id: number): T | undefined => (!t ? undefined : t instanceof Map ? t.get(id) : t[id]);
const ownedAt = (c: Ctx, id: number) => at(c.owned, id);
const ownedEntries = (c: Ctx): [number, Owned][] => (c.owned instanceof Map ? [...c.owned] : Object.entries(c.owned).map(([k, v]) => [Number(k), v]));

export const ownerOf = (c: Ctx, id: number) => ownedAt(c, id)?.owner ?? null;
export const isClosed = (c: Ctx, id: number) => at(c.closed, id) !== undefined;

export function ownsGroup(c: Ctx, pid: string, g: Group): boolean {
  return groupSpaces(g).every((s) => ownedAt(c, s)?.owner === pid);
}

export function countKind(c: Ctx, pid: string, kind: Space['kind']): number {
  return kindSpaces(kind).filter((s) => ownedAt(c, s)?.owner === pid).length;
}

/** Precio de compra al banco. */
export function buyPrice(space: Space, char: CharId | null): number {
  const p = space.price ?? 0;
  return char === 'nora' ? Math.round((p * 0.7) / 5) * 5 : p;
}

/** Coste de subir un nivel de construcción en una calle. */
export function buildCost(c: Ctx, space: Space, pid: string): number {
  let cost = GROUPS[space.group!].house;
  if (c.charOf(pid) === 'rita') cost *= 0.75;
  if (c.party === 'naranja') cost *= 0.7;
  if (c.news === 'inflacion') cost *= 1.5;
  if (c.news === 'rebajas') cost *= 0.5;
  return Math.round(cost / 5) * 5;
}

/** Lo que devuelve el banco por derribar un nivel (la mitad de lo que costó sin rebajas). */
export const sellBuildingValue = (space: Space) => GROUPS[space.group!].house / 2;
/** Lo que paga el banco por una propiedad (la mitad de su precio, más sus construcciones). */
export const sellPropValue = (space: Space, level: number) => (space.price ?? 0) / 2 + level * (space.group ? sellBuildingValue(space) : 0);

/** ¿Se puede construir (un nivel más) en esta calle? */
export function canBuild(c: Ctx, pid: string, id: number): boolean {
  const s = BOARD[id];
  const o = ownedAt(c, id);
  if (s.kind !== 'calle' || !o || o.owner !== pid || o.level >= 4) return false;
  return ownsGroup(c, pid, s.group!);
}

/** Alquiler que paga `payer` (con `payerCash` en mano) al caer en `id`. `dice` = suma de los dados. */
export function rentFor(c: Ctx, id: number, payer: string, payerCash: number, dice: number, double = false): number {
  const s = BOARD[id];
  const o = ownedAt(c, id);
  if (!o || o.owner === payer || isClosed(c, id)) return 0;
  const owner = o.owner;
  let rent = 0;
  switch (s.kind) {
    case 'calle': {
      rent = s.rent![o.level];
      if (o.level === 0 && ownsGroup(c, owner, s.group!)) rent *= 2;
      if (c.party === 'azul') rent *= 1.2;
      if (c.charOf(owner) === 'tomas') rent *= 1.4;
      if (c.news === 'boom') rent *= 1.5;
      if (c.news === 'crisis') rent *= 0.5;
      break;
    }
    case 'transporte': {
      if (c.charOf(payer) === 'mar' || c.news === 'huelga') return 0;
      rent = countKind(c, owner, 'transporte') >= 2 ? 125 : 50;
      if (c.party === 'verde') rent *= 2;
      if (c.news === 'turismo') rent *= 2;
      break;
    }
    case 'empresa': {
      rent = dice * (countKind(c, owner, 'empresa') >= 2 ? 12 : 5);
      if (c.party === 'verde') rent *= 0.5;
      if (c.news === 'frio') rent *= 2;
      break;
    }
    case 'banco': {
      if (c.news === 'panico') return 0;
      const n = countKind(c, owner, 'banco');
      rent = Math.max(25 * n, payerCash * 0.1 * n);
      break;
    }
    case 'atraccion': {
      rent = countKind(c, owner, 'atraccion') >= 2 ? 80 : 40;
      if (c.news === 'turismo') rent *= 2;
      break;
    }
    default:
      return 0;
  }
  if (double) rent *= 2;
  if (s.kind !== 'banco') rent *= c.boost ?? 1;
  return Math.max(0, Math.round(rent / 5) * 5);
}

/** Taquilla de las atracciones de un jugador al empezar la ronda. */
export function attractionIncome(c: Ctx, pid: string): number {
  const n = countKind(c, pid, 'atraccion');
  if (!n) return 0;
  return n * ATTRACTION_INCOME[n >= 2 ? 1 : 0] * (c.news === 'turismo' ? 2 : 1);
}

/** ¿Este jugador paga intereses por sus préstamos? */
export function paysInterest(c: Ctx, pid: string): boolean {
  if (c.charOf(pid) === 'ernesto') return false;
  return countKind(c, pid, 'banco') === 0;
}

export const maxLoans = (char: CharId | null) => (char === 'ernesto' ? 4 : MAX_LOANS);

/** Sueldo al pasar por la Salida. */
export function salary(c: Ctx, pid: string): number {
  let s = c.party === 'rojo' ? 250 : SALARY;
  const ch = c.charOf(pid);
  if (ch === 'mar') s += 60;
  if (ch === 'ernesto') s += 40;
  return s;
}

/** Precio de un viaje en metro. */
export const metroFare = (char: CharId | null) => (char === 'mar' ? 0 : METRO_FARE);

/** Valor de lo construido y de las propiedades (a precio de compra). */
export function assets(c: Ctx, pid: string): number {
  let v = 0;
  for (const [id, o] of ownedEntries(c)) {
    if (o.owner !== pid) continue;
    const s = BOARD[id];
    v += s.price ?? 0;
    if (s.group) v += o.level * GROUPS[s.group].house;
  }
  return v;
}

/** Patrimonio: dinero + propiedades y construcciones − préstamos. */
export function worth(c: Ctx, p: Pick<PlayerState, 'id' | 'cash' | 'loans' | 'bankrupt'>): number {
  if (p.bankrupt) return 0;
  return p.cash + assets(c, p.id) - p.loans * LOAN;
}

/** Lo máximo que podría reunir vendiéndolo todo al banco y pidiendo los préstamos que le quedan. */
export function liquidity(c: Ctx, p: PlayerState): number {
  let v = p.cash + (maxLoans(p.char) - p.loans) * LOAN;
  for (const [id, o] of ownedEntries(c)) if (o.owner === p.id) v += sellPropValue(BOARD[id], o.level);
  return v;
}

/** Distancia hacia delante entre dos casillas. */
export const ahead = (from: number, to: number) => (to - from + BOARD_SIZE) % BOARD_SIZE;

export const money = (n: number) => `${Math.round(n)} monedas`;
