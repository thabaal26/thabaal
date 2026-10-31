// Google for "Connect Google Sheets": the sign-in (OAuth with the drive.file permission only, so Thabaal can touch
// nothing but the one spreadsheet it creates) and the few Sheets API calls the live sync needs. Plain fetch, no SDK.
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SUMMARY_HEADINGS, SUMMARY_RIGHT_HEADINGS, TABS, type Cell, type Tab } from "./layout";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

/** The Google sign-in keys are set (the same ones "Continue with Google" uses). */
export const googleReady = () => Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());

/** auth: access removed or expired (reconnect) · gone: the sheet was deleted · limit: Google's rate limit · other. */
export type GoogleErrorKind = "auth" | "gone" | "limit" | "other";
export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: GoogleErrorKind,
  ) {
    super(message);
  }
}

/* ---------- sign-in ---------- */

function stateSecret() {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is not set");
  return `gsheet-state:${s}`;
}
const sign = (body: string) => createHmac("sha256", stateSecret()).update(body).digest("base64url");

/** A signed, short-lived note of who started the sign-in, checked again when Google sends them back. */
export function signState(p: { clientId: string; userId: string }, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ c: p.clientId, u: p.userId, x: now + 15 * 60_000, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function readState(state: string | null | undefined, now = Date.now()): { clientId: string; userId: string } | null {
  const [body, sig] = (state ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: string; u?: string; x?: number };
    if (!p.c || !p.u || !p.x || p.x < now) return null;
    return { clientId: p.c, userId: p.u };
  } catch {
    return null;
  }
}

export const redirectUri = (origin: string) => `${origin}/api/google/sheets/callback`;

export function authUrl(origin: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!.trim());
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", `openid email ${SHEETS_SCOPE}`);
  // offline + consent: Google gives a refresh token, so the sheet keeps updating when nobody is signed in.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenCall(params: Record<string, string>): Promise<TokenReply> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(), ...params }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenReply;
  if (!res.ok || json.error) {
    const auth = json.error === "invalid_grant" || res.status === 400 || res.status === 401;
    throw new GoogleError(json.error_description || json.error || `Google sign-in failed (${res.status})`, res.status, auth ? "auth" : "other");
  }
  return json;
}

/** The email of the Google account in an ID token Google just sent us over TLS. */
function emailOf(idToken?: string) {
  try {
    const p = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return p.email ?? null;
  } catch {
    return null;
  }
}

/** Swaps the sign-in code for tokens; insists the person ticked the Drive permission. */
export async function exchangeCode(code: string, origin: string) {
  const r = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  if (!r.refresh_token || !r.access_token) throw new GoogleError("Google didn't give lasting access. Please try again.", 400, "auth");
  if (!(r.scope ?? "").split(/\s+/).includes(SHEETS_SCOPE))
    throw new GoogleError("The permission to create the sheet wasn't ticked. Connect again and allow it.", 400, "auth");
  return { refreshToken: r.refresh_token, accessToken: r.access_token, expiresIn: r.expires_in ?? 3600, email: emailOf(r.id_token) };
}

export async function refreshAccess(refreshToken: string) {
  const r = await tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  return { accessToken: r.access_token!, expiresIn: r.expires_in ?? 3600 };
}

/** Removes Thabaal's access from the Google account (the sheet stays theirs). Best effort. */
export async function revoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => {});
}

/* ---------- Sheets API ---------- */

async function api<T>(token: string, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (res.ok) return (await res.json().catch(() => ({}))) as T;
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
  const msg = json.error?.message ?? `Google Sheets error ${res.status}`;
  const kind: GoogleErrorKind =
    res.status === 401 ? "auth" : res.status === 404 ? "gone" : res.status === 429 ? "limit" : res.status === 403 && /permission|caller does not have/i.test(msg) && !/has not been used|disabled/i.test(msg) ? "gone" : "other";
  throw new GoogleError(msg, res.status, kind);
}

/** "A", "B", ... "AA" */
export function colLetter(n: number) {
  let s = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
export const rangeOf = (tab: Tab, from: string, to?: string) => `'${tab.title}'!${from}${to ? `:${to}` : ""}`;
const cellsOut = (rows: Cell[][]) => rows.map((r) => r.map((v) => (v == null ? "" : v)));

const rgb = (hex: string) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
const NAVY = rgb("#10283B");
const WHITE = rgb("#FFFFFF");
const BAND = rgb("#F6F8FB");

const FORMAT: Partial<Record<string, { type: string; pattern: string }>> = {
  money: { type: "CURRENCY", pattern: "[$₹]#,##0.##" },
  int: { type: "NUMBER", pattern: "0" },
  date: { type: "DATE", pattern: "dd mmm yyyy" },
  datetime: { type: "DATE_TIME", pattern: "dd mmm yyyy, h:mm am/pm" },
  phone: { type: "TEXT", pattern: "@" },
};
/** Words that colour a status cell: green (done), amber (waiting), red (stopped). */
const STATUS_COLOURS: [string[], string, string][] = [
  [["Paid", "Delivered", "Collected", "Allowed", "Payment", "Success", "Captured", "Completed", "Customer → Shop"], "#E3F6EC", "#0B6B3A"],
  [["Waiting", "Pending", "Cash on delivery", "Not paid", "Due", "Received", "Confirmed", "Dispatched", "Packed", "Ready"], "#FFF4D6", "#7A5200"],
  [["Cancelled", "Failed", "Opted out", "Refund", "Not on WhatsApp", "Rejected", "Removed"], "#FDE7E3", "#9A2A17"],
];

/** Header, widths, number formats, filter, a protected heading row, and colour for status words, tab by tab. */
function formatRequests(sheetIds: Record<string, number>) {
  const req: object[] = [];
  for (const tab of TABS) {
    const sheetId = sheetIds[tab.key];
    tab.cols.forEach((col, i) =>
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: col.w }, fields: "pixelSize" } }),
    );
    if (tab.key === "summary") {
      req.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
          cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16, foregroundColor: NAVY } } },
          fields: "userEnteredFormat.textFormat",
        },
      });
      req.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 },
          cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: rgb("#5A6B7B") } } },
          fields: "userEnteredFormat.textFormat",
        },
      });
      const heading = (row: number, c0: number, c1: number) =>
        req.push({
          repeatCell: {
            range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: c0, endColumnIndex: c1 },
            cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { bold: true, foregroundColor: WHITE } } },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        });
      for (const r of SUMMARY_HEADINGS) heading(r, 0, 2);
      for (const r of SUMMARY_RIGHT_HEADINGS) heading(r, 3, 6);
      req.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 40, startColumnIndex: 1, endColumnIndex: 2 },
          cell: { userEnteredFormat: { horizontalAlignment: "RIGHT", textFormat: { bold: true } } },
          fields: "userEnteredFormat(horizontalAlignment,textFormat)",
        },
      });
      req.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 40, startColumnIndex: 4, endColumnIndex: 6 },
          cell: { userEnteredFormat: { horizontalAlignment: "RIGHT" } },
          fields: "userEnteredFormat.horizontalAlignment",
        },
      });
      continue;
    }
    const n = tab.cols.length;
    req.push({
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: n },
          rowProperties: { headerColor: NAVY, firstBandColor: WHITE, secondBandColor: BAND },
        },
      },
    });
    req.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: n },
        cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: WHITE }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)",
      },
    });
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: "pixelSize" } });
    tab.cols.forEach((col, i) => {
      const f = FORMAT[col.kind];
      if (f)
        req.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
            cell: { userEnteredFormat: { numberFormat: f } },
            fields: "userEnteredFormat.numberFormat",
          },
        });
      if (col.kind === "status")
        for (const [words, bg, fg] of STATUS_COLOURS)
          for (const w of words)
            req.push({
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 }],
                  booleanRule: { condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: w }] }, format: { backgroundColor: rgb(bg), textFormat: { foregroundColor: rgb(fg), bold: true } } },
                },
                index: 0,
              },
            });
    });
    req.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: n } } } });
    req.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: "Headings used by Thabaal's live sync",
          warningOnly: true,
        },
      },
    });
  }
  return req;
}

/** Creates the business's sheet with every tab, heading and format. Returns its id and each tab's sheet id. */
export async function createSpreadsheet(token: string, title: string) {
  const made = await api<{ spreadsheetId: string; sheets: { properties: { sheetId: number; title: string } }[] }>(token, "POST", SHEETS, {
    properties: { title, locale: "en_IN", timeZone: "Asia/Kolkata" },
    sheets: TABS.map((tab, index) => ({
      properties: {
        title: tab.title,
        index,
        tabColorStyle: { rgbColor: rgb(tab.color) },
        gridProperties: { rowCount: tab.key === "summary" ? 40 : 1000, columnCount: tab.cols.length, frozenRowCount: tab.key === "summary" ? 0 : 1, hideGridlines: tab.key === "summary" },
      },
    })),
  });
  const ids: Record<string, number> = {};
  for (const tab of TABS) ids[tab.key] = made.sheets.find((s) => s.properties.title === tab.title)?.properties.sheetId ?? 0;
  await writeRanges(
    token,
    made.spreadsheetId,
    TABS.filter((tab) => tab.key !== "summary").map((tab) => ({ range: rangeOf(tab, "A1", `${colLetter(tab.cols.length - 1)}1`), values: [tab.cols.map((c) => c.h)] })),
  );
  await api(token, "POST", `${SHEETS}/${made.spreadsheetId}:batchUpdate`, { requests: formatRequests(ids) });
  return { spreadsheetId: made.spreadsheetId, tabs: ids };
}

/** The sheet still exists and is reachable with this access. */
export async function sheetExists(token: string, spreadsheetId: string) {
  try {
    await api(token, "GET", `${SHEETS}/${spreadsheetId}?fields=spreadsheetId`);
    return true;
  } catch (e) {
    if (e instanceof GoogleError && e.kind === "gone") return false;
    throw e;
  }
}

/** Column A (the key) of each tab, from row 2 down. */
export async function readKeys(token: string, spreadsheetId: string, tabs: Tab[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!tabs.length) return out;
  const q = tabs.map((tab) => `ranges=${encodeURIComponent(rangeOf(tab, "A2", "A"))}`).join("&");
  const r = await api<{ valueRanges?: { values?: string[][] }[] }>(token, "GET", `${SHEETS}/${spreadsheetId}/values:batchGet?majorDimension=COLUMNS&${q}`);
  tabs.forEach((tab, i) => out.set(tab.key, (r.valueRanges?.[i]?.values?.[0] ?? []).map(String)));
  return out;
}

/** Writes rows into given ranges in one call (values as they are: no formulas). */
export async function writeRanges(token: string, spreadsheetId: string, data: { range: string; values: Cell[][] }[]) {
  if (!data.length) return;
  await api(token, "POST", `${SHEETS}/${spreadsheetId}/values:batchUpdate`, { valueInputOption: "RAW", data: data.map((d) => ({ range: d.range, values: cellsOut(d.values) })) });
}

/** Adds rows under the last one of a tab (the sheet grows as needed). */
export async function appendRows(token: string, spreadsheetId: string, tab: Tab, rows: Cell[][]) {
  if (!rows.length) return;
  const range = encodeURIComponent(rangeOf(tab, "A1", colLetter(tab.cols.length - 1)));
  await api(token, "POST", `${SHEETS}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: cellsOut(rows) });
}

/** Empties every tab below its headings (a rebuild from scratch). */
export async function clearData(token: string, spreadsheetId: string) {
  await api(token, "POST", `${SHEETS}/${spreadsheetId}/values:batchClear`, {
    ranges: TABS.map((tab) => (tab.key === "summary" ? rangeOf(tab, "A1", "F40") : rangeOf(tab, "A2", colLetter(tab.cols.length - 1)))),
  });
}

export const sheetUrl = (spreadsheetId: string) => `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
