"use client";

import React, { createContext, useContext, useEffect, useRef, useState, ElementType } from "react";
import { useReducedMotion, useIsMobile } from "./use-motion";

interface StaggerContextType {
  isTriggered: boolean;
  staggerMs: number;
  maxDelayMs: number;
  registerItem: () => number;
}

const StaggerContext = createContext<StaggerContextType | null>(null);

export interface StaggerGroupProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  staggerMs?: number;
  maxDelayMs?: number;
  threshold?: number;
  rootMargin?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function StaggerGroup({
  as: Component = "div",
  staggerMs,
  maxDelayMs = 450,
  threshold = 0.1,
  rootMargin = "0px 0px -30px 0px",
  disabled = false,
  className = "",
  style,
  children,
  ...rest
}: StaggerGroupProps) {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLElement | null>(null);
  const [isTriggered, setIsTriggered] = useState(() => disabled || reducedMotion);

  const defaultStagger = isMobile ? 45 : 75;
  const effectiveStaggerMs = staggerMs !== undefined ? staggerMs : defaultStagger;

  // Counter to automatically assign sequential indices to child StaggerItems
  const itemCounterRef = useRef(0);
  // Reset counter on re-render so indices remain deterministic
  itemCounterRef.current = 0;

  const registerItem = () => {
    const idx = itemCounterRef.current;
    itemCounterRef.current += 1;
    return idx;
  };

  useEffect(() => {
    if (disabled || reducedMotion) {
      setIsTriggered(true);
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    // Fail-safe guarantee (Law 5): Content is never stuck hidden
    const failSafeTimer = setTimeout(() => {
      setIsTriggered(true);
    }, 1200);

    // Immediate viewport check
    const rect = node.getBoundingClientRect();
    const inViewport =
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0;

    if (inViewport) {
      setIsTriggered(true);
      clearTimeout(failSafeTimer);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsTriggered(true);
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
  }, [disabled, reducedMotion, threshold, rootMargin]);

  return (
    <StaggerContext.Provider
      value={{
        isTriggered,
        staggerMs: effectiveStaggerMs,
        maxDelayMs,
        registerItem,
      }}
    >
      <Component
        ref={containerRef as any}
        className={`thabaal-stagger-group ${className}`}
        style={style}
        {...rest}
      >
        {children}
      </Component>
    </StaggerContext.Provider>
  );
}

export interface StaggerItemProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  index?: number;
  duration?: number;
  distance?: number;
  children: React.ReactNode;
}

export function StaggerItem({
  as: Component = "div",
  index: explicitIndex,
  duration = 500,
  distance,
  className = "",
  style,
  children,
  ...rest
}: StaggerItemProps) {
  const context = useContext(StaggerContext);
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [assignedIndex] = useState(() =>
    explicitIndex !== undefined ? explicitIndex : (context ? context.registerItem() : 0)
  );

  const idx = explicitIndex !== undefined ? explicitIndex : assignedIndex;
  const isTriggered = context ? context.isTriggered : true;
  const staggerMs = context ? context.staggerMs : (isMobile ? 45 : 75);
  const maxDelay = context ? context.maxDelayMs : 450;

  const defaultDistance = isMobile ? 12 : 18;
  const effectiveDistance = distance !== undefined ? distance : defaultDistance;

  // Calculate capped delay
  const computedDelay = Math.min(idx * staggerMs, maxDelay);

  // Status: "idle" -> "animating" -> "done"
  const [status, setStatus] = useState<"idle" | "animating" | "done">(() =>
    reducedMotion ? "done" : "idle"
  );

  useEffect(() => {
    if (reducedMotion) {
      setStatus("done");
      return;
    }

    if (isTriggered) {
      const enterTimer = setTimeout(() => {
        setStatus("animating");
      }, computedDelay);

      const cleanupTimer = setTimeout(() => {
        // Law 7: Clean up transform once animation finishes so dropdowns & popovers are never clipped
        setStatus("done");
      }, computedDelay + duration + 50);

      return () => {
        clearTimeout(enterTimer);
        clearTimeout(cleanupTimer);
      };
    }
  }, [isTriggered, computedDelay, duration, reducedMotion]);

  const isIdle = status === "idle";
  const isAnimating = status === "animating";
  const isDone = status === "done";

  const getTransform = () => {
    if (isDone || reducedMotion) return "none";
    if (isAnimating) return "translate3d(0, 0, 0) scale(1)";
    return `translate3d(0, ${effectiveDistance}px, 0) scale(0.985)`;
  };

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
      className={`thabaal-stagger-item ${className}`}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
