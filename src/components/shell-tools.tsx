"use client";

import { createContext, useContext, type ReactNode } from "react";
import { NotificationBell } from "@/components/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";

/** What the dashboard frame offers every page header (set once by the dashboard layout). */
const ShellContext = createContext<{ notifications: boolean } | null>(null);

export function ShellProvider({ notifications, children }: { notifications: boolean; children: ReactNode }) {
  return <ShellContext.Provider value={{ notifications }}>{children}</ShellContext.Provider>;
}

const round = "grid size-10 place-items-center rounded-full border-[1.5px] border-line bg-panel text-ink shadow-xs transition hover:border-ink";

/**
 * Computers: the bell and the light/dark switch at the right of every page title (phones have
 * them in the top bar). Inside the dashboard frame the language button is left out: the side menu already has the
 * language switch at these widths (owner asked for one switch, not two). Outside the frame, `lang` is shown alone.
 */
export function PageTools({ lang }: { lang?: ReactNode }) {
  const shell = useContext(ShellContext);
  if (!shell) return <>{lang}</>;
  return (
    <div className="hidden shrink-0 items-center gap-2 lg:flex print:hidden">
      {shell.notifications && <NotificationBell className={round} />}
      <ThemeToggle className={round} />
    </div>
  );
}
