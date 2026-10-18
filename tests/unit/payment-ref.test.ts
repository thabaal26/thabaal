// Payment references shown on Payments and receipts: only real ones. WhatsApp's UPI mode sends no transaction id, so
// the webhook used to store the message id ("wamid.…") or "WA-UPI", which showed up as the reference.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { paymentRef } from "../../src/lib/plain-error";

describe("paymentRef", () => {
  test("a UTR or gateway id is shown as is", () => {
    assert.equal(paymentRef("412345678901"), "412345678901");
    assert.equal(paymentRef(" pay_PZ3x9Kq1 "), "pay_PZ3x9Kq1");
  });
  test("a UTR the customer sent in chat drops the UTR- prefix", () => {
    assert.equal(paymentRef("UTR-412345678901"), "412345678901");
  });
  test("WhatsApp message ids and the WA-UPI placeholder are not references", () => {
    assert.equal(paymentRef("wamid.HBgMOTE4Nzc4NjEzMzcyFQIAEhgg"), null);
    assert.equal(paymentRef("WA-UPI"), null);
    assert.equal(paymentRef(""), null);
    assert.equal(paymentRef(null), null);
  });
});
