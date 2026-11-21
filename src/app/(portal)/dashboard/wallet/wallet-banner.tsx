import Link from "@/components/intent-link";
import { Suspense } from "react";
import { walletBalance } from "@/lib/wallet";
import { rupees } from "@/lib/wallet-rates";

/** A thin strip on every page when a wallet client's balance is low or empty. */
export function WalletBanner({ clientId, lowAlert }: { clientId: string; lowAlert: number }) {
  return (
    <Suspense fallback={null}>
      <Strip clientId={clientId} lowAlert={lowAlert} />
    </Suspense>
  );
}

async function Strip({ clientId, lowAlert }: { clientId: string; lowAlert: number }) {
  const balance = await walletBalance(clientId);
  if (balance >= lowAlert && balance > 0) return null;
  const empty = balance <= 0;
  return (
    <div
      role="status"
      className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border px-3.5 py-2.5 text-sm sm:mb-5 ${
        empty ? "border-danger-border bg-danger-bg text-danger" : "border-warning-border bg-warning-bg text-warning"
      }`}
    >
      <span>
        <b>Wallet {rupees(balance)}.</b> {empty ? "Campaigns are stopped until you add money." : "Add money soon so campaigns keep going."}
      </span>
      <Link href="/dashboard/wallet" className="font-semibold underline underline-offset-2">
        Add money
      </Link>
    </div>
  );
}
