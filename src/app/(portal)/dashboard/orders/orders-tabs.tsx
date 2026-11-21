import { LinkTabs } from "../portal-ui";

/** Orders' two tabs from the portal design: Orders and Packing list (each its own address). */
export function OrdersTabs({ active }: { active: "orders" | "pack" }) {
  return (
    <LinkTabs
      label="Orders views"
      current={active}
      tabs={[
        { id: "orders", href: "/dashboard/orders", label: "Orders", ta: "ஆர்டர்கள்" },
        // Packing list switched off (owner, 18 Oct 2026):
        // { id: "pack", href: "/dashboard/orders/packing", label: "Packing list", ta: "பேக்கிங்" },
      ]}
    />
  );
}
