import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { RECEIPT_COOKIE_NAME, resolveThankYouReceipt } from "@/lib/marketing/receipt";
import { GoogleAdsConversion } from "@/components/marketing/GoogleAdsProvider";
import { DEMO_URL } from "@/app/login/demo-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thank You · Thabaal",
  robots: { index: false, follow: false },
};

export default async function ThankYouPage() {
  let receiptToken: string | undefined;
  try {
    const cookieStore = await cookies();
    receiptToken = cookieStore.get(RECEIPT_COOKIE_NAME)?.value;
  } catch {}

  const receipt = await resolveThankYouReceipt(receiptToken);

  const wa = DEMO_URL.startsWith("https://wa.me/")
    ? `${DEMO_URL.split("?")[0]}?text=${encodeURIComponent("Hi Thabaal, I just requested a demo on your website.")}`
    : DEMO_URL;

  return (
    <>
      {receipt.conversionEligible && (receipt.transactionReference || receipt.conversionEventId) && (
        <GoogleAdsConversion transactionId={receipt.transactionReference ?? receipt.conversionEventId} />
      )}
      <main className="min-h-screen bg-[#0d1117] text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#161b22] border border-gray-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
            🙏
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            நன்றி!
          </h1>
          <p className="text-gray-300 text-sm mb-6 leading-relaxed">
            உங்கள் கோரிக்கை வெற்றிகரமாகப் பெறப்பட்டது. ஒரு வேலை மணி நேரத்திற்குள் (காலை 10 – இரவு 7) உங்களை WhatsApp-ல் தொடர்பு கொள்கிறோம்.
          </p>
          <div className="space-y-3">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition text-center shadow-lg shadow-emerald-900/30"
            >
              இப்போதே WhatsApp-ல் பேசுங்கள் 💬
            </a>
            <Link
              href="/"
              className="block w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition text-center text-sm"
            >
              முகப்புப் பக்கத்திற்குத் திரும்பு
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
