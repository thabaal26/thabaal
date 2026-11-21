import { LinkTabs } from "../portal-ui";

/** Chats' three tabs from the portal design: Open chats, Priority, Calls (each its own address). */
export function InboxTabs({ active }: { active: "inbox" | "priority" | "calls" }) {
  return (
    <LinkTabs
      label="Chats views"
      current={active}
      tabs={[
        { id: "inbox", href: "/dashboard/replies", label: "Open chats", ta: "திறந்த உரையாடல்கள்" },
        { id: "priority", href: "/dashboard/replies/priority", label: "Priority", ta: "முன்னுரிமை" },
        { id: "calls", href: "/dashboard/calls", label: "Calls", ta: "அழைப்புகள்" },
      ]}
    />
  );
}

export const CHATS_SUB = "Answer customers first. Free replies are open for 24 hours after they write.";
export const CHATS_SUB_TA = "வாடிக்கையாளர்களுக்கு உடனே பதிலளிக்கவும். செய்தி வந்ததிலிருந்து 24 மணி நேரம் இலவச உரையாடல் சாளரம் திறந்திருக்கும்.";
