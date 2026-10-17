import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { PickClientNotice } from "@/components/ui";
import { comboReport } from "@/lib/business-reports";
import { getScope } from "@/lib/session";
import { PortalPage } from "../../portal-ui";
import { ProductsTabs } from "../products-tabs";
import { CombosView } from "./combos-view";

export const metadata: Metadata = { title: "Combo ideas" };
export const dynamic = "force-dynamic";

export default async function CombosPage() {
  const scope = await getScope();
  const frame = (children: React.ReactNode) => (
    <PortalPage
      title="Products"
      titleTa="பொருட்கள்"
      sub="What you sell, and which items need your attention."
      subTa="நீங்கள் விற்பவை, கவனிக்க வேண்டிய பொருட்கள்."
      actions={
        <Link className="btn primary" href="/dashboard/campaigns/new">
          Announce a combo
        </Link>
      }
    >
      <ProductsTabs active="combos" />
      {children}
    </PortalPage>
  );
  if (!scope.clientId) return frame(<PickClientNotice what="combo ideas" />);

  const r = await comboReport(scope.clientId);

  return frame(<CombosView report={r} />);
}

