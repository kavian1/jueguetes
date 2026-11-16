import { useState } from 'react';
import { loadName, saveName } from '../net/protocol';
import { Sprite } from '../pixel/Sprite';
import '../isla/art';
import { paintVillaCover } from '../villa/art';
import { worldScale } from '../pixel/world';
import { PixelCanvas } from './Backdrop';
import type { GameDef } from './games';
import { paintIslaCover, paintPolvoCover } from './hubArt';
import { pageForGame } from '../site';

const COVERS = { polvo: paintPolvoCover, isla: paintIslaCover, villa: paintVillaCover };
const COVER_CAST: Record<string, string[]> = {
  polvo: ['fig_cardo', 'fig_tinta'],
  isla: [],
  villa: ['fig_vmrita', 'fig_vmernesto'],
};

interface Props {
  games: GameDef[];
  initialCode: string;
  onPick: (def: GameDef) => void;
  onJoin: (name: string, code: string) => void;
}

/** Pantalla principal: la estantería con los juegos y la entrada a una sala por código. */
export function Hub({ games, initialCode, onPick, onJoin }: Props) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode);
  const [err, setErr] = useState('');
  const s = worldScale() >= 4 ? 3 : 2;

  const join = () => {
    const c = code.trim().toUpperCase();
    if (!name.trim()) return setErr('Escribe tu nombre primero.');
    if (c.length < 5) return setErr('El código de sala tiene 5 caracteres.');
    saveName(name.trim());
    onJoin(name.trim(), c);
  };

  return (
    <div className="hub">
      <h1 className="logo hub-logo">
        <small>★ juegos de mesa online con amigos ★</small>
        Rincón de Juegos
      </h1>

      <div className="hub-shelf">
        {games.map((g) => (
          <a
            key={g.id}
            href={pageForGame(g.id).path}
            className={'game-box box-' + g.id}
            style={{ width: 96 * s + 22 }}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onPick(g);
            }}
          >
            <span className="box-cover">
              <PixelCanvas paint={COVERS[g.id]} w={96} h={56} scale={s} />
              <span className="box-cast">
                {COVER_CAST[g.id].map((f, i) => (
                  <Sprite key={f} name={f} scale={s} className={i ? 'flip' : ''} />
                ))}
                {g.id === 'isla' && (
                  <>
                    <Sprite name="isla_zorro" scale={s} />
                  </>
                )}
              </span>
            </span>
            <span className="box-title">{g.title}</span>
            <span className="box-kicker">{g.kicker}</span>
            <span className="box-meta">
              {g.players} · {g.length}
            </span>
          </a>
        ))}
        <div className="game-box soon" style={{ width: 96 * s + 22 }} aria-hidden="true">
          <span className="box-cover soon-cover">
            <Sprite name="dev_dorso" scale={s + 1} />
          </span>
          <span className="box-title">Próximamente</span>
          <span className="box-kicker">más juegos en camino</span>
        </div>
      </div>

      <div className="hub-card panel">
        <label htmlFor="name">
          <b>Tu nombre</b>
        </label>
        <input
          id="name"
          className="input"
          value={name}
          maxLength={16}
          placeholder="p. ej. Kaavi"
          onChange={(e) => {
            setName(e.target.value);
            setErr('');
          }}
          onBlur={() => name.trim() && saveName(name.trim())}
        />
        {initialCode ? (
          <button className="btn primary big" onClick={join}>
            Unirse a la sala {initialCode}
          </button>
        ) : null}
        <div className="sep">{initialCode ? 'o usa otro código' : '¿te han pasado un código?'}</div>
        <div className="row">
          <input
            className="input code-input"
            value={code}
            maxLength={5}
            placeholder="CÓDIGO"
            style={{ textTransform: 'uppercase', letterSpacing: 3 }}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              setErr('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button className="btn blue" onClick={join}>
            Unirse
          </button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
      <p className="tagline hub-tagline">Elige un juego para crear una sala · conexión directa entre navegadores · los huecos se rellenan con bots</p>
    </div>
  );
}
