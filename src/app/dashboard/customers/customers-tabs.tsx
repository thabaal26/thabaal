import { LinkTabs } from "../portal-ui";

/** Customers' four tabs from the portal design (Refills keeps its own address). */
export function CustomersTabs({ active }: { active: "all" | "groups" | "loyalty" | "refills" }) {
  return (
    <LinkTabs
      label="Customers views"
      current={active}
      tabs={[
        { id: "all", href: "/dashboard/customers", label: "All customers", ta: "அனைத்து வாடிக்கையாளர்கள்" },
        { id: "groups", href: "/dashboard/customers?tab=groups", label: "Groups to reach", ta: "அணுக வேண்டியவர்கள்" },
        { id: "loyalty", href: "/dashboard/customers?tab=loyalty", label: "Loyalty", ta: "விசுவாசம்" },
        { id: "refills", href: "/dashboard/refills", label: "Refills", ta: "மறு ஆர்டர்" },
      ]}
    />
  );
}

export const CUSTOMERS_SUB = "Everyone you sell to, who to reach today, and how to reward them.";
export const CUSTOMERS_SUB_TA = "நீங்கள் விற்கும் அனைவரும், இன்று யாரை அணுக வேண்டும், எப்படி பாராட்டுவது.";
