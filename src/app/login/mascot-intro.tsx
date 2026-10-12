"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import "./mascot.css";

/*
 * The sign-in page's mascot bird:
 *   Sits proudly on the last letter right from the start.
 *   Gentle breathing and natural wing flutter.
 *   Clean brand artwork without cartoon eyes or mouth overlays.
 */

type P = { x: number; y: number };
type Lang = "en" | "ta";

/* Letter points on top of the 900 × 252 wordmark images where the bird stands */
const LETTERS: Record<Lang, { x: number; y: number }[]> = {
  en: [
    { x: 58, y: 75 }, // t
    { x: 150, y: 57 }, // h
    { x: 344, y: 109 }, // a
    { x: 455, y: 27 }, // b
    { x: 639, y: 109 }, // a
    { x: 772, y: 108 }, // a
    { x: 869, y: 58 }, // l - sits cleanly on the last letter L
  ],
  ta: [
    { x: 236, y: 59 }, // த
    { x: 386, y: 60 }, // ப
    { x: 515, y: 60 }, // ா
    { x: 710, y: 56 }, // ல் - sits cleanly on the last letter ல்
  ],
};

const ART_RATIO = 354 / 640;
const BELLY = { x: 0.74, y: 0.8 }; // where it stands, as a fraction of the 640 × 354 art

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function MascotIntro({ lang }: { lang: Lang }) {
  const host = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);

  useEffect(() => {
    const mascot = host.current;
    const page = mascot?.closest<HTMLElement>(".thabaal-page");
    const site = page?.closest<HTMLElement>(".thabaal-site");
    if (!mascot || !page || !site) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      site.classList.add("tm-still");
      return () => site.classList.remove("tm-still");
    }

    const idle = mascot.querySelector<HTMLElement>(".tm-idle")!;
    const wing = mascot.querySelector<HTMLElement>(".tm-wing")!;
    const face = mascot.querySelector<HTMLElement>(".tm-face")!;
    const words = page.querySelector<HTMLElement>(".thabaal-brand .words");
    const mark = page.querySelector<HTMLElement>(".thabaal-brand .mark");
    const form = page.querySelector<HTMLElement>(".thabaal-form");
    if (!words || !mark) return;

    let dead = false;
    let wingAnim: Animation | null = null;
    let idleAnim: Animation | null = null;

    /* Geometry, in page coordinates */
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
      mascot.style.setProperty("--tm-w", `${v}px`);
    };
    const h = (w: number) => w * ART_RATIO;
    const at = (p: P, w: number) =>
      `translate3d(${(p.x - w * BELLY.x).toFixed(1)}px, ${(p.y - h(w) * BELLY.y).toFixed(1)}px, 0)`;

    /* Target perch letter: last letter ("l" in English, "ல்" in Tamil) */
    const perchIndex = (l: Lang) => LETTERS[l].length - 1;
    const letterPoint = (i: number, l: Lang): P => {
      const r = rel(words.getBoundingClientRect());
      const L = LETTERS[l][i];
      return { x: r.left + (L.x / 900) * r.width, y: r.top + (L.y / 252) * r.height + 1 };
    };
    const perchPoint = (): P => letterPoint(perchIndex(langRef.current), langRef.current);

    /* Place directly on the last letter right from the start */
    const place = () => {
      const w = smallW();
      setW(w);
      const pos = perchPoint();
      mascot.style.transform = at(pos, w);
    };

    /* Perch animation: subtle breathing bob + natural wing flutters */
    const startPerch = () => {
      wingAnim?.cancel();
      idleAnim?.cancel();
      const cycle = 5200;
      wingAnim = wing.animate(
        [
          { offset: 0, transform: "rotate(16deg)" },
          { offset: 0.6, transform: "rotate(16deg)", easing: "cubic-bezier(.5,0,.75,1)" },
          { offset: 0.645, transform: "rotate(-20deg)", easing: "cubic-bezier(.25,0,.5,1)" },
          { offset: 0.69, transform: "rotate(12deg)", easing: "cubic-bezier(.5,0,.75,1)" },
          { offset: 0.735, transform: "rotate(-16deg)", easing: "cubic-bezier(.25,0,.5,1)" },
          { offset: 0.8, transform: "rotate(16deg)" },
          { offset: 1, transform: "rotate(16deg)" },
        ],
        { duration: cycle, iterations: Infinity }
      );
      idleAnim = idle.animate(
        [
          { offset: 0, transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "ease-in-out" },
          { offset: 0.28, transform: "translate3d(0, -2px, 0) rotate(-1.5deg)", easing: "ease-in-out" },
          { offset: 0.58, transform: "translate3d(0, 0, 0) rotate(.8deg)", easing: "cubic-bezier(.3,0,.4,1)" },
          { offset: 0.68, transform: "translate3d(0, -5px, 0) rotate(-2deg)", easing: "cubic-bezier(.5,0,.6,1)" },
          { offset: 0.8, transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "ease-in-out" },
          { offset: 1, transform: "translate3d(0, 0, 0) rotate(0deg)" },
        ],
        { duration: cycle, iterations: Infinity }
      );
    };

    /* Subtle body squash for typing nods */
    const squish = (sx: number, sy: number, ms = 240) => {
      face.animate(
        [
          { transform: "scale(1, 1)" },
          { transform: `scale(${sx}, ${sy})`, offset: 0.35 },
          { transform: "scale(1, 1)" },
        ],
        { duration: ms, easing: "ease-out" }
      );
    };

    // Position immediately on the last letter
    place();
    mascot.classList.add("tm-on");
    site.classList.add("tm-away");
    startPerch();

    // Adjust after font / image loading to ensure exact geometry
    const imgs = [...page.querySelectorAll<HTMLImageElement>(".thabaal-brand img")];
    Promise.all([
      document.fonts?.ready,
      ...imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))),
    ]).then(() => {
      if (!dead) place();
    });

    // Handle resize
    const ro = new ResizeObserver(() => {
      if (!dead) place();
    });
    ro.observe(page);

    // Form typing reactions: gentle nods as user interacts
    const onType = () => squish(1.03, 0.96, 160);
    const onSubmit = () => squish(1.1, 0.88, 300);
    form?.addEventListener("input", onType);
    form?.addEventListener("submit", onSubmit);

    return () => {
      dead = true;
      ro.disconnect();
      form?.removeEventListener("input", onType);
      form?.removeEventListener("submit", onSubmit);
      wingAnim?.cancel();
      idleAnim?.cancel();
    };
  }, []);

  // Update position smoothly on language switch
  useEffect(() => {
    langRef.current = lang;
    const mascot = host.current;
    const page = mascot?.closest<HTMLElement>(".thabaal-page");
    const words = page?.querySelector<HTMLElement>(".thabaal-brand .words");
    const mark = page?.querySelector<HTMLElement>(".thabaal-brand .mark");
    if (!mascot || !page || !words || !mark) return;

    const rel = (r: DOMRect) => {
      const p = page.getBoundingClientRect();
      return new DOMRect(r.left - p.left, r.top - p.top, r.width, r.height);
    };
    const stacked = () => window.matchMedia("(max-width: 900px)").matches;
    const smallW = () => {
      const m = mark.getBoundingClientRect().width || 160;
      return stacked() ? clamp(m * 0.6, 78, 100) : clamp(m * 0.62, 84, 124);
    };
    const w = smallW();
    mascot.style.setProperty("--tm-w", `${w}px`);
    const r = rel(words.getBoundingClientRect());
    const perchIdx = LETTERS[lang].length - 1;
    const L = LETTERS[lang][perchIdx];
    const pos = { x: r.left + (L.x / 900) * r.width, y: r.top + (L.y / 252) * r.height + 1 };
    mascot.style.transform = `translate3d(${(pos.x - w * BELLY.x).toFixed(1)}px, ${(pos.y - w * ART_RATIO * BELLY.y).toFixed(1)}px, 0)`;
  }, [lang]);

  return (
    <div ref={host} className="tm-mascot tm-on" aria-hidden="true">
      <div className="tm-pose">
        <div className="tm-idle">
          <div className="tm-watchwrap">
            <div className="tm-face">
              <Image
                src="/brands/thabaal/wing.png"
                className="tm-wing"
                alt=""
                width={640}
                height={354}
                priority
              />
              <Image
                src="/brands/thabaal/body.png"
                className="tm-body"
                alt=""
                width={640}
                height={354}
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
