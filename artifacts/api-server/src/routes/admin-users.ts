import { Router, type IRouter } from "express";
import { count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  db, authUsers, authSessions, learners, appAccounts, accessGrants, adminAudit,
  completions, courseTrials, polarLivePurchases,
} from "@workspace/db";
import { GetAdminUsersResponse, UpdateAdminUserBody, DeleteAdminUserBody, SetAdminUserAccessBody } from "@workspace/api-zod";
import { z } from "zod/v4";
import { HttpError } from "../lib/http-error";
import { defaultPreferences } from "../lib/learner";
import { getAppSettings } from "../lib/app-settings";
import { normalizeRole, canManageTarget, isComplimentary, type AppRole } from "../lib/admin-policy";
import { adminBillingSummary } from "../lib/admin-billing-summary";
import { usernameKey } from "../lib/auth";

const router: IRouter = Router();
const listQuery = z.object({ search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) });

async function targetFor(actorId: string, actorRole: AppRole, id: string, destructive = false) {
  if (!/^user_[a-zA-Z0-9]+$/.test(id)) throw new HttpError(400, "معرّف حساب غير صالح.");
  const [control] = await db.select().from(appAccounts).where(eq(appAccounts.userId, id));
  if (control?.deletedAt) throw new HttpError(404, "تم حذف هذا الحساب بالفعل.");
  const targetRole = normalizeRole(control?.role);
  if (!canManageTarget(actorRole, actorId, targetRole, id, destructive)) throw new HttpError(403, "لا تملك صلاحية تعديل هذا الحساب، أو لا يمكنك تنفيذ هذا الإجراء على حسابك.");
  const [user] = await db.select().from(authUsers).where(eq(authUsers.id, id)).limit(1);
  if (!user) throw new HttpError(404, "الحساب غير موجود.");
  return { user, control, role: targetRole };
}

router.get("/users", async (req, res) => {
  const query = listQuery.safeParse(req.query);
  if (!query.success) throw new HttpError(400, "بحث أو رقم صفحة غير صالح.");
  const { search, page } = query.data;
  const where = search ? or(ilike(authUsers.fullName, `%${search}%`), ilike(authUsers.username, `%${search}%`)) : undefined;
  const [directory, [total]] = await Promise.all([
    db.select().from(authUsers).where(where).orderBy(desc(authUsers.createdAt)).limit(25).offset((page - 1) * 25),
    db.select({ n: count() }).from(authUsers).where(where),
  ]);
  const ids = directory.map(u => u.id);
  const [controls, grants, profiles, purchases] = ids.length ? await Promise.all([
    db.select().from(appAccounts).where(inArray(appAccounts.userId, ids)),
    db.select().from(accessGrants).where(inArray(accessGrants.userId, ids)),
    db.select().from(learners).where(inArray(learners.identity, ids.map(id => `account:${id}`))),
    db.select().from(polarLivePurchases).where(inArray(polarLivePurchases.userId, ids)),
  ]) : [[], [], [], []];
  const counts = profiles.length ? await db.select({ learnerId: completions.learnerId, total: count() }).from(completions).where(inArray(completions.learnerId, profiles.map(p => p.id))).groupBy(completions.learnerId) : [];
  const trials = profiles.length ? await db.select().from(courseTrials).where(inArray(courseTrials.learnerId, profiles.map(p => p.id))) : [];
  const settings = await getAppSettings();
  const users = directory.map(user => {
    const control = controls.find(c => c.userId === user.id);
    const grant = grants.find(g => g.userId === user.id);
    const profile = profiles.find(p => p.identity === `account:${user.id}`);
    const prefs = profile?.preferences as Partial<typeof defaultPreferences> | undefined;
    const totalLessons = counts.find(c => c.learnerId === profile?.id)?.total ?? 0;
    const role = normalizeRole(control?.role);
    const suspended = !!control?.suspended;
    return {
      id: user.id, username: user.username,
      displayName: prefs?.displayName ?? user.fullName,
      role, suspended,
      createdAt: user.createdAt.toISOString(),
      lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      lessonsCompleted: totalLessons, xp: totalLessons * 30,
      dailyGoal: prefs?.dailyGoal ?? settings.defaultDailyGoal,
      ...adminBillingSummary({
        rows: purchases.filter(p => p.userId === user.id),
        trialStartedAt: trials.find(t => t.learnerId === profile?.id)?.startedAt ?? null,
        preferences: profile?.preferences, complimentary: isComplimentary(grant),
        complimentaryExpiresAt: grant?.expiresAt ?? null, role, suspended,
      }),
      accessReason: grant?.reason ?? "",
    };
  });
  res.json(GetAdminUsersResponse.parse({ users, total: total!.n, page, pageSize: 25 }));
});

router.patch("/users/:id", async (req, res) => {
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "بيانات التعديل غير صالحة. سبب الإجراء مطلوب.");
  const data = parsed.data;
  if (data.reason.trim().length < 3 || (data.displayName !== undefined && !data.displayName.trim())) throw new HttpError(400, "الاسم والسبب لا يمكن أن يكونا فارغين.");
  const actorId = res.locals.adminId as string;
  const actorRole = res.locals.adminRole as AppRole;
  const id = String(req.params.id);
  const { user, control, role } = await targetFor(actorId, actorRole, id, data.suspended === true || data.role !== undefined);
  if (data.role !== undefined && actorRole !== "owner") throw new HttpError(403, "المالك فقط يمكنه تعيين أو إزالة صلاحية المسؤول.");
  if (role === "owner" && (data.role !== undefined || data.suspended !== undefined)) throw new HttpError(403, "لا يمكن إزالة صلاحية المالك أو إيقاف حسابه من هذه الشاشة.");
  await db.transaction(async tx => {
    await tx.insert(appAccounts).values({ userId: id, role: data.role ?? role, suspended: data.suspended ?? control?.suspended ?? false })
      .onConflictDoUpdate({ target: appAccounts.userId, set: {
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.suspended !== undefined ? { suspended: data.suspended } : {}),
        updatedAt: new Date(),
      } });
    if (data.suspended === true) await tx.delete(authSessions).where(eq(authSessions.userId, id));
    if (data.displayName !== undefined) {
      await tx.update(authUsers).set({ fullName: data.displayName.trim(), updatedAt: new Date() }).where(eq(authUsers.id, id));
    }
    if (data.displayName !== undefined || data.dailyGoal !== undefined) {
      const [profile] = await tx.select().from(learners).where(eq(learners.identity, `account:${id}`));
      const preferences = {
        ...defaultPreferences, ...(profile?.preferences as object ?? {}),
        ...(data.displayName !== undefined ? { displayName: data.displayName.trim() } : {}),
        ...(data.dailyGoal !== undefined ? { dailyGoal: data.dailyGoal } : {}),
      };
      await tx.insert(learners).values({ identity: `account:${id}`, preferences })
        .onConflictDoUpdate({ target: learners.identity, set: { preferences } });
    }
    await tx.insert(adminAudit).values({
      actorId, action: "user.update", targetId: id,
      detail: { ...data, previousRole: role, previousSuspended: !!control?.suspended, username: user.username },
    });
  });
  res.json({ status: "saved" });
});

router.put("/users/:id/access", async (req, res) => {
  const parsed = SetAdminUserAccessBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "سبب منح الوصول وتاريخ الانتهاء مطلوبان.");
  const data = parsed.data;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (data.enabled && (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 366 * 86400000)) throw new HttpError(400, "الوصول المجاني يحتاج تاريخ انتهاء مستقبلي خلال سنة.");
  if (data.reason.trim().length < 3) throw new HttpError(400, "اكتب سبباً واضحاً.");
  const id = String(req.params.id), actorId = res.locals.adminId as string;
  await targetFor(actorId, res.locals.adminRole as AppRole, id, false);
  await db.transaction(async tx => {
    await tx.insert(accessGrants).values({ userId: id, enabled: data.enabled, expiresAt: data.enabled ? expiresAt : null, reason: data.reason.trim(), grantedBy: actorId })
      .onConflictDoUpdate({ target: accessGrants.userId, set: { enabled: data.enabled, expiresAt: data.enabled ? expiresAt : null, reason: data.reason.trim(), grantedBy: actorId, updatedAt: new Date() } });
    await tx.insert(adminAudit).values({ actorId, action: data.enabled ? "access.complimentary_granted" : "access.complimentary_revoked", targetId: id, detail: { ...data, source: "admin_grant", paidSubscription: false } });
  });
  res.json({ status: "saved" });
});

router.delete("/users/:id", async (req, res) => {
  const parsed = DeleteAdminUserBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "اسم المستخدم التأكيدي وسبب الحذف مطلوبان.");
  if (parsed.data.reason.trim().length < 3) throw new HttpError(400, "اكتب سبباً واضحاً للحذف.");
  const id = String(req.params.id), actorId = res.locals.adminId as string;
  const target = await targetFor(actorId, res.locals.adminRole as AppRole, id, true);
  if (target.role === "owner") throw new HttpError(403, "حساب المالك محمي من الحذف.");
  if (usernameKey(parsed.data.confirmationUsername) !== usernameKey(target.user.username)) {
    throw new HttpError(400, "اكتب اسم المستخدم بالضبط للتأكيد.");
  }
  await db.transaction(async tx => {
    await tx.insert(appAccounts).values({ userId: id, role: "learner", suspended: true })
      .onConflictDoUpdate({ target: appAccounts.userId, set: { suspended: true, updatedAt: new Date() } });
    await tx.delete(authSessions).where(eq(authSessions.userId, id));
    await tx.delete(authUsers).where(eq(authUsers.id, id));
    await tx.delete(learners).where(eq(learners.identity, `account:${id}`));
    await tx.delete(accessGrants).where(eq(accessGrants.userId, id));
    await tx.update(appAccounts).set({ role: "learner", suspended: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(appAccounts.userId, id));
    await tx.insert(adminAudit).values({
      actorId, action: "user.deleted", targetId: id,
      detail: { reason: parsed.data.reason, username: target.user.username, authenticationIdentityDeleted: true },
    });
  });
  res.json({ status: "deleted" });
});

export default router;
