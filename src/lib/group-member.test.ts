import test from "node:test";
import assert from "node:assert/strict";
import { createGroupMemberSchema, memberDisplayName } from "./group-member";

test("a PayPal email alone supplies the display name and payment address", () => {
  assert.deepEqual(createGroupMemberSchema.parse({ paypalAddress: " Friend@Example.com " }), {
    paypalAddress: "friend@example.com",
    displayName: "friend@example.com",
  });
});

test("a nickname never replaces the PayPal payment address", () => {
  assert.deepEqual(createGroupMemberSchema.parse({
    paypalAddress: "friend@example.com", displayName: " Trip buddy ",
  }), { paypalAddress: "friend@example.com", displayName: "Trip buddy" });
  assert.equal(memberDisplayName("", "friend@example.com"), "friend@example.com");
});

test("missing or invalid emails cannot create members", () => {
  for (const paypalAddress of [undefined, "", "friend", "paypal.me/friend", "friend@", "a b@example.com"]) {
    assert.equal(createGroupMemberSchema.safeParse({ paypalAddress }).success, false);
  }
});

test("long emails can be displayed without the former 60-character name limit", () => {
  const paypalAddress = `${"a".repeat(60)}@example.com`;
  assert.equal(createGroupMemberSchema.parse({ paypalAddress }).displayName, paypalAddress);
});
