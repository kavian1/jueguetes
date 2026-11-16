import type { CSSProperties } from 'react';
import { Sprite } from '../pixel/Sprite';
import { Modal } from '../ui/common';
import {
  CHARACTERS,
  CHAR_IDS,
  GROUPS,
  GROUP_ORDER,
  KIND_INFO,
  LOAN,
  LOAN_INTEREST,
  MAYOR_PERKS,
  METRO_FARE,
  MODES,
  MODE_IDS,
  PARTIES,
  PARTY_IDS,
  REFERENDUM_COST,
  SEAT_BONUS,
  START_CASH,
} from './rules';
import { charSprite } from './art';
import './villa.css';

function Item({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="help-item">
      <Sprite name={icon} scale={2} />
      <div>
        <b>{title}</b>
        {children}
      </div>
    </div>
  );
}

export function VillaHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2>Cómo se juega a Villa Moneda</h2>
      <p>
        Tira los dados, recorre las 40 casillas de la villa y compra lo que pises. Quien caiga en algo tuyo te paga. El <b>patrimonio</b> es tu dinero +
        propiedades + casas − préstamos.
      </p>
      <p className="muted">
        Todos empiezan con {START_CASH} monedas y cada puesto en el orden de juego recibe {SEAT_BONUS} más que el anterior, para compensar a quien
        juega después.
      </p>

      <h3>Modos de juego</h3>
      <div className="help-grid">
        {MODE_IDS.map((m) => (
          <Item key={m} icon={m === 'rapida' ? 'vm_dado_5' : m === 'final' ? 'vm_billete' : 'vm_moneda'} title={MODES[m].name}>
            {MODES[m].text}
          </Item>
        ))}
      </div>

      <h3>Tu turno</h3>
      <ol>
        <li>
          <b>Tira los dados</b> y avanza. Si sacas dobles, vuelves a tirar (tres dobles seguidos: a la comisaría).
        </li>
        <li>
          Si la casilla está libre, puedes <b>comprarla</b>. Si es de otro, le pagas el alquiler.
        </li>
        <li>
          Antes o después de tirar puedes <b>construir</b>, <b>vender</b>, pedir o devolver <b>préstamos</b> y proponer <b>tratos</b> a otros
          jugadores.
        </li>
      </ol>
      <p>Al pasar por la Salida cobras 200.</p>

      <h3>Propiedades</h3>
      <div className="help-grid">
        <Item icon="vm_casa_flores" title={KIND_INFO.calle.name}>
          {KIND_INFO.calle.text}
        </Item>
        <Item icon="vm_tren" title={KIND_INFO.transporte.name}>
          {KIND_INFO.transporte.text}
        </Item>
        <Item icon="vm_fabrica" title={KIND_INFO.empresa.name}>
          {KIND_INFO.empresa.text}
        </Item>
        <Item icon="vm_banco" title={KIND_INFO.banco.name}>
          {KIND_INFO.banco.text}
        </Item>
        <Item icon="vm_noria" title={KIND_INFO.atraccion.name}>
          {KIND_INFO.atraccion.text}
        </Item>
      </div>
      <div className="vm-help-groups">
        {GROUP_ORDER.map((g) => (
          <span key={g} className="vm-mini-prop" style={{ '--band': GROUPS[g].color } as CSSProperties}>
            {GROUPS[g].name} · casa {GROUPS[g].house}
          </span>
        ))}
      </div>
      <p className="muted">Se puede vender al banco una casa por la mitad de lo que cuesta, o una propiedad por la mitad de su precio.</p>

      <h3>Préstamos y deudas</h3>
      <p>
        El banco te presta {LOAN} cuando quieras (hasta 3). Cada vez que pasas por la Salida pagas {LOAN_INTEREST} de intereses por préstamo,
        salvo si tienes un banco. Si no te llega para pagar algo, tendrás que pedir préstamos o vender. Si ni así puedes, quiebras.
      </p>

      <h3>Casillas especiales</h3>
      <div className="help-grid">
        <Item icon="vm_martillo" title="Casa de Subastas">
          El banco subasta una propiedad libre al azar. Todos pujan en secreto a la vez y gana la puja más alta. Quien cae se lleva un 10 % de
          comisión.
        </Item>
        <Item icon="vm_pancarta" title="Plaza de las Pancartas">
          Organizas una manifestación: una propiedad de un rival deja de cobrar alquiler hasta que su dueño vuelva a jugar.
        </Item>
        <Item icon="vm_metro" title="Metro">
          Puedes pagar {METRO_FARE} y saltar a la otra estación, al otro lado del tablero. No pasa por la Salida.
        </Item>
        <Item icon="vm_ayto" title="Ayuntamiento">
          Quien ocupa la alcaldía cobra {MAYOR_PERKS} de dietas. Los demás pueden pagar {REFERENDUM_COST} para convocar un referéndum.
        </Item>
        <Item icon="vm_buzon" title="Buzón">
          Una carta con una sorpresa, buena o mala.
        </Item>
        <Item icon="vm_hacienda" title="Hacienda">
          Un impuesto que va al bote de la Plaza.
        </Item>
        <Item icon="vm_fuente" title="Plaza Mayor">
          Te llevas el bote.
        </Item>
        <Item icon="vm_bolsa" title="Bolsa">
          Inviertes 100: con 1-2 lo pierdes, con 5-6 ganas 150.
        </Item>
        <Item icon="vm_rejas" title="Comisaría">
          Sales sacando dobles o pagando 50. Al tercer turno pagas y sales.
        </Item>
      </div>

      <h3>Noticias y elecciones</h3>
      <p>
        Cada ronda llega una <b>noticia</b> que cambia la economía durante esa ronda (alquileres, precios, intereses…) o reparte o cobra dinero al
        momento. Cada 4 rondas hay <b>elecciones</b>: todos votan en secreto y pueden donar. Cada voto suma 25 y cada moneda donada, 1. El partido
        ganador aplica su política hasta las siguientes elecciones, y quien más le haya aportado ocupa la alcaldía y cobra 30 cada ronda.
      </p>
      <div className="help-grid">
        {PARTY_IDS.map((k) => (
          <div key={k} className="help-item">
            <span className="vm-party-dot" style={{ background: PARTIES[k].color }} />
            <div>
              <b>{PARTIES[k].name}</b>
              {PARTIES[k].policy}
            </div>
          </div>
        ))}
      </div>

      <h3>Los vecinos</h3>
      <p>Al empezar eliges uno de dos vecinos al azar. Cada uno tiene un poder para toda la partida.</p>
      <div className="help-grid">
        {CHAR_IDS.map((c) => (
          <div key={c} className="help-item">
            <Sprite name={charSprite(c)} scale={2} />
            <div>
              <b>
                {CHARACTERS[c].name}, {CHARACTERS[c].trade}
              </b>
              <i>{CHARACTERS[c].power}:</i> {CHARACTERS[c].text}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
