"use client";

import React, { ElementType, useEffect, useRef, useState } from "react";
import { useReducedMotion, useIsMobile } from "./use-motion";

export interface SectionRevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  duration?: number;
  delay?: number;
  threshold?: number;
  rootMargin?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function SectionReveal({
  as: Component = "section",
  duration = 500,
  delay = 0,
  threshold = 0.05,
  rootMargin = "0px 0px -20px 0px",
  disabled = false,
  className = "",
  style,
  children,
  ...rest
}: SectionRevealProps) {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLElement | null>(null);

  const [motionState, setMotionState] = useState<"idle" | "active" | "done">(() =>
    disabled || reducedMotion ? "done" : "idle"
  );

  const settleY = isMobile ? 12 : 20;

  useEffect(() => {
    if (disabled || reducedMotion) {
      setMotionState("done");
      return;
    }

    const node = ref.current;
    if (!node) return;

    // Fail-safe guarantee: Content is never stuck hidden
    const failSafeTimer = setTimeout(() => {
      setMotionState("done");
    }, Math.max(900, delay + duration + 300));

    let doneTimer: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setMotionState("active");
          observer.disconnect();

          doneTimer = setTimeout(() => {
            setMotionState("done");
          }, delay + duration + 40);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);

    return () => {
      clearTimeout(failSafeTimer);
      if (doneTimer) clearTimeout(doneTimer);
      observer.disconnect();
    };
  }, [disabled, reducedMotion, delay, duration, threshold, rootMargin]);

  const isDone = motionState === "done" || disabled || reducedMotion;
  const isActive = motionState === "active";

  const computedStyle: React.CSSProperties = {
    ...style,
    ["--section-dur" as string]: `${duration}ms`,
    ["--section-delay" as string]: `${delay}ms`,
    ["--section-dist" as string]: `${settleY}px`,
    opacity: motionState === "idle" ? 0 : 1,
    transform: isDone
      ? "none"
      : isActive
      ? "translate3d(0, 0, 0) scale(1)"
      : `translate3d(0, ${settleY}px, 0) scale(0.99)`,
    transition: isDone
      ? style?.transition || "none"
      : `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
    willChange: isActive ? "opacity, transform" : style?.willChange || "auto",
  };

  return (
    <Component
      ref={ref as any}
      data-section={motionState}
      className={`thabaal-section-reveal ${className}`}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
