import { LinkTabs } from "../portal-ui";

/** Customers' four tabs from the portal design (Refills keeps its own address). */
export function CustomersTabs({ active }: { active: "all" | "groups" | "loyalty" | "refills" }) {
  return (
    <LinkTabs
      label="Customers views"
      current={active}
      tabs={[
        { id: "all", href: "/dashboard/customers", label: "All customers", ta: "அனைத்து வாடிக்கையாளர்கள்" },
        { id: "groups", href: "/dashboard/customers?tab=groups", label: "Groups to reach", ta: "அணுக வேண்டிய குழுக்கள்" },
        { id: "loyalty", href: "/dashboard/customers?tab=loyalty", label: "Loyalty", ta: "லாயல்டி" },
        { id: "refills", href: "/dashboard/refills", label: "Refills", ta: "மறு ஆர்டர்கள்" },
      ]}
    />
  );
}

export const CUSTOMERS_SUB = "Everyone you sell to, who to reach today, and how to reward them.";
export const CUSTOMERS_SUB_TA = "உங்கள் வாடிக்கையாளர்கள் பட்டியல், இன்று யாரை அணுக வேண்டும் மற்றும் லாயல்டி சலுகைகள்.";
