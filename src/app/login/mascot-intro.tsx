"use client";

import { useEffect, useRef } from "react";
import { BirdFace } from "./bird-face";
import "./mascot.css";

/*
 * The sign-in page's bird: a cheeky, playful little character. Played once per browser session:
 *   A  bursts in from the left, throws a loop-the-loop out of pure joy, lands a bit dizzy on the "t"
 *   B  hops letter to letter (each letter squashes under it), bounces twice on the tall "b" like a
 *      trampoline with a spin, overshoots the "l" and teeters, saves itself and laughs
 *   C  turns to the big sky bird and pulls a face (wink, tongue out). The big bird startles ("!"),
 *      glances back, winds up and flies off the right edge; the little bird giggles
 *   D  takes off with a barrel roll, glides to the split between the columns (the seam under the sky
 *      on phones), flares to a stop, turns to the visitor, beams and winks
 *   E  hovers there: wing beats then a glide, blinking, looking around and now and then up to mischief.
 *      It watches you type your email, and covers its eyes for the password (peeking now and then).
 * Transforms and opacity only, via the Web Animations API (no library). The form is never moved or
 * covered and sign-in never waits on it; reduced-motion visitors get the still page.
 */

type P = { x: number; y: number };
type Lang = "en" | "ta";
type Face = "open" | "joy" | "wink" | "o" | "dizzy" | "shut" | "peek";

/* Letter slices of the 900 × 252 wordmark images and the point on top of each letter to stand on. */
const LETTERS: Record<Lang, { s: number; e: number; x: number; y: number }[]> = {
  en: [
    { s: 0, e: 117, x: 58, y: 75 }, // t
    { s: 117, e: 273, x: 150, y: 57 }, // h
    { s: 273, e: 415, x: 344, y: 109 }, // a
    { s: 415, e: 571, x: 455, y: 27 }, // b
    { s: 571, e: 707, x: 639, y: 109 }, // a
    { s: 707, e: 838, x: 772, y: 108 }, // a
    { s: 838, e: 900, x: 869, y: 58 }, // l
  ],
  ta: [
    { s: 120, e: 320, x: 225, y: 59 }, // த
    { s: 320, e: 455, x: 336, y: 62 }, // ப
    { s: 455, e: 780, x: 600, y: 69 }, // ால்
  ],
};
/* The tall letter it bounces on like a trampoline. */
const BOUNCY: Record<Lang, number> = { en: 3, ta: 2 };

const ART_RATIO = 354 / 640;
const BELLY = { x: 0.74, y: 0.8 }; // where it stands, as a fraction of the 640 × 354 art
const SEEN_KEY = "thabaal-intro-v2";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const bez = (a: P, b: P, c: P, d: P, t: number): P => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

class Skip extends Error {}

export function MascotIntro({ lang }: { lang: Lang }) {
  const host = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);
  const skipRef = useRef<() => void>(() => {});

  // A language switch mid-sequence would swap the wordmark under the hopping bird: jump to the end.
  useEffect(() => {
    if (langRef.current !== lang) skipRef.current();
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    const mascot = host.current;
    const page = mascot?.closest<HTMLElement>(".thabaal-page");
    const site = page?.closest<HTMLElement>(".thabaal-site");
    if (!mascot || !page || !site) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      site.classList.add("tm-still");
      return () => site.classList.remove("tm-still");
    }

    const pose = mascot.querySelector<HTMLElement>(".tm-pose")!;
    const face = mascot.querySelector<HTMLElement>(".tm-face")!;
    const idle = mascot.querySelector<HTMLElement>(".tm-idle")!;
    const watch = mascot.querySelector<HTMLElement>(".tm-watchwrap")!;
    const wing = mascot.querySelector<HTMLElement>(".tm-wing")!;
    const svg = mascot.querySelector<SVGSVGElement>(".bf")!;
    const words = page.querySelector<HTMLElement>(".thabaal-brand .words");
    const mark = page.querySelector<HTMLElement>(".thabaal-brand .mark");
    const sky = page.querySelector<HTMLElement>(".thabaal-right");
    const bigBird = page.querySelector<HTMLElement>(".thabaal-birdpos");
    const bigFace = bigBird?.querySelector<SVGSVGElement>(".bf") ?? null;
    const bigFloat = bigBird?.querySelector<HTMLElement>(".thabaal-birdfloat") ?? null;
    const form = page.querySelector<HTMLElement>(".thabaal-form");
    if (!words || !mark || !sky || !bigBird) return;

    let dead = false;
    let introDone = false;
    let busy = false; // an idle trick or form reaction is playing
    const live = new Set<Animation>();
    const timers = new Set<number>();
    let letterLayer: HTMLDivElement | null = null;
    let w = 110;
    let pos: P = { x: -400, y: 0 };
    let facing: 1 | -1 = 1; // 1 = faces right, like the art
    let mode: "free" | "email" | "password" = "free";

    const track = <A extends Animation>(a: A) => {
      live.add(a);
      a.finished.then(() => live.delete(a), () => live.delete(a));
      return a;
    };
    const anim = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => track(el.animate(k, { fill: "forwards", ...o }));
    const done = (...as: Animation[]) => Promise.all(as.map((a) => a.finished));
    /* Bake an element's finished, filling animations into its style so later style changes apply. */
    const commit = (el: HTMLElement) =>
      el.getAnimations().forEach((a) => {
        try {
          a.commitStyles();
        } catch {}
        a.cancel();
      });
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!dead) fn();
      }, ms);
      timers.add(id);
    };
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          r();
        }, ms);
        timers.add(id);
      });
    let skipped = false; // the intro was cut short (resize, language switch)
    const alive = () => {
      if (dead || skipped) throw new Skip();
    };

    /* ── Faces ── */
    const setFace = (f: Face, el: SVGSVGElement | null = svg) => el?.setAttribute("data-face", f);
    const eyes = (el: SVGSVGElement | null = svg) => el?.querySelectorAll<SVGGElement>(".bf-l, .bf-r") ?? [];
    const blink = (el: SVGSVGElement | null = svg) =>
      eyes(el).forEach((e) =>
        e.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.08)", offset: 0.45 }, { transform: "scaleY(1)" }], { duration: 170, easing: "ease-in-out" }),
      );
    const lookTo = (dx: number, dy: number, ms = 220) => {
      const g = svg.querySelector(".bf-eyes");
      if (g) anim(g, [{ transform: `translate(${dx}px, ${dy}px)` }], { duration: ms, easing: "cubic-bezier(.3,1.4,.6,1)" });
    };

    /* ── Geometry, in the page's own coordinates ── */
    const rel = (r: DOMRect) => {
      const p = page.getBoundingClientRect();
      return new DOMRect(r.left - p.left, r.top - p.top, r.width, r.height);
    };
    const stacked = () => window.matchMedia("(max-width: 900px)").matches;
    const sizeBird = () => {
      const m = mark.getBoundingClientRect().width || 160;
      w = stacked() ? clamp(m * 0.6, 78, 100) : clamp(m * 0.62, 84, 124);
      mascot.style.setProperty("--tm-w", `${w}px`);
    };
    const h = () => w * ART_RATIO;
    const at = (p: P) => `translate3d(${(p.x - w * BELLY.x).toFixed(1)}px, ${(p.y - h() * BELLY.y).toFixed(1)}px, 0)`;
    const letterPoint = (i: number, l: Lang): P => {
      const r = rel(words.getBoundingClientRect());
      const L = LETTERS[l][i];
      return { x: r.left + (L.x / 900) * r.width, y: r.top + (L.y / 252) * r.height + 1 };
    };
    /* Rest: on the column split, level with the brand (desktop); on the seam under the sky, at the
       right (stacked layouts). Kept above the form. */
    const restPoint = (): P => {
      const s = rel(sky.getBoundingClientRect());
      if (stacked()) return { x: page.clientWidth - 14 - w * (1 - BELLY.x), y: s.top + s.height - 8 };
      const m = rel(mark.getBoundingClientRect());
      let y = m.top + m.height * 0.7;
      if (form) y = Math.min(y, rel(form.getBoundingClientRect()).top - h() * 0.5);
      return { x: s.left + w * (BELLY.x - 0.5), y: Math.max(y, h() + 80) };
    };

    /* ── Wings ── */
    let wingAnim: Animation | null = null;
    let wingAngle = 8;
    const wingTo = (deg: number, ms = 160) => {
      wingAnim?.cancel();
      wingAnim = anim(wing, [{ transform: `rotate(${wingAngle}deg)` }, { transform: `rotate(${deg}deg)` }], { duration: ms, easing: "ease-out" });
      wingAngle = deg;
      return wingAnim;
    };
    /* Wingbeats: quick downstroke, slower recovery. */
    const flap = (period: number, up = -24, down = 10) => {
      wingAnim?.cancel();
      wingAnim = track(
        wing.animate(
          [
            { transform: `rotate(${up}deg)`, easing: "cubic-bezier(.5,0,.75,1)" },
            { transform: `rotate(${down}deg)`, offset: 0.42, easing: "cubic-bezier(.25,0,.5,1)" },
            { transform: `rotate(${up}deg)` },
          ],
          { duration: period, iterations: Infinity },
        ),
      );
      wingAngle = up;
    };

    /* ── Flight along a curve, banking with the direction of travel ── */
    const fly = (path: [P, P, P, P], ms: number, o: { ease?: (t: number) => number; bank?: number; bob?: number; beats?: number; flare?: number } = {}) => {
      const { ease = easeInOutSine, bank = 16, bob = 0, beats = 0, flare = 0 } = o;
      const N = 44;
      const moves: Keyframe[] = [];
      const tilts: Keyframe[] = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const t = ease(k);
        const p = bez(...path, t);
        const q = bez(...path, Math.min(1, t + 0.02));
        const r = bez(...path, Math.max(0, t - 0.02));
        const lift = beats ? Math.sin(k * beats * Math.PI * 2) * bob : 0;
        moves.push({ offset: k, transform: at({ x: p.x, y: p.y + lift }) });
        let ang = (Math.atan2(q.y - r.y, Math.abs(q.x - r.x) + 0.001) * 180) / Math.PI;
        ang = clamp(ang * 0.55, -bank, bank) * facing;
        // Flare: nose up as it brakes, then level.
        if (flare && k > 0.8) ang += flare * Math.sin(((k - 0.8) / 0.2) * Math.PI);
        tilts.push({ offset: k, transform: `rotate(${ang.toFixed(2)}deg)` });
      }
      pos = path[3];
      return [anim(mascot, moves, { duration: ms }), anim(pose, tilts, { duration: ms })] as const;
    };

    /* A forward loop-the-loop of radius r, starting and ending at the current point. */
    const loop = (r: number, ms: number) => {
      const c = { x: pos.x, y: pos.y - r };
      const N = 36;
      const moves: Keyframe[] = [];
      const tilts: Keyframe[] = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const a = easeInOutSine(k) * Math.PI * 2;
        moves.push({ offset: k, transform: at({ x: c.x + r * Math.sin(a) * 1.1, y: c.y + r * Math.cos(a) }) });
        tilts.push({ offset: k, transform: `rotate(${(-a * 180) / Math.PI}deg)` });
      }
      return [anim(mascot, moves, { duration: ms }), anim(pose, tilts, { duration: ms })] as const;
    };

    /* ── Letters that squash under it ── */
    const splitLetters = (l: Lang) => {
      letterLayer = document.createElement("div");
      letterLayer.className = "tm-letters";
      letterLayer.setAttribute("aria-hidden", "true");
      for (const L of LETTERS[l]) {
        const span = document.createElement("span");
        span.style.clipPath = `inset(-30% ${(100 - (L.e / 900) * 100).toFixed(2)}% -30% ${((L.s / 900) * 100).toFixed(2)}%)`;
        letterLayer.appendChild(span);
      }
      words.appendChild(letterLayer);
      words.classList.add("tm-split");
    };
    const joinLetters = () => {
      words.classList.remove("tm-split");
      letterLayer?.remove();
      letterLayer = null;
    };
    const squash = (i: number, depth: number) => {
      const el = letterLayer?.children[i] as HTMLElement | undefined;
      if (!el) return;
      const d = depth * words.getBoundingClientRect().height;
      anim(el, [
        { transform: "translateY(0) scaleY(1)" },
        { transform: `translateY(${d}px) scaleY(.9)`, offset: 0.18 },
        { transform: `translateY(${-d * 0.4}px) scaleY(1.04)`, offset: 0.45 },
        { transform: `translateY(${d * 0.14}px) scaleY(.99)`, offset: 0.7 },
        { transform: "translateY(0) scaleY(1)" },
      ], { duration: 480, easing: "linear" });
    };

    /* Body squash and stretch, keeping the facing. */
    const squish = (sx: number, sy: number, ms = 240, extra = "") =>
      anim(face, [{ transform: `scale(${facing}, 1)${extra}` }, { transform: `scale(${facing * sx}, ${sy})${extra}`, offset: 0.35 }, { transform: `scale(${facing}, 1)${extra}` }], { duration: ms, easing: "ease-out" });

    /* One hop with anticipation, wings tucked in the air, and a squashy landing. */
    const hop = async (to: P, peak: number, ms: number, spin = 0) => {
      const from = pos;
      squish(1.1, 0.86, 130);
      wingTo(-12, 90);
      await wait(95);
      alive();
      wingTo(16, 140);
      const N = 26;
      const moves: Keyframe[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = from.x + (to.x - from.x) * easeInOutSine(t);
        const y = from.y + (to.y - from.y) * t - 4 * peak * t * (1 - t);
        moves.push({ offset: t, transform: at({ x, y }) });
      }
      const dir = Math.sign(to.x - from.x) || facing;
      const a1 = anim(mascot, moves, { duration: ms });
      const a2 = spin
        ? anim(pose, [{ transform: "rotate(0deg)" }, { transform: `rotate(${-360 * spin}deg)` }], { duration: ms, easing: "cubic-bezier(.4,0,.3,1)" })
        : anim(pose, [{ transform: `rotate(${-9 * dir}deg)` }, { transform: `rotate(${7 * dir}deg)`, offset: 0.75 }, { transform: "rotate(0deg)" }], { duration: ms, easing: "ease-in-out" });
      pos = to;
      await done(a1, a2);
      alive();
      squish(1.12, 0.82, 240);
    };

    const turn = async (to: 1 | -1) => {
      if (facing === to) return;
      const from = facing;
      facing = to;
      await done(anim(face, [{ transform: `scale(${from}, 1)` }, { transform: `scale(${from * 0.12}, .94)`, offset: 0.5 }, { transform: `scale(${to}, 1)` }], { duration: 240, easing: "ease-in-out" }));
    };

    /* Giggle: quick shakes with a laughing face. */
    const giggle = async (ms = 800) => {
      setFace("joy");
      const n = Math.round(ms / 90);
      const k: Keyframe[] = [];
      for (let i = 0; i <= n; i++) k.push({ transform: `scale(${facing}, 1) rotate(${i === n ? 0 : i % 2 ? 4 : -4}deg) translateY(${i % 2 ? -2 : 0}px)` });
      await done(anim(face, k, { duration: ms, easing: "linear" }));
    };

    /* ── Idle: beat-and-glide hover, blinking, and a trick every so often ── */
    let idleAnims: Animation[] = [];
    const startIdle = () => {
      idleAnims.forEach((a) => a.cancel());
      const cycle = 3600;
      const beats: Keyframe[] = [];
      for (let i = 0; i < 4; i++) {
        beats.push({ offset: (i * 0.36) / 3.6, transform: "rotate(-24deg)", easing: "cubic-bezier(.5,0,.75,1)" });
        beats.push({ offset: (i * 0.36 + 0.15) / 3.6, transform: "rotate(10deg)", easing: "cubic-bezier(.25,0,.5,1)" });
      }
      beats.push({ offset: 1.44 / 3.6, transform: "rotate(-14deg)", easing: "ease-out" });
      beats.push({ offset: 3.2 / 3.6, transform: "rotate(-10deg)", easing: "ease-in" });
      beats.push({ offset: 1, transform: "rotate(-24deg)" });
      wingAnim?.cancel();
      wingAnim = track(wing.animate(beats, { duration: cycle, iterations: Infinity }));
      idleAnims = [
        wingAnim,
        track(
          idle.animate(
            [
              { transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "cubic-bezier(.3,0,.5,1)" },
              { transform: "translate3d(0, -10px, 0) rotate(-2.5deg)", offset: 0.42, easing: "cubic-bezier(.4,0,.6,1)" },
              { transform: "translate3d(0, 3px, 0) rotate(1.5deg)", offset: 0.9, easing: "ease-in-out" },
              { transform: "translate3d(0, 0, 0) rotate(0deg)" },
            ],
            { duration: cycle, iterations: Infinity },
          ),
        ),
      ];
    };
    const blinkLoop = () => {
      if (svg.getAttribute("data-face") === "open" || svg.getAttribute("data-face") === "peek") {
        blink();
        if (Math.random() < 0.25) later(blink, 220); // double blink sometimes
      }
      later(blinkLoop, rand(2400, 5200));
    };

    const tricks: [number, () => Promise<void>][] = [
      [3, async () => { // look around
        lookTo(-7, 0); await wait(600); alive();
        lookTo(7, -2); await wait(650); alive();
        lookTo(0, 0); await wait(250);
      }],
      [3, async () => { // big happy grin and a bounce
        setFace("joy"); squish(1.06, 0.92, 300); await wait(1100); alive(); setFace("open");
      }],
      [2, async () => { // cheeky: tongue out, wiggle
        setFace("wink");
        await done(anim(pose, [{ transform: "rotate(0)" }, { transform: "rotate(-7deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(0)" }], { duration: 900, easing: "ease-in-out" }));
        alive(); setFace("open");
      }],
      [2, async () => { // little dance
        setFace("joy");
        await done(anim(pose, [0, -10, 10, -10, 10, 0].map((d, i) => ({ transform: `rotate(${d}deg) translateY(${i % 2 ? -5 : 0}px)` })), { duration: 1300, easing: "ease-in-out" }));
        alive(); setFace("open");
      }],
      [2, async () => { // "what's behind me?" — turns round, peers, turns back
        await turn(-1); alive();
        lookTo(5, -2); await wait(700); alive();
        setFace("o"); await wait(300); alive();
        await turn(1); alive();
        lookTo(0, 0); setFace("joy"); await wait(500); alive();
        setFace("open");
      }],
      [1, async () => { // loop-the-loop, a bit dizzy after
        idleAnims.forEach((a) => a.pause());
        flap(160); setFace("joy");
        await done(...loop(clamp((pos.y - h() * 0.8 - 10) / 2, 24, w * 0.55), 950)); alive();
        setFace("dizzy"); await giggle(500); alive();
        await wait(500); alive();
        setFace("open"); pose.getAnimations().forEach((a) => a.cancel());
        commit(mascot);
        startIdle();
      }],
    ];
    const trickLoop = () => {
      later(async () => {
        if (!busy && mode === "free" && !document.hidden) {
          busy = true;
          const total = tricks.reduce((n, [wt]) => n + wt, 0);
          let r = Math.random() * total;
          const pick = tricks.find(([wt]) => (r -= wt) < 0)?.[1] ?? tricks[0][1];
          try {
            await pick();
          } catch {
            /* skipped on unmount */
          }
          busy = false;
        }
        trickLoop();
      }, rand(5500, 9500));
    };

    /* ── End state: big bird gone, little bird hovering at its rest point ── */
    const goIdle = () => {
      introDone = true;
      setFace("open");
      startIdle();
      blinkLoop();
      trickLoop();
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
    };
    const settle = () => {
      for (const a of [...live]) a.cancel();
      mascot.getAnimations().forEach((a) => a.cancel());
      live.clear();
      wingAnim = null;
      joinLetters();
      facing = 1;
      sizeBird();
      pos = restPoint();
      mascot.style.transform = at(pos);
      bigBird.classList.add("tm-gone");
      site.classList.add("tm-away");
      mascot.classList.add("tm-on");
      if (!introDone) goIdle();
    };
    skipRef.current = () => {
      if (introDone) return;
      skipped = true;
      timers.forEach((id) => clearTimeout(id)); // pending intro steps
      timers.clear();
      settle();
    };

    /* ── The sequence ── */
    const play = async () => {
      const l = langRef.current;
      sizeBird();
      const letters = LETTERS[l];
      const first = letterPoint(0, l);
      const brand = rel(words.getBoundingClientRect());

      // A: burst in from the left, loop-the-loop for joy, land a bit dizzy.
      pos = { x: -w * 1.3, y: first.y - 150 };
      mascot.style.transform = at(pos);
      mascot.classList.add("tm-on");
      setFace("joy");
      flap(210);
      const loopR = clamp(w * 0.5, 40, 70);
      // Keep the whole loop on screen.
      const loopAt: P = { x: Math.max(brand.left - w * 0.2, w * 1.1), y: Math.max(first.y - 130, loopR * 2 + h() * 0.8 + 16) };
      const [a1] = fly([pos, { x: pos.x + 60, y: pos.y - 40 }, { x: loopAt.x - 80, y: loopAt.y + 10 }, loopAt], 950, { ease: (t) => t, bank: 12, bob: 4, beats: 3 });
      await done(a1);
      alive();
      flap(170);
      await done(...loop(loopR, 900));
      alive();
      setFace("open");
      flap(240);
      const [a2] = fly([pos, { x: pos.x + 60, y: pos.y - 30 }, { x: first.x - w * 0.8, y: first.y - 90 }, first], 1100, { ease: easeOutCubic, bank: 14, bob: 4, beats: 4, flare: -18 });
      later(() => flap(150, -30, 6), 750);
      await done(a2);
      alive();
      wingTo(16, 150);
      splitLetters(l);
      squash(0, 0.07);
      squish(1.14, 0.8, 260);
      setFace("dizzy");
      await wait(450);
      alive();
      // Shake it off.
      await done(anim(face, [0, -12, 12, -8, 6, 0].map((d) => ({ transform: `scale(1, 1) rotate(${d}deg)` })), { duration: 450, easing: "ease-in-out" }));
      alive();
      setFace("open");
      await wait(150);

      // B: hop the letters; trampoline on the tall one; teeter on the last.
      for (let i = 1; i < letters.length; i++) {
        alive();
        const last = i === letters.length - 1;
        let to = letterPoint(i, l);
        if (last) to = { x: to.x + w * 0.16, y: to.y }; // a touch too far…
        const dist = Math.abs(to.x - pos.x);
        squash(i - 1, 0.03);
        setFace(i % 2 ? "joy" : "open");
        await hop(to, clamp(dist * 0.55 + 16, 24, 64) + Math.max(0, pos.y - to.y) * 0.4, clamp(260 + dist * 1.5, 300, 460));
        alive();
        squash(i, 0.06);
        setFace("open");
        if (i === BOUNCY[l]) {
          // Boing, boing, with a spin on the second one.
          await wait(60);
          alive();
          setFace("joy");
          squash(i, 0.12);
          await hop(to, h() * 0.9, 420);
          alive();
          squash(i, 0.12);
          await hop(to, h() * 1.35, 560, 1);
          alive();
          squash(i, 0.08);
          setFace("open");
        }
        if (last) {
          // Wobble on the edge, flapping like mad, then catch the balance.
          setFace("o");
          flap(110, -34, 14);
          await done(anim(pose, [0, 16, -10, 13, -6, 4, 0].map((d) => ({ transform: `rotate(${d}deg)` })), { duration: 1000, easing: "ease-in-out" }));
          alive();
          wingTo(16, 140);
          const fix = letterPoint(i, l);
          await hop(fix, 10, 220);
          alive();
          squash(i, 0.05);
          await giggle(600);
          alive();
        }
        await wait(90);
      }
      setFace("open");
      joinLetters();

      // C: pull a face at the big bird; it startles and flies off; giggles.
      await wait(250);
      alive();
      setFace("wink");
      await done(anim(pose, [0, -8, 7, -6, 0].map((d) => ({ transform: `rotate(${d}deg)` })), { duration: 700, easing: "ease-in-out" }));
      alive();
      const skyR = rel(sky.getBoundingClientRect());
      const bigWing = bigBird.querySelector(".wing")?.getAnimations()[0];
      setFace("o", bigFace);
      const bang = document.createElement("span");
      bang.className = "tm-bang";
      bang.textContent = "!";
      bigFloat?.appendChild(bang);
      anim(bang, [{ opacity: 0, transform: "scale(.3) rotate(-20deg)" }, { opacity: 1, transform: "scale(1.15) rotate(6deg)", offset: 0.6 }, { opacity: 1, transform: "scale(1) rotate(0deg)" }], { duration: 260, easing: "ease-out" });
      const startle = anim(bigBird, [
        { transform: "translate3d(0,0,0) rotate(0deg)" },
        { transform: "translate3d(0,-22px,0) rotate(3deg) scale(1.03)", offset: 0.35, easing: "ease-in" },
        { transform: "translate3d(-8px,2px,0) rotate(-4deg)" },
      ], { duration: 520, easing: "ease-out" });
      setFace("joy");
      await done(startle);
      alive();
      await wait(380);
      alive();
      anim(bang, [{ opacity: 1 }, { opacity: 0, transform: "scale(.6)" }], { duration: 200 });
      setFace("open", bigFace);
      blink(bigFace);
      bigWing?.updatePlaybackRate(1.7);
      const windUp = anim(bigBird, [{ transform: "translate3d(-8px,2px,0) rotate(-4deg)" }, { transform: "translate3d(-28px,12px,0) rotate(4deg)" }], { duration: 380, easing: "cubic-bezier(.4,0,.2,1)" });
      await done(windUp);
      alive();
      bigWing?.updatePlaybackRate(2.4);
      const exit = anim(bigBird, [
        { transform: "translate3d(-28px,12px,0) rotate(4deg) scale(1)", easing: "cubic-bezier(.5,0,.9,.55)" },
        { transform: `translate3d(${skyR.width * 0.35}px, ${-skyR.height * 0.12}px, 0) rotate(-10deg) scale(.92)`, offset: 0.55, easing: "cubic-bezier(.3,0,.8,.6)" },
        { transform: `translate3d(${skyR.width * 1.08}px, ${-skyR.height * 0.3}px, 0) rotate(-14deg) scale(.82)` },
      ], { duration: 1600 });
      lookTo(6, -3, 400);
      // Hops with glee and giggles while it goes.
      const glee = (async () => {
        await wait(150);
        alive();
        await hop(pos, 18, 300);
        alive();
        await hop(pos, 24, 330);
        alive();
        await giggle(700);
      })().catch(() => {});
      await done(exit);
      await glee;
      alive();
      bang.remove();
      bigBird.classList.add("tm-gone");
      bigWing?.updatePlaybackRate(1);
      lookTo(0, 0);
      await wait(450);

      // D: barrel-roll off to the split, flare to a stop.
      alive();
      site.classList.add("tm-away");
      setFace("joy");
      const rest = restPoint();
      squish(1.08, 0.86, 160);
      await wait(110);
      alive();
      flap(200);
      const span = rest.x - pos.x;
      const dur = clamp(1300 + Math.hypot(span, rest.y - pos.y) * 1.1, 1500, 2300);
      const [d1] = fly([pos, { x: pos.x + span * 0.25, y: Math.min(pos.y, rest.y) - 120 }, { x: rest.x - span * 0.22, y: rest.y - 70 }, rest], dur, { bank: 15, bob: 4, beats: 6, flare: -18 });
      // Barrel roll in the middle of the glide.
      anim(face, [
        { transform: "scale(1, 1)", offset: 0 },
        { transform: "scale(1, 1)", offset: 0.3 },
        { transform: "scale(1, -1)", offset: 0.45 },
        { transform: "scale(1, 1)", offset: 0.6 },
        { transform: "scale(1, 1)" },
      ], { duration: dur, easing: "ease-in-out" });
      later(() => wingAnim?.updatePlaybackRate(0.8), dur * 0.5);
      later(() => flap(150, -30, 8), dur * 0.8);
      await done(d1);
      alive();
      flap(300);
      setFace("open");

      // Turn to the visitor, beam, tilt, wink.
      later(() => setFace("joy"), 500);
      later(() => setFace("wink"), 1300);
      later(() => setFace("open"), 2000);
      await done(anim(face, [
        { transform: "perspective(500px) rotateY(0deg) rotate(0deg)" },
        { transform: "perspective(500px) rotateY(-30deg) rotate(0deg)", offset: 0.25, easing: "ease-out" },
        { transform: "perspective(500px) rotateY(-30deg) rotate(-9deg)", offset: 0.45, easing: "ease-in-out" },
        { transform: "perspective(500px) rotateY(-30deg) rotate(-9deg)", offset: 0.85 },
        { transform: "perspective(500px) rotateY(0deg) rotate(0deg)" },
      ], { duration: 2400, easing: "ease-in-out" }));
      alive();
      face.getAnimations().forEach((a) => a.cancel());
      pose.getAnimations().forEach((a) => a.cancel());
      commit(mascot);

      // E: hover.
      goIdle();
    };

    /* Start once the brand images have their final size. */
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    const imgs = [...page.querySelectorAll<HTMLImageElement>(".thabaal-brand img")];
    Promise.all([document.fonts?.ready, ...imgs.map((i) => (i.complete ? null : i.decode().catch(() => null)))]).then(() => {
      if (dead) return;
      site.classList.add("tm-intro");
      if (seen) settle();
      else
        play().catch((e) => {
          if (!(e instanceof Skip) && !dead && !skipped) settle();
        });
    });

    /* Keep the resting bird in place when the layout changes; mid-sequence, jump to the end. */
    let lastW = page.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!introDone) {
        // A scrollbar appearing nudges the width a little; only a real resize ends the intro early.
        if (Math.abs(page.clientWidth - lastW) > 60) skipRef.current();
        return;
      }
      lastW = page.clientWidth;
      if (busy) return; // a trick is moving it; the next resize or trick end will place it
      mascot.getAnimations().forEach((a) => a.cancel());
      sizeBird();
      pos = restPoint();
      mascot.style.transform = at(pos);
    });
    ro.observe(page);

    /* Form reactions: watch the email being typed; cover the eyes for the password (and peek). */
    let peekTimer = 0;
    let blurTimer = 0;
    const toward = () => (stacked() ? { x: -4, y: 6 } : { x: 7, y: 2 }); // toward the form, in the bird's own (flipped) frame
    const onFocus = (e: FocusEvent) => {
      if (!introDone || !(e.target instanceof HTMLInputElement)) return;
      clearTimeout(blurTimer);
      clearInterval(peekTimer);
      const isPw = e.target.type === "password" || e.target.name.toLowerCase().includes("password");
      mode = isPw ? "password" : "email";
      if (!stacked()) watch.style.transform = isPw ? "" : "scaleX(-1)";
      if (isPw) {
        setFace("shut");
        lookTo(0, 0);
        // Naughty: peeks every so often.
        peekTimer = window.setInterval(() => {
          if (dead || mode !== "password") return;
          setFace("peek");
          window.setTimeout(() => mode === "password" && setFace("shut"), 650);
        }, 2600);
      } else {
        setFace("open");
        const t = toward();
        lookTo(t.x, t.y);
      }
    };
    const onBlur = () => {
      blurTimer = window.setTimeout(() => {
        clearInterval(peekTimer);
        mode = "free";
        watch.style.transform = "";
        setFace("open");
        lookTo(0, 0);
      }, 350);
    };
    const onType = () => {
      if (mode === "email") squish(1.03, 0.96, 160); // little nods as you type
    };
    const onSubmit = () => {
      if (!introDone) return;
      clearInterval(peekTimer);
      mode = "free";
      watch.style.transform = "";
      setFace("joy");
      squish(1.1, 0.88, 300);
    };
    form?.addEventListener("focusin", onFocus);
    form?.addEventListener("focusout", onBlur);
    form?.addEventListener("input", onType);
    form?.addEventListener("submit", onSubmit);

    return () => {
      dead = true;
      ro.disconnect();
      timers.forEach((id) => clearTimeout(id));
      clearTimeout(blurTimer);
      clearInterval(peekTimer);
      form?.removeEventListener("focusin", onFocus);
      form?.removeEventListener("focusout", onBlur);
      form?.removeEventListener("input", onType);
      form?.removeEventListener("submit", onSubmit);
      for (const a of [...live]) a.cancel();
      joinLetters();
      site.classList.remove("tm-intro", "tm-away");
      bigBird.classList.remove("tm-gone");
      bigBird.getAnimations().forEach((a) => a.cancel());
      bigBird.querySelector(".tm-bang")?.remove();
    };
  }, []);

  return (
    <div ref={host} className="tm-mascot" aria-hidden="true">
      <div className="tm-pose">
        <div className="tm-idle">
          <div className="tm-watchwrap">
            <div className="tm-face">
              {/* eslint-disable-next-line @next/next/no-img-element -- same brand art as the sky bird, already cached */}
              <img src="/brands/thabaal/wing.png" className="tm-wing" alt="" width={640} height={354} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brands/thabaal/body.png" className="tm-body" alt="" width={640} height={354} />
              <BirdFace />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
