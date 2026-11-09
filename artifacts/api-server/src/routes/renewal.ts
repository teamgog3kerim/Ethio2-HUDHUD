import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db, renewalDevices } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import { SaveReminderDeviceBody, RevokeReminderDeviceBody } from "@workspace/api-zod";
import { getLearner } from "../lib/learner";
import { HttpError } from "../lib/http-error";
import { deliveryConfig, reminderDeviceStatus } from "../lib/renewal-delivery";
import { allowedPushAddress } from "../lib/renewal-policy";
import { revokeDeviceConsent } from "../lib/renewal-consent";

const router = Router();
// Disable-only capability. It cannot read account data, enroll a device, or
// revoke a different account now using the same physical installation.
router.post("/billing/reminder-device/:deviceId/revoke", async (req, res) => {
  const parsed = RevokeReminderDeviceBody.safeParse(req.body);
  const id = String(req.params.deviceId);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new HttpError(400, "Invalid revocation");
  await revokeDeviceConsent(id, parsed.data);
  res.sendStatus(204);
});
router.route("/billing/reminder-device/:deviceId")
  .all((req, _res, next) => {
    if (!getAuth(req).userId) throw new HttpError(401, "Sign in to enable background reminders");
    if (!z.string().uuid().safeParse(req.params.deviceId).success) throw new HttpError(400, "Invalid installation identifier");
    next();
  })
  .get(async (req, res) => { res.json(await reminderDeviceStatus(String(req.params.deviceId), getAuth(req).userId!)); })
  .put(async (req, res) => {
    const parsed = SaveReminderDeviceBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid device registration");
    const data = parsed.data;
    if (data.expectedUserId !== getAuth(req).userId) throw new HttpError(409, "Account changed; opt in again");
    try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }); }
    catch { throw new HttpError(400, "Invalid timezone"); }
    if (data.channel === "web") {
      if (!deliveryConfig().webConfigured) throw new HttpError(503, "Web Push is not configured");
      if (!allowedPushAddress(data.address) || !data.p256dh || !data.auth ||
        !/^[\w-]+={0,2}$/.test(data.p256dh) || !/^[\w-]+={0,2}$/.test(data.auth) ||
        Buffer.from(data.p256dh, "base64url").length !== 65 || Buffer.from(data.auth, "base64url").length !== 16)
        throw new HttpError(400, "Unsupported Web Push subscription");
    } else if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(data.address)) {
      throw new HttpError(400, "Invalid Expo token");
    }
    const learner = await getLearner(req, res);
    const id = String(req.params.deviceId);
    const userId = getAuth(req).userId!;
    await db.transaction(async tx => {
      // Transfer requires fresh opt-in. Claims retain their original ownership
      // and are never returned to the next account, including on A -> B -> A.
      await tx.delete(renewalDevices).where(and(eq(renewalDevices.address, data.address), ne(renewalDevices.id, id)));
      const devices = await tx.select({ id: renewalDevices.id }).from(renewalDevices).where(eq(renewalDevices.userId, userId));
      if (devices.length >= 10 && !devices.some(d => d.id === id)) throw new HttpError(409, "Device limit reached");
      const value = {
        id, learnerId: learner.id, userId, channel: data.channel, address: data.address,
        subscription: data.channel === "web" ? { endpoint: data.address, keys: { p256dh: data.p256dh, auth: data.auth } } : {},
        timezone: data.timezone, state: "enabled", updatedAt: new Date(),
        revocationHash: createHash("sha256").update(data.revocationToken).digest("hex"),
      };
      await tx.insert(renewalDevices).values(value).onConflictDoUpdate({ target: renewalDevices.id, set: value });
    });
    res.json(await reminderDeviceStatus(id, userId));
  })
  .delete(async (req, res) => {
    await db.update(renewalDevices).set({ state: "disabled", updatedAt: new Date() })
      .where(and(eq(renewalDevices.id, String(req.params.deviceId)), eq(renewalDevices.userId, getAuth(req).userId!)));
    res.sendStatus(204);
  });
export default router;
