// Shared artwork for the favicon and home-screen icons.

/** The default brand green (--color-brand in globals.css); image routes can't read CSS variables. */
export const ICON_GREEN = "#0d844a";

export function AppIcon({ size }: { size: number }) {
  const s = size;
  return (
    <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: ICON_GREEN, borderRadius: s * 0.22 }}>
      <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
    </div>
  );
}
