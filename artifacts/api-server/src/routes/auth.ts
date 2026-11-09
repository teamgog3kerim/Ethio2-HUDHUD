import { Router } from "express";
import { eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { z } from "zod/v4";
import { db, authUsers, authSessions, appAccounts, learners } from "@workspace/db";
import { defaultPreferences } from "../lib/learner";
import { getAuth, createAccount, authenticate, toPublicAuthUser, clearSessionCookie, makePasswordHash, validatePassword, issueAuthSession, verifyPassword } from "../lib/auth";
import { HttpError } from "../lib/http-error";
import { getAppSettings } from "../lib/app-settings";

const router = Router();
const authAttemptLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا." },
});
const registerBody = z.object({
  fullName: z.string().trim().min(2).max(80),
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,24}$/),
  password: z.string().min(10).max(128),
});
const loginBody = z.object({
  username: z.string().trim().min(3).max(24),
  password: z.string().min(1).max(128),
});

router.get("/auth/session", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ isSignedIn: false, user: null });
    return;
  }
  const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
  if (!user) {
    res.json({ isSignedIn: false, user: null });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ isSignedIn: true, user: toPublicAuthUser(user) });
});

router.post("/auth/register", authAttemptLimit, async (req, res): Promise<void> => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "أكمل الاسم واسم المستخدم وكلمة المرور بالشكل المطلوب.");
  const user = await createAccount(parsed.data);
  const settings = await getAppSettings();
  await db.transaction(async tx => {
    await tx.insert(appAccounts).values({ userId: user.id, role: "learner" }).onConflictDoNothing();
    await tx.insert(learners).values({
      identity: `account:${user.id}`,
      preferences: { ...defaultPreferences, displayName: user.fullName, dailyGoal: settings.defaultDailyGoal },
    }).onConflictDoNothing();
  });
  await db.update(authUsers).set({ lastSignInAt: new Date() }).where(eq(authUsers.id, user.id));
  await db.delete(authSessions).where(eq(authSessions.userId, user.id));
  // Set the signed-in state through the same opaque, database-backed session used by login.
  const token = await issueAuthSession(user.id, req, res);
  res.status(201).json({
    isSignedIn: true, user: toPublicAuthUser({ ...user, lastSignInAt: new Date() }),
    ...(req.get("x-hudhud-client") === "native" ? { accessToken: token } : {}),
  });
});

router.post("/auth/login", authAttemptLimit, async (req, res): Promise<void> => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "أدخل اسم المستخدم وكلمة المرور.");
  const user = await authenticate(parsed.data.username, parsed.data.password);
  const token = await issueAuthSession(user.id, req, res);
  res.json({
    isSignedIn: true, user: toPublicAuthUser(user),
    ...(req.get("x-hudhud-client") === "native" ? { accessToken: token } : {}),
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const { sessionHash } = getAuth(req);
  if (sessionHash) await db.delete(authSessions).where(eq(authSessions.tokenHash, sessionHash));
  clearSessionCookie(req, res);
  res.json({ isSignedIn: false, user: null });
});

router.post("/auth/password", authAttemptLimit, async (req, res): Promise<void> => {
  const { userId, sessionHash } = getAuth(req);
  if (!userId || !sessionHash) throw new HttpError(401, "سجّل الدخول لتغيير كلمة المرور.");
  const parsed = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  }).safeParse(req.body);
  if (!parsed.success || !validatePassword(parsed.data.newPassword)) throw new HttpError(400, "كلمة المرور الجديدة يجب أن تتكون من 10 إلى 128 حرفًا.");
  const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
  if (!user || !await verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    throw new HttpError(400, "كلمة المرور الحالية غير صحيحة.");
  }
  const passwordHash = await makePasswordHash(parsed.data.newPassword);
  await db.transaction(async tx => {
    await tx.update(authUsers).set({ passwordHash, updatedAt: new Date() }).where(eq(authUsers.id, userId));
    await tx.delete(authSessions).where(eq(authSessions.userId, userId));
  });
  const token = await issueAuthSession(userId, req, res);
  res.json({
    status: "password_changed",
    ...(req.get("x-hudhud-client") === "native" ? { accessToken: token } : {}),
  });
});

export default router;
