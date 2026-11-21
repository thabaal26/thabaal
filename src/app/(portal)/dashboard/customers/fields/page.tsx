import { redirect } from "next/navigation";

/** Custom fields are account setup and live in Settings now; old links land there. */
export default function OldFieldsPage() {
  redirect("/dashboard/settings/fields");
}
