import { createHash, randomUUID } from "node:crypto";
import { db, authUsers, appAccounts, adminAudit, ownerBootstrapGrants } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { HttpError } from "./http-error";
import { makePasswordHash, usernameKey, getAuth } from "./auth";
import { normalizeRole, assertAccountUsable, type AppRole } from "./admin-policy";

function ownerConfig() {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!username && !password) return null;
  if (!username || !/^[A-Za-z0-9_]{3,24}$/.test(username)) throw new Error("ADMIN_BOOTSTRAP_USERNAME must be 3 to 24 letters, digits, or underscores");
  if (!password || password.length < 12 || password.length > 128) throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be 12 to 128 characters");
  const fullName = process.env.ADMIN_BOOTSTRAP_FULL_NAME?.trim() || "HUDHUD Owner";
  const normalized = usernameKey(username);
  return {
    username, normalized, password, fullName,
    key: createHash("sha256").update(`hudhud-owner-username:${normalized}`).digest("hex"),
  };
}

export async function bootstrapConfiguredOwner() {
  const config = ownerConfig();
  if (!config) return "not_configured";
  let [user] = await db.select().from(authUsers).where(eq(authUsers.usernameNormalized, config.normalized)).limit(1);
  if (!user) {
    const passwordHash = await makePasswordHash(config.password);
    const [created] = await db.insert(authUsers).values({
      id: `user_${randomUUID().replaceAll("-", "")}`,
      fullName: config.fullName, username: config.username,
      usernameNormalized: config.normalized, passwordHash,
    }).onConflictDoNothing({ target: authUsers.usernameNormalized }).returning();
    user = created ?? (await db.select().from(authUsers).where(eq(authUsers.usernameNormalized, config.normalized)).limit(1))[0];
  }
  if (!user) throw new Error("Unable to provision the configured owner account");
  await db.transaction(async tx => {
    const [claim] = await tx.insert(ownerBootstrapGrants)
      .values({ configKey: config.key, userId: user.id }).onConflictDoNothing().returning();
    if (claim) {
      await tx.insert(appAccounts).values({ userId: user.id, role: "owner", suspended: false })
        .onConflictDoUpdate({ target: appAccounts.userId, set: { role: "owner", suspended: false, deletedAt: null, updatedAt: new Date() } });
      await tx.insert(adminAudit).values({
        actorId: user.id, action: "owner.bootstrap", targetId: user.id,
        detail: { username: config.username },
      });
    }
  });
  return "ready";
}

export async function getAppRole(userId: string): Promise<AppRole> {
  const [account] = await db.select().from(appAccounts).where(eq(appAccounts.userId, userId));
  assertAccountUsable(account);
  return normalizeRole(account?.role);
}

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) throw new HttpError(401, "سجّل الدخول أولاً.");
  const role = await getAppRole(userId);
  if (role === "learner") throw new HttpError(403, "هذه الصفحة متاحة للإدارة فقط.");
  res.locals.adminId = userId;
  res.locals.adminRole = role;
  next();
};

export const enforceAccountStatus: RequestHandler = async (req, _res, next) => {
  const { userId } = getAuth(req);
  if (userId) {
    const [account] = await db.select().from(appAccounts).where(eq(appAccounts.userId, userId));
    assertAccountUsable(account);
  }
  next();
};
