import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db, learners, renewalDevices } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ActOnStudyReminderBody, SaveStudyReminderSettingsBody, SaveStudyReminderDeviceBody, RevokeStudyReminderDeviceBody } from "@workspace/api-zod";
import { getLearner } from "../lib/learner";
import { HttpError } from "../lib/http-error";
import { studyWebConfig } from "../lib/study-push-config";
import { allowedPushAddress } from "../lib/renewal-policy";
import { revokeDeviceConsent } from "../lib/renewal-consent";
import { isStudyDevice, studyDeviceStatus, studyStatus } from "../lib/study-reminder-delivery";

const router = Router();
router.post("/study-reminders/devices/:deviceId/revoke", async (req, res) => {
  const parsed = RevokeStudyReminderDeviceBody.safeParse(req.body);
  const id = String(req.params.deviceId);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new HttpError(400, "Invalid revocation");
  const [device] = await db.select().from(renewalDevices).where(eq(renewalDevices.id, id));
  if (device && isStudyDevice(device.subscription)) await revokeDeviceConsent(id, parsed.data);
  res.sendStatus(204);
});
router.use("/study-reminders", (req, _res, next) => {
  if (!getAuth(req).userId) throw new HttpError(401, "Sign in for study reminders");
  next();
});
router.get("/study-reminders", async (req, res) => {
  await getLearner(req, res);
  res.json(await studyStatus(getAuth(req).userId!));
});
router.put("/study-reminders", async (req, res) => {
  const parsed = SaveStudyReminderSettingsBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid reminder settings");
  const learner = await getLearner(req, res);
  await db.update(learners).set({
    preferences: sql`${learners.preferences} || ${JSON.stringify({
      reminderEnabled: parsed.data.enabled, reminderTime: parsed.data.time,
    })}::jsonb`,
  }).where(eq(learners.id, learner.id));
  res.json(await studyStatus(getAuth(req).userId!));
});
router.post("/study-reminders/action", async (req, res) => {
  const parsed = ActOnStudyReminderBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid reminder action");
  const learner = await getLearner(req, res);
  // Serialize action evaluation against schedule/profile edits.
  await db.transaction(async tx => {
    await tx.execute(sql`select id from learners where id = ${learner.id} for no key update`);
    const status = await studyStatus(getAuth(req).userId!);
    if (status.occurrenceKey !== parsed.data.occurrenceKey) throw new HttpError(409, "The study schedule changed; refresh the reminder");
    const action = {
      key: status.occurrenceKey, dismissed: parsed.data.action === "dismiss",
      snoozedUntil: parsed.data.action === "snooze" ? new Date(Date.now() + 600000).toISOString() : undefined,
    };
    await tx.update(learners).set({ preferences: sql`${learners.preferences} || ${JSON.stringify({ studyReminderAction: action })}::jsonb` }).where(eq(learners.id, learner.id));
  });
  res.json(await studyStatus(getAuth(req).userId!));
});
router.route("/study-reminders/devices/:deviceId")
  .all((req, _res, next) => {
    if (!z.string().uuid().safeParse(req.params.deviceId).success) throw new HttpError(400, "Invalid installation identifier");
    next();
  })
  .get(async (req, res) => { res.json(await studyDeviceStatus(String(req.params.deviceId), getAuth(req).userId!)); })
  .put(async (req, res) => {
    const parsed = SaveStudyReminderDeviceBody.safeParse(req.body);
    if (!parsed.success || parsed.data.channel !== "web") throw new HttpError(400, "Invalid study Web Push registration");
    const data = parsed.data;
    const userId = getAuth(req).userId!;
    if (data.expectedUserId !== userId) throw new HttpError(409, "Account changed; opt in again");
    if (!studyWebConfig().webConfigured) throw new HttpError(503, "Web Push requires a stable, strong SESSION_SECRET");
    if (!allowedPushAddress(data.address) || !data.p256dh || !data.auth
      || !/^[\w-]+={0,2}$/.test(data.p256dh) || !/^[\w-]+={0,2}$/.test(data.auth)
      || Buffer.from(data.p256dh, "base64url").length !== 65 || Buffer.from(data.auth, "base64url").length !== 16)
      throw new HttpError(400, "Unsupported push subscription");
    const learner = await getLearner(req, res);
    const id = String(req.params.deviceId);
    await db.transaction(async tx => {
      const [old] = await tx.select().from(renewalDevices).where(eq(renewalDevices.id, id));
      if (old && !isStudyDevice(old.subscription)) throw new HttpError(409, "Use a separate study notification registration");
      const [addressOwner] = await tx.select().from(renewalDevices).where(eq(renewalDevices.address, data.address));
      if (addressOwner && addressOwner.id !== id) throw new HttpError(409, "Subscription is already bound; reset this study registration");
      const devices = await tx.select({ id: renewalDevices.id }).from(renewalDevices).where(eq(renewalDevices.userId, userId));
      if (devices.length >= 20 && !devices.some(d => d.id === id)) throw new HttpError(409, "Device limit reached");
      const value = {
        id, learnerId: learner.id, userId, channel: "web", address: data.address,
        subscription: { kind: "study", endpoint: data.address, keys: { p256dh: data.p256dh, auth: data.auth } },
        timezone: learner.preferences.timezone, state: "enabled", updatedAt: new Date(),
        revocationHash: createHash("sha256").update(data.revocationToken).digest("hex"),
      };
      await tx.insert(renewalDevices).values(value).onConflictDoUpdate({ target: renewalDevices.id, set: value });
    });
    res.json(await studyDeviceStatus(id, userId));
  })
  .delete(async (req, res) => {
    await db.update(renewalDevices).set({ state: "disabled", updatedAt: new Date() }).where(and(
      eq(renewalDevices.id, String(req.params.deviceId)), eq(renewalDevices.userId, getAuth(req).userId!),
      sql`${renewalDevices.subscription}->>'kind' = 'study'`,
    ));
    res.sendStatus(204);
  });
export default router;
