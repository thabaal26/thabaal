import { redirect } from "next/navigation";

/** Google Sheet sync is account setup and lives in Settings now; old links land there. */
export default function OldSheetPage() {
  redirect("/dashboard/settings/sheet");
}
