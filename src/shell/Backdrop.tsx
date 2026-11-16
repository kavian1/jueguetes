import { useEffect, useRef } from 'react';
import { worldScale } from '../pixel/world';

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Fondo pixelado a pantalla completa, pintado al tamaño de píxel del mundo. */
export function Backdrop({ paint, className, scale }: { paint: Paint; className?: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const setup = () => {
      const s = scale ?? worldScale();
      const W = Math.ceil(window.innerWidth / s);
      const H = Math.ceil(window.innerHeight / s);
      if (!W || !H) return;
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = W * s + 'px';
      canvas.style.height = H * s + 'px';
      paint(ctx, W, H);
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
  }, [paint, scale]);
  return <canvas ref={ref} className={'scene-bg ' + (className ?? '')} aria-hidden="true" />;
}

/** Lienzo pequeño (portadas, miniaturas) pintado una vez a su tamaño lógico. */
export function PixelCanvas({ paint, w, h, scale, className }: { paint: Paint; w: number; h: number; scale: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!, w, h);
  }, [paint, w, h]);
  return <canvas ref={ref} className={'pixel-canvas ' + (className ?? '')} style={{ width: w * scale, height: h * scale }} aria-hidden="true" />;
}
