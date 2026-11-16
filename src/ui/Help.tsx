import { CARD_DEFS } from '../game/cards';
import { CHARACTERS, ROLE_INFO } from '../game/characters';
import type { Role } from '../game/types';
import { Sprite } from '../pixel/Sprite';
import { Modal, PORTRAIT_BG } from './common';

export function Help({ onClose }: { onClose: () => void }) {
  const brown = Object.values(CARD_DEFS).filter((d) => d.color === 'madera');
  const blue = Object.values(CARD_DEFS).filter((d) => d.color === 'equipo');
  return (
    <Modal onClose={onClose}>
      <h2>Cómo se juega</h2>
      <p>
        Cada jugador recibe un <b>rol secreto</b> y un <b>personaje</b> con una habilidad. Sólo el Sheriff muestra su rol. Tus vidas
        son también el máximo de cartas que puedes guardar al final del turno.
      </p>

      <h3>Roles</h3>
      <div className="help-grid">
        {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
          <div key={r} className="help-item">
            <Sprite name={r} scale={2} />
            <div>
              <b>{ROLE_INFO[r].name}</b>
              {ROLE_INFO[r].goal}
            </div>
          </div>
        ))}
      </div>
      <p className="muted">
        4 jugadores: Sheriff, Renegado y 2 Forajidos · 5: +1 Ayudante · 6: +1 Forajido · 7: +1 Ayudante. El Sheriff tiene 1 vida extra y empieza.
      </p>

      <h3>Tu turno</h3>
      <ol>
        <li>
          <b>Roba 2 cartas.</b>
        </li>
        <li>
          <b>Juega las cartas que quieras.</b> Sólo 1 Disparo por turno, no puedes tener dos cartas iguales en juego y sólo un arma.
        </li>
        <li>
          <b>Descarta</b> hasta tener tantas cartas como vidas.
        </li>
      </ol>
      <p>
        Fuera de tu turno sólo puedes usar <b>Esquiva</b> (cuando te disparan) y <b>Whisky</b> (cuando vas a caer). Con 2 jugadores el
        Whisky ya no cura.
      </p>

      <h3>Distancia y alcance</h3>
      <p>
        La distancia es el número de asientos hasta otro jugador por el camino más corto (los eliminados no cuentan). Para disparar, la
        distancia debe ser menor o igual que el <b>alcance de tu arma</b>. Empiezas con una Pistola de alcance 1. El Caballo y el Catalejo
        cambian la distancia; las armas no.
      </p>

      <h3>Desenfundar</h3>
      <p>
        Barril, Calabozo y Dinamita te hacen <b>desenfundar</b>: se gira la carta de arriba del mazo y se mira su palo y valor (esquina
        superior derecha de cada carta).
      </p>

      <h3>Recompensas y castigos</h3>
      <p>
        Quien elimina a un Forajido roba 3 cartas. Si el Sheriff elimina a un Ayudante, pierde todas sus cartas. Cuando el Sheriff cae,
        ganan los Forajidos (o el Renegado si es el último en pie). Si caen todos los Forajidos y el Renegado, gana el Sheriff con sus
        Ayudantes.
      </p>

      <h3>Cartas de acción · marco marrón (se juegan y se descartan)</h3>
      <div className="help-grid">
        {brown.map((d) => (
          <div key={d.kind} className="help-item">
            <Sprite name={d.kind} scale={2} />
            <div>
              <b>
                {d.name} <span className="muted">×{d.count}</span>
              </b>
              {d.text}
            </div>
          </div>
        ))}
      </div>

      <h3>Equipo · marco verde (se queda en juego)</h3>
      <div className="help-grid">
        {blue.map((d) => (
          <div key={d.kind} className="help-item">
            <Sprite name={d.kind} scale={2} />
            <div>
              <b>
                {d.name} <span className="muted">×{d.count}</span>
              </b>
              {d.text}
            </div>
          </div>
        ))}
      </div>

      <h3>Personajes</h3>
      <div className="help-grid">
        {Object.values(CHARACTERS).map((c) => (
          <div key={c.id} className="help-item">
            <div style={{ background: PORTRAIT_BG[c.id], padding: 2 }}>
              <Sprite name={c.id} scale={2} />
            </div>
            <div>
              <b>
                {c.name} <span className="muted">· {c.trade} · {c.hp}♥</span>
              </b>
              <i>{c.power}:</i> {c.ability}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
