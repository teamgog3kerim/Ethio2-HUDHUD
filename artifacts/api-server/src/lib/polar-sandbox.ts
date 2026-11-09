import { createPolar, webhooks, type models } from "@polar-sh/sdk/2026-10";
import { db, polarSandboxCheckouts, polarSandboxEvents, appAccounts, type PolarSandboxCheckoutRecord } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { HttpError } from "./http-error";
import { logger } from "./logger";
import { assertSandboxProduct, paidOrderEligible, safeSandboxUrl, sandboxCustomerId, sixMonthsAfter, type SandboxPlan } from "./polar-sandbox-policy";

export function sandboxEnabled() {
  // Cannot be activated in a published app accidentally by copying dev secrets.
  return process.env.NODE_ENV !== "production"
    && process.env.POLAR_SANDBOX_CHECKOUT_ENABLED === "true"
    && !!process.env.POLAR_SANDBOX_ACCESS_TOKEN
    && !!process.env.POLAR_SANDBOX_MONTHLY_PRODUCT_ID
    && !!process.env.POLAR_SANDBOX_SIX_MONTH_PRODUCT_ID
    && !!process.env.POLAR_SANDBOX_APP_URL;
}
function config() {
  if (!sandboxEnabled()) throw new HttpError(503, "الدفع التجريبي غير متاح. لم يتم تحصيل أي رسوم.");
  const appUrl = new URL(process.env.POLAR_SANDBOX_APP_URL!);
  if (appUrl.protocol !== "https:" || appUrl.pathname !== "/") throw new HttpError(503, "إعداد رابط العودة غير صالح.");
  return {
    api: createPolar({ accessToken: process.env.POLAR_SANDBOX_ACCESS_TOKEN!, environment: "sandbox", timeout: 6 }),
    origin: appUrl.origin,
    products: { monthly: process.env.POLAR_SANDBOX_MONTHLY_PRODUCT_ID!, six_month: process.env.POLAR_SANDBOX_SIX_MONTH_PRODUCT_ID! },
  };
}
// Do not expose SDK exceptions, request bodies, tokens, or checkout URLs to logs.
async function polarCall<T>(call: () => Promise<T>): Promise<T> {
  try { return await call(); }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    logger.warn({ provider: "polar_sandbox", statusCode }, "Sandbox provider request failed");
    if (statusCode === 422) throw new HttpError(400, "رفض Polar بيانات الدفع التجريبي. تحقّق من صلاحية بريد الحساب وبياناته قبل المحاولة مجدداً.");
    if (statusCode === 401 || statusCode === 403) throw new HttpError(503, "تعذّر بدء الاختبار بسبب إعدادات أو صلاحيات اتصال Polar. يرجى مراجعة الإدارة.");
    throw new HttpError(502, "تعذر الاتصال بـ Polar التجريبي. حاول مرة أخرى؛ لا يتم تحصيل أموال حقيقية.");
  }
}
export function checkoutResponse(row: PolarSandboxCheckoutRecord) {
  return {
    id: row.id, environment: "sandbox" as const, plan: row.plan as SandboxPlan,
    status: row.status as "pending" | "paid" | "failed" | "expired" | "refunded",
    checkoutUrl: row.status === "pending" && row.expiresAt > new Date() ? safeSandboxUrl(row.checkoutUrl) : null,
    accessUntil: row.accessUntil?.toISOString() ?? null,
    subscriptionStatus: row.subscriptionStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}
async function assertUsable(userId: string) {
  const [account] = await db.select().from(appAccounts).where(eq(appAccounts.userId, userId));
  if (account?.deletedAt || account?.suspended) throw new HttpError(403, "هذا الحساب غير متاح للدفع.");
}
export async function createSandboxCheckout(userId: string, email: string | undefined, plan: SandboxPlan) {
  await assertUsable(userId);
  const { api, origin, products } = config();
  const product = await polarCall(() => api.products.get(products[plan]));
  try { assertSandboxProduct(plan, product); }
  catch { throw new HttpError(503, "إعداد المنتج التجريبي لا يطابق السعر أو مدة الخطة. يرجى مراجعة الإدارة."); }
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`polar-sandbox:${userId}`}))`);
    const records = await tx.select().from(polarSandboxCheckouts).where(eq(polarSandboxCheckouts.userId, userId));
    if (records.some(r => r.status === "paid" && r.accessUntil && r.accessUntil > new Date())) {
      throw new HttpError(409, "لديك عملية تجريبية فعّالة. افتح بوابة الفوترة لإدارتها.");
    }
    const pending = records.find(r => r.status === "pending" && r.expiresAt > new Date());
    if (pending) {
      if (pending.plan !== plan) throw new HttpError(409, "لديك صفحة دفع تجريبية معلّقة لخطة أخرى. أكملها أو انتظر انتهاءها قبل تغيير الخطة.");
      return checkoutResponse(pending);
    }
    const checkout = await polarCall(() => api.checkouts.create({
      products: [products[plan]], external_customer_id: sandboxCustomerId(userId),
      ...(email ? { customer_email: email } : {}),
      allow_discount_codes: false, allow_trial: false, currency: "usd",
      metadata: { application: "hudhud", environment: "sandbox", plan },
      success_url: `${origin}/billing/return?checkout_id={CHECKOUT_ID}`,
      return_url: `${origin}/billing/cancel`,
    }));
    if (checkout.external_customer_id !== sandboxCustomerId(userId) || checkout.product_id !== products[plan]) {
      throw new HttpError(502, "تعذر تأكيد ربط صفحة الدفع بالحساب.");
    }
    const [row] = await tx.insert(polarSandboxCheckouts).values({
      id: checkout.id, userId, plan, checkoutUrl: safeSandboxUrl(checkout.url),
      expiresAt: new Date(checkout.expires_at),
    }).returning();
    return checkoutResponse(row);
  });
}

export async function refreshSandboxCheckout(userId: string, id: string) {
  await assertUsable(userId);
  const { api, products } = config();
  // Serialize verification for this account. Every refresh reads current Polar
  // state under the lock, so old or duplicate events cannot restore a refund.
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`polar-sandbox:${userId}`}))`);
    const [row] = await tx.select().from(polarSandboxCheckouts)
      .where(and(eq(polarSandboxCheckouts.id, id), eq(polarSandboxCheckouts.userId, userId)));
    if (!row) throw new HttpError(404, "لم يتم العثور على عملية دفع لهذا الحساب.");
    const checkout = await polarCall(() => api.checkouts.get(id));
    if (checkout.external_customer_id !== sandboxCustomerId(userId) || checkout.product_id !== products[row.plan as SandboxPlan]) {
      throw new HttpError(403, "عملية الدفع غير مرتبطة بهذا الحساب.");
    }
    const plan = row.plan as SandboxPlan;
    const productId = products[plan];
    let subscription: models.Subscription | null = null;
    const initialOrders = await polarCall(() => api.orders.list({ checkout_id: id, limit: 100 }));
    const subscriptionId = initialOrders.items.find(o => o.subscription_id)?.subscription_id ?? row.subscriptionId;
    let orders = initialOrders.items;
    if (subscriptionId) {
      subscription = await polarCall(() => api.subscriptions.get(subscriptionId));
      if (subscription.customer.external_id !== sandboxCustomerId(userId) || subscription.product_id !== productId || plan !== "monthly") {
        throw new HttpError(403, "الاشتراك غير مرتبط بهذا الحساب أو الخطة.");
      }
      const page = await polarCall(() => api.orders.list({ subscription_id: subscriptionId, limit: 100 }));
      orders = page.items;
      // A course has six payments, not an indefinitely renewing membership.
      const paidCycles = orders.filter(o => paidOrderEligible(o, productId, plan)).length;
      if (paidCycles >= 6 && !subscription.cancel_at_period_end && subscription.status === "active") {
        subscription = await polarCall(() => api.subscriptions.update(subscriptionId, { cancel_at_period_end: true }));
      }
    }
    const ownOrders = orders.filter(o => o.customer.external_id === sandboxCustomerId(userId) && o.product_id === productId);
    const paid = ownOrders.filter(o => paidOrderEligible(o, productId, plan));
    let status = checkout.status === "expired" ? "expired" : checkout.status === "failed" ? "failed" : "pending";
    let accessUntil: Date | null = null;
    if (paid.length && plan === "six_month") {
      const first = paid.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      accessUntil = sixMonthsAfter(first.created_at);
      status = "paid";
    } else if (paid.length && subscription) {
      // A past payment does not cover a failed current renewal.
      const currentOrder = paid.some(o => new Date(o.created_at).getTime() >= new Date(subscription!.current_period_start).getTime() - 60_000);
      if (currentOrder && subscription.status === "active") {
        accessUntil = new Date(subscription.current_period_end);
        status = "paid";
      } else status = ["canceled", "unpaid", "past_due"].includes(subscription.status) ? "expired" : "pending";
    } else if (ownOrders.some(o => o.refunded_amount > 0)) status = "refunded";
    const [saved] = await tx.update(polarSandboxCheckouts).set({
      status, accessUntil, subscriptionId,
      subscriptionStatus: subscription?.status ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
      verifiedAt: new Date(),
    }).where(eq(polarSandboxCheckouts.id, id)).returning();
    return checkoutResponse(saved);
  });
}

export async function sandboxPortal(userId: string) {
  await assertUsable(userId);
  const { api, origin } = config();
  const [purchase] = await db.select().from(polarSandboxCheckouts).where(eq(polarSandboxCheckouts.userId, userId)).limit(1);
  if (!purchase) throw new HttpError(404, "لا توجد عملية دفع تجريبية لهذا الحساب.");
  const session = await polarCall(() => api.customerSessions.create({
    external_customer_id: sandboxCustomerId(userId), return_url: `${origin}/choose-plan`,
  }));
  return { environment: "sandbox" as const, url: safeSandboxUrl(session.customer_portal_url) };
}

export async function handleSandboxWebhook(body: Buffer, headers: Record<string, string>) {
  if (!sandboxEnabled() || !process.env.POLAR_SANDBOX_WEBHOOK_SECRET) throw new HttpError(503, "Sandbox webhook is not configured");
  let event;
  try {
    event = await webhooks.validateEvent(body, headers, process.env.POLAR_SANDBOX_WEBHOOK_SECRET);
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) return;
    throw new HttpError(403, "Invalid webhook signature");
  }
  const eventId = headers["webhook-id"];
  const [done] = await db.select().from(polarSandboxEvents).where(eq(polarSandboxEvents.id, eventId));
  if (done) return;
  let checkoutId: string | null = null;
  if (event.type.startsWith("checkout.")) checkoutId = (event.data as models.Checkout).id;
  else if (event.type.startsWith("order.") || event.type.startsWith("subscription.")) {
    const data = event.data as models.Order | models.Subscription;
    checkoutId = data.checkout_id;
    const subscriptionId = event.type.startsWith("subscription.") ? data.id : (data as models.Order).subscription_id;
    if (!checkoutId && subscriptionId) {
      const [record] = await db.select().from(polarSandboxCheckouts).where(eq(polarSandboxCheckouts.subscriptionId, subscriptionId));
      checkoutId = record?.id ?? null;
    }
  }
  if (checkoutId) {
    const [row] = await db.select().from(polarSandboxCheckouts).where(eq(polarSandboxCheckouts.id, checkoutId));
    if (row) {
      const [account] = await db.select().from(appAccounts).where(eq(appAccounts.userId, row.userId));
      // Keep deleted identities tombstoned; never recreate accounts from events.
      if (!account?.deletedAt && !account?.suspended) await refreshSandboxCheckout(row.userId, row.id);
    }
  }
  // Mark only after successful reconciliation. Failures remain retryable.
  await db.insert(polarSandboxEvents).values({ id: eventId }).onConflictDoNothing();
}
