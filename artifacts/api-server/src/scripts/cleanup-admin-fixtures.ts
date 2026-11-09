import { readFile, unlink } from "node:fs/promises";
import { db, authSessions, authUsers, learners, appAccounts, accessGrants, adminAudit, lessons, pool } from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { logger } from "../lib/logger";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Fixture cleanup is restricted to development");
  const fixtures = JSON.parse(process.argv[2] ?? await readFile("/tmp/hudhud-admin-fixtures.json", "utf8")) as { id: string; username: string; role: string }[];
  if (!fixtures.length || fixtures.some(f => !/^hhtest_(admin|learner)_[a-f0-9]{8}$/.test(f.username) || !/^user_[a-f0-9]{32}$/.test(f.id))) {
    throw new Error("Invalid disposable fixture manifest");
  }
  for (const fixture of fixtures) {
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, fixture.id)).limit(1);
    if (user && user.username !== fixture.username) throw new Error("Refusing to remove an account outside the fixture manifest");
    await db.insert(appAccounts).values({ userId: fixture.id, role: "learner", suspended: true, deletedAt: new Date() })
      .onConflictDoUpdate({ target: appAccounts.userId, set: { role: "learner", suspended: true, deletedAt: new Date(), updatedAt: new Date() } });
  }
  const ids = fixtures.map(f => f.id);
  await db.transaction(async tx => {
    const created = await tx.select().from(adminAudit).where(and(inArray(adminAudit.actorId, ids), eq(adminAudit.action, "lesson.created"), eq(adminAudit.targetId, "admin-browser-check")));
    if (created.length) await tx.delete(lessons).where(and(eq(lessons.id, "admin-browser-check"), eq(lessons.active, false)));
    await tx.delete(authSessions).where(inArray(authSessions.userId, ids));
    await tx.delete(learners).where(inArray(learners.identity, ids.map(id => `account:${id}`)));
    await tx.delete(accessGrants).where(inArray(accessGrants.userId, ids));
    await tx.delete(adminAudit).where(or(inArray(adminAudit.actorId, ids), inArray(adminAudit.targetId, ids)));
    await tx.delete(authUsers).where(inArray(authUsers.id, ids));
  });
  if (!process.argv[2]) await unlink("/tmp/hudhud-admin-fixtures.json");
  logger.info({ count: ids.length }, "Disposable admin verification records removed");
}
main().catch(err => { logger.error({ err }, "Fixture cleanup failed"); process.exitCode = 1; }).finally(() => pool.end());
