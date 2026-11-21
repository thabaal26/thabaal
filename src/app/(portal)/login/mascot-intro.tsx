"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import "./mascot.css";

/*
 * The sign-in page's mascot bird:
 *   Sits proudly on the last letter right from page load (positioned via pure CSS).
 *   Gentle breathing bob and natural periodic wing flutter.
 *   Subtle nod reaction to form typing and submit.
 *   Clean brand artwork without cartoon eyes or mouth overlays.
 */

export function MascotIntro({ lang }: { lang?: "en" | "ta" }) {
  void lang;
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mascot = host.current;
    if (!mascot) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const idle = mascot.querySelector<HTMLElement>(".tm-idle");
    const wing = mascot.querySelector<HTMLElement>(".tm-wing");
    const face = mascot.querySelector<HTMLElement>(".tm-face");
    const form = document.querySelector<HTMLElement>(".thabaal-form");
    if (!idle || !wing || !face) return;

    // Perch living motion: subtle breathing bob + natural periodic wing flutters
    const cycle = 5200;
    const wingAnim = wing.animate(
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

    const idleAnim = idle.animate(
      [
        { offset: 0, transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "ease-in-out" },
        { offset: 0.28, transform: "translate3d(0, -2px, 0) rotate(-1.5deg)", easing: "ease-in-out" },
        { offset: 0.58, transform: "translate3d(0, 0, 0) rotate(.8deg)", easing: "cubic-bezier(.3,0,.4,1)" },
        { offset: 0.68, transform: "translate3d(0, -4px, 0) rotate(-2deg)", easing: "cubic-bezier(.5,0,.6,1)" },
        { offset: 0.8, transform: "translate3d(0, 0, 0) rotate(0deg)", easing: "ease-in-out" },
        { offset: 1, transform: "translate3d(0, 0, 0) rotate(0deg)" },
      ],
      { duration: cycle, iterations: Infinity }
    );

    // Form typing reactions: gentle nods as user interacts
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

    const onType = () => squish(1.03, 0.96, 160);
    const onSubmit = () => squish(1.1, 0.88, 300);
    form?.addEventListener("input", onType);
    form?.addEventListener("submit", onSubmit);

    return () => {
      form?.removeEventListener("input", onType);
      form?.removeEventListener("submit", onSubmit);
      wingAnim.cancel();
      idleAnim.cancel();
    };
  }, []);

  return (
    <div ref={host} className="tm-mascot" aria-hidden="true">
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
