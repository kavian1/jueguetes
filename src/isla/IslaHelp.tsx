import { Sprite } from '../pixel/Sprite';
import { Modal } from '../ui/common';
import { COST, DEV_INFO, GOAL, RES_INFO } from './rules';
import { RES, type DevKind, type Res, type ResMap } from './types';
import './art';

export function CostRow({ cost }: { cost: Partial<ResMap> }) {
  const items: Res[] = [];
  for (const r of RES) for (let i = 0; i < (cost[r] ?? 0); i++) items.push(r);
  return (
    <span className="cost-row">
      {items.map((r, i) => (
        <Sprite key={i} name={'mini_' + r} scale={2} title={RES_INFO[r].name} />
      ))}
    </span>
  );
}

export function IslaHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2>Cómo se juega a Isla Cosecha</h2>
      <p>
        La isla está hecha de casillas que producen recursos. Cada una tiene un número: cuando salga en los dados, todas las cabañas y
        villas que la toquen cosechan. Gana quien llegue antes a <b>{GOAL} puntos</b> en su turno.
      </p>

      <h3>Recursos</h3>
      <div className="help-grid">
        {RES.map((r) => (
          <div key={r} className="help-item">
            <Sprite name={'res_' + r} scale={2} />
            <div>
              <b>{RES_INFO[r].name}</b>
              Sale del {RES_INFO[r].terrain.toLowerCase()}.
            </div>
          </div>
        ))}
        <div className="help-item">
          <Sprite name="isla_zorro" scale={2} />
          <div>
            <b>Las dunas</b>
            No producen nada: es donde vive el zorro.
          </div>
        </div>
      </div>

      <h3>Al empezar</h3>
      <p>
        Por turnos, cada uno funda una cabaña con un camino pegado. Después, en orden inverso, la segunda: esa ya te da un recurso de cada
        casilla que toca. Dos edificios nunca pueden estar en cruces vecinos.
      </p>

      <h3>En tu turno</h3>
      <ol>
        <li>
          <b>Tira los dados.</b> Todos cosechan: 1 recurso por cabaña y 2 por villa en las casillas con ese número.
        </li>
        <li>
          <b>Comercia</b> con los demás (tú propones, ellos aceptan) o con el granero: 4 iguales por 1, o 3 por 1 y 2 por 1 si tienes un
          edificio en un muelle.
        </li>
        <li>
          <b>Construye</b> lo que puedas pagar y <b>pasa el turno</b>.
        </li>
      </ol>
      <div className="help-grid">
        <div className="help-item">
          <Sprite name="isla_road_a_0" scale={2} />
          <div>
            <b>Camino</b>
            <CostRow cost={COST.camino} /> Sale de tus caminos o edificios.
          </div>
        </div>
        <div className="help-item">
          <Sprite name="isla_cabana_0" scale={2} />
          <div>
            <b>Cabaña · 1 punto</b>
            <CostRow cost={COST.cabana} /> En un cruce libre junto a tu camino.
          </div>
        </div>
        <div className="help-item">
          <Sprite name="isla_villa_0" scale={2} />
          <div>
            <b>Villa · 2 puntos</b>
            <CostRow cost={COST.villa} /> Mejora una de tus cabañas: cosecha el doble.
          </div>
        </div>
        <div className="help-item">
          <Sprite name="isla_cartas" scale={2} />
          <div>
            <b>Carta de aldea</b>
            <CostRow cost={COST.carta} /> Sorpresas que te ayudan (una por turno, no la del mismo turno).
          </div>
        </div>
      </div>

      <h3>Cartas de aldea</h3>
      <div className="help-grid">
        {(Object.keys(DEV_INFO) as DevKind[]).map((k) => (
          <div key={k} className="help-item">
            <Sprite name={'dev_' + k} scale={2} />
            <div>
              <b>{DEV_INFO[k].name}</b>
              {DEV_INFO[k].text}
            </div>
          </div>
        ))}
      </div>

      <h3>El siete y el zorro</h3>
      <p>
        Con un <b>7</b> nadie cosecha: quien tenga más de 7 cartas pierde la mitad, y quien tiró mueve al zorro a otra casilla (que deja de
        producir mientras esté allí) y le roba un recurso a alguien que tenga un edificio en ella.
      </p>

      <h3>Bonificaciones (+2 puntos)</h3>
      <div className="help-grid">
        <div className="help-item">
          <Sprite name="isla_sendero" scale={2} />
          <div>
            <b>Gran Sendero</b>
            Para el camino seguido más largo, de al menos 5 tramos.
          </div>
        </div>
        <div className="help-item">
          <Sprite name="isla_jauria" scale={2} />
          <div>
            <b>Gran Jauría</b>
            Para quien haya jugado más perros guardianes (mínimo 3).
          </div>
        </div>
      </div>
    </Modal>
  );
}
