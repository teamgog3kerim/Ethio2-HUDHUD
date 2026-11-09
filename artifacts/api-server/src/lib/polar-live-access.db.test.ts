import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, learners, polarLivePurchases, polarSandboxCheckouts, accessGrants, appAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import { liveAccess } from "./polar-live-access";
import { billingStatus } from "./billing-status";
import { getAccessState, defaultAppSettings } from "./app-settings";
import { liveCheckoutEnabled, liveMonthlyEnabled } from "./polar-live";

test("live entitlement isolation, freshness, grants and original trial are preserved", async () => {
  const userId = `isolated-live-access-${randomUUID()}`;
  const other = `isolated-live-other-${randomUUID()}`;
  const [learner] = await db.insert(learners).values({ identity: `account:${userId}` }).returning();
  const checkoutId = randomUUID();
  const until = new Date(Date.now() + 25 * 86_400_000);
  try {
    const initial = await billingStatus(learner!.id, userId);
    await db.insert(polarSandboxCheckouts).values({
      id: randomUUID(), userId, plan: "six_month", status: "paid", checkoutUrl: "https://sandbox.polar.sh/checkout/fixture",
      expiresAt: until, accessUntil: until, verifiedAt: new Date(),
    });
    assert.equal((await liveAccess(userId)).accessUntil, null, "sandbox does not grant live access");
    await db.insert(polarLivePurchases).values({
      userId, plan: "six_month", status: "pending", checkoutId, verifiedAt: new Date(),
      nextCheckAt: until,
    });
    const pending = await billingStatus(learner!.id, userId);
    assert.equal(pending.hasLivePurchase, false, "an unpaid checkout is not portal-ready billing history");
    assert.equal(pending.paymentVerificationPending, true);
    assert.equal(pending.pendingCheckoutId, checkoutId);
    await db.update(polarLivePurchases).set({
      status: "paid", verifiedAt: new Date(),
      accessUntil: until, paidUntil: until, nextCheckAt: until,
    }).where(eq(polarLivePurchases.userId, userId));
    const paid = await billingStatus(learner!.id, userId);
    assert.equal(paid.source, "polar_live");
    assert.equal(paid.plan, "six_month");
    assert.equal(paid.trial.startedAt, initial.trial.startedAt);
    assert.equal(paid.configured, true);
    assert.equal(paid.enforcementEnabled, true);
    assert.equal(paid.liveCheckoutEnabled, liveCheckoutEnabled());
    assert.equal(paid.liveMonthlyCheckoutEnabled, liveMonthlyEnabled());
    assert.equal(paid.hasLivePurchase, true, "verified purchases can open billing receipts");
    assert.equal((await liveAccess(other)).accessUntil, null);
    const access = await getAccessState(userId, defaultAppSettings);
    assert.equal(access.dailyAiLimit, defaultAppSettings.complimentaryAiDailyLimit);
    await db.insert(accessGrants).values({ userId, enabled: true, expiresAt: until, reason: "isolated fixture", grantedBy: "isolated-test" });
    const granted = await billingStatus(learner!.id, userId);
    assert.equal(granted.source, "admin_grant");
    assert.equal(granted.plan, "complimentary");
    await db.delete(accessGrants).where(eq(accessGrants.userId, userId));
    await db.update(polarLivePurchases).set({ verifiedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(polarLivePurchases.userId, userId));
    let refreshes = 0;
    const stale = await liveAccess(userId, async () => { refreshes++; throw new Error("isolated provider outage"); });
    assert.equal(refreshes, 1);
    assert.equal(stale.accessUntil, null, "stale verification cannot silently unlock access");
    assert.equal(stale.paymentVerificationPending, true);
    await db.update(polarLivePurchases).set({ verifiedAt: new Date(), status: "refunded", accessUntil: null }).where(eq(polarLivePurchases.userId, userId));
    assert.equal((await liveAccess(userId)).accessUntil, null);
    await db.insert(appAccounts).values({ userId, deletedAt: new Date() });
    await assert.rejects(liveAccess(userId), (e: { status: number }) => e.status === 403);
  } finally {
    await db.delete(polarLivePurchases).where(eq(polarLivePurchases.userId, userId));
    await db.delete(polarSandboxCheckouts).where(eq(polarSandboxCheckouts.userId, userId));
    await db.delete(accessGrants).where(eq(accessGrants.userId, userId));
    await db.delete(appAccounts).where(eq(appAccounts.userId, userId));
    await db.delete(learners).where(eq(learners.id, learner!.id));
    await pool.end();
  }
});
