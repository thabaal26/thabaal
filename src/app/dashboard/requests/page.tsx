import { redirect } from "next/navigation";

/** Requests moved to the admin panel: plan payments to check are under Payments, new accounts under Clients. */
export default function RequestsPage() {
  redirect("/admin/payments");
}
