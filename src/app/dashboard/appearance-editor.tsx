"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Bell, Check, ChevronDown, Package, Search, Send, ShoppingCart, Sparkles, Truck, Users } from "@/components/icons";
import { Bell3D, Dashboard3D, Rupee3D, ShoppingBag3D, Trophy3D, Users3D } from "@/components/icons-3d";
import { IconSetLink } from "@/components/icon-set-link";
import { TrendChart } from "@/components/charts";
import { ColumnChart } from "@/components/viz";
import { toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader, IconCube, type HeaderTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  APPEARANCE_KEYS,
  BUILT_IN,
  ICON_PACKS,
  OPTIONS,
  appearanceAttrs,
  iconSetId,
  type Appearance,
  type AppearanceKey,
  type AppearanceOverrides,
} from "@/lib/appearance";
import { saveClientAppearance, savePortalAppearance } from "./actions/appearance";

type Props =
  | { mode: "portal"; initial: Appearance }
  | { mode: "client"; clientId: string; clientName: string; initial: AppearanceOverrides; portal: Appearance };

const GROUPS: { title: string; note?: string; keys: AppearanceKey[] }[] = [
  { title: "Icons", note: "The line icons on every screen.", keys: ["iconPack", "iconWeight"] },
  { title: "Icon tiles", note: "The coloured squares in the menu, on KPI cards and in empty states.", keys: ["tileLook", "tileTone", "tileArt"] },
  { title: "Cards", keys: ["cardStyle"] },
  { title: "Buttons and corners", keys: ["uiStyle"] },
  { title: "Charts", note: "Gauges, heat maps and range charts always draw with ECharts.", keys: ["chartLib"] },
];

const LABEL: Record<AppearanceKey, string> = {
  iconPack: "Icon set",
  iconWeight: "Weight",
  tileLook: "Style",
  tileTone: "Colour",
  tileArt: "Artwork",
  cardStyle: "Card style",
  uiStyle: "UI style",
  chartLib: "Chart library",
};

const optionLabel = <K extends AppearanceKey>(key: K, id: Appearance[K]) => OPTIONS[key].find((o) => o.id === id)?.label ?? id;

/**
 * The owner's look editor: the portal default (Settings) or one client's own look (Clients). Every
 * choice is a row of toggles with a live preview beside it, drawn with the real cards, tiles, icons
 * and charts in the picked look.
 */
export function AppearanceEditor(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const base = props.mode === "portal" ? BUILT_IN : props.portal;
  const [value, setValue] = useState<AppearanceOverrides>(props.initial);
  const look: Appearance = { ...base, ...value };
  const changed = JSON.stringify(normalise(value, props.mode)) !== JSON.stringify(normalise(props.initial, props.mode));

  const set = <K extends AppearanceKey>(key: K, v: Appearance[K] | null) =>
    setValue((cur) => {
      const next = { ...cur };
      if (v === null) delete next[key];
      else next[key] = v;
      return next;
    });

  const save = () =>
    start(async () => {
      const r = props.mode === "portal" ? await savePortalAppearance(look) : await saveClientAppearance(props.clientId, value);
      toastResult(r);
      if (r.ok) router.refresh();
    });

  const weightsOn = ICON_PACKS.find((p) => p.id === look.iconPack)?.weights ?? true;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0 space-y-5">
        {GROUPS.map((g) => (
          <fieldset key={g.title} className="min-w-0 space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</legend>
            {g.note && <p className="-mt-1 text-xs text-muted">{g.note}</p>}
            {g.keys.map((key) => (
              <ToggleRow
                key={key}
                name={key}
                label={LABEL[key]}
                value={value[key] ?? null}
                options={OPTIONS[key]}
                fallback={props.mode === "client" ? `Default · ${optionLabel(key, base[key])}` : null}
                required={props.mode === "portal"}
                disabled={key === "iconWeight" && !weightsOn ? "This set has one weight." : undefined}
                onChange={(v) => set(key, v as never)}
                swatch={(id) => <Swatch k={key} id={id} look={look} />}
              />
            ))}
          </fieldset>
        ))}
      </div>

      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <p className="mb-1.5 text-xs font-medium text-ink-2">Live preview</p>
        <Preview look={look} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {props.mode === "portal" ? (
              <>Clients without their own look use this.</>
            ) : Object.keys(value).length ? (
              <>
                <Badge tone="violet">Own look</Badge> {Object.keys(value).length} of {APPEARANCE_KEYS.length} choices differ from the default.
              </>
            ) : (
              <>Follows the portal default.</>
            )}
          </p>
          <div className="flex gap-2 max-sm:w-full">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || Object.keys(normalise(value, props.mode)).length === 0}
              onClick={() => setValue(props.mode === "portal" ? { ...BUILT_IN } : {})}
              className="max-sm:flex-1"
            >
              {props.mode === "portal" ? "Thabaal standard" : "Use default"}
            </Button>
            <Button type="button" size="sm" loading={pending} disabled={!changed} onClick={save} className="max-sm:flex-1">
              Save look
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A client's look on the Clients page: a one-line summary that opens into the editor (the editor
 *  and its preview only mount when opened, so a long client list stays light). */
export function ClientAppearance(props: { clientId: string; clientName: string; initial: AppearanceOverrides; portal: Appearance }) {
  const [open, setOpen] = useState(false);
  const look: Appearance = { ...props.portal, ...props.initial };
  const own = Object.keys(props.initial).length;
  const summary = [
    `${optionLabel("iconPack", look.iconPack)} icons`,
    `${optionLabel("tileLook", look.tileLook)} ${optionLabel("tileTone", look.tileTone).toLowerCase()} tiles`,
    `${optionLabel("cardStyle", look.cardStyle)} cards`,
    `${optionLabel("uiStyle", look.uiStyle)} UI`,
    `${optionLabel("chartLib", look.chartLib)} charts`,
  ].join(" · ");
  return (
    <div className="rounded-card border border-line bg-panel">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 rounded-card px-3.5 py-3 text-left hover:bg-subtle">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            {own ? "Own look" : "Portal default look"}
            {own > 0 && <Badge tone="violet">{own} custom</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-deep">
          {open ? "Close" : "Customise"}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="border-t border-line p-3.5 sm:p-4">
          <AppearanceEditor mode="client" {...props} />
        </div>
      )}
    </div>
  );
}

/** What would be stored: the portal keeps only differences from the built-in look. */
function normalise(v: AppearanceOverrides, mode: Props["mode"]) {
  const out: Record<string, string> = {};
  for (const k of APPEARANCE_KEYS) {
    const x = v[k];
    if (x && !(mode === "portal" && x === BUILT_IN[k])) out[k] = x;
  }
  return out;
}

function ToggleRow({
  name,
  label,
  value,
  options,
  fallback,
  required,
  disabled,
  onChange,
  swatch,
}: {
  name: string;
  label: string;
  value: string | null;
  options: readonly { id: string; label: string; hint?: string }[];
  /** Client mode: the "use the portal default" choice. */
  fallback: string | null;
  required: boolean;
  disabled?: string;
  onChange: (v: string | null) => void;
  swatch: (id: string) => ReactNode;
}) {
  const current = value ?? (required ? options[0].id : null);
  return (
    <div className={cn("min-w-0", disabled && "opacity-50")}>
      <p id={`${name}-label`} className="mb-1.5 text-xs font-medium text-ink-2">
        {label}
        {disabled && <span className="font-normal text-muted"> · {disabled}</span>}
      </p>
      <div role="radiogroup" aria-labelledby={`${name}-label`} className="flex flex-wrap gap-1.5">
        {fallback && <Toggle on={current === null} onClick={() => onChange(null)} disabled={!!disabled} label={fallback} />}
        {options.map((o) => (
          <Toggle key={o.id} on={current === o.id} onClick={() => onChange(o.id)} disabled={!!disabled} label={o.label} hint={o.hint} swatch={swatch(o.id)} />
        ))}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label, hint, swatch, disabled }: { on: boolean; onClick: () => void; label: string; hint?: string; swatch?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-control border px-2.5 py-1.5 text-left text-[0.8125rem] font-medium transition active:scale-[0.98] disabled:cursor-not-allowed",
        on ? "border-brand bg-brand-soft/70 text-ink ring-1 ring-brand/30" : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
      )}
    >
      {swatch}
      <span>{label}</span>
      {on && <Check aria-hidden className="size-3.5 text-brand-deep" />}
    </button>
  );
}

const SAMPLE_TILES = [
  { Icon: Dashboard3D, bg: "from-[#34d399] via-[#10b981] to-[#059669]" },
  { Icon: Bell3D, bg: "from-[#fbbf24] via-[#f59e0b] to-[#d97706]" },
  { Icon: ShoppingBag3D, bg: "from-[#38bdf8] via-[#0ea5e9] to-[#0284c7]" },
  { Icon: Users3D, bg: "from-[#c084fc] via-[#9333ea] to-[#7e22ce]" },
];

/** A small sample of one choice, drawn in the rest of the look being edited. */
function Swatch({ k, id, look }: { k: AppearanceKey; id: string; look: Appearance }) {
  const with_ = { ...look, [k]: id } as Appearance;
  if (k === "iconPack" || k === "iconWeight") {
    const setId = iconSetId(with_);
    return (
      <span data-iconset={setId} aria-hidden className="flex items-center gap-1 text-ink-2">
        <IconSetLink set={setId} />
        <Bell className="size-4" />
        <Search className="size-4" />
        <Send className="size-4" />
      </span>
    );
  }
  if (k === "tileLook" || k === "tileTone" || k === "tileArt") {
    const T = k === "tileArt" ? Trophy3D : Rupee3D;
    return (
      <span {...appearanceAttrs(with_)} aria-hidden className="contents">
        <span className="icon-cube-3d grid size-6 place-items-center rounded-[7px] bg-gradient-to-br from-[#fbbf24] via-[#f59e0b] to-[#d97706] text-white ring-1 ring-inset ring-white/35">
          <T className="size-3.5" />
        </span>
      </span>
    );
  }
  if (k === "cardStyle") {
    return (
      <span {...appearanceAttrs(with_)} aria-hidden className="contents">
        <span className="ui-card block h-5 w-7 rounded-[5px] border border-line bg-panel shadow-card" />
      </span>
    );
  }
  if (k === "uiStyle") {
    return (
      <span {...appearanceAttrs(with_)} aria-hidden className="contents">
        <span className="ui-btn block h-4 w-7 rounded-control bg-brand" />
      </span>
    );
  }
  return null;
}

const TREND = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  series: [
    { key: "read", label: "Read", color: "emerald", values: [42, 58, 51, 77, 69, 94, 88], area: true },
    { key: "replied", label: "Replied", color: "blue", values: [12, 19, 15, 26, 22, 31, 35] },
  ],
};
const COLUMNS = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => ({
  key: d,
  label: d,
  parts: [
    { key: "upi", label: "UPI", value: [8, 12, 9, 15, 11][i], color: "emerald" },
    { key: "cash", label: "Cash", value: [4, 3, 6, 5, 7][i], color: "gold" },
  ],
}));

/** The real components in the look being edited (a nested box with its own data-* attributes). */
function Preview({ look }: { look: Appearance }) {
  const tones: HeaderTone[] = ["brand", "gold", "info", "violet"];
  return (
    <div {...appearanceAttrs(look)} className="space-y-3 overflow-hidden rounded-sheet border border-line bg-canvas p-3">
      <IconSetLink set={iconSetId(look)} />
      {/* A slice of the sidebar. */}
      <div className="surface-dark flex items-center gap-2 rounded-card bg-night px-3 py-2.5">
        {SAMPLE_TILES.map(({ Icon, bg }, i) => (
          <span key={i} className={cn("icon-cube-3d grid size-8 place-items-center rounded-[9px] bg-gradient-to-br text-white", bg)}>
            <Icon className="size-[18px]" />
          </span>
        ))}
        <span className="ml-auto text-xs font-medium text-white/70">Menu</span>
      </div>

      <Card className="card-3d overflow-hidden">
        <CardHeader tone="brand" icon={<Sparkles />} title="This week" description="Messages read and replies" action={<Button size="sm" variant="secondary">Export</Button>} />
        <div className="p-3">
          <TrendChart labels={TREND.labels} series={TREND.series} height={140} peak={false} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {[
          { tone: tones[1], Icon: Rupee3D, label: "Revenue", value: "₹48,250" },
          { tone: tones[2], Icon: ShoppingBag3D, label: "Orders", value: "126" },
        ].map(({ tone, Icon, label, value }) => (
          <Card key={label} className="card-3d flex items-center gap-2.5 p-3">
            <IconCube tone={tone} size="sm">
              <Icon />
            </IconCube>
            <div className="min-w-0">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="text-base font-semibold text-ink">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <ColumnChart columns={COLUMNS} height={110} label="Sales by day" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm">
            <Send /> Send campaign
          </Button>
          <Button size="sm" variant="secondary">
            <Users /> Audience
          </Button>
          <span className="ml-auto flex items-center gap-2 text-muted">
            <ShoppingCart className="size-4" />
            <Package className="size-4" />
            <Truck className="size-4" />
          </span>
        </div>
      </Card>
    </div>
  );
}
