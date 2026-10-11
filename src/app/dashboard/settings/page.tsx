import { Building2, CheckCircle2, Circle, LogOut, SquarePen } from "@/components/icons";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { logout } from "../../login/actions";
import { cn } from "@/lib/cn";
import { getSettings, wahaConfig } from "@/lib/provider";
import { waConfig } from "@/lib/whatsapp";
import { LocalSessionPanel, ProviderSwitch } from "./provider-panel";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5">
      {ok ? <CheckCircle2 aria-label="Set" className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle aria-label="Not set" className="mt-0.5 size-4 shrink-0 text-line-strong" />}
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", ok ? "text-ink" : "text-ink-2")}>{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </li>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-2">{label}</p>
      <code className="block select-all break-all rounded-control bg-sunken px-3 py-2 font-mono text-xs leading-relaxed text-ink">{value}</code>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const account = (
    <Card className="card-3d">
      <CardHeader tone="violet" title="Your account" description={`Signed in as ${user.email}`} />
      <PasswordForm />
      <form action={logout} className="border-t border-line p-4 sm:p-5">
        <button className={buttonClass("secondary") + " w-full sm:w-auto"}>
          <LogOut aria-hidden className="size-4" /> Sign out
        </button>
      </form>
    </Card>
  );
  if (user.role !== "ADMIN") {
    return (
      <>
        <PageHeader
          title="Settings"
          description={user.client ? `Your login for ${user.client.name}.` : "Your account."}
          actions={<Link href="/dashboard/templates" className={buttonClass("secondary") + " lg:hidden"}><SquarePen aria-hidden className="size-4" /> Templates</Link>}
        />
        <div className="max-w-form">{account}</div>
      </>
    );
  }

  const cfg = waConfig();
  const settings = await getSettings();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <PageHeader
        title="Settings"
        description="WhatsApp connection, scheduler and your account."
        actions={
          <>
            <Link href="/dashboard/templates" className={buttonClass("secondary") + " lg:hidden"}><SquarePen aria-hidden className="size-4" /> Templates</Link>
            <Link href="/dashboard/clients" className={buttonClass("secondary")}><Building2 aria-hidden className="size-4" /> Clients</Link>
          </>
        }
      />
      <ProviderSwitch provider={settings.provider} metaLive={cfg.live} localReady={!!wahaConfig(settings)} />
      <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        <LocalSessionPanel
          url={settings.wahaUrl ?? ""}
          hasKey={!!settings.wahaApiKey}
          session={settings.wahaSession}
          active={settings.provider === "LOCAL"}
        />
        <Card className="card-3d">
          <CardHeader
            tone="brand"
            title="Meta Cloud API"
            description={`Default number, used by clients without their own WhatsApp details on the Clients page. ${cfg.live ? "Configured in Vercel → Environment Variables." : "Not configured: add these in Vercel → Environment Variables, then redeploy."}`}
            action={settings.provider === "META" ? <Badge tone="green" dot>Active</Badge> : undefined}
          />
          <ul className="divide-y divide-line">
            <Check ok={!!cfg.token} label="Access token" hint="WHATSAPP_TOKEN: a permanent System User token from Meta Business settings." />
            <Check ok={!!cfg.phoneNumberId} label="Phone number ID" hint="WHATSAPP_PHONE_NUMBER_ID from WhatsApp Manager → API setup." />
            <Check ok={!!cfg.wabaId} label="WhatsApp Business Account ID" hint="WHATSAPP_BUSINESS_ACCOUNT_ID, used to create and sync templates." />
            <Check ok={!!cfg.appId} label="Meta App ID" hint="META_APP_ID, needed only for image headers." />
            <Check ok={!!process.env.META_APP_SECRET} label="App secret" hint="META_APP_SECRET, used to verify that webhooks really come from Meta." />
            <Check ok={!!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN} label="Webhook verify token" hint="WHATSAPP_WEBHOOK_VERIFY_TOKEN: any secret string, entered in Meta too." />
          </ul>
          <div className="space-y-3 border-t border-line p-4 sm:p-5">
            <Copyable label="Webhook callback URL" value={`${origin}/api/webhook`} />
            <p className="text-xs text-muted leading-relaxed">
              Subscribe to Meta webhook fields:{" "}
              <code className="text-ink">
                messages, calls, message_template_status_update, message_template_quality_update, template_category_update, phone_number_quality_update, account_update, account_alerts
              </code>
            </p>
          </div>
        </Card>

        <div className="space-y-4 sm:space-y-6 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <Card className="card-3d">
            <CardHeader tone="info" title="Scheduler" description="Something must call this URL every 5 minutes (every minute with the local session) to start campaigns and send batches." />
            <div className="space-y-3 p-4 sm:p-5">
              <Copyable label="Cron URL" value={`${origin}/api/cron?key=•••CRON_SECRET•••`} />
              <p className="text-xs text-muted">
                {process.env.CRON_SECRET ? "CRON_SECRET is set." : "Set CRON_SECRET first."} On Vercel Pro, add a cron to <code>vercel.json</code>. On the free Hobby plan, use a free service
                such as cron-job.org with the URL above. The scheduler can also be run from the Dashboard page.
              </p>
            </div>
          </Card>
          {account}
        </div>
      </div>
    </>
  );
}
