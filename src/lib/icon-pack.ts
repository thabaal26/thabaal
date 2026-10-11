// Which icon set a client's portal draws with. Both sets ship in every page and CSS shows
// the chosen one (see the [data-icons] rules in globals.css), so switching needs no rebuild.

export const ICON_PACKS = [
  { id: "hugeicons", label: "Hugeicons", hint: "Soft rounded line icons on coloured tiles. The default." },
  { id: "classic", label: "Classic", hint: "The original Lucide icons with the glossy 3D menu tiles." },
] as const;

export type IconPack = (typeof ICON_PACKS)[number]["id"];

export const DEFAULT_ICON_PACK: IconPack = "hugeicons";

export const isIconPack = (v: unknown): v is IconPack => ICON_PACKS.some((p) => p.id === v);

export const iconPackOf = (v: unknown): IconPack => (isIconPack(v) ? v : DEFAULT_ICON_PACK);
