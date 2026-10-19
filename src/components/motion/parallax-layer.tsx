"use client";

import React, { ElementType, useEffect, useRef } from "react";
import { registerParallaxLayer, useReducedMotion } from "./use-motion";

export interface ParallaxLayerProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  speed?: number; // e.g. -0.1 for slow background, 0.15 for decorative shapes
  clamped?: number; // max displacement in pixels (default 45px)
  disabled?: boolean;
  children?: React.ReactNode;
}

export function ParallaxLayer({
  as: Component = "div",
  speed = 0.12,
  clamped = 45,
  disabled = false,
  className = "",
  style,
  children,
  ...rest
}: ParallaxLayerProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (disabled || reducedMotion) return;
    const node = ref.current;
    if (!node) return;

    // Registers with the shared rAF scroll scheduler (single global listener)
    const unregister = registerParallaxLayer(node, speed, clamped);
    return unregister;
  }, [speed, clamped, disabled, reducedMotion]);

  const computedStyle: React.CSSProperties = {
    ...style,
    willChange: disabled || reducedMotion ? "auto" : "transform",
  };

  return (
    <Component
      ref={ref as any}
      className={`thabaal-parallax-layer ${className}`}
      style={computedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}
