import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { paintPovTable, paintSaloon, paintTopTable, paintTown, worldScale } from '../pixel/world';
import { Sprite } from '../pixel/Sprite';

/** Fondo a pantalla completa: el pueblo (portada y sala) o el interior del saloon (partida). */
export function SceneBackground({ variant = 'town' }: { variant?: 'town' | 'saloon' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const setup = () => {
      const scale = worldScale();
      const W = Math.ceil(window.innerWidth / scale);
      const H = Math.ceil(window.innerHeight / scale);
      if (!W || !H) return;
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = W * scale + 'px';
      canvas.style.height = H * scale + 'px';
      if (variant === 'saloon') paintSaloon(ctx, W, H);
      else paintTown(ctx, W, H);
    };
    setup();
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(setup, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, [variant]);
  return <canvas ref={ref} className={'scene-bg ' + variant} aria-hidden="true" />;
}

/** Lienzo pixelado (al tamaño de píxel del mundo) que se repinta al cambiar de tamaño. */
function useWorldCanvas(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      const scale = worldScale();
      const W = Math.max(40, Math.round(canvas.clientWidth / scale));
      const H = Math.max(30, Math.round(canvas.clientHeight / scale));
      if (canvas.width === W && canvas.height === H) return;
      canvas.width = W;
      canvas.height = H;
      paint(ctx, W, H);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [paint]);
  return ref;
}

/** Mesa vista desde arriba (modo compacto / móvil). */
export function TableCanvas() {
  const ref = useWorldCanvas(paintTopTable);
  return <canvas ref={ref} className="table-canvas" aria-hidden="true" />;
}

/** Mesa vista desde tu asiento (primera persona). */
export function PovTableCanvas() {
  const ref = useWorldCanvas(paintPovTable);
  return <canvas ref={ref} className="pov-table" aria-hidden="true" />;
}

/**
 * Vida del saloon: motas de polvo que flotan en los haces de luz de las ventanas y
 * el parpadeo de las lámparas. Usa la misma geometría que el fondo pintado.
 */
export function SaloonAmbience() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setVp({ w: window.innerWidth, h: window.innerHeight }), 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, []);
  const s = worldScale();
  const W = Math.ceil(vp.w / s);
  const H = Math.ceil(vp.h / s);
  const u = Math.max(0.7, H / 200);
  const r = (v: number) => Math.round(v * u);
  const crownH = Math.max(3, r(4));
  const motes: CSSProperties[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (const side of [-1, 1]) {
    const ww = Math.max(28, r(38));
    const wh = Math.max(34, r(50));
    const x0 = Math.round(W * (side < 0 ? 0.115 : 0.885) - ww / 2);
    const y0 = crownH + r(12);
    const toward = side < 0 ? 1 : -1;
    for (let i = 0; i < 16; i++) {
      const t = 0.08 + rnd() * 0.75;
      const yy = y0 + wh + t * (H - y0 - wh);
      const left = x0 + toward * t * W * 0.16;
      const right = x0 + ww + toward * t * W * 0.16 + t * ww * 0.6;
      const xx = Math.min(left, right) + rnd() * Math.abs(right - left);
      motes.push({
        left: Math.round(xx) * s,
        top: Math.round(yy) * s,
        width: s,
        height: s,
        animationDuration: `${6 + rnd() * 6}s`,
        animationDelay: `${-rnd() * 10}s`,
        ['--dx' as string]: `${Math.round((rnd() - 0.5) * 6) * s}px`,
        ['--dy' as string]: `${-Math.round(4 + rnd() * 8) * s}px`,
      });
    }
  }
  const lamps = [0.29, 0.71].map((f) => ({ left: Math.round(W * f) * s, top: (crownH + r(16)) * s, width: r(56) * s, height: r(44) * s }));
  return (
    <div className="ambience" aria-hidden="true">
      {lamps.map((st, i) => (
        <div key={'l' + i} className="lamp-glow" style={{ ...st, animationDelay: `${i * 1.3}s` }} />
      ))}
      {motes.map((st, i) => (
        <span key={i} className="mote" style={st} />
      ))}
    </div>
  );
}

/** Una planta rodadora que cruza de vez en cuando. */
export function Tumbleweed() {
  return (
    <div className="tumbleweed-lane" aria-hidden="true">
      <div className="tumbleweed">
        <div className="tumbleweed-spin">
          <Sprite name="tumbleweed" scale={4} />
        </div>
      </div>
    </div>
  );
}
