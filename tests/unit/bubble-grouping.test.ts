import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupBubbles,
  canJoin,
  timestamp,
  GROUP_WINDOW_MS,
  type BubbleCandidate,
} from "../../src/lib/chat/bubble-grouping";

test("WhatsApp Web Message Bubble Grouping Engine", async (t) => {
  const baseTime = new Date("2026-11-19T10:00:00.000Z").getTime();

  function makeMsg(
    id: string,
    offsetSeconds: number,
    overrides?: Partial<BubbleCandidate>
  ): BubbleCandidate {
    return {
      id,
      conversationId: "conv_1",
      direction: "OUTBOUND",
      actorKey: "biz:phone_1",
      createdAt: new Date(baseTime + offsetSeconds * 1000).toISOString(),
      displayDayKey: "2026-11-19",
      isSystemEvent: false,
      ...overrides,
    };
  }

  await t.test("1. Returns empty array for empty input", () => {
    const res = groupBubbles([]);
    assert.deepEqual(res, []);
  });

  await t.test("2. Single message is marked as SINGLE", () => {
    const single = makeMsg("m1", 0);
    const [res] = groupBubbles([single]);
    assert.equal(res.bubblePosition, "SINGLE");
  });

  await t.test("3. Two consecutive messages in same window are FIRST and LAST", () => {
    const m1 = makeMsg("m1", 0);
    const m2 = makeMsg("m2", 60); // 1 minute later
    const res = groupBubbles([m1, m2]);

    assert.equal(res[0].bubblePosition, "FIRST");
    assert.equal(res[1].bubblePosition, "LAST");
  });

  await t.test("4. Three consecutive messages in same window are FIRST, MIDDLE, LAST", () => {
    const m1 = makeMsg("m1", 0);
    const m2 = makeMsg("m2", 60); // 1 min
    const m3 = makeMsg("m3", 120); // 2 mins
    const res = groupBubbles([m1, m2, m3]);

    assert.equal(res[0].bubblePosition, "FIRST");
    assert.equal(res[1].bubblePosition, "MIDDLE");
    assert.equal(res[2].bubblePosition, "LAST");
  });

  await t.test("5. Direction change breaks group into SINGLE or separate clusters", () => {
    const m1 = makeMsg("m1", 0, { direction: "OUTBOUND" });
    const m2 = makeMsg("m2", 30, { direction: "INBOUND", actorKey: "cust:+919876543210" });
    const m3 = makeMsg("m3", 60, { direction: "INBOUND", actorKey: "cust:+919876543210" });
    const res = groupBubbles([m1, m2, m3]);

    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "FIRST");
    assert.equal(res[2].bubblePosition, "LAST");
  });

  await t.test("6. Different actorKey in same direction breaks group", () => {
    const m1 = makeMsg("m1", 0, { direction: "INBOUND", actorKey: "cust:1" });
    const m2 = makeMsg("m2", 30, { direction: "INBOUND", actorKey: "cust:2" });
    const res = groupBubbles([m1, m2]);

    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "SINGLE");
  });

  await t.test("7. Different conversationId breaks group", () => {
    const m1 = makeMsg("m1", 0, { conversationId: "conv_1" });
    const m2 = makeMsg("m2", 30, { conversationId: "conv_2" });
    const res = groupBubbles([m1, m2]);

    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "SINGLE");
  });

  await t.test("8. Calendar day boundary breaks group even within 5 minutes", () => {
    const m1 = makeMsg("m1", 0, { displayDayKey: "2026-11-19" });
    const m2 = makeMsg("m2", 60, { displayDayKey: "2026-11-20" });
    const res = groupBubbles([m1, m2]);

    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "SINGLE");
  });

  await t.test("9. Exact 5-minute adjacency threshold boundary check", () => {
    const m1 = makeMsg("m1", 0);
    const m2Exact = makeMsg("m2", 300); // 300s = 5 min exact
    assert.equal(canJoin(m1, m2Exact), true);

    const m3Over = makeMsg("m3", 301); // 301s = 5 min + 1 sec
    assert.equal(canJoin(m1, m3Over), false);

    const res = groupBubbles([m1, m3Over]);
    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "SINGLE");
  });

  await t.test("10. System event breaks group", () => {
    const m1 = makeMsg("m1", 0);
    const mSys = makeMsg("mSys", 30, { isSystemEvent: true });
    const m2 = makeMsg("m2", 60);
    const res = groupBubbles([m1, mSys, m2]);

    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "SINGLE");
    assert.equal(res[2].bubblePosition, "SINGLE");
  });

  await t.test("11. Direction === SYSTEM never joins", () => {
    const m1 = makeMsg("m1", 0, { direction: "SYSTEM" });
    const m2 = makeMsg("m2", 30, { direction: "SYSTEM" });
    assert.equal(canJoin(m1, m2), false);
    const res = groupBubbles([m1, m2]);
    assert.equal(res[0].bubblePosition, "SINGLE");
    assert.equal(res[1].bubblePosition, "SINGLE");
  });

  await t.test("12. Invalid timestamp throws descriptive error", () => {
    assert.throws(
      () => timestamp("not-a-valid-date"),
      /Invalid message timestamp/
    );
  });
});
