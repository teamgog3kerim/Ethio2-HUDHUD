import { Router, type IRouter } from "express";
import { liveCheckoutEnabled } from "../lib/polar-live";
import { getAuth } from "../lib/auth";
import { db, authUsers, applicationSettings, adminAudit, appAccounts, accessGrants, completions, aiUsage, learners } from "@workspace/db";
import { count, and, eq, gt, desc, like, isNull } from "drizzle-orm";
import { GetAdminAccessResponse, GetAdminOverviewResponse, SaveAdminSettingsBody, GetAdminSettingsResponse, GetAdminAuditResponse } from "@workspace/api-zod";
import { z } from "zod/v4";
import { getAppRole, requireAdmin } from "../lib/admin-auth";
import { getAppSettings } from "../lib/app-settings";
import { HttpError } from "../lib/http-error";
import usersRouter from "./admin-users";
import contentRouter from "./admin-content";
import visitorsRouter from "./admin-visitors";
const router: IRouter = Router();
router.get("/me", async (req, res) => {
  const { userId } = getAuth(req);
  res.json(GetAdminAccessResponse.parse({ signedIn: !!userId, role: userId ? await getAppRole(userId) : "learner" }));
});
router.use(requireAdmin);
router.get("/overview", async (_req, res) => {
  const [directory, learnerCount, completionCount, usageCount, complimentaryCount, suspendedCount] = await Promise.all([
    db.select({ n: count() }).from(authUsers),
    db.select({ n: count() }).from(learners).where(like(learners.identity, "account:%")),
    db.select({ n: count() }).from(completions),
    db.select({ n: count() }).from(aiUsage),
    db.select({ n: count() }).from(accessGrants).where(and(eq(accessGrants.enabled, true), gt(accessGrants.expiresAt, new Date()))),
    db.select({ n: count() }).from(appAccounts).where(and(eq(appAccounts.suspended, true), isNull(appAccounts.deletedAt))),
  ]);
  res.json(GetAdminOverviewResponse.parse({ registeredUsers: directory[0]!.n, learners: learnerCount[0]!.n, completedLessons: completionCount[0]!.n, aiRequests: usageCount[0]!.n, activeComplimentary: complimentaryCount[0]!.n, suspendedUsers: suspendedCount[0]!.n, billingConfigured: liveCheckoutEnabled() }));
});
router.get("/settings", async (_req, res) => { res.json(await getAppSettings()); });
router.put("/settings", async (req, res) => {
  const parsed = SaveAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "الإعدادات غير صالحة.");
  if (parsed.data.supportEmail && !z.email().safeParse(parsed.data.supportEmail).success) throw new HttpError(400, "بريد الدعم غير صالح.");
  await db.transaction(async tx => {
    const [old] = await tx.select().from(applicationSettings).where(eq(applicationSettings.id, "global"));
    await tx.insert(applicationSettings).values({ id: "global", value: parsed.data })
      .onConflictDoUpdate({ target: applicationSettings.id, set: { value: parsed.data, updatedAt: new Date() } });
    await tx.insert(adminAudit).values({ actorId: res.locals.adminId, action: "settings.updated", targetId: "global", detail: { before: old?.value ?? {}, after: parsed.data } });
  });
  res.json(GetAdminSettingsResponse.parse(parsed.data));
});
router.get("/audit", async (_req, res) => {
  const rows = await db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(100);
  res.json(GetAdminAuditResponse.parse(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});
router.use(usersRouter);
router.use(visitorsRouter);
router.use(contentRouter);
export default router;
