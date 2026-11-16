import { Suspense, useState } from 'react';
import { loadName, saveName } from '../net/protocol';
import { Sprite } from '../pixel/Sprite';
import '../isla/art';
import { charSprite } from '../villa/art';
import { CHAR_IDS } from '../villa/rules';
import { PORTRAIT_BG } from '../ui/common';
import type { GameDef } from './games';

function Hero({ def }: { def: GameDef }) {
  if (def.id === 'villa')
    return (
      <div className="isla-hero" aria-hidden="true">
        {CHAR_IDS.slice(0, 8).map((c) => (
          <span key={c} className="hero-chip">
            <Sprite name={charSprite(c)} scale={2} />
          </span>
        ))}
      </div>
    );
  if (def.id === 'polvo')
    return (
      <div className="home-cast" aria-hidden="true">
        {(['tinta', 'cardo', 'olmo', 'pipa', 'miel', 'ceniza', 'chispa'] as const).map((c) => (
          <div key={c} className="portrait" style={{ background: PORTRAIT_BG[c] }}>
            <Sprite name={c} scale={2} />
          </div>
        ))}
      </div>
    );
  return (
    <div className="isla-hero" aria-hidden="true">
      {['res_madera', 'res_arcilla', 'res_lana', 'res_trigo', 'res_piedra'].map((r) => (
        <span key={r} className="hero-chip">
          <Sprite name={r} scale={3} />
        </span>
      ))}
      <span className="hero-chip fox">
        <Sprite name="isla_zorro" scale={3} />
      </span>
    </div>
  );
}

interface Props {
  def: GameDef;
  onBack: () => void;
  onHost: (name: string) => void;
  onSolo: (name: string) => void;
}

/** Portada de un juego: crear sala online, practicar con bots o leer las reglas. */
export function GameHome({ def, onBack, onHost, onSolo }: Props) {
  const [name, setName] = useState(loadName);
  const [help, setHelp] = useState(false);
  const [err, setErr] = useState('');
  const go = (fn: (n: string) => void) => {
    if (!name.trim()) return setErr('Escribe tu nombre primero.');
    saveName(name.trim());
    fn(name.trim());
  };
  const Help = def.Help;
  return (
    <div className={'home home-' + def.id}>
      <a
        className="btn small back-btn"
        href="/"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onBack();
        }}
      >
        ← Rincón de Juegos
      </a>
      <div className="home-title">
        {def.id === 'polvo' && <Sprite name="revolver" scale={4} className="flip" />}
        <h1 className="logo">
          <small>★ {def.kicker} ★</small>
          {def.title}
        </h1>
        {def.id === 'polvo' && <Sprite name="revolver" scale={4} />}
      </div>
      <Hero def={def} />
      <p className="tagline">{def.blurb}</p>

      <div className="home-card panel">
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
        />
        <button className="btn primary big" onClick={() => go(onHost)}>
          Crear sala online
        </button>
        <button className="btn" onClick={() => go(onSolo)}>
          Practicar contra bots
        </button>
        <button className="btn small" onClick={() => setHelp(true)}>
          Cómo se juega
        </button>
        {err && <div className="err">{err}</div>}
      </div>
      <p className="tagline" style={{ fontSize: 13 }}>
        {def.players} · {def.length} · los huecos se rellenan con bots
      </p>
      {help && (
        <Suspense fallback={null}>
          <Help onClose={() => setHelp(false)} />
        </Suspense>
      )}
    </div>
  );
}
