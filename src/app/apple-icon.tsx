import { ImageResponse } from "next/og";
import { AppIcon, ICON_GREEN } from "./app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS rounds the corners itself, so fill the square.
  return new ImageResponse(
    <div style={{ width: 180, height: 180, display: "flex", background: ICON_GREEN }}>
      <AppIcon size={180} />
    </div>,
    size,
  );
}
