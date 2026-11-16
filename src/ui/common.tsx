import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Card, CharId, Role } from '../game/types';
import { CARD_DEFS, SUIT_SYMBOL, rankLabel } from '../game/cards';
import { ROLE_INFO } from '../game/characters';
import { Sprite } from '../pixel/Sprite';

export const PORTRAIT_BG: Record<CharId, string> = {
  tinta: '#9fd8e4',
  bruma: '#f3d27a',
  musgo: '#f2b8a8',
  miel: '#9fd8e4',
  pipa: '#bfe3a0',
  chispa: '#f2b8a8',
  pincho: '#c7eaa0',
  ceniza: '#d6c4f2',
  ramon: '#f3d27a',
  olmo: '#f6e0b0',
  trebol: '#f3d27a',
  cardo: '#ecbf7c',
  nuez: '#9fd8e4',
};

/** Convierte **texto** en negrita. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

export function Portrait({ character, big, dead }: { character: CharId; big?: boolean; dead?: boolean }) {
  return (
    <div className={'portrait' + (big ? ' big' : '')} style={{ background: PORTRAIT_BG[character] }}>
      <Sprite name={character} scale={big ? 3 : 2} />
      {dead && (
        <div className="tombstone">
          <Sprite name="tomb" scale={big ? 4 : 3} />
        </div>
      )}
    </div>
  );
}

export function Hearts({ hp, max }: { hp: number; max: number }) {
  const items = [];
  for (let i = 0; i < max; i++) items.push(<Sprite key={i} name={i < hp ? 'heart' : 'heartEmpty'} scale={2} />);
  return (
    <div className="hearts" title={`${Math.max(0, hp)} de ${max} vidas`}>
      {items}
    </div>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={'role-badge ' + role} title={ROLE_INFO[role].goal}>
      <Sprite name={role} scale={1} />
      {ROLE_INFO[role].name}
    </span>
  );
}

export function Chip({ card, onClick }: { card: Card; onClick?: () => void }) {
  const def = CARD_DEFS[card.kind];
  const danger = card.kind === 'calabozo' || card.kind === 'dinamita';
  return (
    <span className={'chip ' + (danger ? 'danger' : def.color)} title={`${def.name}: ${def.text}`} onClick={onClick}>
      <Sprite name={card.kind} scale={1} />
      {def.name}
    </span>
  );
}

interface CardProps {
  card: Card;
  size?: 'hand' | 'small';
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  style?: CSSProperties;
}

export function CardView({ card, size = 'hand', selected, dim, glow, onClick, onDoubleClick, style }: CardProps) {
  const def = CARD_DEFS[card.kind];
  const red = card.suit === 'H' || card.suit === 'D';
  const cls = ['card', def.color, size === 'small' ? 'small' : '', selected ? 'selected' : '', dim ? 'dim' : '', glow ? 'glow' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} style={style} onClick={onClick} onDoubleClick={onDoubleClick} title={`${def.name}: ${def.text}`}>
      <span className="card-name">{def.name}</span>
      <span className={'card-val' + (red ? ' red' : '')}>
        {rankLabel(card.rank)}
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className="card-art">
        <Sprite name={card.kind} scale={size === 'small' ? 3 : 4} />
      </span>
      {size === 'hand' && <span className="card-text">{def.text}</span>}
    </button>
  );
}

export function CardBack({ size = 'small', label }: { size?: 'hand' | 'small'; label?: string }) {
  return (
    <div className={'card back' + (size === 'small' ? ' small' : '')} title={label}>
      <div className="emblem">
        <Sprite name="duelo" scale={3} />
      </div>
    </div>
  );
}

export function Modal({ children, onClose, narrow }: { children: ReactNode; onClose?: () => void; narrow?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // se pinta en <body> para que ninguna mesa lo meta en su maquetación ni lo tape
  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal panel' + (narrow ? ' narrow' : '')} role="dialog" aria-modal="true">
        {onClose && (
          // la ✕ se queda fija arriba aunque se baje leyendo
          <div className="modal-close-bar">
            <button className="btn small modal-close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
