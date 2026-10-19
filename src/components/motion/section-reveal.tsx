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
  duration = 700,
  delay = 0,
  threshold = 0.08,
  rootMargin = "0px 0px -40px 0px",
  disabled = false,
  className = "",
  style,
  children,
  ...rest
}: SectionRevealProps) {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLElement | null>(null);

  // Status: "idle" -> "animating" -> "done"
  const [status, setStatus] = useState<"idle" | "animating" | "done">(() =>
    disabled || reducedMotion ? "done" : "idle"
  );

  const settleY = isMobile ? 16 : 28;

  useEffect(() => {
    if (disabled || reducedMotion) {
      setStatus("done");
      return;
    }

    const node = ref.current;
    if (!node) return;

    // Fail-safe guarantee (Law 5): Content is never stuck hidden
    const failSafeTimer = setTimeout(() => {
      setStatus((s) => (s === "idle" ? "done" : s));
    }, Math.max(1200, delay + duration + 400));

    // Immediate viewport check
    const rect = node.getBoundingClientRect();
    const inViewport =
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0;

    if (inViewport) {
      const enterTimer = setTimeout(() => {
        setStatus("animating");
      }, delay);

      const cleanupTimer = setTimeout(() => {
        setStatus("done");
      }, delay + duration + 80);

      return () => {
        clearTimeout(failSafeTimer);
        clearTimeout(enterTimer);
        clearTimeout(cleanupTimer);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const enterTimer = setTimeout(() => {
            setStatus("animating");
          }, delay);

          const cleanupTimer = setTimeout(() => {
            setStatus("done");
          }, delay + duration + 80);

          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);

    return () => {
      clearTimeout(failSafeTimer);
      observer.disconnect();
    };
  }, [disabled, reducedMotion, delay, duration, threshold, rootMargin]);

  const isIdle = status === "idle";
  const isAnimating = status === "animating";
  const isDone = status === "done";

  // Law 7: Full post-reveal cleanup ensures no transform, clip-path or overflow:hidden is left locked
  const computedStyle: React.CSSProperties = {
    ...style,
    opacity: isIdle ? 0 : 1,
    transform: isDone || reducedMotion
      ? "none"
      : isAnimating
      ? "translate3d(0, 0, 0) scale(1)"
      : `translate3d(0, ${settleY}px, 0) scale(0.985)`,
    transition: isDone
      ? style?.transition || "none"
      : `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    willChange: isAnimating ? "opacity, transform" : style?.willChange || "auto",
  };

  return (
    <Component
      ref={ref as any}
      className={`thabaal-section-reveal ${className}`}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
