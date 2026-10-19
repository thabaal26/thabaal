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
  duration = 420,
  delay = 0,
  threshold = 0.05,
  rootMargin = "0px 0px -20px 0px",
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

  const [motionState, setMotionState] = useState<"idle" | "active" | "done">(() =>
    disabled || reducedMotion ? "done" : "idle"
  );

  const defaultDistance = isMobile ? 10 : 16;
  const effectiveDistance = distance !== undefined ? distance : defaultDistance;

  useEffect(() => {
    if (disabled || reducedMotion) {
      setMotionState("done");
      return;
    }

    const node = ref.current;
    if (!node) return;

    // Fail-safe visibility guarantee: Never stuck hidden past 800ms
    const failSafeTimer = setTimeout(() => {
      setMotionState("done");
    }, Math.max(800, delay + duration + 300));

    let doneTimer: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setMotionState("active");
          if (once) observer.disconnect();

          doneTimer = setTimeout(() => {
            setMotionState("done");
          }, delay + duration + 30);
        } else if (!once) {
          setMotionState("idle");
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
  }, [disabled, reducedMotion, delay, duration, threshold, rootMargin, once]);

  // Compute transform offset based on direction
  const getInitialTransform = () => {
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

  const isDone = motionState === "done" || disabled || reducedMotion;
  const isActive = motionState === "active";

  const computedStyle: React.CSSProperties = {
    ...style,
    ["--reveal-dur" as string]: `${duration}ms`,
    ["--reveal-delay" as string]: `${delay}ms`,
    opacity: motionState === "idle" ? 0 : 1,
    transform: isDone ? "none" : isActive ? "translate3d(0, 0, 0)" : getInitialTransform(),
    transition: isDone
      ? style?.transition || "none"
      : `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    willChange: isActive ? "opacity, transform" : style?.willChange || "auto",
  };

  return (
    <Component
      ref={ref as any}
      data-reveal={motionState}
      className={`thabaal-reveal ${className}`}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
