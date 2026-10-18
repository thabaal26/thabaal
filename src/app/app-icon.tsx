import { readFileSync } from "node:fs";
import path from "node:path";

// Shared Thabaal artwork for the browser tab favicon, Apple touch icon, and PWA home-screen icons.

export const ICON_BG = "#ffffff";
export const ICON_NAVY = "#031b33";

let cachedMarkDataUri: string | null = null;

function getThabaalMarkDataUri(): string {
  if (cachedMarkDataUri) return cachedMarkDataUri;
  try {
    const file = path.join(process.cwd(), "public", "brands", "thabaal", "mark.png");
    const base64 = readFileSync(file).toString("base64");
    cachedMarkDataUri = `data:image/png;base64,${base64}`;
    return cachedMarkDataUri;
  } catch {
    return "";
  }
}

export function AppIcon({ size, maskable = false }: { size: number; maskable?: boolean }) {
  const s = size;
  const markUri = getThabaalMarkDataUri();
  const imgW = Math.round(s * (maskable ? 0.72 : 0.86));
  const imgH = Math.round(imgW * (554 / 1024));

  return (
    <div
      style={{
        width: s,
        height: s,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BG,
        borderRadius: maskable ? 0 : Math.round(s * 0.22),
        border: maskable ? "none" : `${Math.max(2, Math.round(s * 0.03))}px solid #e2e8f0`,
      }}
    >
      {markUri ? (
        <img
          src={markUri}
          alt="Thabaal"
          width={imgW}
          height={imgH}
          style={{ objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            fontSize: Math.round(s * 0.5),
            fontWeight: 800,
            color: ICON_NAVY,
          }}
        >
          T
        </div>
      )}
    </div>
  );
}
