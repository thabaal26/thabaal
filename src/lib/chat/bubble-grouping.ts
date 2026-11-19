export type MessageDirection = "INBOUND" | "OUTBOUND" | "SYSTEM";
export type BubblePosition = "SINGLE" | "FIRST" | "MIDDLE" | "LAST";

export interface BubbleCandidate {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  actorKey: string; // e.g. "contact:+919XXXXXXXXX" or "business:<phone-number-id>"
  createdAt: Date | string;
  displayDayKey: string; // derived using conversation UI timezone
  isSystemEvent: boolean;
}

export interface GroupedBubble extends BubbleCandidate {
  bubblePosition: BubblePosition;
}

export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function timestamp(value: Date | string): number {
  const result = new Date(value).getTime();
  if (!Number.isFinite(result)) {
    throw new Error("Invalid message timestamp");
  }
  return result;
}

export function canJoin(previous: BubbleCandidate, current: BubbleCandidate): boolean {
  if (previous.isSystemEvent || current.isSystemEvent) return false;
  if (previous.direction === "SYSTEM" || current.direction === "SYSTEM") return false;
  if (
    previous.conversationId !== current.conversationId ||
    previous.direction !== current.direction ||
    previous.actorKey !== current.actorKey ||
    previous.displayDayKey !== current.displayDayKey
  ) {
    return false;
  }
  const gap = timestamp(current.createdAt) - timestamp(previous.createdAt);
  return gap >= 0 && gap <= GROUP_WINDOW_MS;
}

export function groupBubbles(messages: readonly BubbleCandidate[]): GroupedBubble[] {
  return messages.map((message, index) => {
    const previous = index > 0 ? messages[index - 1] : undefined;
    const next = index < messages.length - 1 ? messages[index + 1] : undefined;

    const joinsPrevious = previous !== undefined && canJoin(previous, message);
    const joinsNext = next !== undefined && canJoin(message, next);

    let bubblePosition: BubblePosition;
    if (!joinsPrevious && !joinsNext) {
      bubblePosition = "SINGLE";
    } else if (!joinsPrevious && joinsNext) {
      bubblePosition = "FIRST";
    } else if (joinsPrevious && joinsNext) {
      bubblePosition = "MIDDLE";
    } else {
      bubblePosition = "LAST";
    }

    return { ...message, bubblePosition };
  });
}
