"use client";

/*
 * Shared pieces of the portal design (thabaal-portal.html), drawn with its own classes from
 * portal.css: page frame and header, tabs, chips, period switch, pills, and the English/தமிழ்
 * switch. Pages pass live data in; nothing here holds sample figures.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import Link from "@/components/intent-link";
import { PageTools } from "@/components/shell-tools";
import "./portal.css";

/* ── Language: the same choice as the sign-in page ("thabaal-lang"), per device ── */

type Lang = "en" | "ta";
const LANG_KEY = "thabaal-lang";
const LANG_EVENT = "thabaal-lang";

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}
function subscribeLang(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LANG_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LANG_EVENT, cb);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, readLang, () => "en");
}

export function setLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {}
  window.dispatchEvent(new Event(LANG_EVENT));
}

/** English text, or its Tamil version when Tamil is chosen (the design's data-ta strings). */
export function T({ ta, children }: { ta?: string; children: ReactNode }) {
  const lang = useLang();
  return <>{lang === "ta" && ta ? ta : children}</>;
}

export function LangButton() {
  const lang = useLang();
  return (
    <button type="button" className="iconbtn" aria-label="Language: English or Tamil" style={{ width: "auto", padding: "0 12px", fontWeight: 700 }} onClick={() => setLang(lang === "ta" ? "en" : "ta")}>
      {lang === "ta" ? "EN" : "தமிழ்"}
    </button>
  );
}

/* ── Page frame: <div class="thabaal-portal"> with the design's header ── */

export function PortalPage({
  title,
  titleTa,
  sub,
  subTa,
  actions,
  children,
}: {
  title: ReactNode;
  titleTa?: string;
  sub?: ReactNode;
  subTa?: string;
  /** The page's main button(s), left of the bell. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="thabaal-portal">
      <div className="wrapin">
        <header className="top">
          <div>
            <h1>{titleTa ? <T ta={titleTa}>{title}</T> : title}</h1>
            {sub && <p className="sub">{subTa ? <T ta={subTa}>{sub}</T> : sub}</p>}
          </div>
          <div className="tools">
            {actions}
            <LangButton />
            <PageTools />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

/* ── URL state: tabs, chips and periods live in the address (?tab=…), so links and Back work ── */

export function useQueryState(key: string, fallback: string): [string, (v: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const value = sp.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const next = new URLSearchParams(sp.toString());
      if (v === fallback) next.delete(key);
      else next.set(key, v);
      const qs = next.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [sp, router, path, key, fallback],
  );
  return [value, set];
}

export type TabDef = { id: string; label: string; ta?: string; count?: number };

/** The design's underlined tabs. Pass `panels` keyed by tab id; only the open one renders. */
export function Tabs({ tabs, panels, param = "tab", label }: { tabs: TabDef[]; panels: Record<string, ReactNode>; param?: string; label: string }) {
  const [cur, setCur] = useQueryState(param, tabs[0].id);
  const open = tabs.some((t) => t.id === cur) ? cur : tabs[0].id;
  return (
    <>
      <div className="tabs" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={open === t.id} onClick={() => setCur(t.id)}>
            <T ta={t.ta}>{t.label}</T>
            {t.count ? <small style={{ marginLeft: 6, opacity: 0.7 }}>{t.count}</small> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panels[open]}</div>
    </>
  );
}

/** A row of filter chips; returns the picked id. */
export function Chips({ options, value, onChange, label, style }: { options: { id: string; label: string; ta?: string; n?: number }[]; value: string; onChange: (v: string) => void; label: string; style?: React.CSSProperties }) {
  return (
    <div className="chips" role="group" aria-label={label} style={style}>
      {options.map((o) => (
        <button key={o.id} type="button" className="chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          <T ta={o.ta}>{o.label}</T>
          {o.n !== undefined && <small>{o.n.toLocaleString("en-IN")}</small>}
        </button>
      ))}
    </div>
  );
}

/** The design's segmented switch (7 / 30 / 90 days…). With `hrefs`, each option is a link. */
export function Seg({ options, value, onChange, label }: { options: { id: string; label: string; href?: string }[]; value: string; onChange?: (v: string) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) =>
        o.href ? (
          <Link key={o.id} href={o.href} scroll={false} aria-pressed={value === o.id} role="button" style={{ border: 0, padding: "6px 12px", borderRadius: 9, fontWeight: 600, fontSize: 13.5, textDecoration: "none", color: value === o.id ? "var(--bg)" : "var(--muted)", background: value === o.id ? "var(--ink)" : "none" }}>
            {o.label}
          </Link>
        ) : (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange?.(o.id)}>
            {o.label}
          </button>
        ),
      )}
    </div>
  );
}

export type PillTone = "ok" | "warn" | "bad" | "info" | "mute";
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

/** Small area sparkline in the design's colours (gold, or red when falling). */
export function Spark({ data, down }: { data: number[]; down?: boolean }) {
  const w = 120,
    h = 34,
    pad = 3;
  const s = data.length >= 2 ? data : [0, 0];
  const min = Math.min(...s),
    max = Math.max(...s),
    r = max - min || 1;
  const pts = s.map((v, i) => [(i / (s.length - 1)) * w, max === min ? h - pad : h - pad - ((v - min) / r) * (h - pad * 2)]);
  const d = "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L");
  const c = down ? "#F46B4E" : "#FFC329";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: "100%", height: 34, display: "block" }}>
      <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={c} fillOpacity={0.22} />
      <path d={d} fill="none" stroke={c} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}


/** Tabs that are separate addresses (each tab is its own page). `current` is the open tab's id. */
export function LinkTabs({ tabs, current, label }: { tabs: { id: string; label: string; ta?: string; href: string; count?: number }[]; current: string; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === current ? "page" : undefined} aria-selected={t.id === current}>
          <T ta={t.ta}>{t.label}</T>
          {t.count ? <small style={{ marginLeft: 6, opacity: 0.7 }}>{t.count}</small> : null}
        </Link>
      ))}
    </nav>
  );
}

type ActResult = { ok: boolean; message?: string; errors?: string[] };

/**
 * A design button (.btn) that runs a bound server action: optional confirmation (the app's own
 * dialog), then the result as a toast and a refresh. Ignores repeat taps while it runs.
 */
export function PAction({
  action,
  children,
  confirm,
  className = "sm",
  title,
  style,
  "aria-label": ariaLabel,
}: {
  action: () => Promise<ActResult>;
  children: ReactNode;
  confirm?: string;
  /** Extra design classes after "btn": "sm", "primary sm", "ghost sm"… */
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}) {
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  return (
    <button
      type="button"
      className={`btn ${className}`}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      disabled={pending}
      style={{ ...style, ...(pending ? { opacity: 0.6 } : null) }}
      onClick={async () => {
        if (busy.current) return;
        busy.current = true;
        try {
          if (confirm && !(await confirmAction(confirm))) return;
          start(async () => {
            toastResult(await action());
            router.refresh();
          });
        } finally {
          busy.current = false;
        }
      }}
    >
      {children}
    </button>
  );
}
