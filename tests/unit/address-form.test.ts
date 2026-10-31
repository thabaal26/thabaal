// WhatsApp's address form: reading the answer, one-line address, checks, pre-fill, "yes" replies and location pins.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formAddressText, formErrors, formPhone, formPrefill, formValuesFrom, locationAddress, SAME_ADDRESS_RE } from "../../src/lib/address-form";

describe("address form helpers", () => {
  const answer = JSON.stringify({
    values: { name: "Meena R", phone_number: "+919876543210", in_pin_code: "625020", house_number: "12", floor_number: "2", building_name: "Lake View Apts", address: "3rd Street", landmark_area: "Anna Nagar", city: "Madurai", state: "Tamil Nadu" },
  });

  test("reads the form's answer and writes one address line", () => {
    const v = formValuesFrom(answer);
    assert.ok(v);
    assert.equal(formAddressText(v!), "12, Floor 2, Lake View Apts, 3rd Street, Anna Nagar, Madurai, Tamil Nadu - 625020");
    assert.equal(formErrors(v!), null);
  });

  test("a saved address picked in the form (saved_address_id) reads the same way; junk is not an address", () => {
    assert.ok(formValuesFrom(JSON.stringify({ saved_address_id: "a1", values: { in_pin_code: "625020", address: "Main road", city: "Madurai" } })));
    assert.equal(formValuesFrom("not json"), null);
    assert.equal(formValuesFrom(JSON.stringify({ flow_token: "x" })), null);
  });

  test("missing or wrong pincode, street or city is sent back to fix", () => {
    const e = formErrors({ in_pin_code: "62502", city: "Madurai" });
    assert.ok(e?.in_pin_code);
    assert.ok(e?.address);
    assert.equal(e?.city, undefined);
  });

  test("the form is pre-filled with the last address, the real name and the WhatsApp number", () => {
    const v = formPrefill({ name: "+919876543210", phone: "919876543210", deliveryAddress: { city: "Madurai", in_pin_code: "625020", lat: 9.9 } });
    assert.deepEqual(v, { in_pin_code: "625020", city: "Madurai", phone_number: "+919876543210" });
    assert.equal(formPrefill({ name: "Meena R", phone: "919876543210" }).name, "Meena R");
    assert.equal(formPhone("14155550123"), undefined);
  });

  test('"yes" / "same" / "சரி" confirm the saved address; a question does not', () => {
    for (const t of ["yes", "Same address", "ok 👍", "aama", "சரி", "haan"]) assert.match(t, SAME_ADDRESS_RE, t);
    for (const t of ["yes but change the address", "how much is delivery?", "no"]) assert.doesNotMatch(t, SAME_ADDRESS_RE, t);
  });

  test("a shared location becomes a line and a map link", () => {
    const p = locationAddress({ latitude: 9.93, longitude: 78.12, name: "Home", address: "Anna Nagar, Madurai" });
    assert.equal(p.mapUrl, "https://maps.google.com/?q=9.93,78.12");
    assert.match(p.text, /Anna Nagar, Madurai \(location pin\)/);
  });
});
