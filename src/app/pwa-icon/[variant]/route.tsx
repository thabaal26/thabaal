import { ImageResponse } from "next/og";
import { AppIcon, ICON_GREEN } from "../../app-icon";

// Android launcher icons: /pwa-icon/192, /pwa-icon/512 and /pwa-icon/maskable (full bleed, safe-zone padded).
export async function GET(_: Request, ctx: RouteContext<"/pwa-icon/[variant]">) {
  const { variant } = await ctx.params;
  if (variant === "maskable") {
    return new ImageResponse(
      <div style={{ width: 512, height: 512, display: "flex", alignItems: "center", justifyContent: "center", background: ICON_GREEN }}>
        <svg width={230} height={230} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      </div>,
      { width: 512, height: 512 },
    );
  }
  const size = variant === "192" ? 192 : 512;
  return new ImageResponse(<AppIcon size={size} />, { width: size, height: size });
}
