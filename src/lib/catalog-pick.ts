// Which Meta catalogue Thabaal works on for a WhatsApp Business Account.
//
// Meta's list of catalogues connected to a WhatsApp account (GET /{waba}/product_catalogs) can come back empty
// even when WhatsApp Manager and the WhatsApp app show the catalogue connected, and a link call returned success.
// When that happens we fall back to the catalogues the same business owns, but only when there is exactly one,
// so we never guess between several.

/** The connected catalogue when Meta lists one, else the business's only catalogue, else none. */
export function chooseCatalogId(connected: string[], owned: string[]): string | null {
  if (connected.length > 0) return connected[0];
  if (owned.length === 1) return owned[0];
  return null;
}
