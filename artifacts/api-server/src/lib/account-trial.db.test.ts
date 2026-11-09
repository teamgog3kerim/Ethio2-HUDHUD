import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, learners, courseTrials } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { billingStatus } from "./billing-status";

test("account activation starts 48h, marketing visits do not, and old trials never reset", async () => {
  const guestId = randomUUID();
  const userId = `isolated-account-trial-${randomUUID()}`;
  const [guest, account] = await db.insert(learners).values([
    { identity: `guest:${guestId}` }, { identity: `account:${userId}` },
  ]).returning();
  const ids = [guest!.id, account!.id];
  try {
    const anonymous = await billingStatus(guest!.id, null);
    assert.equal(anonymous.fullCourseAccess, false);
    assert.equal((await db.select().from(courseTrials).where(eq(courseTrials.learnerId, guest!.id))).length, 0);
    // A legacy guest clock must not shorten the explicitly promised account trial.
    await db.insert(courseTrials).values({ learnerId: guest!.id, startedAt: new Date(Date.now() - 24 * 3600_000) });
    const before = Date.now();
    const first = await billingStatus(account!.id, userId, guestId);
    assert.equal(first.fullCourseAccess, true);
    assert.equal(first.trial.state, "active");
    assert.ok(Date.parse(first.trial.startedAt) >= before - 1000);
    assert.equal(Date.parse(first.trial.endsAt) - Date.parse(first.trial.startedAt), 48 * 3600_000);
    const repeat = await billingStatus(account!.id, userId, guestId);
    assert.equal(repeat.trial.startedAt, first.trial.startedAt);
    const original = new Date(Date.now() - 49 * 3600_000);
    await db.update(courseTrials).set({ startedAt: original }).where(eq(courseTrials.learnerId, account!.id));
    const expired = await billingStatus(account!.id, userId, guestId);
    assert.equal(expired.trial.state, "expired");
    assert.equal(expired.fullCourseAccess, false);
    assert.equal(expired.trial.startedAt, original.toISOString());
  } finally {
    await db.delete(learners).where(inArray(learners.id, ids));
    await pool.end();
  }
});
