import { LinkTabs } from "../portal-ui";

/** Chats' three tabs from the portal design: Open chats, Priority, Calls (each its own address). */
export function InboxTabs({ active }: { active: "inbox" | "priority" | "calls" }) {
  return (
    <LinkTabs
      label="Chats views"
      current={active}
      tabs={[
        { id: "inbox", href: "/dashboard/replies", label: "Open chats", ta: "திறந்த அரட்டைகள்" },
        { id: "priority", href: "/dashboard/replies/priority", label: "Priority", ta: "முன்னுரிமை" },
        { id: "calls", href: "/dashboard/calls", label: "Calls", ta: "அழைப்புகள்" },
      ]}
    />
  );
}

export const CHATS_SUB = "Answer customers first. Free replies are open for 24 hours after they write.";
export const CHATS_SUB_TA = "முதலில் வாடிக்கையாளர்களுக்கு பதில் சொல்லுங்கள். அவர்கள் எழுதிய 24 மணி நேரம் இலவச பதில்.";
