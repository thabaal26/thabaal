"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { BirdFace } from "./bird-face";
import "./mascot.css";

/*
 * The sign-in page's mascot bird:
 *   1. Bursts in from the left screen directly onto the first letter.
 *   2. Jumps letter to letter (each letter squashes playfully; tall letter has a bouncy trampoline spin).
 *   3. Lands squarely and sits proudly on the last letter ("l" in English, "ல்" in Tamil, with proper spacing).
 *   4. Right sky carrier bird maintains its constant, peaceful flight undisturbed.
 *   5. Mascot stays perched on the last letter: breathing, wing flutters, blinks, and reacts to email/password typing.
 */

type P = { x: number; y: number };
type Lang = "en" | "ta";
type Face = "open" | "joy" | "wink" | "o" | "dizzy" | "shut" | "peek";

/* Letter slices of the 900 × 252 wordmark images and the point on top of each letter to stand on. */
const LETTERS: Record<Lang, { s: number; e: number; x: number; y: number; clip?: string }[]> = {
  en: [
    { s: 0, e: 117, x: 58, y: 75 }, // t
    { s: 117, e: 273, x: 150, y: 57 }, // h
    { s: 273, e: 415, x: 344, y: 109 }, // a
    // b: encompasses the full green sparks symbol radiating up to x=583 at y<=100 without slicing it
    {
      s: 415,
      e: 583,
      x: 455,
      y: 27,
      clip: "polygon(46.11% -30%, 64.78% -30%, 64.78% 39.7%, 63.44% 39.7%, 63.44% 130%, 46.11% 130%)",
    },
    // a: starts after b's body at x=571 (below y=100) and x=583 (above y=100)
    {
      s: 571,
      e: 707,
      x: 639,
      y: 109,
      clip: "polygon(64.78% -30%, 78.56% -30%, 78.56% 130%, 63.44% 130%, 63.44% 39.7%, 64.78% 39.7%)",
    },
    { s: 707, e: 838, x: 772, y: 108 }, // a
    { s: 838, e: 900, x: 869, y: 58 }, // l
  ],
  ta: [
    { s: 120, e: 320, x: 236, y: 59 }, // த
    { s: 320, e: 455, x: 386, y: 60 }, // ப
    { s: 455, e: 580, x: 515, y: 60 }, // ா
    { s: 580, e: 760, x: 710, y: 56 }, // ல் - sits cleanly on the top arch of the final letter with proper spacing!
  ],
};
/* The tall letter it bounces on like a trampoline. */
const BOUNCY: Record<Lang, number> = { en: 3, ta: 1 };

const ART_RATIO = 354 / 640;
const BELLY = { x: 0.74, y: 0.8 }; // where it stands, as a fraction of the 640 × 354 art
const SEEN_KEY = "thabaal-intro-v3";

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

  // A language switch mid-sequence swaps the wordmark under the hopping bird: jump to the end.
  // Afterwards it re-perches on the new wordmark's last letter.
  useEffect(() => {
    if (langRef.current === lang) return;
    langRef.current = lang;
    skipRef.current();
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
    const wing = mascot.querySelector<HTMLElement>(".tm-wing")!;
    const svg = mascot.querySelector<SVGSVGElement>(".bf")!;
    const words = page.querySelector<HTMLElement>(".thabaal-brand .words");
    const mark = page.querySelector<HTMLElement>(".thabaal-brand .mark");
    const form = page.querySelector<HTMLElement>(".thabaal-form");
    if (!words || !mark) return;

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
    const setFace = (f: Face) => svg?.setAttribute("data-face", f);
    const eyes = () => svg?.querySelectorAll<SVGGElement>(".bf-l, .bf-r") ?? [];
    const blink = () =>
      eyes().forEach((e) =>
        e.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.08)", offset: 0.45 }, { transform: "scaleY(1)" }], { duration: 170, easing: "ease-in-out" }),
      );
    const lookTo = (dx: number, dy: number, ms = 220) => {
      const g = svg?.querySelector(".bf-eyes");
      if (g) anim(g, [{ transform: `translate(${dx}px, ${dy}px)` }], { duration: ms, easing: "cubic-bezier(.3,1.4,.6,1)" });
    };

    /* ── Geometry, in the page's own coordinates ── */
    const rel = (r: DOMRect) => {
      const p = page.getBoundingClientRect();
      return new DOMRect(r.left - p.left, r.top - p.top, r.width, r.height);
    };
    const stacked = () => window.matchMedia("(max-width: 900px)").matches;
    const smallW = () => {
      const m = mark.getBoundingClientRect().width || 160;
      return stacked() ? clamp(m * 0.6, 78, 100) : clamp(m * 0.62, 84, 124);
    };
    const setW = (v: number) => {
      w = v;
      mascot.style.setProperty("--tm-w", `${w}px`);
    };
    const sizeBird = () => setW(smallW());
    const h = () => w * ART_RATIO;
    const at = (p: P) => `translate3d(${(p.x - w * BELLY.x).toFixed(1)}px, ${(p.y - h() * BELLY.y).toFixed(1)}px, 0)`;
    const letterPoint = (i: number, l: Lang): P => {
      const r = rel(words.getBoundingClientRect());
      const L = LETTERS[l][i];
      return { x: r.left + (L.x / 900) * r.width, y: r.top + (L.y / 252) * r.height + 1 };
    };
    /* Target perch letter: first letter (த) for Tamil, last letter (l) for English */
    const perchIndex = (l: Lang) => (l === "ta" ? 0 : LETTERS[l].length - 1);
    const perchPoint = (): P => letterPoint(perchIndex(langRef.current), langRef.current);

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
        if (flare && k > 0.8) ang += flare * facing * Math.sin(((k - 0.8) / 0.2) * Math.PI);
        tilts.push({ offset: k, transform: `rotate(${ang.toFixed(2)}deg)` });
      }
      pos = path[3];
      return [anim(mascot, moves, { duration: ms }), anim(pose, tilts, { duration: ms })] as const;
    };

    /* ── Letters that squash under it ── */
    const splitLetters = (l: Lang) => {
      if (letterLayer) return;
      letterLayer = document.createElement("div");
      letterLayer.className = "tm-letters";
      letterLayer.setAttribute("aria-hidden", "true");
      for (const L of LETTERS[l]) {
        const span = document.createElement("span");
        if (L.clip) {
          span.style.clipPath = L.clip;
        } else {
          span.style.clipPath = `inset(-30% ${(100 - (L.e / 900) * 100).toFixed(2)}% -30% ${((L.s / 900) * 100).toFixed(2)}%)`;
        }
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
    /* A squash of the perch letter, splitting the wordmark just for as long as it wobbles. */
    let joinId = 0;
    const bump = (depth: number) => {
      splitLetters(langRef.current);
      squash(perchIndex(langRef.current), depth);
      window.clearTimeout(joinId);
      timers.delete(joinId);
      joinId = window.setTimeout(() => {
        timers.delete(joinId);
        joinLetters();
      }, 560);
      timers.add(joinId);
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

    /* ── Perched on the last letter: breathing, wing flutter now and then, blinking ── */
    let idleAnims: Animation[] = [];
    const startPerch = () => {
      idleAnims.forEach((a) => a.cancel());
      const cycle = 5200;
      wingAnim?.cancel();
      wingAnim = track(
        wing.animate(
          [
            { offset: 0, transform: "rotate(16deg)" },
            { offset: 0.6, transform: "rotate(16deg)", easing: "cubic-bezier(.5,0,.75,1)" },
            { offset: 0.645, transform: "rotate(-22deg)", easing: "cubic-bezier(.25,0,.5,1)" },
            { offset: 0.69, transform: "rotate(12deg)", easing: "cubic-bezier(.5,0,.75,1)" },
            { offset: 0.735, transform: "rotate(-18deg)", easing: "cubic-bezier(.25,0,.5,1)" },
            { offset: 0.8, transform: "rotate(16deg)" },
            { offset: 1, transform: "rotate(16deg)" },
          ],
          { duration: cycle, iterations: Infinity },
        ),
      );
      wingAngle = 16;
      idleAnims = [
        wingAnim,
        track(
          idle.animate(
            [
              { offset: 0, transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "ease-in-out" },
              { offset: 0.28, transform: "translate3d(0, -2px, 0) rotate(-1.5deg)", easing: "ease-in-out" },
              { offset: 0.58, transform: "translate3d(0, 0, 0) rotate(.8deg)", easing: "cubic-bezier(.3,0,.4,1)" },
              { offset: 0.68, transform: "translate3d(0, -7px, 0) rotate(-2deg)", easing: "cubic-bezier(.5,0,.6,1)" },
              { offset: 0.8, transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "ease-in-out" },
              { offset: 1, transform: "translate3d(0, 0, 0) rotate(0deg)" },
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

    /* A hop in place on the letter (optionally with a spin), squashing the letter on take-off and landing. */
    const perchHop = async (peak: number, ms: number, spin = 0) => {
      bump(0.03);
      await hop(pos, peak, ms, spin);
      alive();
      bump(spin ? 0.1 : 0.06);
    };
    const tricks: [number, () => Promise<void>][] = [
      [3, async () => { // look around
        lookTo(-7, 0); await wait(600); alive();
        lookTo(7, -2); await wait(650); alive();
        lookTo(0, 0); await wait(250);
      }],
      [3, async () => { // happy hops on the letter
        setFace("joy");
        await perchHop(16, 300); alive();
        await wait(120); alive();
        await perchHop(22, 340); alive();
        await wait(300); alive();
        setFace("open");
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
      [2, async () => { // beam & wink at visitor
        lookTo(-3, 4, 300);
        setFace("wink");
        await done(anim(pose, [{ transform: "rotate(0)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(0)" }], { duration: 700, easing: "ease-in-out" }));
        alive();
        await wait(500);
        alive();
        setFace("joy");
        await giggle(450);
        alive();
        setFace("open");
        lookTo(0, 0);
      }],
      [1, async () => { // trampoline spin on the letter, dizzy after
        setFace("joy");
        await perchHop(h() * 0.6, 380); alive();
        await perchHop(h() * 1.1, 560, 1); alive();
        setFace("dizzy"); await wait(700); alive();
        setFace("open");
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
          if (!dead) {
            // Wings back to perching if a trick took them over; back on the letter
            if (wingAnim !== idleAnims[0] || idleAnims.some((a) => a.playState === "paused")) startPerch();
            place();
          }
        }
        trickLoop();
      }, rand(4200, 7800));
    };

    /* ── End state: the little bird perched on the last letter ── */
    const place = () => {
      mascot.getAnimations().forEach((a) => a.cancel());
      sizeBird();
      pos = perchPoint();
      mascot.style.transform = at(pos);
    };
    const goIdle = () => {
      introDone = true;
      setFace("open");
      startPerch();
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
      place();
      site.classList.add("tm-away");
      mascot.classList.add("tm-on");
      if (!introDone) goIdle();
    };
    skipRef.current = () => {
      if (introDone) {
        if (!busy) place();
        return;
      }
      skipped = true;
      timers.forEach((id) => clearTimeout(id)); // pending intro steps
      timers.clear();
      settle();
    };

    /* ── The sequence: comes out from left screen; sits on first letter for Tamil, L for English ── */
    const play = async () => {
      const l = langRef.current;
      sizeBird();
      const letters = LETTERS[l];
      const targetIdx = perchIndex(l);
      const first = letterPoint(0, l);

      // 1. Comes out from left screen onto the first letter
      pos = { x: -w * 1.4, y: first.y - 80 };
      mascot.style.transform = at(pos);
      mascot.classList.add("tm-on");
      setFace("joy");
      flap(200);
      const [a1] = fly(
        [pos, { x: pos.x + 80, y: pos.y - 30 }, { x: first.x - w * 0.7, y: first.y - 80 }, first],
        850,
        { ease: easeOutCubic, bank: 14, bob: 4, beats: 3, flare: -16 }
      );
      await done(a1);
      alive();
      wingTo(16, 140);
      splitLetters(l);
      squash(0, 0.08);
      squish(1.14, 0.82, 220);
      await wait(140);
      alive();

      if (targetIdx === 0) {
        // Tamil: sits proudly on the first letter (த) with a happy bounce!
        setFace("joy");
        squash(0, 0.12);
        await hop(first, h() * 0.85, 380);
        alive();
        squash(0, 0.09);
        await wait(120);
        alive();
      } else {
        // English: Jumps from letter to letter; trampoline bounce on tall letter (b); sits on L
        for (let i = 1; i < letters.length; i++) {
          alive();
          const isLast = i === letters.length - 1;
          const to = letterPoint(i, l);
          const dist = Math.abs(to.x - pos.x);
          squash(i - 1, 0.03);
          setFace(i % 2 ? "joy" : "open");
          await hop(
            to,
            clamp(dist * 0.55 + 16, 24, 64) + Math.max(0, pos.y - to.y) * 0.4,
            clamp(260 + dist * 1.5, 300, 460)
          );
          alive();
          squash(i, isLast ? 0.09 : 0.06);
          setFace("open");
          if (i === BOUNCY[l]) {
            // Boing, boing, with a spin on the tall letter!
            await wait(60);
            alive();
            setFace("joy");
            squash(i, 0.12);
            await hop(to, h() * 0.9, 400);
            alive();
            squash(i, 0.12);
            await hop(to, h() * 1.3, 540, 1);
            alive();
            squash(i, 0.08);
            setFace("open");
          }
          await wait(isLast ? 200 : 90);
        }
      }

      // Sits on target letter
      alive();
      joinLetters();
      setFace("joy");
      await giggle(500);
      alive();
      setFace("open");
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
        if (Math.abs(page.clientWidth - lastW) > 60) skipRef.current();
        return;
      }
      lastW = page.clientWidth;
      if (!busy) place();
    });
    ro.observe(page);

    /* Form reactions: watch the email being typed; cover the eyes for the password (and peek). */
    let peekTimer = 0;
    let blurTimer = 0;
    const onFocus = (e: FocusEvent) => {
      if (!introDone || !(e.target instanceof HTMLInputElement)) return;
      clearTimeout(blurTimer);
      clearInterval(peekTimer);
      const isPw = e.target.type === "password" || e.target.name.toLowerCase().includes("password");
      mode = isPw ? "password" : "email";
      if (isPw) {
        // Covers eyes… and peeks naughtily now and then.
        setFace("shut");
        lookTo(0, 0);
        peekTimer = window.setInterval(() => {
          if (dead || mode !== "password") return;
          setFace("peek");
          window.setTimeout(() => mode === "password" && setFace("shut"), 650);
        }, 2200);
      } else {
        // Watches the form below.
        setFace("open");
        lookTo(-3, 7);
      }
    };
    const onBlur = () => {
      blurTimer = window.setTimeout(() => {
        clearInterval(peekTimer);
        mode = "free";
        setFace("open");
        lookTo(0, 0);
      }, 350);
    };
    const onType = () => {
      if (mode === "email" && !busy) squish(1.03, 0.96, 160); // little nods as you type
    };
    const onSubmit = () => {
      if (!introDone) return;
      clearInterval(peekTimer);
      mode = "free";
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
    };
  }, []);

  return (
    <div ref={host} className="tm-mascot" aria-hidden="true">
      <div className="tm-pose">
        <div className="tm-idle">
          <div className="tm-watchwrap">
            <div className="tm-face">
              <Image src="/brands/thabaal/wing.png" className="tm-wing" alt="" width={640} height={354} loading="eager" />
              <Image src="/brands/thabaal/body.png" className="tm-body" alt="" width={640} height={354} loading="eager" />
              <BirdFace />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
