import { redirect } from "next/navigation";

/** Clients moved to the admin panel (/admin/clients); each client's setup tools are on its page there. */
export default function ClientsPage() {
  redirect("/admin/clients");
}
