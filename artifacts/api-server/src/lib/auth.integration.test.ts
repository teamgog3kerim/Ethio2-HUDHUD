import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { and, eq } from "drizzle-orm";
import { db, pool, appAccounts, authSessions, authUsers, learners } from "@workspace/db";
import { authSessionMiddleware } from "./auth";
import authRouter from "../routes/auth";

after(() => pool.end());

test("username registration, native bearer sessions, web cookies, and sign-out", {
  skip: process.env.RUN_AUTH_INTEGRATION !== "1" || process.env.NODE_ENV === "production",
  timeout: 30_000,
}, async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const username = `authcheck_${suffix}`;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(authSessionMiddleware());
  app.use("/api", authRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/auth`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  try {
    const registered = await post("register", { fullName: "Auth Test", username, password: "test-password-123" }, { "x-hudhud-client": "native" });
    assert.equal(registered.status, 201);
    const registration = await registered.json() as { user: { id: string; username: string }; accessToken?: string };
    assert.equal(registration.user.username, username);
    assert.ok(registration.accessToken);

    const nativeSession = await fetch(`${base}/session`, { headers: { authorization: `Bearer ${registration.accessToken}` } });
    assert.equal(nativeSession.status, 200);
    assert.equal((await nativeSession.json() as { user: { id: string } }).user.id, registration.user.id);

    const signedOut = await post("logout", {}, { authorization: `Bearer ${registration.accessToken}` });
    assert.equal(signedOut.status, 200);
    const revoked = await fetch(`${base}/session`, { headers: { authorization: `Bearer ${registration.accessToken}` } });
    assert.equal((await revoked.json() as { isSignedIn: boolean }).isSignedIn, false);

    const loggedIn = await post("login", { username: username.toUpperCase(), password: "test-password-123" });
    assert.equal(loggedIn.status, 200);
    const cookie = loggedIn.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const webSession = await fetch(`${base}/session`, { headers: { cookie } });
    assert.equal((await webSession.json() as { user: { id: string } }).user.id, registration.user.id);
    assert.equal((await post("logout", {}, { cookie })).status, 200);
  } finally {
    const [user] = await db.select().from(authUsers).where(eq(authUsers.usernameNormalized, username.toLowerCase())).limit(1);
    if (user) await db.transaction(async tx => {
      await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
      await tx.delete(learners).where(eq(learners.identity, `account:${user.id}`));
      await tx.delete(appAccounts).where(eq(appAccounts.userId, user.id));
      await tx.delete(authUsers).where(eq(authUsers.id, user.id));
    });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
