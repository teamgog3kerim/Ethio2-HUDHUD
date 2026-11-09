import { test } from "node:test";
import assert from "node:assert/strict";
import { queueRenewalRevocation, retryRenewalRevocations, finishRenewalRevocation, nativeRenewalPayloadAllowed, type RenewalBinding } from "../src/renewal-consent";

// Both production clients use this persistence/retry module. Exercise browser
// and asynchronous native storage, not a second implementation of the policy.
for (const platform of ["web", "native"] as const) {
  for (const enrolled of [false, true]) {
    test(`${platform}: sign-out succeeds during an API outage ${enrolled ? "with prior consent" : "without enrollment or network withdrawal"}`, async () => {
      let persisted = JSON.stringify({
        id: "installation", owner: enrolled ? "A" : null, consent: enrolled,
        revocationToken: "capability", bindingKey: enrolled ? "binding-a" : null, pending: [],
      } satisfies RenewalBinding);
      const store = {
        read: async () => { if (platform === "native") await Promise.resolve(); return JSON.parse(persisted) as RenewalBinding; },
        write: async (b: RenewalBinding) => { persisted = JSON.stringify(b); },
      };
      let requests = 0;
      let signedOut = false;
      await queueRenewalRevocation(store);
      await finishRenewalRevocation(store, async () => { requests++; throw new Error("API unavailable"); }, { bestEffort: true });
      signedOut = true; // Sign-out remains reachable after local withdrawal.
      assert.equal(signedOut, true);
      assert.equal((await store.read()).consent, false);
      assert.equal(requests, enrolled ? 1 : 0);
      assert.equal((await store.read()).pending.length, enrolled ? 1 : 0);
      await retryRenewalRevocations(store, async () => {});
      assert.equal((await store.read()).pending.length, 0, "Reconnect finishes the pending withdrawal");
    });
  }
  test(`${platform}: failed revocation persists across A -> B -> A and can always be retried`, async () => {
    const initial: RenewalBinding = {
      id: "installation", owner: "A", consent: true, bindingKey: "binding-a",
      revocationToken: "device-capability", pending: [],
    };
    let persisted = JSON.stringify(initial);
    const store = {
      read: async () => { if (platform === "native") await Promise.resolve(); return JSON.parse(persisted) as RenewalBinding; },
      write: async (b: RenewalBinding) => { if (platform === "native") await Promise.resolve(); persisted = JSON.stringify(b); },
    };
    let activeBinding = "binding-a";
    let enabled = true;
    let offline = true;
    const revoke = async (_id: string, input: { bindingKey: string; revocationToken: string }) => {
      if (offline) throw new Error("Offline");
      if (input.bindingKey === activeBinding && input.revocationToken === initial.revocationToken) enabled = false;
    };
    await queueRenewalRevocation(store);
    assert.equal((await store.read()).consent, false, "Local consent stops before the network");
    await assert.rejects(retryRenewalRevocations(store, revoke));
    assert.equal((await store.read()).owner, null);
    assert.equal((await store.read()).pending.length, 1, "Failed DELETE/capability is not forgotten");
    activeBinding = "binding-b";
    await store.write({ ...await store.read(), owner: "B", consent: true, bindingKey: activeBinding });
    offline = false;
    await retryRenewalRevocations(store, revoke);
    assert.equal(enabled, true, "A's pending request cannot revoke B");
    assert.equal((await store.read()).pending.length, 0);
    await queueRenewalRevocation(store);
    await retryRenewalRevocations(store, revoke);
    assert.equal(enabled, false, "Revocation works after the local owner has been cleared");
    activeBinding = "binding-a"; enabled = true;
    await store.write({ ...await store.read(), owner: "A", consent: true, bindingKey: activeBinding });
    await queueRenewalRevocation(store);
    await retryRenewalRevocations(store, revoke);
    assert.equal(enabled, false, "Returning A can always withdraw consent");
  });
}
test("native data-only push must match persisted account consent and an unexpired period", () => {
  const a: RenewalBinding = { id: "device", owner: "A", consent: true, revocationToken: "capability", bindingKey: "binding-a", pending: [] };
  const payload = { type: "renewal", bindingKey: "binding-a", period: "a".repeat(64), expiresAt: "2026-11-01T12:00:00Z" };
  const now = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(nativeRenewalPayloadAllowed(a, payload, now), true);
  assert.equal(nativeRenewalPayloadAllowed({ ...a, owner: null, consent: false }, payload, now), false);
  assert.equal(nativeRenewalPayloadAllowed({ ...a, owner: "B", bindingKey: "binding-b" }, payload, now), false);
  assert.equal(nativeRenewalPayloadAllowed(a, { ...payload, expiresAt: "2026-10-29T12:00:00Z" }, now), false);
});
