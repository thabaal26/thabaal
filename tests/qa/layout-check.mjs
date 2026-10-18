// What looks wrong on a screen even when nothing scrolls sideways. Runs inside the page (page.evaluate(layoutIssues, opts)),
// so it must stay self-contained. scope: the parts to check, e.g. "main, header, nav, aside" or "[role=dialog], dialog[open]".
//   sideways - the page scrolls sideways
//   overlap  - two pieces of text or controls drawn on top of each other
//   squeezed - text forced into a column so narrow it breaks a letter or two a line
//   touching - text or a control closer than 6px to the edge of its card
//   uneven   - tiles in the same row with different heights
//   too wide - a dialog wider than the screen
export function layoutIssues({ scope = "main, header, nav, aside", dbg = false } = {}) {
  const out = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`sideways ${document.documentElement.scrollWidth}px`);
  const label = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 24)}"`;
  const shown = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      if (a.tagName === "DIALOG" && !a.open) return false;
      if (a.tagName === "DETAILS" && !a.open && a !== el && !el.closest("summary")) return false;
    }
    return true;
  };
  const srOnly = (el, r) => r.width <= 2 || r.height <= 2 || el.closest(".sr-only") || getComputedStyle(el).clip === "rect(0px, 0px, 0px, 0px)";
  const roots = [...document.querySelectorAll(scope)].filter(shown);
  for (const d of roots) if (d.matches("[role=dialog], dialog") && d.getBoundingClientRect().width > vw + 1) out.push(`too wide ${label(d)} ${Math.round(d.getBoundingClientRect().width)}px`);
  // Things a person reads or taps: controls, plus elements with their own text.
  const boxes = [];
  const ctl = "a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],summary,img";
  const all = new Set(roots.flatMap((r) => [...r.querySelectorAll("*")]));
  for (const el of all) {
    if (el.closest("svg, canvas, [aria-hidden=true], .echarts, [_echarts_instance_]")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own && !el.matches(ctl)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || srOnly(el, r) || r.bottom < 0 || r.top > window.innerHeight * 3) continue;
    if (!shown(el)) continue;
    // Pinned bars (header, bottom menu) only count against things in the same bar.
    let pin = null;
    for (let a = el; a && a !== document.body; a = a.parentElement) if (/fixed|sticky/.test(getComputedStyle(a).position)) { pin = a; break; }
    // What a scrolling or clipping box around it hides isn't on screen (a menu scrolled past, a truncated line).
    let clip = { left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (/(auto|scroll|hidden|clip)/.test(st.overflowX + st.overflowY)) {
        const cr = a.getBoundingClientRect();
        clip = { left: Math.max(clip.left, cr.left), right: Math.min(clip.right, cr.right), top: Math.max(clip.top, cr.top), bottom: Math.min(clip.bottom, cr.bottom) };
      }
    }
    const cut = (q) => ({ left: Math.max(q.left, clip.left), right: Math.min(q.right, clip.right), top: Math.max(q.top, clip.top), bottom: Math.min(q.bottom, clip.bottom) });
    const real = (q) => q.right - q.left > 2 && q.bottom - q.top > 2;
    // Text: each line's own extent, not the stretched block (a short label in a wide row, or a line that wraps,
    // doesn't count as covering its neighbours). Buttons and fields: their whole box, since it's drawn.
    let rects = [cut(r)];
    const textual = own && !el.matches("button,input,select,textarea,summary,img,[role=button],[role=tab]");
    if (textual) {
      const range = document.createRange();
      range.selectNodeContents(el);
      rects = [...range.getClientRects()].map((q) => cut({ left: Math.max(q.left, r.left), right: Math.min(q.right, r.right), top: Math.max(q.top, r.top), bottom: Math.min(q.bottom, r.bottom) }));
    }
    rects = rects.filter(real);
    if (!rects.length) continue;
    const rect = rects.reduce((u, q) => ({ left: Math.min(u.left, q.left), right: Math.max(u.right, q.right), top: Math.min(u.top, q.top), bottom: Math.max(u.bottom, q.bottom) }));
    if (textual) {
      // Squeezed: a sentence in a column only a few letters wide.
      const text = (el.textContent || "").trim();
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
      if (text.length >= 12 && r.width < 60 && r.height > lh * 4) out.push(`squeezed ${label(el)} ${Math.round(r.width)}px wide`);
    }
    boxes.push({ el, r: rect, rects, pin });
  }
  if (dbg) out.push(`debug boxes=${boxes.length}`);
  // Overlap: two boxes that aren't nested, drawn over each other by more than a sliver.
  const seen = new Set();
  const abs = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === "absolute") return true; return false; };
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.pin !== B.pin) continue;
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const hit = A.rects.some((a) => B.rects.some((b) => {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 3 && h > 3 && w * h > 24;
      }));
      if (hit) {
        // Stacked on purpose (an absolutely placed badge on its button) is fine.
        if (abs(A.el) || abs(B.el)) continue;
        const k = `overlap ${label(A.el)} × ${label(B.el)}`;
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
    }
  // Touching: content closer than 6px to its card's edge.
  for (const card of [...all].filter((e) => e.matches(".card, [class*='rounded-card'], .stat, .tile"))) {
    const cr = card.getBoundingClientRect();
    if (cr.width < 40 || !shown(card)) continue;
    const cs = getComputedStyle(card);
    if (parseFloat(cs.paddingLeft) === 0 && parseFloat(cs.paddingTop) === 0) continue; // edge-to-edge lists and images
    for (const bx of boxes) {
      if (!card.contains(bx.el) || bx.el.matches("img")) continue;
      const d = Math.min(bx.r.left - cr.left, cr.right - bx.r.right, bx.r.top - cr.top, cr.bottom - bx.r.bottom);
      if (d < 6 && d > -1) {
        const k = `touching edge ${label(bx.el)} (${Math.round(d)}px)`;
        if (!seen.has(k)) { seen.add(k); out.push(k); }
        break;
      }
    }
  }
  // Uneven: stat tiles side by side with different heights.
  const tiles = [...all].filter((e) => e.matches(".stat, .kpi, [data-stat]") && shown(e)).map((t) => t.getBoundingClientRect());
  const rows = new Map();
  for (const r of tiles) { const k = Math.round(r.top / 4); rows.set(k, [...(rows.get(k) ?? []), r.height]); }
  for (const hs of rows.values()) if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 2) out.push(`uneven tiles ${hs.map(Math.round).join("/")}`);
  return [...new Set(out)].slice(0, 12);
}
