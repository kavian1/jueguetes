import type { CharId, Role } from './types';

export interface CharDef {
  id: CharId;
  name: string;
  /** oficio que se muestra bajo el nombre */
  trade: string;
  hp: number;
  power: string;
  ability: string;
}

// Los identificadores internos se mantienen; nombres y aspecto son los del Oeste.
export const CHARACTERS: Record<CharId, CharDef> = {
  tinta: { id: 'tinta', name: 'Martina «Siete Vidas»', trade: 'pistolera', hp: 3, power: 'Siete vidas', ability: 'Una vez por partida, cuando recibiría un golpe mortal, se queda con 1 vida.' },
  bruma: { id: 'bruma', name: 'Tadeo «Ojo Fino»', trade: 'explorador', hp: 4, power: 'Ojo fino', ability: 'Ve a todos los demás a -1 de distancia.' },
  musgo: { id: 'musgo', name: 'Ignacio el Escurridizo', trade: 'tahúr', hp: 3, power: 'Escurridizo', ability: 'Los demás le ven a +1 de distancia.' },
  miel: { id: 'miel', name: 'Bertha', trade: 'tabernera', hp: 4, power: 'Aguante', ability: 'Cada Whisky que bebe le cura 2 vidas en vez de 1.' },
  pipa: { id: 'pipa', name: 'Joaquín «Culebra»', trade: 'cuatrero', hp: 4, power: 'Cuerpo a tierra', ability: 'Ráfaga y Estampida no le afectan.' },
  chispa: { id: 'chispa', name: 'Lupe «Doble Gatillo»', trade: 'pistolera', hp: 4, power: 'Doble gatillo', ability: 'Puede jugar hasta 2 Disparos por turno.' },
  pincho: { id: 'pincho', name: 'Silas «Espino»', trade: 'vaquero', hp: 4, power: 'Mala espina', ability: 'Cuando otro jugador le quita vida, ese jugador descarta una carta al azar de su mano.' },
  ceniza: { id: 'ceniza', name: 'Ezequiel', trade: 'enterrador', hp: 4, power: 'Enterrador', ability: 'Cuando otro jugador es eliminado, se queda con las cartas de su mano.' },
  ramon: { id: 'ramon', name: 'Ratón Méndez', trade: 'carterista', hp: 4, power: 'Dedos largos', ability: 'Su Atraco alcanza a jugadores a distancia 2.' },
  olmo: { id: 'olmo', name: 'Madame Zora', trade: 'adivina', hp: 4, power: 'Bola de cristal', ability: 'Al robar, mira las 3 primeras cartas, se queda 2 y devuelve 1 al mazo.' },
  trebol: { id: 'trebol', name: "Trébol O'Hara", trade: 'jugador', hp: 4, power: 'Suerte', ability: 'Al desenfundar para Barril o Calabozo, los ♦ también cuentan como ♥.' },
  cardo: { id: 'cardo', name: 'Bruno «el Toro»', trade: 'matón', hp: 4, power: 'Embestida', ability: 'Sus Disparos contra jugadores a distancia 1 necesitan 2 Esquivas para anularse.' },
  nuez: { id: 'nuez', name: 'Remedios', trade: 'curandera', hp: 4, power: 'Remedio casero', ability: 'En su turno puede descartar 2 cartas para recuperar 1 vida.' },
};

export const ROLE_INFO: Record<Role, { name: string; goal: string }> = {
  sheriff: { name: 'Sheriff', goal: 'Elimina a todos los Forajidos y al Renegado.' },
  ayudante: { name: 'Ayudante', goal: 'Protege al Sheriff y elimina a Forajidos y Renegado.' },
  forajido: { name: 'Forajido', goal: 'Elimina al Sheriff.' },
  renegado: { name: 'Renegado', goal: 'Sé el último en pie: elimina a todos y deja al Sheriff para el final.' },
};

export function rolesFor(n: number): Role[] {
  const table: Record<number, Role[]> = {
    4: ['sheriff', 'renegado', 'forajido', 'forajido'],
    5: ['sheriff', 'renegado', 'forajido', 'forajido', 'ayudante'],
    6: ['sheriff', 'renegado', 'forajido', 'forajido', 'forajido', 'ayudante'],
    7: ['sheriff', 'renegado', 'forajido', 'forajido', 'forajido', 'ayudante', 'ayudante'],
  };
  const roles = table[n];
  if (!roles) throw new Error('Se necesitan entre 4 y 7 jugadores');
  return [...roles];
}

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;
