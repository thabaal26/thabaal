"use client";

import React, { ElementType, useEffect, useRef, useState } from "react";
import { useReducedMotion, useIsMobile } from "./use-motion";

export type ScrollRevealDirection = "up" | "down" | "left" | "right" | "none";

export interface ScrollRevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  direction?: ScrollRevealDirection;
  distance?: number;
  duration?: number;
  delay?: number;
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

export function ScrollReveal({
  as: Component = "div",
  direction = "up",
  distance,
  duration = 550,
  delay = 0,
  threshold = 0.12,
  rootMargin = "0px 0px -30px 0px",
  once = true,
  disabled = false,
  className = "",
  style,
  children,
  ...rest
}: ScrollRevealProps) {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLElement | null>(null);

  // Status: "idle" (hidden) -> "animating" -> "done" (cleared)
  const [status, setStatus] = useState<"idle" | "animating" | "done">(() =>
    disabled || reducedMotion ? "done" : "idle"
  );

  const defaultDistance = isMobile ? 12 : 22;
  const effectiveDistance = distance !== undefined ? distance : defaultDistance;

  useEffect(() => {
    if (disabled || reducedMotion) {
      setStatus("done");
      return;
    }

    const node = ref.current;
    if (!node) return;

    // Fail-safe visibility guarantee (Law 5): Content is never stuck hidden past 1200ms
    const failSafeTimer = setTimeout(() => {
      setStatus((s) => (s === "idle" ? "done" : s));
    }, Math.max(1200, delay + duration + 400));

    // Immediate viewport check on mount (Law 5)
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
      }, delay + duration + 60);

      return () => {
        clearTimeout(failSafeTimer);
        clearTimeout(enterTimer);
        clearTimeout(cleanupTimer);
      };
    }

    // IntersectionObserver for elements scrolled into view
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const enterTimer = setTimeout(() => {
            setStatus("animating");
          }, delay);

          const cleanupTimer = setTimeout(() => {
            setStatus("done");
            if (once) observer.disconnect();
          }, delay + duration + 60);

          if (once) {
            observer.unobserve(entry.target);
          }
        } else if (!once) {
          setStatus("idle");
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);

    return () => {
      clearTimeout(failSafeTimer);
      observer.disconnect();
    };
  }, [disabled, reducedMotion, delay, duration, threshold, rootMargin, once]);

  // Compute transform offset based on direction
  const getTransform = () => {
    if (status === "done" || disabled || reducedMotion) return "none";
    if (status === "animating") return "translate3d(0, 0, 0)";

    switch (direction) {
      case "up":
        return `translate3d(0, ${effectiveDistance}px, 0)`;
      case "down":
        return `translate3d(0, -${effectiveDistance}px, 0)`;
      case "left":
        return `translate3d(${effectiveDistance}px, 0, 0)`;
      case "right":
        return `translate3d(-${effectiveDistance}px, 0, 0)`;
      case "none":
      default:
        return "translate3d(0, 0, 0)";
    }
  };

  const isIdle = status === "idle";
  const isAnimating = status === "animating";
  const isDone = status === "done";

  // Law 7: When done, transform and willChange are completely cleared to prevent stacking context bugs
  const computedStyle: React.CSSProperties = {
    ...style,
    opacity: isIdle ? 0 : 1,
    transform: getTransform(),
    transition: isDone
      ? style?.transition || "none"
      : `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    willChange: isAnimating ? "opacity, transform" : style?.willChange || "auto",
  };

  return (
    <Component
      ref={ref as any}
      className={`thabaal-reveal ${className}`}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
