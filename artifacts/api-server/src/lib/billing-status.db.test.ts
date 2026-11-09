import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, learners, courseTrials } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { GetBillingStatusResponse } from "@workspace/api-zod";
import { billingStatus } from "./billing-status";

test("48-hour trial persists, expired access is blocked, and signup cannot restart it", {
  skip: process.env.RUN_BILLING_DB_TESTS !== "1",
}, async () => {
  const guestId = randomUUID();
  const userId = `billing-test-${randomUUID()}`;
  const created = await db.insert(learners).values([
    { identity: `guest:${guestId}` }, { identity: `account:${userId}` },
  ]).returning();
  const guest = created.find(l => l.identity.startsWith("guest:"))!;
  const account = created.find(l => l.identity.startsWith("account:"))!;
  try {
    const initial = GetBillingStatusResponse.parse(await billingStatus(guest.id, null));
    assert.equal(initial.trial.state, "active");
    assert.equal(initial.isGuest, true);
    assert.equal(initial.configured, true);
    assert.equal(initial.enforcementEnabled, true);
    assert.equal(initial.fullCourseAccess, true);
    assert.match(initial.message, /48/);
    assert.doesNotMatch(initial.message, /الحجب غير مفعّل|مفتوحاً مؤقتاً/);
    assert.equal(initial.plan, "free");
    assert.equal(initial.reminder, null);
    assert.deepEqual(initial.offers.map(o => o.priceUsd), [29, 149]);
    const again = await billingStatus(guest.id, null);
    assert.equal(again.trial.startedAt, initial.trial.startedAt.toISOString());
    const expiredStart = new Date(Date.now() - 3 * 86_400_000);
    await db.update(courseTrials).set({ startedAt: expiredStart }).where(eq(courseTrials.learnerId, guest.id));
    const expired = await billingStatus(guest.id, null);
    assert.equal(expired.trial.state, "expired");
    assert.equal(expired.enforcementEnabled, true);
    assert.equal(expired.fullCourseAccess, false);
    await billingStatus(account.id, userId);
    const inherited = await billingStatus(account.id, userId, guestId);
    assert.equal(inherited.isGuest, false);
    assert.equal(inherited.trial.startedAt, expiredStart.toISOString());
    assert.equal(inherited.fullCourseAccess, false);
    const earlierStart = new Date(Date.now() - 5 * 86_400_000);
    await db.update(courseTrials).set({ startedAt: earlierStart }).where(eq(courseTrials.learnerId, account.id));
    await Promise.all(Array.from({ length: 4 }, () => billingStatus(account.id, userId, guestId)));
    assert.equal((await billingStatus(account.id, userId)).trial.startedAt, earlierStart.toISOString());
    const [unchanged] = await db.select().from(learners).where(eq(learners.id, account.id));
    assert.deepEqual(unchanged?.preferences, {});
    for (const choice of ["monthly", "six_month", "trial"]) {
      await db.update(learners).set({ preferences: { selectedPlan: choice } }).where(eq(learners.id, account.id));
      const status = GetBillingStatusResponse.parse(await billingStatus(account.id, userId));
      assert.equal(status.selectedPlan, choice);
      assert.equal(status.plan, "free");
      assert.equal(status.configured, true);
      assert.equal(status.enforcementEnabled, true);
      assert.equal(status.fullCourseAccess, false, "saving a plan is not payment");
      assert.equal(status.trial.startedAt.toISOString(), earlierStart.toISOString());
      assert.equal((await billingStatus(guest.id, null)).selectedPlan, null);
    }
  } finally {
    await db.delete(learners).where(inArray(learners.id, created.map(l => l.id)));
  }
});
