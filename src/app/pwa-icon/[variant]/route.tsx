import { ImageResponse } from "next/og";
import { AppIcon } from "../../app-icon";

// Android launcher icons: /pwa-icon/192, /pwa-icon/512 and /pwa-icon/maskable (full bleed, safe-zone padded).
export async function GET(_: Request, ctx: RouteContext<"/pwa-icon/[variant]">) {
  const { variant } = await ctx.params;
  if (variant === "maskable") {
    return new ImageResponse(<AppIcon size={512} maskable />, { width: 512, height: 512 });
  }
  const size = variant === "192" ? 192 : 512;
  return new ImageResponse(<AppIcon size={size} />, { width: size, height: size });
}
