"use client";

import NextLink from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * The portal's <Link>: prefetches when someone shows intent (pointer over it, keyboard focus, a finger
 * touching it) instead of as soon as it scrolls into view.
 *
 * Every dashboard page is dynamic, so each prefetch is a server render of the shared layout. With the
 * default behaviour the ~20 links in the sidebar and tab bar fired 30+ such requests on every page
 * view, competing with the page itself for the server and the database. Hovering or touching a link
 * happens a moment before the click, which is enough to have the loading state ready.
 */
export default function Link({ prefetch, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);
  return (
    <NextLink
      {...rest}
      prefetch={intent ? (prefetch ?? null) : false}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
    />
  );
}
