// Catálogo del Rincón de Juegos. Para añadir un juego nuevo basta con crear su motor
// (con un GameAdapter), su mesa y su ayuda, y registrarlo aquí.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameAdapter, GameId, Session, Snapshot } from '../net/protocol';
import { polvoAdapter } from '../game/adapter';
import { islaAdapter } from '../isla/adapter';
import { villaAdapter } from '../villa/adapter';

export interface TableProps {
  snap: Snapshot<any>;
  session: Session<any, any>;
  onLeave: () => void;
}

export type Theme = 'oeste' | 'isla' | 'villa';

export interface GameDef {
  id: GameId;
  title: string;
  kicker: string;
  blurb: string;
  players: string;
  length: string;
  theme: Theme;
  adapter: GameAdapter<any, any, any, any>;
  Table: LazyExoticComponent<ComponentType<TableProps>>;
  Help: LazyExoticComponent<ComponentType<{ onClose: () => void }>>;
}

export const GAMES: GameDef[] = [
  {
    id: 'villa',
    title: 'Villa Moneda',
    kicker: 'compra, construye y gobierna',
    blurb: 'Recorre la villa comprando calles, bancos y empresas, construye casas, pide préstamos, vota en las elecciones y aguanta las noticias de cada ronda. Cada vecino tiene su propio truco. Gana el patrimonio más grande.',
    players: '3–5 jugadores',
    length: '40–60 min',
    theme: 'villa',
    adapter: villaAdapter,
    Table: lazy(() => import('../villa/VillaTable').then((m) => ({ default: m.VillaTable }))),
    Help: lazy(() => import('../villa/VillaHelp').then((m) => ({ default: m.VillaHelp }))),
  },
  {
    id: 'isla',
    title: 'Isla Cosecha',
    kicker: 'cosecha, comercia y construye',
    blurb: 'Funda cabañas en una isla de casillas, recoge lo que dicten los dados, comercia con tus vecinos y que no te pille el zorro. Gana quien llegue antes a 10 puntos.',
    players: '3–4 jugadores',
    length: '45–75 min',
    theme: 'isla',
    adapter: islaAdapter,
    Table: lazy(() => import('../isla/IslaTable').then((m) => ({ default: m.IslaTable }))),
    Help: lazy(() => import('../isla/IslaHelp').then((m) => ({ default: m.IslaHelp }))),
  },
  {
    id: 'polvo',
    title: 'Polvo y Pólvora',
    kicker: 'un duelo de roles ocultos',
    blurb: 'El Sheriff, sus Ayudantes, los Forajidos y un Renegado se ven las caras en el pueblo. Nadie sabe quién es quién… salvo el Sheriff.',
    players: '4–7 jugadores',
    length: '20–40 min',
    theme: 'oeste',
    adapter: polvoAdapter,
    Table: lazy(() => import('../ui/Table').then((m) => ({ default: m.Table as ComponentType<TableProps> }))),
    Help: lazy(() => import('../ui/Help').then((m) => ({ default: m.Help }))),
  },
];

export const gameById = (id: GameId | null | undefined) => GAMES.find((g) => g.id === id) ?? null;
