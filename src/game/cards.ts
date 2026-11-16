import type { Card, CardKind, Suit } from './types';
import { mulberry32, shuffle } from './rng';

export type CardColor = 'madera' | 'equipo';

export interface CardDef {
  kind: CardKind;
  name: string;
  /** madera = se juega y se descarta; equipo = se queda en juego */
  color: CardColor;
  text: string;
  count: number;
  weaponRange?: number;
}

export const CARD_DEFS: Record<CardKind, CardDef> = {
  disparo: { kind: 'disparo', name: 'Disparo', color: 'madera', count: 24, text: 'Quita 1 vida a un jugador a tu alcance. Sólo 1 por turno.' },
  esquiva: { kind: 'esquiva', name: 'Esquiva', color: 'madera', count: 13, text: 'Anula un disparo dirigido a ti. Se juega fuera de turno.' },
  manzanilla: { kind: 'manzanilla', name: 'Whisky', color: 'madera', count: 6, text: 'Recupera 1 vida. Puedes beberlo al recibir un golpe mortal.' },
  picnic: { kind: 'picnic', name: 'Fogata', color: 'madera', count: 1, text: 'Todos los jugadores recuperan 1 vida.' },
  correo: { kind: 'correo', name: 'Telegrama', color: 'madera', count: 2, text: 'Roba 2 cartas.' },
  encomienda: { kind: 'encomienda', name: 'Botín', color: 'madera', count: 1, text: 'Roba 3 cartas.' },
  mercadillo: { kind: 'mercadillo', name: 'Subasta', color: 'madera', count: 2, text: 'Revela 1 carta por jugador vivo. Por turnos, cada uno elige una.' },
  hurto: { kind: 'hurto', name: 'Atraco', color: 'madera', count: 4, text: 'Quita una carta (de la mano o en juego) a un jugador a distancia 1.' },
  travesura: { kind: 'travesura', name: 'Lazo', color: 'madera', count: 4, text: 'Descarta una carta (de la mano o en juego) de cualquier jugador.' },
  rafaga: { kind: 'rafaga', name: 'Ráfaga', color: 'madera', count: 1, text: 'Dispara a todos los demás. No cuenta como Disparo.' },
  estampida: { kind: 'estampida', name: 'Estampida', color: 'madera', count: 2, text: 'Los demás descartan un Disparo o pierden 1 vida. No se puede esquivar.' },
  duelo: { kind: 'duelo', name: 'Duelo', color: 'madera', count: 3, text: 'Reta a cualquiera. Por turnos descartáis Disparos; el primero que no pueda pierde 1 vida.' },
  barril: { kind: 'barril', name: 'Barril', color: 'equipo', count: 2, text: 'Si te disparan, desenfunda: con ♥ esquivas el disparo.' },
  poni: { kind: 'poni', name: 'Caballo', color: 'equipo', count: 2, text: 'Los demás te ven a +1 de distancia.' },
  catalejo: { kind: 'catalejo', name: 'Catalejo', color: 'equipo', count: 1, text: 'Ves a los demás a -1 de distancia.' },
  calabozo: { kind: 'calabozo', name: 'Calabozo', color: 'equipo', count: 3, text: 'Encierra a otro jugador (no al Sheriff). En su turno desenfunda: con ♥ sale; si no, pierde el turno.' },
  dinamita: { kind: 'dinamita', name: 'Dinamita', color: 'equipo', count: 1, text: 'Al empezar tu turno desenfunda: con ♠ del 2 al 9 explota (-3 vidas). Si no, pasa al siguiente.' },
  repetidora: { kind: 'repetidora', name: 'Repetidora', color: 'equipo', count: 2, weaponRange: 1, text: 'Arma. Alcance 1. Puedes jugar todos los Disparos que quieras.' },
  revolver: { kind: 'revolver', name: 'Revólver', color: 'equipo', count: 3, weaponRange: 2, text: 'Arma. Alcance 2.' },
  escopeta: { kind: 'escopeta', name: 'Escopeta', color: 'equipo', count: 1, weaponRange: 3, text: 'Arma. Alcance 3.' },
  carabina: { kind: 'carabina', name: 'Carabina', color: 'equipo', count: 1, weaponRange: 4, text: 'Arma. Alcance 4.' },
  rifle: { kind: 'rifle', name: 'Rifle de caza', color: 'equipo', count: 1, weaponRange: 5, text: 'Arma. Alcance 5.' },
};

export const BASE_WEAPON = { name: 'Pistola', range: 1 };

export const isBlue = (k: CardKind) => CARD_DEFS[k].color === 'equipo';
export const isWeapon = (k: CardKind) => CARD_DEFS[k].weaponRange !== undefined;
export const cardName = (c: Card | CardKind) => CARD_DEFS[typeof c === 'string' ? c : c.kind].name;

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: 'picas', H: 'corazones', D: 'diamantes', C: 'tréboles' };

export function rankLabel(r: number): string {
  if (r <= 10) return String(r);
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[r];
}

export const cardValueLabel = (c: Card) => `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}`;

/**
 * Construye el mazo de 80 cartas. Los palos y valores se reparten de forma
 * equilibrada (20 de cada palo) y se asignan con una semilla fija para que
 * cada carta tenga siempre el mismo valor.
 */
export function buildDeck(rnd: () => number = Math.random): Card[] {
  const kinds: CardKind[] = [];
  for (const def of Object.values(CARD_DEFS)) for (let i = 0; i < def.count; i++) kinds.push(def.kind);

  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const values: { suit: Suit; rank: number }[] = [];
  for (let i = 0; i < kinds.length; i++) values.push({ suit: suits[i % 4], rank: 2 + ((i * 7 + Math.floor(i / 4)) % 13) });
  shuffle(values, mulberry32(20261108));

  const cards: Card[] = kinds.map((kind, i) => ({ id: i + 1, kind, suit: values[i].suit, rank: values[i].rank }));
  return shuffle(cards, rnd);
}
