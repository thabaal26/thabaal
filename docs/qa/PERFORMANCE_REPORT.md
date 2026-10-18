# Thabaal: performance report (18 Oct 2026)

Measured with `tests/qa/perf.mjs` in Chromium 141 against the QA app (production build, `next start`, local
Postgres), cold cache, median of 3 loads per page, signed in as the QA shop manager. **Laptop:** 1366×768, no
throttling. **Phone:** 390×844, CPU slowed 4×, network 9 Mbps down / 1.5 Mbps up / 150 ms latency.

The server and database run on the same machine as the browser, so time to first byte is lower than on the live
site (Vercel + Neon). Compare pages with each other and runs with runs, not with field data.

Targets (Google's "good" thresholds): LCP ≤ 2,500 ms, CLS ≤ 0.1; for TBT (a lab stand-in for INP) ≤ 300 ms on a
laptop and ≤ 600 ms on the throttled phone.

## 1. Results (fixed build)

| Page | Laptop LCP | Laptop TBT | Phone FCP | Phone LCP | Phone TBT | CLS | JS (KB, transfer) | Requests |
|---|---|---|---|---|---|---|---|---|
| /login | 264 | 17 | 760 | 772 | 155 | 0 | 197 | 27 |
| Home | 312 | 47 | 832 | 1,164 | 302 | 0 | 229 | 31 |
| Orders | 292 | 56 | 756 | 1,068 | **538** | 0 | 225 | 30 |
| Payments | 252 | 56 | 732 | 1,092 | 358 | 0 | 199 | 28 |
| Customers | 240 | 43 | 768 | 1,084 | 272 | 0 | 204 | 31 |
| Products | 256 | 48 | 744 | 1,032 | 264 | 0 | 199 | 28 |
| Templates | 280 | 29 | 716 | 1,008 | 235 | 0 | 191 | 25 |
| Campaigns | 212 | 16 | 796 | 1,004 | 340 | 0 | 198 | 28 |
| Message log | 472 | 30 | 792 | 896 | 383 | 0 | 200 | 27 |
| Chats | 348 | 52 | 684 | 868 | 387 | 0.066 (phone) | 206 | 28 |
| Reports | 264 | 7 | 636 | 1,076 | 256 | 0 | 197 | 27 |
| Settings | 304 | 53 | 792 | 1,096 | 272 | 0 | 218 | 30 |

All times in ms. Every page meets every target. Raw data: `.git/qa-perf.json` (written by the suite).

## 2. Bundle

Client JavaScript in `.next/static/chunks`: 3.2 MB on disk across 48 files. The largest chunks are the chart
libraries: ECharts 634 KB (217 KB gzipped) and Recharts 441 KB (126 KB gzipped). They were not part of the
JavaScript transferred during any measured load above (191–229 KB per page, counted until the network was idle plus
one second): charts load later, once the page is idle (17 Oct change), so they don't delay the first paint.

## 3. Findings

| # | Finding | Severity | Action |
|---|---|---|---|
| P-1 | Orders on the throttled phone: 538 ms of long tasks, the highest of all pages (still under the 600 ms target). The page hydrates every order card with its actions at once. | P3 | Watch as order counts grow; a later step could render the first 20 cards and the rest on scroll. |
| P-2 | Chats on the phone: CLS 0.066 (under 0.1), the only page with any layout shift: the chat panel settles after the list loads. | P3 | None needed now. |
| P-3 | Three chart libraries are shipped (ECharts, Recharts, Chart.js). Each loads only where used and after paint, but together they are the bulk of the JavaScript. | P3 | Long term, standardise on one. Not changed: it would touch every chart. |
| P-4 | The brand icon and `/icon` are requested twice on dashboard pages: once as the tab icon, once by the notification badge that redraws the tab icon with the unread count. Small images, cached after the first visit. | P3 | None needed. |

No optimisation was made in this run: nothing measured was over target, and the scroll-smoothness work of 17 Oct
(60 fps, charts loading while idle) is already in place. Before/after: the 17 Oct baseline used a different method
(scroll FPS), so there is no like-for-like earlier load measurement; this run is the baseline for future runs.

## 4. Not measured

Live-site field data (Vercel Speed Insights is in the project's Vercel menu), Lighthouse scores, INP from real
interactions, memory over long sessions, database query timings on the live database.
