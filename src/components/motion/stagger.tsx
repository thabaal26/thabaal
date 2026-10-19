"use client";

import React, { createContext, useContext, useEffect, useRef, useState, ElementType } from "react";
import { useReducedMotion, useIsMobile } from "./use-motion";

interface StaggerContextType {
  motionState: "idle" | "active" | "done";
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
  threshold = 0.05,
  rootMargin = "0px 0px -20px 0px",
  disabled = false,
  className = "",
  style,
  children,
  ...rest
}: StaggerGroupProps) {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLElement | null>(null);
  const [motionState, setMotionState] = useState<"idle" | "active" | "done">(() =>
    disabled || reducedMotion ? "done" : "idle"
  );

  const defaultStagger = isMobile ? 35 : 55;
  const effectiveStaggerMs = staggerMs !== undefined ? staggerMs : defaultStagger;

  // Counter to automatically assign sequential indices to child StaggerItems
  const itemCounterRef = useRef(0);
  itemCounterRef.current = 0;

  const registerItem = () => {
    const idx = itemCounterRef.current;
    itemCounterRef.current += 1;
    return idx;
  };

  useEffect(() => {
    if (disabled || reducedMotion) {
      setMotionState("done");
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    // Fail-safe guarantee: Content is never stuck hidden
    const failSafeTimer = setTimeout(() => {
      setMotionState("done");
    }, 950);

    let doneTimer: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setMotionState("active");
          observer.disconnect();

          // After max delay + animation duration, switch to "done"
          // This cleans up all transitions/transforms so dropdowns and popups work 100% without clipping!
          doneTimer = setTimeout(() => {
            setMotionState("done");
          }, maxDelayMs + 450);
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
  }, [disabled, reducedMotion, threshold, rootMargin, maxDelayMs]);

  return (
    <StaggerContext.Provider
      value={{
        motionState,
        staggerMs: effectiveStaggerMs,
        maxDelayMs,
        registerItem,
      }}
    >
      <Component
        ref={containerRef as any}
        data-stagger-group={motionState}
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
  duration = 420,
  distance,
  className = "",
  style,
  children,
  ...rest
}: StaggerItemProps) {
  const context = useContext(StaggerContext);
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const indexRef = useRef<number | null>(null);

  if (indexRef.current === null) {
    indexRef.current = explicitIndex !== undefined ? explicitIndex : (context ? context.registerItem() : 0);
  }

  const idx = explicitIndex !== undefined ? explicitIndex : (indexRef.current ?? 0);
  const staggerMs = context ? context.staggerMs : (isMobile ? 35 : 55);
  const maxDelay = context ? context.maxDelayMs : 450;
  const delay = Math.min(idx * staggerMs, maxDelay);
  const effectiveDistance = distance !== undefined ? distance : (isMobile ? 10 : 16);

  const motionState = context ? context.motionState : (reducedMotion ? "done" : "active");
  const isDone = motionState === "done" || reducedMotion;

  // GPU compositor friendly styles using CSS custom properties - 0 React re-renders!
  const computedStyle: React.CSSProperties = {
    ...style,
    ["--stagger-delay" as string]: `${delay}ms`,
    ["--stagger-dur" as string]: `${duration}ms`,
    ["--stagger-dist" as string]: `${effectiveDistance}px`,
    ...(isDone ? { transform: "none", willChange: "auto", transition: style?.transition || "none" } : {}),
  };

  return (
    <Component
      className={`thabaal-stagger-item ${className}`}
      data-stagger-item={motionState}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
