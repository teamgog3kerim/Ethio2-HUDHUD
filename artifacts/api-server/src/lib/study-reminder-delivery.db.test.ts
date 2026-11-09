import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("study delivery: isolated consent, durable dedup, pause, opt-out, snooze and failure", { skip: process.env.RUN_STUDY_INTEGRATION !== "1" }, async () => {
  const { db, pool, learners, renewalDevices, renewalDeliveries, accessGrants, appAccounts } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { default: webpush } = await import("web-push");
  const { dispatchStudyDevice, studyStatus, studyDeviceStatus } = await import("./study-reminder-delivery");
  const { dispatchRenewalDevice } = await import("./renewal-delivery");
  const { localDate } = await import("./study-schedule");
  const userId = `study-test-${randomUUID()}`;
  const now = new Date();
  const today = localDate(now, "UTC");
  const prefs = {
    timezone: "UTC", reminderEnabled: true, reminderTime: "00:00",
    studySchedule: { startDate: today, studyDays: [0, 1, 2, 3, 4, 5, 6], pausedOn: null as string | null, pausedDays: 0 },
    studyReminderAction: undefined as undefined | { key: string; snoozedUntil?: string; dismissed?: boolean },
  };
  process.env.SESSION_SECRET = "isolated-study-test-root-key-not-a-real-credential";
  const original = webpush.sendNotification;
  let calls = 0;
  let payload: Record<string, string> = {};
  webpush.sendNotification = async (_subscription, data) => {
    calls++; payload = JSON.parse(String(data));
    return { statusCode: 201, body: "", headers: {} };
  };
  try {
    const [learner] = await db.insert(learners).values({ identity: `account:${userId}`, preferences: prefs }).returning();
    await db.insert(accessGrants).values({
      userId, enabled: true, expiresAt: new Date(now.getTime() + 3 * 86400000),
      grantedBy: "isolated-test", reason: "Isolated reminder test",
    });
    const [device] = await db.insert(renewalDevices).values({
      id: randomUUID(), learnerId: learner!.id, userId, channel: "web",
      address: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      subscription: { kind: "study", endpoint: "https://example.invalid/fixture-only", keys: { p256dh: "fixture", auth: "fixture" } },
      timezone: "UTC", state: "enabled",
    }).returning();
    const save = () => db.update(learners).set({ preferences: prefs }).where(eq(learners.id, learner!.id));
    await Promise.all([dispatchStudyDevice(device!.id, now), dispatchStudyDevice(device!.id, now)]);
    assert.equal(calls, 1, "Concurrent workers claim once");
    assert.equal(payload.kind, "study"); assert.equal(payload.date, today);
    assert.equal((await studyDeviceStatus(device!.id, userId)).lastResult, "accepted");
    assert.equal((await studyDeviceStatus(device!.id, "another-user")).enabled, false);
    await dispatchRenewalDevice(device!);
    assert.equal(calls, 1, "Study consent must not enroll billing reminders");
    const key = (await studyStatus(userId, now)).occurrenceKey!;
    prefs.studyReminderAction = { key, snoozedUntil: new Date(now.getTime() + 600000).toISOString() };
    await save(); await dispatchStudyDevice(device!.id, now);
    assert.equal(calls, 1, "Snooze suppresses delivery until due");
    const later = new Date(now.getTime() + 600001);
    // Keep the test's ten-minute interval within this local study day.
    if (localDate(later, "UTC") === today) {
      await dispatchStudyDevice(device!.id, later);
      assert.equal(calls, 2, "Snooze allows one requested later notification");
    }
    const before = calls;
    prefs.studyReminderAction = { key, snoozedUntil: new Date(now.getTime() - 1000).toISOString() };
    prefs.reminderEnabled = false;
    await save(); await dispatchStudyDevice(device!.id, now);
    assert.equal(calls, before, "Global opt-out prevents a new claim");
    prefs.reminderEnabled = true; prefs.studySchedule.pausedOn = today;
    await save(); await dispatchStudyDevice(device!.id, now);
    assert.equal(calls, before, "Paused schedules send nothing");
    prefs.studySchedule.pausedOn = null;
    await save(); await dispatchStudyDevice(device!.id, now);
    assert.equal(calls, before + 1);
    prefs.studyReminderAction = { key, snoozedUntil: new Date(now.getTime() - 2000).toISOString() };
    await save();
    webpush.sendNotification = async () => { calls++; throw Object.assign(new Error("Expired subscription"), { statusCode: 410 }); };
    await dispatchStudyDevice(device!.id, now);
    assert.equal((await studyDeviceStatus(device!.id, userId)).state, "expired");
    await db.update(renewalDevices).set({ state: "enabled" }).where(eq(renewalDevices.id, device!.id));
    prefs.studyReminderAction = { key, snoozedUntil: new Date(now.getTime() - 3000).toISOString() };
    await save();
    webpush.sendNotification = async () => { calls++; throw new Error("Unknown provider result"); };
    const prior = calls;
    await dispatchStudyDevice(device!.id, now); await dispatchStudyDevice(device!.id, now);
    assert.equal(calls, prior + 1, "Unknown outcomes are never blindly retried");
    assert.equal((await studyDeviceStatus(device!.id, userId)).lastResult, "unknown");
    await db.delete(learners).where(eq(learners.id, learner!.id));
    assert.equal((await db.select().from(renewalDeliveries).where(eq(renewalDeliveries.userId, userId))).length, 0);
  } finally {
    webpush.sendNotification = original;
    await db.delete(learners).where(eq(learners.identity, `account:${userId}`));
    await db.delete(accessGrants).where(eq(accessGrants.userId, userId));
    await db.delete(appAccounts).where(eq(appAccounts.userId, userId));
    await pool.end();
  }
});
