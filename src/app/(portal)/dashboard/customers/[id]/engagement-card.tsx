import { Card, CardHeader, Badge } from "@/components/ui";
import { Send3D } from "@/components/icons-3d";
import { fmtDate } from "@/lib/format";
import { SEGMENT_LABEL, type EngagementRow, type HistoryItem } from "@/lib/engagement-segments";
import { T } from "../../portal-ui";

// Customer page › how this customer responds to campaigns (lib/engagement-segments.ts): their group, what can stop
// a send (kept apart from the group), and their campaign story.

const TONE = { engaged: "green", seen: "blue", reached: "gray", dormant: "amber", new: "gray" } as const;
const KIND: Record<HistoryItem["kind"], { en: string; ta: string }> = {
  offer: { en: "Offer sent", ta: "சலுகை அனுப்பப்பட்டது" },
  delivered: { en: "Delivered", ta: "சேர்ந்தது" },
  read: { en: "Read", ta: "படித்தார்" },
  failed: { en: "Not delivered", ta: "சேரவில்லை" },
  button: { en: "Tapped a button", ta: "பட்டனை அழுத்தினார்" },
  reply: { en: "Replied", ta: "பதில் அனுப்பினார்" },
  order: { en: "Ordered", ta: "ஆர்டர் செய்தார்" },
};
const BLOCK = {
  "opted-out": { en: "Opted out: never sent offers", ta: "விலகியவர்: சலுகைகள் அனுப்பப்படாது" },
  unreachable: { en: "Can't receive WhatsApp: left out of campaigns", ta: "வாட்ஸ்அப் பெற முடியாது: பிரச்சாரங்களில் இல்லை" },
  "moved-inactive": { en: "Moved to Dormant by you: left out of campaigns", ta: "நீங்கள் Dormant-க்கு மாற்றினீர்கள்: பிரச்சாரங்களில் இல்லை" },
} as const;

export function EngagementCard({ row, history, hasHistory }: { row: EngagementRow | undefined; history: HistoryItem[]; hasHistory: boolean }) {
  if (!row) return null;
  const label = SEGMENT_LABEL[row.segment];
  return (
    <Card className="card-3d overflow-hidden" data-testid="engagement-card">
      <CardHeader
        tone="gold"
        icon={<Send3D />}
        title="Campaign response"
        description="How they respond to your offers, from all your campaigns so far. Taps, replies and orders count; failed messages never count against them."
      />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {hasHistory ? (
            <span data-segment={row.segment}>
              <Badge tone={TONE[row.segment]} dot>
                <T ta={label.ta}>{label.en}</T>
              </Badge>
            </span>
          ) : (
            <Badge tone="gray"><T ta="இன்னும் பிரச்சாரம் இல்லை">No campaign yet</T></Badge>
          )}
          <span className="text-xs text-muted">{hasHistory ? <T ta={label.hintTa}>{label.hint}</T> : null}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["Offers delivered", "சேர்ந்த சலுகைகள்", String(row.delivered)],
            ["Read", "படித்தவை", String(row.read)],
            ["Taps and replies", "பட்டன், பதில்கள்", String(row.buttons + row.replies)],
            ["Last response", "கடைசி பதில்", row.lastInteractionAt ? fmtDate(row.lastInteractionAt, "d MMM yyyy") : "—"],
          ].map(([en, ta, v]) => (
            <div key={en} className="rounded-control bg-sunken px-2.5 py-2">
              <dt className="text-xs text-muted"><T ta={ta}>{en}</T></dt>
              <dd className="tabular font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {(row.suppressed || row.pausedUntil) && (
          <p className="rounded-control bg-warning-bg px-3 py-2 text-xs text-warning" data-testid="engagement-block">
            {row.suppressed ? (
              <T ta={BLOCK[row.suppressed].ta}>{BLOCK[row.suppressed].en}</T>
            ) : (
              <T ta={`Meta ${fmtDate(row.pausedUntil!, "d MMM")} வரை சலுகைகளை நிறுத்தியுள்ளது (தற்காலிகம்)`}>{`Meta is holding offers back until about ${fmtDate(row.pausedUntil!, "d MMM")} (temporary)`}</T>
            )}
          </p>
        )}
        {history.length > 0 && (
          <ol className="max-h-72 space-y-1.5 overflow-y-auto text-sm" aria-label="Campaign history" tabIndex={0}>
            {history.map((h, k) => (
              <li key={k} className="flex gap-2">
                <span className="tabular w-24 shrink-0 text-xs text-muted">{fmtDate(h.at, "d MMM, h:mm a")}</span>
                <span className="min-w-0">
                  <span className="font-medium text-ink-2"><T ta={KIND[h.kind].ta}>{KIND[h.kind].en}</T></span>
                  <span className="text-muted">{` · ${h.campaign ?? h.text}`}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
