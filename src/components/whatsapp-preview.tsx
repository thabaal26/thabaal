import { CheckCheck, Copy, CreditCard, ExternalLink, ImageIcon, Phone, Reply, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TemplateButton } from "@/lib/template";

/** Renders WhatsApp's *bold*, _italic_, ~strike~ and ```mono``` formatting. */
function formatWa(text: string): ReactNode[] {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g);
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    if (/^```[^`]+```$/.test(p)) return <code key={i} className="font-mono text-[12px]">{p.slice(3, -3)}</code>;
    return p;
  });
}

const ICON = { QUICK_REPLY: Reply, URL: ExternalLink, PHONE_NUMBER: Phone, COPY_CODE: Copy, ORDER_DETAILS: CreditCard, CATALOG: ShoppingBag };

export function WhatsAppBubble({
  header, headerImage, body, footer, buttons, time = "10:00", className,
}: {
  header?: string;
  headerImage?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButton[];
  time?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full max-w-[300px]", className)}>
      <div className="overflow-hidden rounded-xl rounded-tl-sm bg-bubble text-[13.5px] leading-snug text-ink shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]">
        {headerImage !== undefined && (
          <div className="p-1 pb-0">
            {headerImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerImage} alt="" className="aspect-[1.91/1] w-full rounded-lg object-cover" />
            ) : (
              <div className="grid aspect-[1.91/1] place-items-center rounded-lg bg-zinc-200 text-zinc-400"><ImageIcon className="size-8" /></div>
            )}
          </div>
        )}
        <div className="px-2.5 pb-1.5 pt-2">
          {header && <p className="mb-1 font-bold">{formatWa(header)}</p>}
          <p className="whitespace-pre-wrap break-words">{body ? formatWa(body) : <span className="text-muted">Your message…</span>}</p>
          {footer && <p className="mt-1 text-[12px] text-muted">{footer}</p>}
          <p className="-mb-0.5 mt-0.5 flex items-center justify-end gap-0.5 text-[10.5px] text-muted">
            {time} <CheckCheck className="size-3.5 text-sky-500" />
          </p>
        </div>
        {buttons?.map((b, i) => {
          const Icon = ICON[b.type];
          return (
            <div key={i} className="flex items-center justify-center gap-1.5 border-t border-zinc-100 py-2 text-[13.5px] font-medium text-sky-600">
              <Icon className="size-3.5" />
              {b.text || "Button"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PhoneFrame({ children, name = "Your Business" }: { children: ReactNode; name?: string }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.2rem] bg-night p-2.5 shadow-pop">
      <div className="overflow-hidden rounded-[1.7rem]">
        <div className="flex items-center gap-2.5 bg-[#075e54] px-4 pb-2.5 pt-4 text-white">
          <span className="grid size-8 place-items-center rounded-full bg-white/20 text-xs font-semibold">{name.slice(0, 1)}</span>
          <div>
            <p className="text-sm font-medium leading-tight">{name}</p>
            <p className="text-[11px] text-white/70">Business account</p>
          </div>
        </div>
        <div className="chat-wall min-h-[420px] p-3">
          <p className="mx-auto mb-3 w-fit rounded-md bg-white/80 px-2 py-0.5 text-[10.5px] text-muted shadow-sm">TODAY</p>
          {children}
        </div>
      </div>
    </div>
  );
}
