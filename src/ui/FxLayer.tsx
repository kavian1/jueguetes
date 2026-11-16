import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { Card, Fx, PublicPlayer } from '../game/types';
import { CARD_DEFS, SUIT_SYMBOL, rankLabel } from '../game/cards';
import { ROLE_INFO } from '../game/characters';
import { spriteData } from '../pixel/Sprite';

export type Anchors = MutableRefObject<Map<string, HTMLElement>>;
type Pt = { x: number; y: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const tf = (p: Pt, s = 1, r = 0) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)`;
const STEP = 'steps(1, end)';

const FILTERS = {
  red: 'brightness(1.6) sepia(1) saturate(9) hue-rotate(-38deg)',
  green: 'brightness(1.3) sepia(1) saturate(5) hue-rotate(55deg)',
  gold: 'brightness(1.5) sepia(1) saturate(4)',
};

/** Dirige todos los efectos: crea elementos temporales en una capa fija y los anima con la Web Animations API. */
class Director {
  me = '';
  players: PublicPlayer[] = [];

  constructor(
    private layer: HTMLDivElement,
    private anchors: Anchors,
    private shakeTarget: RefObject<HTMLElement>,
  ) {}

  // ── posiciones ──

  name(id?: string) {
    return this.players.find((p) => p.id === id)?.name ?? '?';
  }
  el(key: string): HTMLElement | null {
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
  seat(id: string) {
    return this.pt('seat:' + id);
  }
  hand(id: string) {
    return this.pt('hand:' + id, this.seat(id));
  }
  play(id: string) {
    return this.pt('play:' + id, this.seat(id));
  }
  get deck() {
    return this.pt('deck');
  }
  get discard() {
    return this.pt('discard', this.deck);
  }
  get center() {
    return this.pt('center', this.discard);
  }

  // ── piezas ──

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
    i.className = 'sprite' + (s.hires ? ' hires' : '');
    i.draggable = false;
    return i;
  }
  sprite(name: string, scale: number): HTMLDivElement {
    const d = this.node('fx-sprite');
    d.appendChild(this.img(name, scale));
    return d;
  }
  card(card?: Card): HTMLDivElement {
    if (!card) {
      const d = this.node('fx-card back');
      const em = document.createElement('span');
      em.className = 'fx-card-emblem';
      em.appendChild(this.img('duelo', 1));
      d.appendChild(em);
      return d;
    }
    const def = CARD_DEFS[card.kind];
    const d = this.node('fx-card ' + def.color);
    const name = document.createElement('span');
    name.className = 'fx-card-name';
    name.textContent = def.name;
    const val = document.createElement('span');
    val.className = 'fx-card-val' + (card.suit === 'H' || card.suit === 'D' ? ' red' : '');
    val.textContent = rankLabel(card.rank) + SUIT_SYMBOL[card.suit];
    const art = document.createElement('span');
    art.className = 'fx-card-art';
    art.appendChild(this.img(card.kind, 2));
    d.append(name, val, art);
    return d;
  }
  place(el: HTMLElement, p: Pt, s = 1, r = 0) {
    el.style.transform = tf(p, s, r);
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

  // ── efectos básicos ──

  async fly(el: HTMLElement, a: Pt, b: Pt, o: { dur?: number; arc?: number; s0?: number; s1?: number; r0?: number; r1?: number } = {}) {
    const { dur = 450, arc = 60, s0 = 1, s1 = 1, r0 = 0, r1 = 0 } = o;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - arc };
    await this.anim(
      el,
      [{ transform: tf(a, s0, r0) }, { transform: tf(mid, (s0 + s1) / 2, (r0 + r1) / 2), offset: 0.5 }, { transform: tf(b, s1, r1) }],
      { duration: dur, easing: 'cubic-bezier(.3,.6,.35,1)' },
    );
  }

  text(p: Pt, text: string, cls: string, dy = -50, dur = 1100) {
    const el = this.node('fx-text ' + cls);
    el.textContent = text;
    this.anim(
      el,
      [
        { transform: tf(p, 0.5), opacity: 0 },
        { transform: tf({ x: p.x, y: p.y - 8 }, 1.2), opacity: 1, offset: 0.15 },
        { transform: tf({ x: p.x, y: p.y - 12 }, 1), opacity: 1, offset: 0.6 },
        { transform: tf({ x: p.x, y: p.y + dy }, 1), opacity: 0 },
      ],
      { duration: dur, easing: 'ease-out' },
    ).then(() => el.remove());
  }

  burst(p: Pt, name: string, scale: number, dur = 380, grow = 1.6) {
    const el = this.sprite(name, scale);
    this.anim(
      el,
      [
        { transform: tf(p, 0.3), opacity: 1 },
        { transform: tf(p, 1.1), opacity: 1, offset: 0.3 },
        { transform: tf(p, grow), opacity: 0 },
      ],
      { duration: dur, easing: 'steps(5)' },
    ).then(() => el.remove());
  }

  puffs(p: Pt, n: number, spread: number, name = 'puff', scale = 3) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
      const d = spread * (0.6 + Math.random() * 0.5);
      const to = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7 - 12 };
      const el = this.sprite(name, scale);
      this.anim(
        el,
        [
          { transform: tf(p, 0.5), opacity: 1 },
          { transform: tf(to, 1.3), opacity: 0 },
        ],
        { duration: 600 + Math.random() * 350, easing: 'cubic-bezier(.2,.8,.3,1)' },
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
          { transform: tf({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d + 20 }, 0.6), opacity: 0 },
        ],
        { duration: 450 + Math.random() * 300, easing: 'steps(6)' },
      ).then(() => el.remove());
    }
  }

  shake(el: HTMLElement | null, mag = 6, dur = 420) {
    if (!el) return;
    const k = (x: number, y: number) => ({ transform: `translate(${x}px, ${y}px)`, easing: STEP });
    this.anim(el, [k(0, 0), k(-mag, mag / 3), k(mag, -mag / 3), k(-mag * 0.6, 0), k(mag * 0.6, mag / 4), k(-mag * 0.3, 0), k(0, 0)], { duration: dur, fill: 'none' });
  }

  flash(el: HTMLElement | null, color: keyof typeof FILTERS) {
    if (!el) return;
    const on = { filter: FILTERS[color], easing: STEP };
    const off = { filter: 'none', easing: STEP };
    this.anim(el, [on, off, on, off], { duration: 420, fill: 'none' });
  }

  screen(color: string, peak = 0.6, dur = 450) {
    const el = this.node('fx-screen');
    el.style.background = color;
    this.anim(el, [{ opacity: peak }, { opacity: 0 }], { duration: dur, easing: 'ease-out' }).then(() => el.remove());
  }

  vignette() {
    const el = this.node('fx-vignette');
    this.anim(el, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' }).then(() => el.remove());
  }

  heart(id: string, lost: boolean) {
    const p = this.pt('hearts:' + id, this.seat(id));
    const el = this.sprite('heart', 3);
    const frames = lost
      ? [
          { transform: tf(p, 1), opacity: 1 },
          { transform: tf({ x: p.x, y: p.y - 22 }, 1.7, -14), opacity: 1, offset: 0.35 },
          { transform: tf({ x: p.x + 14, y: p.y + 36 }, 1.1, 50), opacity: 0 },
        ]
      : [
          { transform: tf({ x: p.x, y: p.y + 24 }, 0.4), opacity: 0 },
          { transform: tf({ x: p.x, y: p.y - 16 }, 1.8), opacity: 1, offset: 0.5 },
          { transform: tf(p, 1), opacity: 0 },
        ];
    this.anim(el, frames, { duration: 850, easing: 'ease-out' }).then(() => el.remove());
  }

  banner(content: HTMLElement[], cls: string, dur: number) {
    const el = this.node('fx-banner ' + cls);
    el.append(...content);
    this.anim(
      el,
      [
        { transform: 'translate(-50%, -200%)' },
        { transform: 'translate(-50%, 0)', offset: 0.14, easing: 'ease-out' },
        { transform: 'translate(-50%, 0)', offset: 0.82 },
        { transform: 'translate(-50%, -200%)' },
      ],
      { duration: dur },
    ).then(() => el.remove());
  }

  tracer(a: Pt, b: Pt) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const line = this.node('fx-tracer');
    line.style.width = len + 'px';
    line.style.transform = `translate(${a.x}px, ${a.y}px) rotate(${ang}deg)`;
    this.anim(
      line,
      [
        { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.5 },
        { clipPath: 'inset(0 0 0 100%)', opacity: 0.3 },
      ],
      { duration: 320, easing: 'linear' },
    ).then(() => line.remove());
    const bullet = this.node('fx-bullet');
    this.anim(
      bullet,
      [
        { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) rotate(${ang}deg)` },
        { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) rotate(${ang}deg)` },
      ],
      { duration: 190, easing: 'linear' },
    ).then(() => bullet.remove());
  }

  caption(p: Pt, text: string, ms: number) {
    const el = this.node('fx-caption');
    el.textContent = text;
    this.anim(
      el,
      [
        { transform: tf({ x: p.x, y: p.y + 10 }), opacity: 0 },
        { transform: tf(p), opacity: 1, offset: 0.1 },
        { transform: tf(p), opacity: 1, offset: 0.88 },
        { transform: tf(p), opacity: 0 },
      ],
      { duration: ms },
    ).then(() => el.remove());
  }

  aim(id: string) {
    const p = this.seat(id);
    const el = this.sprite('crosshair', 4);
    this.anim(
      el,
      [
        { transform: tf(p, 2.4, 0), opacity: 0 },
        { transform: tf(p, 1, 90), opacity: 1, offset: 0.35 },
        { transform: tf(p, 1, 90), opacity: 1, offset: 0.8 },
        { transform: tf(p, 0.8, 90), opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out' },
    ).then(() => el.remove());
  }

  // ── un efecto por cada evento del motor; devuelve cuánto esperar antes del siguiente ──

  run(f: Fx): number {
    const me = this.me;
    const mine = (id?: string) => id === me;
    switch (f.kind) {
      case 'turn': {
        const p = this.players.find((x) => x.id === f.player);
        if (!p) return 0;
        const label = document.createElement('span');
        label.textContent = mine(p.id) ? '¡Tu turno!' : `Turno de ${p.name}`;
        this.banner([this.img(p.character, mine(p.id) ? 3 : 2), label], mine(p.id) ? 'mine' : '', mine(p.id) ? 1700 : 1250);
        this.flash(this.el('seat:' + p.id), 'gold');
        return 300;
      }

      case 'draw': {
        const deal = f.reason === 'deal';
        const n = Math.min(f.amount ?? 1, 8);
        const from = this.deck;
        const to = this.hand(f.player);
        const far = !mine(f.player);
        const gap = deal ? 55 : 110;
        for (let i = 0; i < n; i++)
          setTimeout(() => {
            const c = this.card();
            this.place(c, from);
            this.fly(c, from, to, { dur: deal ? 380 : 480, arc: 50, s0: 0.9, s1: far ? 0.5 : 1.15, r0: -10, r1: far ? 0 : 6 }).then(() => c.remove());
          }, i * gap);
        return deal ? 120 + n * 30 : 220 + n * 110;
      }

      case 'discard': {
        const from = f.from === 'inplay' ? this.play(f.player) : this.hand(f.player);
        const n = f.card ? 1 : Math.min(f.amount ?? 1, 6);
        for (let i = 0; i < n; i++)
          setTimeout(() => {
            const c = this.card(f.card);
            this.place(c, from);
            this.fly(c, from, this.discard, { dur: 420, arc: 40, s0: mine(f.player) ? 1 : 0.6, s1: 0.95, r0: 12, r1: -4 }).then(() => c.remove());
          }, i * 90);
        return 240 + n * 90;
      }

      case 'play': {
        if (!f.card) return 0;
        const from = this.hand(f.player);
        const center = this.center;
        const c = this.card(f.card);
        this.place(c, from);
        void (async () => {
          await this.fly(c, from, center, { dur: 380, arc: 50, s0: mine(f.player) ? 1 : 0.55, s1: 2, r0: -8, r1: 0 });
          this.caption({ x: center.x, y: center.y + 82 }, f.target ? `${this.name(f.player)} → ${this.name(f.target)}` : this.name(f.player), 1150);
          if (f.target && f.card!.kind !== 'duelo') this.aim(f.target);
          await sleep(950);
          await this.fly(c, center, this.discard, { dur: 320, arc: 10, s0: 2, s1: 0.95 });
          c.remove();
        })();
        return 520;
      }

      case 'equip': {
        if (!f.card) return 0;
        const target = f.target ?? f.player;
        const from = this.hand(f.player);
        const to = this.play(target);
        const c = this.card(f.card);
        this.place(c, from);
        const kind = f.card.kind;
        void (async () => {
          await this.fly(c, from, to, { dur: 560, arc: 80, s0: mine(f.player) ? 1 : 0.55, s1: 0.7, r0: -12, r1: 0 });
          c.remove();
          this.puffs(to, 4, 26, 'dust', 2);
          if (kind === 'calabozo') this.jail(target);
          if (kind === 'dinamita') this.sparks(to, 6, 30);
        })();
        return kind === 'calabozo' ? 1300 : 650;
      }

      case 'steal': {
        const target = f.target!;
        const from = f.from === 'inplay' ? this.play(target) : this.hand(target);
        const to = this.hand(f.player);
        const n = f.card ? 1 : Math.min(f.amount ?? 1, 6);
        this.puffs(from, 3, 20, 'puff', 2);
        this.text(this.seat(target), f.amount ? '¡Al saco!' : '¡Atraco!', 'info', -40, 900);
        for (let i = 0; i < n; i++)
          setTimeout(() => {
            const c = this.card(f.card);
            this.place(c, from);
            this.fly(c, from, to, { dur: 560, arc: 90, s0: 0.65, s1: mine(f.player) ? 1.1 : 0.55, r1: 14 }).then(() => c.remove());
          }, i * 100);
        return 650 + n * 100;
      }

      case 'lasso': {
        const a = this.seat(f.player);
        const b = this.seat(f.target!);
        const rope = this.sprite('travesura', 3);
        this.place(rope, a);
        void (async () => {
          await this.anim(
            rope,
            [
              { transform: tf(a, 0.6, 0) },
              { transform: tf({ x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 90 }, 1.2, 360) },
              { transform: tf(b, 1, 720) },
            ],
            { duration: 560, easing: 'ease-in-out' },
          );
          rope.remove();
          this.shake(this.el('seat:' + f.target), 6, 320);
          if (f.card) {
            const from = f.from === 'inplay' ? this.play(f.target!) : this.hand(f.target!);
            const c = this.card(f.card);
            this.place(c, from);
            await this.fly(c, from, this.discard, { dur: 460, arc: 60, s0: 0.65, s1: 0.95, r0: 25 });
            c.remove();
          }
        })();
        return 1050;
      }

      case 'shot': {
        const a = this.seat(f.player);
        const b = this.seat(f.target!);
        this.burst(a, 'disparo', 3, 260, 1.5);
        this.text({ x: a.x, y: a.y - 34 }, '¡PUM!', 'pum', -16, 650);
        this.tracer(a, b);
        this.shake(this.el('seat:' + f.player), 3, 200);
        setTimeout(() => this.puffs(b, 3, 18, 'puff', 2), 200);
        return 430;
      }

      case 'dodge': {
        const el = this.el('seat:' + f.player);
        const p = this.seat(f.player);
        if (el)
          this.anim(
            el,
            [
              { transform: 'translateX(0)' },
              { transform: 'translateX(24px)', offset: 0.22 },
              { transform: 'translateX(24px)', offset: 0.62 },
              { transform: 'translateX(0)' },
            ],
            { duration: 560, easing: 'ease-out', fill: 'none' },
          );
        this.text({ x: p.x, y: p.y - 24 }, f.reason === 'barril' ? '¡Barril!' : '¡Esquiva!', 'dodge', -40, 1050);
        if (f.reason === 'barril') this.burst(this.play(f.player), 'barril', 3, 650, 1.4);
        if (f.card) {
          const from = this.hand(f.player);
          const c = this.card(f.card);
          this.place(c, from);
          this.fly(c, from, this.discard, { dur: 420, arc: 40, s0: mine(f.player) ? 1 : 0.6, s1: 0.95, r0: 10 }).then(() => c.remove());
        }
        return 620;
      }

      case 'damage': {
        const el = this.el('seat:' + f.player);
        const p = this.seat(f.player);
        const n = f.amount ?? 1;
        this.flash(el, 'red');
        this.shake(el, n >= 3 ? 12 : 8, 460);
        this.burst(p, 'spark', 5, 300, 2.2);
        for (let i = 0; i < n; i++) setTimeout(() => this.heart(f.player, true), i * 160);
        this.text({ x: p.x, y: p.y - 10 }, `-${n}`, 'dmg', -64, 1250);
        if (mine(f.player)) {
          this.vignette();
          this.shake(this.shakeTarget.current, 7, 380);
        }
        return 650;
      }

      case 'heal': {
        const el = this.el('seat:' + f.player);
        const p = this.seat(f.player);
        this.flash(el, 'green');
        for (let i = 0; i < 6; i++) {
          const s = this.sprite('plus', 2);
          const sx = p.x + (Math.random() - 0.5) * 70;
          this.anim(
            s,
            [
              { transform: tf({ x: sx, y: p.y + 24 }, 0.6), opacity: 0 },
              { transform: tf({ x: sx, y: p.y - 6 }, 1), opacity: 1, offset: 0.3 },
              { transform: tf({ x: sx, y: p.y - 66 }, 0.8), opacity: 0 },
            ],
            { duration: 950, delay: i * 80, easing: 'ease-out' },
          ).then(() => s.remove());
        }
        this.heart(f.player, false);
        this.text({ x: p.x, y: p.y - 10 }, `+${f.amount ?? 1}`, 'heal', -60, 1200);
        return 520;
      }

      case 'check': {
        if (!f.card) return 0;
        const center = this.center;
        const deck = this.deck;
        const back = this.card();
        this.place(back, deck);
        const card = f.card;
        const ok = !!f.success;
        void (async () => {
          await this.fly(back, deck, center, { dur: 320, arc: 30, s0: 0.9, s1: 2 });
          await this.anim(back, [{ transform: tf(center, 2) + ' scaleX(1)' }, { transform: tf(center, 2) + ' scaleX(0)' }], { duration: 130, easing: 'ease-in' });
          back.remove();
          const face = this.card(card);
          face.style.transform = tf(center, 2) + ' scaleX(0)';
          await this.anim(face, [{ transform: tf(center, 2) + ' scaleX(0)' }, { transform: tf(center, 2) + ' scaleX(1)' }], { duration: 130, easing: 'ease-out' });
          const stamp = this.node('fx-stamp ' + (ok ? 'ok' : 'ko'));
          stamp.textContent = ok ? '✔' : '✘';
          const sp = { x: center.x + 46, y: center.y - 60 };
          this.anim(stamp, [{ transform: tf(sp, 2.6, -24), opacity: 0 }, { transform: tf(sp, 1, -8), opacity: 1 }], { duration: 200, easing: 'ease-in' });
          this.caption({ x: center.x, y: center.y + 82 }, `${this.name(f.player)} desenfunda · ${f.reason}`, 1000);
          if (ok) this.sparks(sp, 6, 30);
          await sleep(850);
          stamp.remove();
          await this.fly(face, center, this.discard, { dur: 300, arc: 10, s0: 2, s1: 0.95 });
          face.remove();
        })();
        return 1250;
      }

      case 'explode': {
        const p = this.seat(f.player);
        this.screen('#fff4d0', 0.85, 380);
        this.burst(p, 'disparo', 7, 620, 2.3);
        setTimeout(() => this.burst(p, 'disparo', 5, 520, 1.9), 140);
        this.puffs(p, 10, 100, 'puff', 4);
        this.sparks(p, 14, 120);
        this.shake(this.shakeTarget.current, 14, 620);
        this.text({ x: p.x, y: p.y - 44 }, '¡BUM!', 'boom', -30, 1300);
        return 900;
      }

      case 'pass': {
        const a = this.play(f.player);
        const b = this.play(f.target!);
        const d = this.sprite('dinamita', 3);
        this.place(d, a);
        this.fly(d, a, b, { dur: 680, arc: 100, r1: 360 }).then(() => {
          d.remove();
          this.sparks(b, 6, 26);
        });
        return 760;
      }

      case 'elim': {
        const p = this.seat(f.player);
        this.puffs(p, 7, 55, 'dust', 3);
        const t = this.sprite('tomb', 4);
        this.anim(
          t,
          [
            { transform: tf({ x: p.x, y: p.y + 44 }, 0.5), opacity: 0 },
            { transform: tf(p, 1.15), opacity: 1, offset: 0.35 },
            { transform: tf(p, 1), opacity: 1, offset: 0.85 },
            { transform: tf(p, 1), opacity: 0 },
          ],
          { duration: 1900, easing: 'ease-out' },
        ).then(() => t.remove());
        this.text({ x: p.x, y: p.y - 56 }, `¡Fuera! Era ${f.role ? ROLE_INFO[f.role].name : '?'}`, 'elim', -20, 1900);
        if (mine(f.player)) this.screen('#1d1a24', 0.6, 900);
        return 1300;
      }

      case 'store': {
        const n = f.amount ?? 1;
        const c0 = this.center;
        for (let i = 0; i < n; i++)
          setTimeout(() => {
            const c = this.card();
            this.place(c, this.deck);
            this.fly(c, this.deck, { x: c0.x + (i - (n - 1) / 2) * 34, y: c0.y }, { dur: 420, arc: 40, s1: 1.2 }).then(() => c.remove());
          }, i * 90);
        return 300 + n * 90;
      }

      case 'pick': {
        const from = this.pt('store', this.center);
        const to = this.hand(f.player);
        const c = this.card(f.card);
        this.place(c, from);
        this.fly(c, from, to, { dur: 480, arc: 60, s0: 1.1, s1: mine(f.player) ? 1.1 : 0.55 }).then(() => c.remove());
        return 450;
      }

      case 'duel': {
        const el = this.node('fx-duel');
        const icon = document.createElement('div');
        icon.className = 'fx-duel-icon';
        icon.appendChild(this.img('duelo', 5));
        const title = document.createElement('div');
        title.className = 'fx-duel-title';
        title.textContent = '¡Duelo!';
        const names = document.createElement('div');
        names.className = 'fx-duel-names';
        names.textContent = `${this.name(f.player)}  vs  ${this.name(f.target)}`;
        el.append(icon, title, names);
        this.anim(
          el,
          [
            { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.18 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.28 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.85 },
            { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
          ],
          { duration: 1400 },
        ).then(() => el.remove());
        this.flash(this.el('seat:' + f.player), 'gold');
        this.flash(this.el('seat:' + f.target), 'gold');
        return 1000;
      }
    }
    return 0;
  }

  jail(id: string) {
    const p = this.seat(id);
    const el = this.sprite('calabozo', 5);
    this.anim(
      el,
      [
        { transform: tf({ x: p.x, y: p.y - 150 }), opacity: 1 },
        { transform: tf(p), opacity: 1, offset: 0.4, easing: 'ease-out' },
        { transform: tf({ x: p.x, y: p.y - 14 }), opacity: 1, offset: 0.52, easing: 'ease-in' },
        { transform: tf(p), opacity: 1, offset: 0.64 },
        { transform: tf(p), opacity: 1, offset: 0.9 },
        { transform: tf(p), opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-in' },
    ).then(() => el.remove());
    setTimeout(() => this.shake(this.el('seat:' + id), 5, 300), 520);
  }
}

interface Props {
  fx: Fx[];
  round: number;
  me: string;
  players: PublicPlayer[];
  anchors: Anchors;
  shakeRef: RefObject<HTMLElement>;
}

/** Capa transparente por encima de la mesa donde ocurren todas las animaciones. */
export function FxLayer({ fx, round, me, players, anchors, shakeRef }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const director = useRef<Director | null>(null);
  const seen = useRef(-1);
  const queue = useRef<Fx[]>([]);
  const running = useRef(false);

  if (director.current) {
    director.current.me = me;
    director.current.players = players;
  }

  useEffect(() => {
    director.current = new Director(layer.current!, anchors, shakeRef);
    director.current.me = me;
    director.current.players = players;
    return () => {
      queue.current = [];
      layer.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maxId = fx.reduce((m, f) => Math.max(m, f.id), 0);
    // al entrar a mitad de partida no se reproducen efectos viejos (salvo el reparto inicial)
    const first = seen.current < 0;
    if (first) seen.current = round <= 1 ? 0 : maxId;
    const fresh = fx.filter((f) => f.id > seen.current);
    if (!fresh.length) return;
    seen.current = maxId;
    if (reducedMotion()) return;
    queue.current.push(...fresh);
    const pump = async () => {
      if (running.current) return;
      running.current = true;
      // la primera vez, espera a que la mesa esté pintada para saber dónde está cada cosa
      if (first) await sleep(400);
      while (queue.current.length) {
        const f = queue.current.shift()!;
        let wait = 0;
        try {
          wait = director.current?.run(f) ?? 0;
        } catch {
          wait = 0;
        }
        const backlog = queue.current.length;
        await sleep(backlog > 8 ? wait * 0.25 : backlog > 3 ? wait * 0.6 : wait);
      }
      running.current = false;
    };
    void pump();
  }, [fx, round]);

  return <div className="fx-layer" ref={layer} aria-hidden="true" />;
}
