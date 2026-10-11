// How a client's portal draws its icons. Two independent choices, both made by the admin on the
// Clients page: the icon set, and the look of the coloured icon tiles. Every icon ships in every
// variant and CSS shows the chosen one (see the [data-icons]/[data-look] rules in globals.css),
// so switching needs no rebuild.

export const ICON_PACKS = [
  { id: "hugeicons", label: "Hugeicons", hint: "Soft, rounded line icons. The default." },
  { id: "lucide", label: "Lucide", hint: "Crisp classic line icons; 3D tiles get the original glossy drawings." },
] as const;

export const ICON_LOOKS = [
  { id: "3d", label: "3D glossy", hint: "Raised tiles with a shine and soft shadow. The default." },
  { id: "2d", label: "2D flat", hint: "Flat coloured tiles, no shine or shadow." },
] as const;

export type IconPack = (typeof ICON_PACKS)[number]["id"];
export type IconLook = (typeof ICON_LOOKS)[number]["id"];

export const isIconPack = (v: unknown): v is IconPack => ICON_PACKS.some((p) => p.id === v);
export const isIconLook = (v: unknown): v is IconLook => ICON_LOOKS.some((p) => p.id === v);

/** "classic" was the first name for Lucide. */
export const iconPackOf = (v: unknown): IconPack => (v === "classic" ? "lucide" : isIconPack(v) ? v : "hugeicons");
export const iconLookOf = (v: unknown): IconLook => (isIconLook(v) ? v : "3d");
