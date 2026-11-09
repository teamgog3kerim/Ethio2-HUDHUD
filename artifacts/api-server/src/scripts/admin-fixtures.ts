// Disposable development-only accounts for the protected admin browser check.
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db, appAccounts, authUsers, learners, pool } from "@workspace/db";
import { makePasswordHash } from "../lib/auth";
import { defaultPreferences } from "../lib/learner";
import { logger } from "../lib/logger";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Fixtures are restricted to development");
  const tag = randomUUID().replaceAll("-", "").slice(0, 8);
  const fixtures = [];
  for (const [name, role] of [["Admin", "owner"], ["Learner", "learner"]] as const) {
    const username = `hhtest_${name.toLowerCase()}_${tag}`;
    const id = `user_${randomUUID().replaceAll("-", "")}`;
    const passwordHash = await makePasswordHash(randomBytes(18).toString("base64url"));
    await db.insert(authUsers).values({
      id, fullName: `${name} Check`, username, usernameNormalized: username.toLowerCase(), passwordHash,
    });
    await db.insert(appAccounts).values({ userId: id, role });
    await db.insert(learners).values({
      identity: `account:${id}`,
      preferences: { ...defaultPreferences, displayName: `${name} Check`, onboardingComplete: true, language: "en" },
    });
    fixtures.push({ id, username, role });
  }
  await writeFile("/tmp/hudhud-admin-fixtures.json", JSON.stringify(fixtures));
  logger.info({ count: fixtures.length }, "Disposable admin verification accounts prepared");
}
main().catch(err => { logger.error({ err }, "Fixture preparation failed"); process.exitCode = 1; }).finally(() => pool.end());
