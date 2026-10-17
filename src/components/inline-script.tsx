"use client";

/**
 * An inline script that runs as the browser parses the server HTML (before first paint), without
 * React's dev warning about rendering <script> tags. On the server it's real JavaScript; when React
 * renders it in the browser it becomes inert text, and suppressHydrationWarning accepts the
 * type difference. See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 */
export function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
