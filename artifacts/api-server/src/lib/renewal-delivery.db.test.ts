import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";

test("verified reminder delivery: dedup, cancellation, accounts, failure and deletion", { skip: process.env.RUN_RENEWAL_INTEGRATION !== "1" }, async () => {
  const { db, pool, learners, accessGrants, appAccounts, renewalDevices, renewalDeliveries } = await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { default: webpush } = await import("web-push");
  const { dispatchRenewalDevice, reminderDeviceStatus, verifiedReminder } = await import("./renewal-delivery");
  const { revokeDeviceConsent } = await import("./renewal-consent");
  const { deviceBindingKey } = await import("./renewal-policy");
  const userId = `renewal-test-${randomUUID()}`;
  const other = `renewal-test-${randomUUID()}`;
  const users = [userId, other];
  const revocationToken = randomUUID();
  const keys = webpush.generateVAPIDKeys();
  process.env.RENEWAL_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.RENEWAL_VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.RENEWAL_VAPID_SUBJECT = "mailto:tests@example.invalid";
  const original = webpush.sendNotification;
  let calls = 0;
  webpush.sendNotification = async () => { calls++; return { statusCode: 201, body: "", headers: {} }; };
  try {
    const [learner] = await db.insert(learners).values({ identity: `account:${userId}` }).returning();
    const [otherLearner] = await db.insert(learners).values({ identity: `account:${other}` }).returning();
    assert.ok(learner && otherLearner);
    const [device] = await db.insert(renewalDevices).values({
      id: randomUUID(), learnerId: learner.id, userId, channel: "web",
      address: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      subscription: {}, timezone: "Africa/Addis_Ababa",
      revocationHash: createHash("sha256").update(revocationToken).digest("hex"),
    }).returning();
    assert.ok(device);
    // No synthetic subscriptions/trial dates qualify.
    assert.equal(await verifiedReminder(userId), null);
    await dispatchRenewalDevice(device);
    assert.equal(calls, 0);
    const expiry = new Date(Date.now() + 2 * 86_400_000);
    await db.insert(accessGrants).values({ userId, enabled: true, expiresAt: new Date(Date.now() + 8 * 86_400_000), grantedBy: "test-fixture", reason: "Isolated test grant" });
    await dispatchRenewalDevice(device);
    assert.equal(calls, 0, "Future periods are not sent early");
    assert.ok((await reminderDeviceStatus(device.id, userId)).nextAt);
    await db.update(accessGrants).set({ expiresAt: expiry }).where(eq(accessGrants.userId, userId));
    await Promise.all([dispatchRenewalDevice(device), dispatchRenewalDevice(device)]);
    assert.equal(calls, 1, "Concurrent workers claim once");
    await db.update(renewalDevices).set({ timezone: "America/New_York" }).where(eq(renewalDevices.id, device.id));
    await dispatchRenewalDevice(device);
    assert.equal(calls, 1, "Timezone changes cannot resend");
    let status = await reminderDeviceStatus(device.id, userId);
    assert.equal(status.lastResult, "accepted");
    assert.equal(status.nextAt, null);
    assert.equal((await reminderDeviceStatus(device.id, other)).enabled, false);
    assert.equal((await reminderDeviceStatus(device.id, other)).lastResult, null);
    // Transfer to another account does not expose or suppress that account.
    await db.insert(accessGrants).values({ userId: other, enabled: true, expiresAt: expiry, grantedBy: "test-fixture", reason: "Isolated test grant" });
    const [transferred] = await db.update(renewalDevices).set({ userId: other, learnerId: otherLearner.id }).where(eq(renewalDevices.id, device.id)).returning();
    await revokeDeviceConsent(device.id, { revocationToken, bindingKey: deviceBindingKey(userId, device.id) });
    assert.equal((await reminderDeviceStatus(device.id, other)).enabled, true, "Old-account capability cannot revoke new account");
    await dispatchRenewalDevice(device);
    assert.equal(calls, 1, "Stale account scan is rejected");
    assert.equal((await reminderDeviceStatus(device.id, other)).lastResult, null);
    await dispatchRenewalDevice(transferred!);
    assert.equal(calls, 2);
    await db.update(renewalDevices).set({ userId, learnerId: learner.id }).where(eq(renewalDevices.id, device.id));
    await dispatchRenewalDevice(device);
    assert.equal(calls, 2, "A -> B -> A preserves per-account dedup");
    await revokeDeviceConsent(device.id, { revocationToken: randomUUID(), bindingKey: deviceBindingKey(userId, device.id) });
    assert.equal((await reminderDeviceStatus(device.id, userId)).enabled, true, "Wrong capabilities have no effect");
    await revokeDeviceConsent(device.id, { revocationToken, bindingKey: deviceBindingKey(userId, device.id) });
    assert.equal((await reminderDeviceStatus(device.id, userId)).enabled, false, "Account-session-independent revocation works");
    await db.update(renewalDevices).set({ state: "enabled" }).where(eq(renewalDevices.id, device.id));
    // A new verified period can schedule; cancellation and opt-out prevent it.
    await db.update(accessGrants).set({ expiresAt: new Date(expiry.getTime() + 1000), enabled: false }).where(eq(accessGrants.userId, userId));
    await dispatchRenewalDevice(device);
    assert.equal(calls, 2);
    await db.update(accessGrants).set({ enabled: true }).where(eq(accessGrants.userId, userId));
    await db.update(renewalDevices).set({ state: "disabled" }).where(eq(renewalDevices.id, device.id));
    await dispatchRenewalDevice(device);
    assert.equal(calls, 2);
    await db.update(renewalDevices).set({ state: "enabled" }).where(eq(renewalDevices.id, device.id));
    await db.insert(appAccounts).values({ userId, suspended: true });
    await dispatchRenewalDevice(device);
    assert.equal(calls, 2);
    await db.update(appAccounts).set({ suspended: false }).where(eq(appAccounts.userId, userId));
    webpush.sendNotification = async () => { calls++; throw Object.assign(new Error("Expired"), { statusCode: 410 }); };
    await dispatchRenewalDevice(device);
    status = await reminderDeviceStatus(device.id, userId);
    assert.equal(status.state, "expired");
    assert.equal(status.lastResult, "failed");
    await db.update(renewalDevices).set({ state: "enabled" }).where(eq(renewalDevices.id, device.id));
    await db.update(accessGrants).set({ expiresAt: new Date(expiry.getTime() + 2000) }).where(eq(accessGrants.userId, userId));
    webpush.sendNotification = async () => { calls++; throw new Error("Ambiguous timeout"); };
    await dispatchRenewalDevice(device);
    await dispatchRenewalDevice(device);
    assert.equal(calls, 4, "Ambiguous attempt is not repeated");
    assert.equal((await reminderDeviceStatus(device.id, userId)).lastResult, "unknown");
    await db.delete(learners).where(eq(learners.id, learner.id));
    assert.equal((await db.select().from(renewalDevices).where(eq(renewalDevices.id, device.id))).length, 0);
    assert.equal((await db.select().from(renewalDeliveries).where(eq(renewalDeliveries.userId, userId))).length, 0);
  } finally {
    webpush.sendNotification = original;
    await db.delete(learners).where(inArray(learners.identity, users.map(u => `account:${u}`)));
    await db.delete(accessGrants).where(inArray(accessGrants.userId, users));
    await db.delete(appAccounts).where(inArray(appAccounts.userId, users));
    await pool.end();
  }
});
