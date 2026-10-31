import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutMode, type PaySettings, readPaySettings } from "../../src/lib/pay-settings";

const defaultSettings = (extra: Partial<PaySettings> = {}): PaySettings => ({
  ...readPaySettings({}, null),
  ...extra,
});

test("checkoutMode: COD on + waPay -> 'choose'", () => {
  const p = { settings: defaultSettings({ codOn: true }), waPay: true, upi: false };
  assert.equal(checkoutMode(p, 500, null), "choose");
});

test("checkoutMode: COD on + only upi -> 'choose'", () => {
  const p = { settings: defaultSettings({ codOn: true }), waPay: false, upi: true };
  assert.equal(checkoutMode(p, 500, null), "choose");
});

test("checkoutMode: COD off + waPay -> 'online'", () => {
  const p = { settings: defaultSettings({ codOn: false }), waPay: true, upi: false };
  assert.equal(checkoutMode(p, 500, null), "online");
});

test("checkoutMode: COD on but total > codMax -> 'online'", () => {
  const p = { settings: defaultSettings({ codOn: true, codMax: 1000 }), waPay: true, upi: true };
  assert.equal(checkoutMode(p, 1500, null), "online");
  assert.equal(checkoutMode(p, 1000, null), "choose");
});

test("checkoutMode: COD on but customer outside codAreas -> 'online'", () => {
  const p = { settings: defaultSettings({ codOn: true, codAreas: "Madurai city, Chennai" }), waPay: true, upi: false };
  const outsideCustomer = { region: "Coimbatore", location: "RS Puram", locationRaw: "RS Puram, Coimbatore" };
  assert.equal(checkoutMode(p, 500, outsideCustomer), "online");

  const insideCustomer = { region: "Madurai", location: "KK Nagar", locationRaw: "KK Nagar, Madurai" };
  assert.equal(checkoutMode(p, 500, insideCustomer), "choose");
});

test("checkoutMode: no waPay and no upi -> 'none' (with COD on and with COD off)", () => {
  const codOn = { settings: defaultSettings({ codOn: true }), waPay: false, upi: false };
  assert.equal(checkoutMode(codOn, 500, null), "none");

  const codOff = { settings: defaultSettings({ codOn: false }), waPay: false, upi: false };
  assert.equal(checkoutMode(codOff, 500, null), "none");
});
