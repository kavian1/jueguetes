// Animaciones de Isla Cosecha: dados que ruedan, recursos que vuelan de las casillas a
// cada jugador, polvo al construir, el zorro, los tratos y los carteles de bonificación.
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Fx, GameView, Res, ResMap } from './types';
import { RES } from './types';
import { DEV_INFO, PLAYER_COLORS } from './rules';
import { spriteData } from '../pixel/Sprite';

export type Anchors = MutableRefObject<Map<string, HTMLElement>>;
type Pt = { x: number; y: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const tf = (p: Pt, s = 1, r = 0) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)`;

const list = (m: Partial<ResMap> | undefined): Res[] => {
  const out: Res[] = [];
  if (m) for (const r of RES) for (let i = 0; i < (m[r] ?? 0); i++) out.push(r);
  return out;
};

class Director {
  view: GameView | null = null;
  scale = 3;

  constructor(
    private layer: HTMLDivElement,
    private anchors: Anchors,
  ) {}

  get me() {
    return this.view?.me ?? '';
  }
  name(id?: string) {
    return this.view?.players.find((p) => p.id === id)?.name ?? '?';
  }
  color(id?: string) {
    const p = this.view?.players.find((q) => q.id === id);
    return p ? PLAYER_COLORS[p.color].hex : '#fff';
  }
  el(key: string) {
    return this.anchors.current.get(key) ?? null;
  }
  pt(key: string, fallback?: Pt): Pt {
    const el = this.el(key);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return fallback ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  player(id?: string): Pt {
    if (id && id === this.me) return this.pt('hand', this.pt('player:' + id));
    return this.pt('player:' + id);
  }
  get board() {
    return this.pt('board');
  }
  get bank() {
    return this.pt('bank', this.board);
  }

  node(cls: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = 'fx ' + cls;
    this.layer.appendChild(d);
    return d;
  }
  img(name: string, scale: number): HTMLImageElement {
    const s = spriteData(name, scale);
    const i = new Image();
    i.src = s.url;
    i.width = s.w * scale;
    i.height = s.h * scale;
    i.className = 'sprite';
    i.draggable = false;
    return i;
  }
  sprite(name: string, scale = this.scale): HTMLDivElement {
    const d = this.node('fx-sprite');
    d.appendChild(this.img(name, scale));
    return d;
  }
  anim(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
    try {
      return el.animate(frames, { fill: 'both', ...opts }).finished.then(
        () => undefined,
        () => undefined,
      );
    } catch {
      return Promise.resolve();
    }
  }

  async fly(el: HTMLElement, a: Pt, b: Pt, o: { dur?: number; arc?: number; s0?: number; s1?: number; delay?: number; spin?: number } = {}) {
    const { dur = 520, arc = 50, s0 = 1, s1 = 1, delay = 0, spin = 0 } = o;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - arc };
    el.style.transform = tf(a, s0);
    el.style.opacity = '0';
    await this.anim(
      el,
      [
        { transform: tf(a, s0 * 0.4), opacity: 0 },
        { transform: tf(a, s0 * 1.15), opacity: 1, offset: 0.12 },
        { transform: tf(mid, (s0 + s1) / 2, spin / 2), opacity: 1, offset: 0.55 },
        { transform: tf(b, s1, spin), opacity: 1, offset: 0.92 },
        { transform: tf(b, s1 * 0.6, spin), opacity: 0 },
      ],
      { duration: dur, delay, easing: 'cubic-bezier(.3,.6,.35,1)' },
    );
    el.remove();
  }

  text(p: Pt, text: string, cls: string, dy = -46, dur = 1150) {
    const el = this.node('fx-text ' + cls);
    el.textContent = text;
    this.anim(
      el,
      [
        { transform: tf(p, 0.5), opacity: 0 },
        { transform: tf({ x: p.x, y: p.y - 8 }, 1.25), opacity: 1, offset: 0.15 },
        { transform: tf({ x: p.x, y: p.y - 12 }, 1), opacity: 1, offset: 0.6 },
        { transform: tf({ x: p.x, y: p.y + dy }, 1), opacity: 0 },
      ],
      { duration: dur, easing: 'ease-out' },
    ).then(() => el.remove());
  }

  puffs(p: Pt, n: number, spread: number, name = 'dust') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.7;
      const d = spread * (0.6 + Math.random() * 0.5);
      const to = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.6 - 6 };
      const el = this.sprite(name, Math.max(2, this.scale - 1));
      this.anim(
        el,
        [
          { transform: tf(p, 0.5), opacity: 1 },
          { transform: tf(to, 1.2), opacity: 0 },
        ],
        { duration: 520 + Math.random() * 320, easing: 'cubic-bezier(.2,.8,.3,1)' },
      ).then(() => el.remove());
    }
  }

  sparks(p: Pt, n: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.5 + Math.random() * 0.6);
      const el = this.sprite('spark', 2);
      this.anim(
        el,
        [
          { transform: tf(p, 1), opacity: 1 },
          { transform: tf({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d + 16 }, 0.6), opacity: 0 },
        ],
        { duration: 460 + Math.random() * 300, easing: 'steps(6)' },
      ).then(() => el.remove());
    }
  }

  banner(html: { icon?: string; text: string; mine?: boolean; color?: string }, dur = 1500) {
    const el = this.node('fx-banner isla-banner' + (html.mine ? ' mine' : ''));
    if (html.color) el.style.setProperty('--pc', html.color);
    if (html.icon) el.appendChild(this.img(html.icon, 3));
    const t = document.createElement('span');
    t.textContent = html.text;
    el.appendChild(t);
    this.anim(
      el,
      [
        { transform: 'translate(-50%, -30px) scale(.7)', opacity: 0 },
        { transform: 'translate(-50%, 0) scale(1.06)', opacity: 1, offset: 0.14 },
        { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.24 },
        { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.82 },
        { transform: 'translate(-50%, -16px) scale(.96)', opacity: 0 },
      ],
      { duration: dur, easing: 'ease-out' },
    ).then(() => el.remove());
  }

  async dice(f: Fx) {
    const [a, b] = f.dice ?? [1, 1];
    const tray = this.el('dice');
    tray?.classList.add('rolling');
    const p = this.pt('dice', this.board);
    const from = { x: p.x - 120, y: p.y - 70 };
    const els = [0, 1].map(() => this.sprite('isla_die_1', this.scale + 1));
    const imgs = els.map((e) => e.firstChild as HTMLImageElement);
    let alive = true;
    (async () => {
      while (alive) {
        for (const im of imgs) im.src = spriteData('isla_die_' + (1 + Math.floor(Math.random() * 6)), 1).url;
        await sleep(70);
      }
    })();
    const targets = [
      { x: p.x - 26, y: p.y },
      { x: p.x + 26, y: p.y },
    ];
    await Promise.all(
      els.map((el, i) =>
        this.anim(
          el,
          [
            { transform: tf(from, 0.6, -90), opacity: 0 },
            { transform: tf({ x: (from.x + targets[i].x) / 2, y: targets[i].y - 40 }, 1.1, 200), opacity: 1, offset: 0.45 },
            { transform: tf(targets[i], 1, 340), opacity: 1, offset: 0.75 },
            { transform: tf({ x: targets[i].x, y: targets[i].y - 10 }, 1, 360), opacity: 1, offset: 0.87 },
            { transform: tf(targets[i], 1, 360), opacity: 1 },
          ],
          { duration: 720 + i * 90, easing: 'ease-out' },
        ),
      ),
    );
    alive = false;
    imgs[0].src = spriteData('isla_die_' + a, 1).url;
    imgs[1].src = spriteData('isla_die_' + b, 1).url;
    const sum = a + b;
    this.text({ x: p.x, y: p.y - 40 }, String(sum), sum === 7 ? 'dmg' : 'isla-sum', -30, 1000);
    await sleep(380);
    tray?.classList.remove('rolling');
    for (const el of els) this.anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => el.remove());
    if (sum === 7) this.text(this.board, '¡El zorro!', 'dmg', -40, 1300);
  }

  run(f: Fx): number {
    const me = this.me;
    switch (f.kind) {
      case 'turn': {
        if (this.view?.phase === 'over') return 0;
        if (f.player === me) {
          this.banner({ text: this.view?.phase === 'setup' ? '¡Te toca fundar!' : '¡Tu turno!', mine: true, icon: 'isla_flag_' + (this.view?.players.find((p) => p.id === me)?.color ?? 0) }, 1300);
          return 700;
        }
        return 150;
      }
      case 'dice':
        void this.dice(f);
        return 1150;
      case 'produce': {
        const from = this.pt('hex:' + f.hex, this.board);
        const to = this.player(f.player);
        for (let i = 0; i < (f.amount ?? 1); i++) void this.fly(this.sprite('res_' + f.res), from, to, { dur: 640, arc: 70, delay: i * 120, s0: 1.1, s1: 0.8 });
        this.el('hex:' + f.hex)?.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }],
          { duration: 360, easing: 'steps(3)' },
        );
        return 140;
      }
      case 'build': {
        const key = f.piece === 'camino' ? 'e:' + f.at : 'v:' + f.at;
        setTimeout(() => {
          const p = this.pt(key, this.board);
          this.puffs({ x: p.x, y: p.y + 6 }, f.piece === 'camino' ? 4 : 7, f.piece === 'camino' ? 16 : 24);
          if (f.piece !== 'camino') this.sparks({ x: p.x, y: p.y - 6 }, f.piece === 'villa' ? 10 : 6, 30);
        }, 260);
        return f.piece === 'camino' ? 260 : 480;
      }
      case 'buy': {
        const name = f.card ? 'dev_' + f.card : 'isla_cartas';
        void this.fly(this.sprite(f.player === me ? name : 'isla_cartas'), this.bank, this.player(f.player), { dur: 620, arc: 60 });
        return 450;
      }
      case 'dev': {
        if (!f.card) return 0;
        const el = this.node('isla-spot');
        el.appendChild(this.img('dev_' + f.card, 5));
        const cap = document.createElement('div');
        cap.className = 'isla-spot-title';
        cap.textContent = DEV_INFO[f.card].name;
        const who = document.createElement('div');
        who.className = 'isla-spot-who';
        who.textContent = f.player === me ? 'juegas' : this.name(f.player) + ' juega';
        el.prepend(who);
        el.appendChild(cap);
        el.style.setProperty('--pc', this.color(f.player));
        this.anim(
          el,
          [
            { transform: 'translate(-50%, -50%) scale(.4) rotate(-8deg)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1.08) rotate(2deg)', opacity: 1, offset: 0.18 },
            { transform: 'translate(-50%, -50%) scale(1) rotate(0)', opacity: 1, offset: 0.3 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.85 },
            { transform: 'translate(-50%, -60%) scale(.9)', opacity: 0 },
          ],
          { duration: 1500, easing: 'ease-out' },
        ).then(() => el.remove());
        return 1100;
      }
      case 'robber': {
        setTimeout(() => {
          const p = this.pt('fox', this.board);
          this.puffs(p, 8, 26, 'puff');
        }, 380);
        return 600;
      }
      case 'steal': {
        const icon = f.res ? 'res_' + f.res : 'isla_cartas';
        void this.fly(this.sprite(icon), this.player(f.target), this.player(f.player), { dur: 700, arc: 80 });
        if (f.target === me && f.res) this.text(this.player(me), '-1', 'dmg', -40);
        return 650;
      }
      case 'discard': {
        const items = list(f.give).slice(0, 5);
        const from = this.player(f.player);
        items.forEach((r, i) => void this.fly(this.sprite(f.player === me ? 'res_' + r : 'isla_cartas'), from, this.bank, { dur: 600, arc: 40, delay: i * 80 }));
        this.text(from, `-${f.amount ?? items.length}`, 'dmg', -40);
        return 450;
      }
      case 'trade': {
        const a = this.player(f.player);
        const b = this.player(f.target);
        list(f.give).forEach((r, i) => void this.fly(this.sprite('res_' + r), a, b, { dur: 760, arc: 60, delay: i * 90 }));
        list(f.get).forEach((r, i) => void this.fly(this.sprite('res_' + r), b, a, { dur: 760, arc: -20, delay: 120 + i * 90 }));
        return 800;
      }
      case 'bank': {
        const p = this.player(f.player);
        list(f.give).forEach((r, i) => void this.fly(this.sprite('res_' + r), p, this.bank, { dur: 560, arc: 40, delay: i * 70 }));
        list(f.get).forEach((r) => void this.fly(this.sprite('res_' + r), this.bank, p, { dur: 600, arc: 50, delay: 380 }));
        return 650;
      }
      case 'gain': {
        const from = f.target ? this.player(f.target) : this.bank;
        list(f.get)
          .slice(0, 8)
          .forEach((r, i) => void this.fly(this.sprite('res_' + r), from, this.player(f.player), { dur: 640, arc: 60, delay: i * 90 }));
        return 450;
      }
      case 'bonus': {
        const icon = f.bonus === 'sendero' ? 'isla_sendero' : 'isla_jauria';
        const label = f.bonus === 'sendero' ? 'Gran Sendero' : 'Gran Jauría';
        this.banner({ icon, text: `${f.player === me ? '¡Tienes' : this.name(f.player) + ' tiene'} el ${label}! +2`, color: this.color(f.player) }, 1900);
        this.sparks(this.player(f.player), 14, 40);
        return 1200;
      }
      case 'win': {
        for (let i = 0; i < 40; i++) {
          const el = this.node('isla-confetti');
          el.style.background = ['#e8484d', '#3a86ec', '#f5c43a', '#5cbc6a', '#a25ce0', '#ff7aa8'][i % 6];
          const x = Math.random() * window.innerWidth;
          this.anim(
            el,
            [
              { transform: `translate(${x}px, -20px) rotate(0deg)` },
              { transform: `translate(${x + (Math.random() - 0.5) * 160}px, ${window.innerHeight + 20}px) rotate(${Math.random() * 720}deg)` },
            ],
            { duration: 1800 + Math.random() * 1600, delay: Math.random() * 600, easing: 'cubic-bezier(.3,.1,.6,1)' },
          ).then(() => el.remove());
        }
        return 0;
      }
    }
    return 0;
  }
}

interface Props {
  view: GameView;
  anchors: Anchors;
  scale: number;
}

/** Capa transparente por encima de la mesa donde ocurren todas las animaciones. */
export function IslaFx({ view, anchors, scale }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const director = useRef<Director | null>(null);
  const seen = useRef(-1);
  const queue = useRef<Fx[]>([]);
  const running = useRef(false);

  if (director.current) {
    director.current.view = view;
    director.current.scale = scale;
  }

  useEffect(() => {
    director.current = new Director(layer.current!, anchors);
    director.current.view = view;
    director.current.scale = scale;
    return () => {
      queue.current = [];
      layer.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fx = view.fx;
  useEffect(() => {
    const maxId = fx.reduce((m, f) => Math.max(m, f.id), 0);
    const first = seen.current < 0;
    // al entrar a mitad de partida no se reproducen efectos viejos (salvo los de la fundación)
    if (first) seen.current = view.phase === 'setup' ? 0 : maxId;
    const fresh = fx.filter((f) => f.id > seen.current);
    if (!fresh.length) return;
    seen.current = maxId;
    if (reducedMotion()) return;
    queue.current.push(...fresh);
    const pump = async () => {
      if (running.current) return;
      running.current = true;
      if (first) await sleep(450);
      while (queue.current.length) {
        const f = queue.current.shift()!;
        let wait = 0;
        try {
          wait = director.current?.run(f) ?? 0;
        } catch {
          wait = 0;
        }
        const backlog = queue.current.length;
        await sleep(backlog > 10 ? wait * 0.25 : backlog > 4 ? wait * 0.6 : wait);
      }
      running.current = false;
    };
    void pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  return <div className="fx-layer" ref={layer} aria-hidden="true" />;
}
