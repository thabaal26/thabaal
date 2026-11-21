import { LinkTabs } from "../portal-ui";

/** Products' tabs from the portal design, plus the existing combo ideas page. */
export function ProductsTabs({ active }: { active: "cat" | "perf" | "combos" }) {
  return (
    <LinkTabs
      label="Products views"
      current={active}
      tabs={[
        { id: "cat", href: "/dashboard/catalogue", label: "Catalogue", ta: "பட்டியல்" },
        { id: "perf", href: "/dashboard/catalogue?view=demand", label: "How products sell", ta: "விற்பனை நிலை" },
        { id: "combos", href: "/dashboard/catalogue/combos", label: "Combo ideas", ta: "சேர்க்கை யோசனைகள்" },
      ]}
    />
  );
}
