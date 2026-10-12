// The factory behind every portal icon (see index.ts). An icon is an empty <svg> that CSS paints:
// a mask of the drawing over currentColor. The drawing comes from the icon set the portal uses
// (lib/appearance.ts): the dashboard links that set's stylesheet, which defines --pi-<id>.
// So a page's JavaScript carries no icon drawings, and switching sets needs no rebuild.

import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children" | "strokeWidth"> & {
  /** Pixel size; usually left alone and set with a Tailwind size-* class instead. */
  size?: number | string;
  /** Ignored: the stroke weight is a portal setting (Appearance → Weight). Kept so old calls still type-check. */
  strokeWidth?: number | string;
};
export type IconComponent = ((props: IconProps) => React.JSX.Element) & { displayName?: string };

export function icon(id: string, name: string): IconComponent {
  const Icon = ({ size = 24, strokeWidth, className, ...rest }: IconProps) => {
    void strokeWidth;
    const labelled = Boolean(rest["aria-label"]);
    return (
      <svg
        width={size}
        height={size}
        aria-hidden={labelled || rest.role ? undefined : true}
        role={labelled ? "img" : undefined}
        focusable="false"
        {...rest}
        className={cn("pi", `pi-${id}`, className)}
      />
    );
  };
  Icon.displayName = name;
  return Icon;
}
