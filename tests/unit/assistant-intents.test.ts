// How customers actually write, and what each kind of message is taken to mean; and the reply wording, which must
// name the shop it comes from, never promise what the shop's settings don't say, and read well with or without a name.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deliveryText,
  hoursText,
  humanText,
  intentOf,
  locationText,
  paymentText,
  problemText,
  receivedText,
  thanksText,
  welcomeText,
  type ShopInfo,
} from "../../src/lib/assistant-intents";

const shop = (extra: Partial<ShopInfo> = {}): ShopInfo => ({ name: "Thenan Naidus", tagline: "Pure cold-pressed oils since 1985", homeCity: "Madurai", catalogue: true, ...extra });
const pay = { codOn: true, codMax: 3000, codAreas: "", hoursOn: true, openAt: "09:00", closeAt: "21:00" };

describe("what a customer's message is about", () => {
  const cases: [string, ReturnType<typeof intentOf>][] = [
    // acknowledgements: nothing to answer
    ["ok", "ack"],
    ["Okay 👍", "ack"],
    ["seri", "ack"],
    ["👍", "ack"],
    ["🙏🙏", "ack"],
    ["yes", "ack"],
    // thanks
    ["Thank you so much", "thanks"],
    ["thanks sir", "thanks"],
    ["tq", "thanks"],
    ["Nandri", "thanks"],
    ["நன்றி", "thanks"],
    // problems
    ["The oil bottle came damaged", "problem"],
    ["you sent the wrong item", "problem"],
    ["I want a refund", "problem"],
    ["quality is very bad smell", "problem"],
    ["bottle odanjiruchu", "problem"],
    ["no problem, thanks", "thanks"],
    // not arrived
    ["I have not received my order", "notArrived"],
    ["didn't get the parcel yet", "notArrived"],
    ["innum varala", "notArrived"],
    // a person
    ["please call me", "human"],
    ["I want to talk to someone", "human"],
    ["customer care number?", "human"],
    ["call pannunga", "human"],
    // shop questions
    ["what are your timings?", "hours"],
    ["are you open today", "hours"],
    ["do you deliver to KK Nagar?", "delivery"],
    ["delivery charges?", "delivery"],
    ["is COD available", "payment"],
    ["COD?", "payment"],
    ["how to pay", "payment"],
    ["gpay accepted?", "payment"],
    ["where is your shop", "location"],
    ["shop address please", "location"],
    // not ours: greetings, catalogue words, orders and plain questions go elsewhere
    ["hi", null],
    ["do you have ghee?", null],
    ["2 kg rice", null],
  ];
  for (const [text, want] of cases) test(`"${text}" → ${want ?? "nothing special"}`, () => assert.equal(intentOf(text), want));
});

describe("the replies, in each shop's own name", () => {
  test("a first-time hello is welcomed to the shop by name, with its tagline and how to order", () => {
    const t = welcomeText(shop(), "Meena R", { returning: false, canReorder: false, withCatalogue: true });
    assert.match(t, /^Hi Meena! 👋 Welcome to \*Thenan Naidus\*\./);
    assert.match(t, /_Pure cold-pressed oils since 1985_/);
    assert.match(t, /Tap \*View catalog\*/);
    assert.doesNotMatch(t, /Reorder/);
  });

  test("another shop gets its own name: one code, every client", () => {
    const t = welcomeText(shop({ name: "Hubbath", tagline: null }), "+919900000000", { returning: false, canReorder: false, withCatalogue: true });
    assert.match(t, /^Hi! 👋 Welcome to \*Hubbath\*\./); // a number, not a name: no "Hi +91..."
    assert.doesNotMatch(t, /Thenan/);
    assert.doesNotMatch(t, /_/);
  });

  test("someone who ordered before is welcomed back and offered their last order again", () => {
    const t = welcomeText(shop(), "Meena", { returning: true, canReorder: true, withCatalogue: true });
    assert.match(t, /^Welcome back, Meena! 👋 Lovely to hear from you again at \*Thenan Naidus\*/);
    assert.match(t, /reply \*Reorder\*/);
  });

  test("at night the welcome says when the shop opens, in the same message", () => {
    const t = welcomeText(shop(), "Meena", { returning: false, canReorder: false, withCatalogue: true, closedOpensAt: "9:00 AM" });
    assert.match(t, /closed right now and open at \*9:00 AM\*/);
  });

  test("with no catalogue the welcome asks how it can help, and the team replies", () => {
    const t = welcomeText(shop({ catalogue: false }), "Meena", { returning: false, canReorder: false, withCatalogue: false });
    assert.match(t, /Welcome to \*Thenan Naidus\*/);
    assert.match(t, /How can we help you today\?/);
    assert.doesNotMatch(t, /View catalog/);
  });

  test("a problem: sorry, a photo please, and the shop's team (at night: when it opens)", () => {
    assert.match(problemText(shop(), "Meena", null), /^We're really sorry about this, Meena\. 🙏 Please send a photo.*\*Thenan Naidus\* team.*shortly\.$/);
    assert.match(problemText(shop(), "Meena", "9:00 AM"), /as soon as we open at \*9:00 AM\*/);
  });

  test("a call request gives the shop's own number when it has one", () => {
    assert.match(humanText(shop({ supportPhone: "98400 12345" }), "Meena", null), /call us directly on \*98400 12345\*/);
    assert.doesNotMatch(humanText(shop(), "Meena", null), /call us directly/);
  });

  test("hours come from the shop-hours setting, and say whether it's open now", () => {
    assert.match(hoursText(shop(), pay, false), /open from \*9:00 AM\* to \*9:00 PM\*\. We're open now/);
    assert.match(hoursText(shop(), pay, true), /closed right now and will reply when we open at \*9:00 AM\*/);
    assert.match(hoursText(shop(), { ...pay, hoursOn: false }, false), /message \*Thenan Naidus\* here anytime/);
  });

  test("delivery follows the shop's order steps and its cash-on-delivery limit", () => {
    assert.match(deliveryText(shop(), pay), /Yes, we deliver in and around Madurai!/);
    assert.match(deliveryText(shop(), pay), /Cash on delivery is available for orders up to \*₹3,000\*/);
    assert.doesNotMatch(deliveryText(shop(), { ...pay, codOn: false }), /Cash on delivery/);
    assert.match(deliveryText(shop({ orderFlow: "pickup" }), pay), /doesn't deliver yet: orders are ready for pickup/);
    assert.match(deliveryText(shop({ orderFlow: "courier" }), pay), /we ship by courier/);
  });

  test("payment lists only the ways this shop has turned on", () => {
    const all = paymentText(shop(), pay, { waPay: true, upi: true });
    assert.match(all, /online right here in WhatsApp.*, by UPI.* or by cash on delivery/);
    const online = paymentText(shop(), { ...pay, codOn: false }, { waPay: true, upi: false });
    assert.doesNotMatch(online, /cash on delivery|UPI \(GPay/);
    assert.match(paymentText(shop(), { ...pay, codOn: false }, { waPay: false, upi: false }), /team will share the payment details/);
  });

  test("location gives the city and a number for directions, or promises the team will send it", () => {
    assert.match(locationText(shop({ supportPhone: "98400 12345" }), null), /\*Thenan Naidus\* is in Madurai\. For the exact address and directions, call us on \*98400 12345\*/);
    assert.match(locationText(shop(), null), /team will send you the exact address shortly/);
  });

  test("thanks and 'anything else' carry the shop's name", () => {
    assert.match(thanksText(shop(), "Meena"), /^You're most welcome, Meena! 😊 Thank you for choosing \*Thenan Naidus\*\.$/);
    assert.match(receivedText(shop(), "Meena", null), /^Thanks for reaching out to \*Thenan Naidus\*, Meena! 🙏 Our team will reply shortly\./);
    assert.match(receivedText(shop(), "Meena", null), /say \*catalogue\*/);
    assert.doesNotMatch(receivedText(shop({ catalogue: false }), "Meena", null), /catalogue/);
  });

  test("every reply carries at most one emoji", () => {
    const all = [
      welcomeText(shop(), "Meena", { returning: true, canReorder: true, withCatalogue: true, closedOpensAt: "9:00 AM" }),
      problemText(shop(), "Meena", null),
      humanText(shop(), "Meena", null),
      hoursText(shop(), pay, false),
      deliveryText(shop(), pay),
      paymentText(shop(), pay, { waPay: true, upi: true }),
      locationText(shop(), null),
      thanksText(shop(), "Meena"),
      receivedText(shop(), "Meena", null),
    ];
    for (const t of all) assert.ok((t.match(/\p{Extended_Pictographic}/gu) ?? []).length <= 1, t);
  });
});
