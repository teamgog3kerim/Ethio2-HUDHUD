import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, authSessions, authUsers, appAccounts } from "@workspace/db";
import { HttpError } from "./http-error";

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_BYTES, {
      N: PASSWORD_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
    }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}
const SESSION_COOKIE = "hudhud_session";
const SESSION_LIFETIME_MS = 30 * 86400000;
const PASSWORD_COST = 32768;
const PASSWORD_BYTES = 64;

export type PublicAuthUser = {
  id: string;
  fullName: string;
  username: string;
  createdAt: string;
  lastSignInAt: string | null;
};
type AuthState = { userId: string | null; sessionHash?: string };
type AuthRequest = Request & { hudhudAuth?: AuthState };

export function getAuth(req: Request): AuthState {
  return (req as AuthRequest).hudhudAuth ?? { userId: null };
}

export function usernameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 6 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt$${PASSWORD_COST}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, costText, saltText, hashText] = encoded.split("$");
  if (scheme !== "scrypt" || costText !== String(PASSWORD_COST) || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length !== 16 || expected.length !== PASSWORD_BYTES) return false;
    const actual = await derivePassword(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function makePasswordHash(password: string): Promise<string> {
  if (!validatePassword(password)) throw new Error("Password must be 6 to 128 characters");
  return hashPassword(password);
}

function publicUser(user: typeof authUsers.$inferSelect): PublicAuthUser {
  return {
    id: user.id, fullName: user.fullName, username: user.username,
    createdAt: user.createdAt.toISOString(),
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
  };
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax" as const, path: "/", maxAge: SESSION_LIFETIME_MS,
  };
}

function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
}

export function clearSessionCookie(req: Request, res: Response) {
  const { maxAge: _maxAge, ...options } = cookieOptions(req);
  res.clearCookie(SESSION_COOKIE, options);
}

export async function issueAuthSession(userId: string, req: Request, res: Response) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = tokenDigest(token);
  const now = new Date();
  await db.insert(authSessions).values({
    tokenHash, userId, createdAt: now,
    lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
  });
  setSessionCookie(req, res, token);
  return token;
}

export function authSessionMiddleware(): RequestHandler {
  return async (req, _res, next) => {
    const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = req.cookies?.[SESSION_COOKIE] ?? bearer;
    if (typeof token !== "string" || token.length < 40 || token.length > 100) {
      (req as AuthRequest).hudhudAuth = { userId: null };
      next();
      return;
    }
    const digest = tokenDigest(token);
    const [row] = await db.select({
      session: authSessions, user: authUsers,
    }).from(authSessions).innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
      .where(and(eq(authSessions.tokenHash, digest), gt(authSessions.expiresAt, new Date()))).limit(1);
    (req as AuthRequest).hudhudAuth = row
      ? { userId: row.user.id, sessionHash: digest }
      : { userId: null };
    next();
  };
}

export async function createAccount(input: { fullName: string; username: string; password: string }) {
  const fullName = input.fullName.trim();
  const username = input.username.trim();
  const usernameNormalized = usernameKey(username);
  if (fullName.length < 2 || fullName.length > 80) throw new HttpError(400, "اكتب اسمًا كاملًا من حرفين إلى 80 حرفًا.");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw new HttpError(400, "اسم المستخدم من 3 إلى 24 حرفًا: استخدم الإنجليزية والأرقام والشرطة السفلية فقط.");
  if (!validatePassword(input.password)) throw new HttpError(400, "كلمة المرور مطلوبة بطول 6 إلى 128 حرفًا.");
  const passwordHash = await hashPassword(input.password);
  const id = `user_${randomUUID().replaceAll("-", "")}`;
  const [user] = await db.insert(authUsers).values({
    id, fullName, username, usernameNormalized, passwordHash,
  }).onConflictDoNothing({ target: authUsers.usernameNormalized }).returning();
  if (!user) throw new HttpError(409, "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.");
  return user;
}

export async function authenticate(username: string, password: string) {
  const normalized = usernameKey(username);
  const [user] = await db.select().from(authUsers).where(eq(authUsers.usernameNormalized, normalized)).limit(1);
  // Verify a fixed-cost dummy hash for unknown accounts to reduce username timing leaks.
  if (!user) {
    await hashPassword(password.slice(0, 128));
    throw new HttpError(401, "اسم المستخدم أو كلمة المرور غير صحيحة.");
  }
  if (!await verifyPassword(password, user.passwordHash)) throw new HttpError(401, "اسم المستخدم أو كلمة المرور غير صحيحة.");
  const [status] = await db.select().from(appAccounts).where(eq(appAccounts.userId, user.id));
  if (status?.suspended || status?.deletedAt) throw new HttpError(403, "هذا الحساب موقوف. تواصل مع الإدارة.");
  const now = new Date();
  const [updated] = await db.update(authUsers).set({ lastSignInAt: now, updatedAt: now })
    .where(eq(authUsers.id, user.id)).returning();
  return updated ?? { ...user, lastSignInAt: now };
}

export function toPublicAuthUser(user: typeof authUsers.$inferSelect): PublicAuthUser {
  return publicUser(user);
}
