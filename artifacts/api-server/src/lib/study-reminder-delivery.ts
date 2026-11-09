import webpush from "web-push";
import { db, learners, renewalDevices, renewalDeliveries, appAccounts } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { billingStatus } from "./billing-status";
import { studyVapidDetails, studyWebConfig } from "./study-push-config";
import { deviceBindingKey } from "./renewal-policy";
import { hash, studyReminderPolicy, type StudyPreferences } from "./study-reminder-policy";
import { localDate } from "./study-schedule";
import { logger } from "./logger";

export function isStudyDevice(subscription: unknown): boolean {
  return !!subscription && typeof subscription === "object" && "kind" in subscription && subscription.kind === "study";
}

export async function studyStatus(userId: string, now = new Date()) {
  const [learner] = await db.select().from(learners).where(eq(learners.identity, `account:${userId}`));
  const status = studyReminderPolicy((learner?.preferences ?? {}) as StudyPreferences, now, userId);
  if (status.due && learner) {
    const [account] = await db.select().from(appAccounts).where(eq(appAccounts.userId, userId));
    if (account?.suspended || account?.deletedAt) return { ...status, due: false };
    const access = await billingStatus(learner.id, userId);
    status.due = access.fullCourseAccess;
  }
  return status;
}

export async function studyDeviceStatus(id: string, userId: string) {
  const [device] = await db.select().from(renewalDevices).where(and(eq(renewalDevices.id, id), eq(renewalDevices.userId, userId)));
  const own = device && isStudyDevice(device.subscription) ? device : undefined;
  const [last] = own ? await db.select().from(renewalDeliveries).where(and(
    eq(renewalDeliveries.deviceId, id), eq(renewalDeliveries.userId, userId),
  )).orderBy(desc(renewalDeliveries.createdAt)).limit(1) : [];
  return {
    ...studyWebConfig(), enabled: own?.state === "enabled",
    bindingKey: own?.state === "enabled" ? deviceBindingKey(userId, id) : null,
    state: own?.state ?? "disabled", nextAt: null,
    lastResult: last?.state === "sending" && Date.now() - last.createdAt.getTime() > 300000 ? "unknown" : last?.state ?? null,
  };
}

export async function dispatchStudyDevice(id: string, now = new Date()) {
  const [initial] = await db.select().from(renewalDevices).where(eq(renewalDevices.id, id));
  if (!initial || !isStudyDevice(initial.subscription)) return;
  await db.transaction(async tx => {
    // Lock in deletion order: learner, then installation. Schedule pause,
    // preference edits and deletion cannot race a new provider dispatch.
    await tx.execute(sql`select id from learners where id = ${initial.learnerId} for no key update`);
    await tx.execute(sql`select id from renewal_devices where id = ${id} for no key update`);
    const [device] = await tx.select().from(renewalDevices).where(eq(renewalDevices.id, id));
    if (!device || device.learnerId !== initial.learnerId || device.state !== "enabled" || device.channel !== "web" || !isStudyDevice(device.subscription)) return;
    const vapidDetails = studyVapidDetails();
    if (!vapidDetails) return;
    const status = await studyStatus(device.userId, now);
    if (!status.due || !status.occurrenceKey) return;
    // Snoozing explicitly permits one later reminder; timeouts never auto-resend.
    const period = `study-${hash(`${device.userId}:${id}:${status.occurrenceKey}:${status.snoozedUntil ?? ""}`)}`;
    const [claim] = await db.insert(renewalDeliveries).values({
      id: period, deviceId: id, learnerId: device.learnerId, userId: device.userId, state: "sending",
    }).onConflictDoNothing().returning();
    if (!claim) return;
    try {
      await webpush.sendNotification(device.subscription as webpush.PushSubscription, JSON.stringify({
        kind: "study", title: "هدهد — حان وقت التعلّم",
        body: "جلسة الأمهرية بانتظارك. اضغط لمتابعة برنامجك.",
        binding: deviceBindingKey(device.userId, id), period,
        date: localDate(now, status.timezone), timezone: status.timezone,
        expiresAt: new Date(now.getTime() + 15 * 60000).toISOString(),
      }), { TTL: 900, timeout: 10000, vapidDetails });
      await db.update(renewalDeliveries).set({ state: "accepted" }).where(eq(renewalDeliveries.id, period));
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      await db.update(renewalDeliveries).set({ state: code ? "failed" : "unknown" }).where(eq(renewalDeliveries.id, period));
      if (code === 404 || code === 410) await tx.update(renewalDevices).set({ state: "expired", updatedAt: new Date() }).where(eq(renewalDevices.id, id));
    }
  });
}

export async function runStudyDelivery(now = new Date()) {
  if (!studyWebConfig().webConfigured) return;
  const devices = await db.select({ id: renewalDevices.id }).from(renewalDevices).where(and(
    eq(renewalDevices.state, "enabled"), eq(renewalDevices.channel, "web"),
    sql`${renewalDevices.subscription}->>'kind' = 'study'`,
  ));
  for (const device of devices) await dispatchStudyDevice(device.id, now);
}

export function startStudyDelivery() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runStudyDelivery(); }
    catch { logger.error("Study reminder delivery unavailable; in-app reminders remain available"); }
    finally { running = false; }
  };
  void tick();
  setInterval(() => void tick(), 60000).unref();
}
