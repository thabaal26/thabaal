// The factory behind every portal icon (see index.ts). Each icon draws both packs; CSS hides the one the
// client didn't pick (lib/icon-pack.ts).

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { LucideIcon } from "lucide-react";
import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children" | "strokeWidth"> & {
  /** Pixel size; usually left alone and set with a Tailwind size-* class instead. */
  size?: number | string;
  strokeWidth?: number;
};
export type IconComponent = ((props: IconProps) => React.JSX.Element) & { displayName?: string };

/** Slightly heavier than the 1.5 Hugeicons draws at, so 16px icons stay crisp next to text. */
const STROKE = 1.75;

export function icon(svg: IconSvgElement, Classic: LucideIcon, name: string): IconComponent {
  const Icon = ({ size = 24, strokeWidth, className, ...rest }: IconProps) => {
    const hidden = rest["aria-label"] || rest.role ? undefined : true;
    return (
      <>
        <HugeiconsIcon icon={svg} size={size} strokeWidth={strokeWidth ?? STROKE} aria-hidden={hidden} focusable="false" {...rest} className={cn("ip-huge", className)} />
        <Classic size={size} strokeWidth={strokeWidth ?? 2} aria-hidden={hidden} focusable="false" {...rest} className={cn("ip-lucide", className)} />
      </>
    );
  };
  Icon.displayName = name;
  return Icon;
}
