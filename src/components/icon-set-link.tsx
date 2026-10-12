import { ICON_SET_HREF } from "@/lib/icon-sets.generated";

/** Links one icon set's stylesheet (cached for a year: the file name changes with its content).
 *  React hoists it into <head> and holds the page until it's loaded, so icons never flash. */
export function IconSetLink({ set }: { set: string }) {
  const href = ICON_SET_HREF[set] ?? ICON_SET_HREF["hugeicons-regular"];
  return <link rel="stylesheet" href={href} precedence="icons" />;
}
