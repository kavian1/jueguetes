// Arte de Villa Moneda: vecinos chibi, iconos de las casillas y la calle de la villa.
// Mismo estilo que el resto del Rincón: rampas de 5 tonos, luz arriba a la izquierda y contorno de color.
import { registerLooks, ramp5, type Look } from '../pixel/chibi';
import { C, INK, custom, ell, minus, or, poly, rect, registerIcons, ring, rrect, seg, star, type Ico, type Ramp } from '../pixel/icons';
import { Px, cloud, hash, hex, mix, shape, type Mask, type RGB } from '../pixel/world';
import { GROUPS } from './rules';
import type { CharId, Group } from './types';

// ───────────────────────── vecinos ─────────────────────────

const LOOKS: Record<CharId, Look> = {
  rita: {
    skin: '#f1bd94',
    hair: '#6b3a2a',
    hairStyle: 'braids',
    eyes: '#4a2c1c',
    lashes: true,
    mouth: 'grin',
    hat: { kind: 'cap', color: '#ffcf3d', band: '#f5922a' },
    shirt: '#f5922a',
    outer: { kind: 'vest', color: '#ffcf3d', trim: '#f6eedf' },
    extras: ['freckles'],
  },
  nora: {
    skin: '#fbd6b4',
    hair: '#ffd257',
    hairStyle: 'long',
    eyes: '#3fae9a',
    lashes: true,
    mouth: 'smile',
    lips: '#e8505b',
    shirt: '#f6eedf',
    outer: { kind: 'coat', color: '#3fbf9a' },
    neck: { kind: 'necklace', color: '#ffcf3d' },
    extras: ['earrings', 'blush'],
  },
  tomas: {
    skin: '#f3c4a0',
    hair: '#d8d0c8',
    hairStyle: 'short',
    eyes: '#5a4a3a',
    eyeStyle: 'happy',
    brows: 'thick',
    mouth: 'smile',
    hat: { kind: 'bowler', color: '#8a5634', band: '#3e2620' },
    beard: 'full',
    beardColor: '#e8e0d8',
    shirt: '#f4e8cc',
    outer: { kind: 'vest', color: '#b0503e', trim: '#ffcf3d' },
    neck: { kind: 'collar', color: '#fff6ea' },
  },
  ernesto: {
    skin: '#efd2b8',
    hair: '#4a3e60',
    hairStyle: 'slick',
    eyes: '#3a4a7a',
    eyeStyle: 'sly',
    mouth: 'smirk',
    hat: { kind: 'top', color: '#2e3a6a', band: '#ffcf3d' },
    beard: 'mustache',
    beardColor: '#4a3e60',
    shirt: '#f6eedf',
    outer: { kind: 'coat', color: '#3a4a8a' },
    neck: { kind: 'tie', color: '#e0453f' },
  },
  lola: {
    skin: '#dc9a6c',
    hair: '#2e2230',
    hairStyle: 'bun',
    eyes: '#5a3420',
    lashes: true,
    mouth: 'grin',
    hat: { kind: 'cap', color: '#2e2a38', band: '#ffcf3d' },
    shirt: '#ffcf3d',
    neck: { kind: 'bandana', color: '#2e2a38' },
    extras: ['earrings'],
  },
  abel: {
    skin: '#c88a5e',
    hair: '#2e2228',
    hairStyle: 'slick',
    eyes: '#3a2218',
    eyeStyle: 'glasses',
    brows: 'raised',
    mouth: 'neutral',
    shirt: '#f6eedf',
    outer: { kind: 'coat', color: '#6a7488' },
    neck: { kind: 'tie', color: '#3a86ec' },
  },
  clara: {
    skin: '#f8d2b0',
    hair: '#b0403a',
    hairStyle: 'bun',
    eyes: '#4a6aa0',
    lashes: true,
    mouth: 'smile',
    lips: '#d0484e',
    shirt: '#f6eedf',
    outer: { kind: 'coat', color: '#e8484d' },
    neck: { kind: 'necklace', color: '#ffcf3d' },
    extras: ['rose', 'blush'],
  },
  pepe: {
    skin: '#f7cba4',
    hair: '#8a5634',
    hairStyle: 'short',
    eyes: '#3f6a8a',
    mouth: 'teeth',
    hat: { kind: 'flat', color: '#9a6a44', band: '#5a3a24' },
    beard: 'stubble',
    beardColor: '#8a5634',
    shirt: '#cfe4f4',
    outer: { kind: 'vest', color: '#6a5a4a', trim: '#cfe4f4' },
    neck: { kind: 'tie', color: '#3e3858' },
    extras: ['bigEars'],
  },
  fortu: {
    skin: '#f9d2ae',
    hair: '#4fae5a',
    hairStyle: 'long',
    eyes: '#3fae5a',
    eyeStyle: 'happy',
    lashes: true,
    mouth: 'smile',
    shirt: '#a45ee0',
    outer: { kind: 'shawl', color: '#ffcf3d', trim: '#4fb85c' },
    extras: ['clover', 'earrings'],
  },
  mar: {
    skin: '#d6966a',
    hair: '#2e2232',
    hairStyle: 'long',
    eyes: '#3a6aa0',
    lashes: true,
    mouth: 'smile',
    lips: '#b8405e',
    hat: { kind: 'scarf', color: '#3fb8d0', band: '#ffcf3d' },
    shirt: '#ff8a6a',
    neck: { kind: 'bandana', color: '#3fb8d0' },
    extras: ['freckles'],
  },
};

/** Nombre del sprite del vecino (retrato 26×26; `fig_` + nombre para la figura). */
export const charSprite = (c: CharId) => 'vm' + c;
registerLooks(Object.fromEntries(Object.entries(LOOKS).map(([k, v]) => ['vm' + k, v])));

// ───────────────────────── iconos ─────────────────────────

const coral = custom('#8a2e3e', '#c8485a', '#f06a6a', '#ff9c8a', '#ffd8c4');
const navy = custom('#1e2448', '#2e3a6a', '#3e56a0', '#6a86d0', '#a8c0f0');
const DARK = custom('#241226', '#3a2438', '#4e3450', '#6a4a6a', '#8a6a88');

function house(i: Ico, roof: Ramp, wall: Ramp = C.cream) {
  i.add(rect(3, 8, 13, 14.6), wall, { spot: [4.5, 9.5] });
  i.add(rect(7, 10.6, 9, 14.6), C.woodD, { inner: false });
  i.add(rect(4.4, 9.6, 6, 11.2), C.sky, { inner: false, light: false });
  i.add(rect(10, 9.6, 11.6, 11.2), C.sky, { inner: false, light: false });
  i.add(poly([[1.4, 8.6], [8, 2], [14.6, 8.6]]), roof, { spot: [6, 5] });
  i.add(rect(11, 3, 12.6, 6), C.brown);
}

function die(i: Ico, n: number) {
  i.add(rrect(1.4, 1.4, 14.6, 14.6, 2.6), custom('#c8b898', '#e8dcc0', '#fffaf0', '#ffffff', '#ffffff'), { spot: [4, 3.6] });
  const P: Record<number, [number, number][]> = {
    1: [[8, 8]],
    2: [[5, 5], [11, 11]],
    3: [[4.6, 4.6], [8, 8], [11.4, 11.4]],
    4: [[5, 5], [11, 5], [5, 11], [11, 11]],
    5: [[4.6, 4.6], [11.4, 4.6], [8, 8], [4.6, 11.4], [11.4, 11.4]],
    6: [[5, 4.4], [11, 4.4], [5, 8], [11, 8], [5, 11.6], [11, 11.6]],
  };
  for (const [x, y] of P[n]) i.add(ell(x, y, 1.3, 1.3), n === 1 ? C.red : DARK, { inner: false, light: false });
}

const groupHouses: Record<string, (i: Ico) => void> = {};
for (const [g, info] of Object.entries(GROUPS)) groupHouses['vm_casa_' + g] = (i) => house(i, ramp5(info.color));

registerIcons({
  ...groupHouses,
  vm_salida: (i) => {
    i.add(poly([[1.4, 8], [7.4, 2], [7.4, 5.4], [14.6, 5.4], [14.6, 10.6], [7.4, 10.6], [7.4, 14]]), C.green, { spot: [5, 6] });
  },
  vm_buzon: (i) => {
    i.add(rect(7, 10.4, 9, 15), C.woodD);
    i.add(rrect(2.4, 2.6, 13.6, 10.6, 3.4), C.gold, { spot: [5, 4.6] });
    i.add(rect(5, 5.6, 11, 6.6), DARK, { inner: false, light: false });
    i.add(ell(8, 8.6, 1.4, 1), coral, { inner: false });
  },
  vm_tren: (i) => {
    i.add(rect(2, 13.6, 14, 14.6), C.steel, { inner: false });
    i.add(rrect(3, 1.6, 13, 12.6, 2.4), C.red, { spot: [5, 3.4] });
    i.add(rrect(4.6, 3.4, 11.4, 7.2, 1), C.sky, { inner: false, spot: [6, 4.4] });
    i.add(ell(5.6, 10, 1.2, 1.1), C.gold, { inner: false, base: 3 });
    i.add(ell(10.4, 10, 1.2, 1.1), C.gold, { inner: false, base: 3 });
  },
  vm_barco: (i) => {
    i.add(rect(9, 2.4, 11, 5.6), coral);
    i.add(rect(4.4, 5.4, 11.6, 9), C.cream, { spot: [5.4, 6.4] });
    i.add(poly([[1.2, 9], [14.8, 9], [12.6, 13], [3.4, 13]]), C.blue, { spot: [3.4, 10] });
    i.add((x, y) => y >= 13.6 && y <= 14.6 && Math.floor(x) % 4 !== 0, C.sky, { inner: false, light: false });
  },
  vm_rejas: (i) => {
    i.add(minus(rrect(1.6, 1.6, 14.4, 14.4, 1.6), rect(4, 4, 12, 12)), C.steel, { spot: [3, 3] });
    i.add(rect(4, 4, 12, 12), navy, { inner: false, base: 1, light: false, shade: false });
    i.add(or(rect(5.6, 4, 6.6, 12), rect(9.4, 4, 10.4, 12)), C.steel, { inner: false, base: 3 });
  },
  vm_rayo: (i) => {
    i.add(rect(6.2, 10.6, 9.8, 13.6), C.steel, { tone: (_x, y, t) => (t === 2 && Math.floor(y) === 12 ? 1 : t) });
    i.add(ell(8, 6.4, 4.4, 4.6), C.gold, { spot: [6.4, 4.4] });
    i.add(poly([[8.6, 3.6], [6.4, 7], [8.2, 7], [7.4, 9.6], [9.8, 6], [8, 6]]), C.flame, { inner: false, base: 3 });
  },
  vm_banco: (i) => {
    i.add(rect(1.6, 12.6, 14.4, 14.6), C.tan);
    for (const x of [2.6, 5.8, 9.2, 12.4]) i.add(rect(x, 7, x + 1.2, 12.6), C.paper);
    i.add(rect(1.6, 5.8, 14.4, 7), C.tan);
    i.add(poly([[1, 6], [8, 1.2], [15, 6]]), C.paper, { spot: [5, 4] });
    i.add(ell(8, 4.2, 1.3, 1.1), C.gold, { inner: false, base: 3 });
  },
  vm_hacienda: (i) => {
    i.add(rrect(2.6, 1.4, 12.4, 14.6, 1), C.paper, { spot: [4, 2.6] });
    i.add((x, y) => x > 4 && x < 11 && [4, 6, 8].includes(Math.floor(y)), C.tan, { inner: false, light: false, shade: false, base: 1 });
    i.add(ell(10.4, 11.4, 3, 2.8), coral, { spot: [9.4, 10.4] });
  },
  vm_bolsa: (i) => {
    i.add(rect(1.6, 9, 4.4, 14.6), coral, { spot: [2.4, 9.6] });
    i.add(rect(6.6, 6, 9.4, 14.6), C.gold, { spot: [7.4, 6.6] });
    i.add(rect(11.6, 2.6, 14.4, 14.6), C.green, { spot: [12.4, 3.2] });
    i.add(seg(2, 7, 12.6, 0.8, 0.6), C.flame, { inner: false, base: 3 });
  },
  vm_fuente: (i) => {
    i.add(ell(8, 12.4, 6.8, 2.6), C.steel, { spot: [3.6, 11.4] });
    i.add(ell(8, 11.8, 5.2, 1.4), C.sky, { inner: false, base: 3 });
    i.add(rect(7, 6.4, 9, 11), C.steel);
    i.add(ell(8, 6.4, 3.4, 1.3), C.steel, { spot: [6, 5.8] });
    i.add(or(ell(8, 3, 1.1, 1.8), ell(4.6, 8.4, 0.8, 0.8), ell(11.4, 8.4, 0.8, 0.8)), C.sky, { inner: false, base: 3 });
  },
  vm_silbato: (i) => {
    i.add(seg(2.4, 2.4, 5, 7, 0.6), coral, { inner: false });
    i.add(rect(8.6, 6.6, 14.6, 9.4), C.steel, { spot: [10, 7.2] });
    i.add(ell(7, 10, 4.6, 3.8), C.steel, { spot: [4.6, 8.2] });
    i.add(ell(6.2, 9.4, 1.3, 1.1), DARK, { inner: false, light: false });
  },
  vm_fabrica: (i) => {
    i.add(ell(12.2, 1.8, 2, 1.4), C.cream, { inner: false });
    i.add(rect(10.6, 2.6, 12.6, 7.4), coral);
    i.add(or(rect(1.6, 8.6, 14.4, 14.6), poly([[1.6, 9], [1.6, 5.6], [5.4, 8.6]]), poly([[5.4, 9], [5.4, 5.6], [9.2, 8.6]])), C.brown, { spot: [2.6, 9.6] });
    i.add(ell(8, 11.6, 2.6, 2.4), C.tan, { spot: [7, 10.6] });
    i.px(7, 11, INK);
    i.px(9, 12, INK);
    i.px(8, 13, INK);
  },
  vm_joya: (i) => {
    i.add(poly([[4, 4.4], [12, 4.4], [14.6, 7.6], [8, 14.4], [1.4, 7.6]]), C.sky, { spot: [5, 6], tone: (x, y, t) => (t === 2 && y > 7.6 && Math.abs(x - 8) < 1 ? 3 : t) });
    i.add(star(12.6, 2.6, 2, 0.8, 4), C.gold, { inner: false, base: 3 });
  },
  vm_moneda: (i) => {
    i.add(ell(8, 8, 6.4, 6.4), C.gold, { spot: [5.4, 5] });
    i.add(ring(8, 8, 3.6, 4.6), C.amber, { inner: false, light: false, base: 2 });
    i.add(rect(7.4, 5.6, 8.6, 10.4), C.amber, { inner: false, base: 1, light: false, shade: false });
  },
  vm_billete: (i) => {
    i.add(rect(1.4, 4, 14.6, 12), C.green, { spot: [2.6, 5] });
    i.add(ell(8, 8, 2.4, 2.4), custom('#2f6e42', '#4f9445', '#9fd46a', '#c8f0a0', '#ffffff'), { inner: false });
  },
  vm_urna: (i) => {
    i.add(rect(5.6, 1.6, 10.4, 8), C.paper, { spot: [6.4, 2.4] });
    i.add(rect(2, 7, 14, 14.6), C.sky, { spot: [3, 8] });
    i.add(rect(5, 7, 11, 8), navy, { inner: false, light: false, shade: false, base: 1 });
  },
  vm_periodico: (i) => {
    i.add(rect(1.6, 2.6, 14.4, 13.6), C.paper, { spot: [2.6, 3.4] });
    i.add(rect(3.4, 4.4, 12.6, 6.4), DARK, { inner: false, light: false, shade: false, base: 2 });
    i.add((x, y) => x > 3 && x < 13 && [8, 10, 12].includes(Math.floor(y)) && Math.floor(x) !== 8, C.tan, { inner: false, light: false, shade: false, base: 1 });
  },
  vm_carta: (i) => {
    i.add(rect(1.4, 3.6, 14.6, 12.6), C.paper, { spot: [2.4, 4.4] });
    i.add(or(seg(1.6, 3.8, 8, 8.6, 0.5), seg(14.4, 3.8, 8, 8.6, 0.5)), C.tan, { inner: false, light: false });
    i.add(ell(8, 8.6, 1.4, 1.3), coral, { inner: false });
  },
  vm_llave: (i) => {
    i.add(minus(ell(4.6, 8, 3.4, 3.4), ell(4.6, 8, 1.4, 1.4)), C.gold, { spot: [3, 6] });
    i.add(or(rect(7.6, 7.2, 14.6, 8.8), rect(11, 8.8, 12.2, 11), rect(13.4, 8.8, 14.6, 10.4)), C.gold);
  },
  vm_medalla: (i) => {
    i.add(or(poly([[4, 1.4], [7.4, 1.4], [8.6, 7], [6.4, 7]]), poly([[12, 1.4], [8.6, 1.4], [7.4, 7], [9.6, 7]])), coral);
    i.add(ell(8, 10.4, 4.2, 4.2), C.gold, { spot: [6.4, 8.6] });
    i.add(star(8, 10.4, 2.4, 1, 5), C.amber, { inner: false, base: 3 });
  },
  vm_martillo: (i) => {
    i.add(rrect(1.2, 12, 8.8, 14.8, 0.8), C.woodD, { spot: [2.2, 12.6] });
    i.add(seg(7.4, 7.4, 14.2, 14.2, 0.9), C.wood);
    i.add(poly([[1.6, 5.8], [5.8, 1.6], [10, 5.8], [5.8, 10]]), C.brown, { spot: [4.6, 3.6], tone: (x, y, t) => (t === 2 && Math.abs(x - y) < 0.8 ? 3 : t) });
    i.add(or(seg(2.6, 6.8, 6.8, 2.6, 0.45), seg(4.8, 9, 9, 4.8, 0.45)), C.gold, { inner: false, light: false, shade: false, base: 3 });
  },
  vm_metro: (i) => {
    i.add(rrect(1.2, 1.2, 14.8, 14.8, 2.4), C.blue, { spot: [3, 3] });
    i.add(or(rect(3.2, 3.8, 5.4, 12.4), rect(10.6, 3.8, 12.8, 12.4), seg(4.8, 4.6, 8, 9, 1), seg(11.2, 4.6, 8, 9, 1)), C.cream, { inner: false, light: false, base: 4 });
  },
  vm_pancarta: (i) => {
    i.add(rect(7.4, 8, 8.6, 15), C.wood);
    i.add(rrect(1.4, 1.4, 14.6, 8.8, 1), C.paper, { spot: [2.4, 2.4] });
    i.add(or(rect(3.4, 3.6, 10, 4.6), rect(3.4, 5.8, 12.6, 6.8)), coral, { inner: false, light: false, shade: false, base: 2 });
    i.add(rect(11.6, 3.4, 12.6, 4.6), coral, { inner: false, light: false, shade: false, base: 3 });
  },
  vm_ayto: (i) => {
    i.add(rect(2, 8.4, 14, 14.6), C.cream, { spot: [3, 9.2] });
    i.add(poly([[1, 8.8], [8, 5.6], [15, 8.8]]), coral, { spot: [5, 7.4] });
    i.add(rect(6, 1.6, 10, 7.6), C.cream, { spot: [6.8, 2.4] });
    i.add(poly([[5.4, 2], [8, 0.4], [10.6, 2]]), coral);
    i.add(ell(8, 4.6, 1.5, 1.5), C.sky, { inner: false, base: 3 });
    i.add(rect(7, 11, 9, 14.6), C.woodD, { inner: false, light: false });
    i.add(or(rect(3.4, 10, 5, 11.6), rect(11, 10, 12.6, 11.6)), C.sky, { inner: false, light: false });
  },
  vm_noria: (i) => {
    i.add(or(seg(8, 7, 4, 14.4, 0.6), seg(8, 7, 12, 14.4, 0.6)), C.steel, { inner: false });
    i.add(rect(2.4, 14, 13.6, 15), C.woodD, { inner: false });
    i.add(ring(8, 7, 4.7, 5.7), C.sky, { inner: false, spot: [4.4, 3.2] });
    i.add(or(seg(8, 7, 8, 1.6, 0.4), seg(8, 7, 3, 7, 0.4), seg(8, 7, 13, 7, 0.4), seg(8, 7, 4.4, 3.4, 0.4), seg(8, 7, 11.6, 3.4, 0.4)), C.steel, { inner: false, light: false, shade: false, base: 3 });
    i.add(ell(8, 7, 1.2, 1.2), C.gold, { inner: false });
    const cabins: [number, number, Ramp][] = [
      [8, 1.4, C.red],
      [2.4, 7, C.gold],
      [13.6, 7, C.green],
      [4, 3, C.violet],
      [12, 3, coral],
    ];
    for (const [x, y, col] of cabins) i.add(ell(x, y, 1.3, 1.1), col, { inner: false });
  },
  vm_museo: (i) => {
    i.add(minus(rrect(1.2, 2, 14.8, 14, 1), rect(3.4, 4.2, 12.6, 11.8)), C.gold, { spot: [2.2, 3] });
    i.add(rect(3.4, 4.2, 12.6, 11.8), C.sky, { inner: false, light: false, shade: false, base: 3 });
    i.add((x, y) => x > 3.4 && x < 12.6 && y < 11.8 && y > 9.4 - Math.sin((x - 3) * 0.7) * 1.4, C.green, { inner: false, light: false, shade: false });
    i.add(ell(10.4, 6.2, 1.2, 1.2), C.flame, { inner: false, light: false, shade: false, base: 2 });
  },
  vm_mini_casa: { w: 10, h: 10, draw: (i) => {
    i.add(rect(1.6, 4.6, 8.4, 9.4), C.green, { spot: [2.4, 5.4] });
    i.add(poly([[0.6, 5.2], [5, 0.8], [9.4, 5.2]]), C.green, { spot: [4, 2.8] });
    i.add(rect(4.2, 6.6, 5.8, 9.4), custom('#1e4d3a', '#2f6e42', '#2f6e42', '#4f9445', '#74b64e'), { inner: false, light: false });
  } },
  vm_mini_edif: { w: 10, h: 12, draw: (i) => {
    i.add(rect(1.4, 1.4, 8.6, 11.4), C.red, { spot: [2.4, 2.4] });
    i.add((x, y) => [3, 6].includes(Math.floor(x)) && [3, 5, 7].includes(Math.floor(y)), C.gold, { inner: false, light: false, shade: false, base: 3 });
    i.add(rect(4.2, 9, 5.8, 11.4), C.woodD, { inner: false, light: false });
  } },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => ['vm_dado_' + n, (i: Ico) => die(i, n)])),
});

// ───────────────────────── la calle de la villa ─────────────────────────

const rectM =
  (x0: number, y0: number, x1: number, y1: number): Mask =>
  (x, y) =>
    x >= x0 && x < x1 && y >= y0 && y < y1;

const HOUSE_COLORS = (Object.keys(GROUPS) as Group[]).map((g) => GROUPS[g].color);

/** Una casita de fachada: tejado de tejas, ventanas con contraventanas y jardinera, puerta y, a veces, toldo de tienda. */
function facade(P: Px, x: number, base: number, w: number, h: number, wall: string, roof: string, accent: string, seed: number) {
  const W = ramp5(wall);
  const R = ramp5(roof);
  const A = ramp5(accent);
  const TRIM = ramp5('#fff6e6');
  const top = base - h;
  // pared con esquinas de piedra
  shape(P, rectM(x, top, x + w, base), W, [x, top, x + w, base], {
    spot: [x + 2, top + 2],
    tone: (px, py, t) => (t === 2 && (Math.floor(px) === x + 1 || Math.floor(px) === x + w - 2) && Math.floor(py) % 3 === 0 ? 3 : t),
  });
  // tejado de tejas (a dos aguas o de buhardilla)
  const rh = Math.max(4, Math.round(w * 0.36));
  const gable = hash(seed, 3) > 0.4;
  const roofMask: Mask = gable
    ? (px, py) => py >= top - rh && py < top + 1 && Math.abs(px - (x + w / 2)) <= ((py - (top - rh)) / rh) * (w / 2 + 2)
    : (px, py) => py >= top - rh * 0.6 && py < top + 1 && px >= x - 2 + (top + 1 - py) * 0.7 && px < x + w + 2 - (top + 1 - py) * 0.7;
  shape(P, roofMask, R, [x - 3, top - rh, x + w + 3, top + 1], {
    spot: [x + w / 2 - 2, top - rh + 2],
    tone: (px, py, t) => (t === 2 && Math.floor(py - top) % 2 === 0 && (Math.floor(px) + Math.floor(py)) % 3 === 0 ? 1 : t),
  });
  // chimenea
  if (hash(seed, 8) > 0.5) shape(P, rectM(x + w * 0.7, top - rh * 0.8, x + w * 0.7 + 3, top - rh * 0.35), ramp5('#c86a4a'), [x + w * 0.7 - 1, top - rh, x + w * 0.7 + 4, top]);
  // ventanas con contraventanas y jardinera
  const glass = ramp5('#8fd4f4');
  const ww = Math.max(3, Math.round(w * 0.18));
  const wh = Math.max(4, Math.round(ww * 1.25));
  const shop = hash(seed, 5) > 0.55 && h > 22;
  const rows = shop ? 1 : h > 30 ? 2 : 1;
  for (let rI = 0; rI < rows; rI++) {
    const wy = top + 3 + rI * (wh + 4);
    for (const fx of w > 22 ? [0.27, 0.73] : [0.5]) {
      const wx = Math.round(x + w * fx - ww / 2);
      shape(P, rectM(wx, wy, wx + ww, wy + wh), glass, [wx, wy, wx + ww, wy + wh], {
        light: false,
        tone: (px, py, t) => (Math.floor(px) === wx && py < wy + wh - 1 ? 4 : Math.floor(py) === wy + Math.floor(wh / 2) || Math.floor(px) === wx + Math.floor(ww / 2) ? 1 : t),
      });
      for (let y = wy; y < wy + wh; y++) {
        P.put(wx - 1, y, A[y === wy ? 3 : 2]);
        P.put(wx + ww, y, A[1]);
      }
      const fl = ramp5(HOUSE_COLORS[Math.floor(hash(seed + rI, wx) * HOUSE_COLORS.length)]);
      for (let k = -1; k <= ww; k++) {
        P.put(wx + k, wy + wh, TRIM[1]);
        P.put(wx + k, wy + wh - 1, k % 2 ? fl[3] : ramp5('#4fae5a')[2]);
      }
    }
  }
  // toldo de tienda o portal
  const dw = Math.max(3, Math.round(w * 0.22));
  const dh = Math.max(6, Math.round(h * 0.3));
  const dx = Math.round(x + w / 2 - dw / 2);
  if (shop) {
    const ay = base - dh - 4;
    for (let y = ay; y < ay + 3; y++)
      for (let xx = x - 1; xx < x + w + 1; xx++) {
        const stripe = Math.floor((xx - x) / 2) % 2 === 0;
        P.put(xx, y, (stripe ? A : TRIM)[y === ay ? 3 : y === ay + 2 ? 1 : 2]);
      }
    for (let xx = x - 1; xx < x + w + 1; xx += 2) P.put(xx, ay + 3, A[1]);
    // escaparates
    const sw = Math.max(3, Math.round(w * 0.22));
    for (const sx of [x + 2, x + w - 2 - sw]) shape(P, rectM(sx, base - dh + 1, sx + sw, base - 2), glass, [sx, base - dh, sx + sw, base - 1], { light: false });
  }
  shape(P, rectM(dx, base - dh, dx + dw, base), ramp5('#9a5a36'), [dx, base - dh, dx + dw, base], {
    spot: [dx + 0.5, base - dh + 0.5],
    tone: (px, _py, t) => (t === 2 && Math.floor(px) === dx + Math.floor(dw / 2) ? 1 : t),
  });
  P.put(dx + dw - 2, base - Math.floor(dh / 2), hex('#ffd84a'));
  for (let k = -1; k <= dw; k++) P.put(dx + k, base - dh - 1, TRIM[3]);
}

function tree(P: Px, x: number, base: number, s: number, seed: number) {
  const trunk = ramp5('#8a5634');
  shape(P, rectM(x - 1, base - s * 0.9, x + 1, base), trunk, [x - 1, base - s, x + 1, base]);
  const leaf = ramp5(hash(seed, 9) > 0.5 ? '#4fae5a' : '#6ac04e');
  const cy = base - s * 1.25;
  shape(P, or(ell(x, cy, s * 0.75, s * 0.62), ell(x - s * 0.45, cy + s * 0.25, s * 0.45, s * 0.4), ell(x + s * 0.45, cy + s * 0.22, s * 0.45, s * 0.4)), leaf, [x - s, cy - s, x + s, cy + s], {
    spot: [x - s * 0.35, cy - s * 0.3],
    tone: (px, py, t) => (t === 2 && hash(Math.floor(px), Math.floor(py)) > 0.86 ? 3 : t),
  });
  // frutitas o flores en la copa
  const fr = ramp5(hash(seed, 2) > 0.5 ? '#ff7a8a' : '#ffcf3d');
  for (let k = 0; k < 4; k++) P.put(x - s * 0.5 + hash(seed, k) * s, cy - s * 0.3 + hash(k, seed) * s * 0.6, fr[3]);
}

function lamp(P: Px, x: number, base: number, h: number) {
  const iron = ramp5('#3e3858');
  shape(P, rectM(x, base - h, x + 1, base), iron, [x, base - h, x + 1, base], { light: false });
  shape(P, rectM(x - 1, base - h - 3, x + 2, base - h), ramp5('#ffd84a'), [x - 2, base - h - 4, x + 3, base - h + 1], { base: 3 });
  P.rect(x - 1, base - h - 4, 3, 1, iron[2]);
}

function bench(P: Px, x: number, base: number, s: number) {
  const wood = ramp5('#c27a46');
  shape(P, rectM(x, base - s * 0.5, x + s * 2, base - s * 0.3), wood, [x - 1, base - s, x + s * 2 + 1, base]);
  shape(P, rectM(x, base - s, x + s * 2, base - s * 0.8), wood, [x - 1, base - s - 1, x + s * 2 + 1, base]);
  P.rect(x + 1, base - s * 0.3, 1, s * 0.3, ramp5('#3e3858')[2]);
  P.rect(x + s * 2 - 2, base - s * 0.3, 1, s * 0.3, ramp5('#3e3858')[2]);
}

function flowerBed(P: Px, x: number, base: number, w: number, seed: number) {
  const soil = ramp5('#9a5a36');
  const leaf = ramp5('#4fae5a');
  shape(P, rectM(x, base - 3, x + w, base), soil, [x, base - 3, x + w, base]);
  for (let k = 1; k < w - 1; k++) {
    P.put(x + k, base - 4, leaf[k % 2 ? 2 : 3]);
    if (k % 2 === 1) P.put(x + k, base - 5, ramp5(HOUSE_COLORS[Math.floor(hash(seed, k) * HOUSE_COLORS.length)])[3]);
  }
}

function fountain(P: Px, cx: number, base: number, s: number) {
  const stone = ramp5('#b8b0c8');
  const water = ramp5('#5cc0e4');
  shape(P, ell(cx, base - s * 0.25, s * 1.6, s * 0.45), stone, [cx - s * 2, base - s, cx + s * 2, base], { spot: [cx - s, base - s * 0.5] });
  shape(P, ell(cx, base - s * 0.35, s * 1.25, s * 0.25), water, [cx - s * 2, base - s, cx + s * 2, base], { light: false, base: 3, outline: false });
  shape(P, rectM(cx - s * 0.18, base - s * 1.2, cx + s * 0.18, base - s * 0.4), stone, [cx - s, base - s * 2, cx + s, base]);
  shape(P, ell(cx, base - s * 1.2, s * 0.7, s * 0.2), stone, [cx - s, base - s * 2, cx + s, base]);
  shape(P, or(ell(cx, base - s * 1.65, s * 0.15, s * 0.4), ell(cx - s * 0.5, base - s * 1.05, s * 0.12, s * 0.12), ell(cx + s * 0.5, base - s * 1.05, s * 0.12, s * 0.12)), water, [cx - s, base - s * 2.4, cx + s, base], { base: 3, outline: false });
}

/** Banderines de fiesta entre dos puntos. */
function bunting(P: Px, x0: number, x1: number, y: number, sag: number) {
  const cols = HOUSE_COLORS.map(hex);
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const yy = Math.round(y + sag * 4 * t * (1 - t));
    P.put(x, yy, hex('#6a4a3a'));
    const k = x - x0;
    if (k % 5 === 1) for (let d = 1; d <= 3; d++) for (let e = 0; e <= 3 - d; e++) P.put(x + e, yy + d, mix(cols[Math.floor(k / 5) % cols.length], [255, 255, 255], d === 1 ? 0.15 : 0));
  }
}

/** La calle de Villa Moneda: cielo, casitas de colores, árboles, farolas y una plaza adoquinada con fuente. */
export function paintVillaScene(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = new Px(W, H, ctx);
  const u = Math.max(0.55, Math.min(1.6, H / 190));
  const r = (v: number) => Math.max(1, Math.round(v * u));
  const ground = Math.round(H * 0.6);

  // cielo con bandas y tramado en las uniones
  const sky = ['#6cc4f0', '#86d0f2', '#a6ddf4', '#c6eaf6', '#e6f6f2'].map(hex);
  for (let y = 0; y < ground; y++) {
    const v = (y / ground) * (sky.length - 1);
    const i = Math.floor(v);
    for (let x = 0; x < W; x++) P.put(x, y, v - i > 0.8 && (x + y) % 2 === 0 ? sky[Math.min(sky.length - 1, i + 1)] : sky[i]);
  }
  // sol
  const sunX = Math.round(W * 0.84);
  const sunY = Math.round(ground * 0.2);
  for (let y = sunY - r(12); y < sunY + r(12); y++)
    for (let x = sunX - r(12); x < sunX + r(12); x++) {
      const d = Math.hypot(x - sunX, y - sunY);
      if (d < r(4.5)) P.put(x, y, hex(d < r(3) ? '#fffbe6' : '#fff0b0'));
      else if (d < r(7.5) && (x + y) % 2 === 0) P.tint(x, y, hex('#fff6d0'), 0.55);
    }
  const nClouds = Math.max(2, Math.round(W / 90));
  for (let k = 0; k < nClouds; k++) cloud(P, Math.round(((k + 0.3 + hash(k, 4) * 0.4) / nClouds) * W), r(8 + hash(k, 7) * 22), u * (0.45 + hash(k, 2) * 0.3));
  // colinas lejanas con arbolitos
  const hill = ramp5('#9ad672');
  const hillY = (x: number) => ground - r(16) + Math.sin(x / r(26)) * r(4) + Math.sin(x / r(11) + 1) * r(2);
  for (let x = 0; x < W; x++) for (let y = Math.round(hillY(x)); y < ground; y++) P.put(x, y, y === Math.round(hillY(x)) ? hill[3] : (x * 7 + y * 3) % 13 === 0 ? hill[1] : hill[2]);
  for (let k = 0; k * r(17) < W; k++) {
    const tx = k * r(17) + Math.round(hash(k, 11) * r(8));
    const ty = Math.round(hillY(tx));
    shape(P, ell(tx, ty - r(2), r(3), r(3.2)), ramp5('#5cb85a'), [tx - r(4), ty - r(6), tx + r(4), ty + 1], { outline: false });
  }

  // casitas en fila
  let x = -r(3);
  let seed = 1;
  while (x < W) {
    const w = r(22 + hash(seed, 1) * 12);
    const h = r(24 + hash(seed, 2) * 12);
    const c = HOUSE_COLORS[seed % HOUSE_COLORS.length];
    const wall = mix(hex(c), [255, 246, 232], 0.6);
    const wallHex = '#' + wall.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    facade(P, x, ground, w, h, wallHex, HOUSE_COLORS[(seed + 3) % HOUSE_COLORS.length], c, seed);
    x += w + r(1 + hash(seed, 5) * 4);
    seed++;
  }
  // banderines de fiesta sobre la calle
  bunting(P, 0, W - 1, Math.round(ground - r(40)), r(7));

  // acera con bordillo
  const walk = ramp5('#ead8b8');
  const curb = ramp5('#b8a898');
  const walkH = r(6);
  for (let y = ground; y < ground + walkH; y++)
    for (let xx = 0; xx < W; xx++) P.put(xx, y, y === ground ? walk[4] : y >= ground + walkH - 1 ? curb[1] : xx % r(8) === 0 ? walk[1] : walk[2]);
  // plaza de adoquines en perspectiva: pequeños al fondo y grandes delante
  const cob = [ramp5('#d4c4ac'), ramp5('#dccaa8'), ramp5('#c8bcb4')];
  const y0 = ground + walkH;
  let y = y0;
  let row = 0;
  while (y < H) {
    const depth = (y - y0) / Math.max(1, H - y0);
    const rowH = Math.max(2, Math.round(r(2.2) * (1 + depth * 1.7)));
    const sw = Math.max(3, Math.round(rowH * 1.7));
    const off = Math.floor(hash(row, 1) * sw);
    for (let yIn = 0; yIn < rowH && y + yIn < H; yIn++)
      for (let xx = 0; xx < W; xx++) {
        const col = Math.floor((xx + off) / sw);
        const xIn = (xx + off) % sw;
        const stone = cob[Math.floor(hash(col, row) * cob.length)];
        let t = 2;
        const corner = (xIn === 0 || xIn === sw - 1) && (yIn === 0 || yIn === rowH - 1);
        if (corner) t = 1;
        else if (yIn === rowH - 1 || xIn === sw - 1) t = 1;
        else if (yIn === 0 || xIn === 0) t = 3;
        if (corner && rowH > 3) t = 0;
        // al fondo, más claro (luz y bruma)
        const c = stone[t];
        P.put(xx, y + yIn, depth < 0.35 ? mix(c, [250, 240, 220], 0.35 * (1 - depth / 0.35)) : c);
      }
    y += rowH;
    row++;
  }
  // árboles, farolas, bancos y parterres sobre la acera
  const base = ground + walkH - 1;
  for (let k = 0; k * r(44) < W + r(40); k++) {
    const tx = k * r(44) + r(10);
    if (k % 2 === 0) tree(P, tx, base, r(8), k);
    else {
      lamp(P, tx, base, r(17));
      if (H > 70) bench(P, tx + r(5), base, r(4));
    }
    if (H > 70 && k % 3 === 2) flowerBed(P, tx - r(16), base, r(10), k);
  }
  // fuente en la plaza
  if (H > 60) fountain(P, Math.round(W / 2), Math.round(ground + (H - ground) * 0.78), r(9));
  P.flush();
}

/** Portada pequeña de la caja del juego. */
export function paintVillaCover(ctx: CanvasRenderingContext2D, W: number, H: number) {
  paintVillaScene(ctx, W, H);
}

export type { RGB };
