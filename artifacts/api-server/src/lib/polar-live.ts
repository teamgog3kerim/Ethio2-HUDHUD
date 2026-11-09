import { createPolar, type models } from "@polar-sh/sdk/2026-10";
import { db, appAccounts, polarLivePurchases, type LivePurchase } from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { HttpError } from "./http-error";
import { logger } from "./logger";
import { LIVE_COURSE_PRODUCTS } from "./polar-live-webhook-policy";
import { assertLiveProduct, manualMonthlyState, monthlyPeriod, MONTHLY_PAYMENT_LIMIT } from "./manual-monthly";
import { hasLiveBillingHistory, openLiveBillingPortal } from "./polar-live-portal";
import {
  LIVE_CHECKOUT_LAUNCH_APPROVED, LIVE_MANUAL_MONTHLY_APPROVED, LIVE_VERIFICATION_TTL,
  liveCustomerId, livePaymentState, safeLiveUrl, type LivePlan,
} from "./polar-live-policy";

export function liveCheckoutEnabled() {
  return LIVE_CHECKOUT_LAUNCH_APPROVED && !!process.env.POLAR_LIVE_ACCESS_TOKEN && !!process.env.POLAR_LIVE_WEBHOOK_SECRET;
}
export function liveMonthlyEnabled() { return liveCheckoutEnabled() && LIVE_MANUAL_MONTHLY_APPROVED; }
export function liveApi() {
  if (!process.env.POLAR_LIVE_ACCESS_TOKEN) throw new HttpError(503, "اتصال Polar المباشر غير متاح.");
  return createPolar({ accessToken: process.env.POLAR_LIVE_ACCESS_TOKEN, timeout: 8 });
}
export async function liveCall<T>(operation: () => Promise<T>, context: "verification" | "portal" = "verification"): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    logger.warn({ provider: "polar_live", operation: context, statusCode: (error as { statusCode?: number }).statusCode }, "Live billing verification unavailable");
    throw new HttpError(502, context === "portal"
      ? "تعذّر فتح بوابة الفوترة لدى Polar حالياً. أعد المحاولة لاحقاً؛ لن تبدأ عملية دفع جديدة ولن يتغير وصولك."
      : "تعذر التحقق من Polar. لا تبدأ عملية دفع جديدة؛ أعد التحقق لاحقاً.");
  }
}
export async function assertLiveAccount(userId: string) {
  const [account] = await db.select().from(appAccounts).where(eq(appAccounts.userId, userId));
  if (account?.deletedAt || account?.suspended) throw new HttpError(403, "هذا الحساب غير متاح للفوترة.");
}
export function liveCheckoutResponse(row: LivePurchase) {
  return {
    id: row.checkoutId ?? row.id, environment: "live" as const, plan: row.plan as LivePlan,
    status: row.status === "creating" ? "pending" : row.status,
    checkoutUrl: row.status === "pending" && row.expiresAt && row.expiresAt > new Date() && row.checkoutUrl ? safeLiveUrl(row.checkoutUrl) : null,
    accessUntil: row.accessUntil?.toISOString() ?? null,
    accessStartsAt: row.monthlyPeriodStart?.toISOString() ?? null,
    subscriptionStatus: row.subscriptionStatus, cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}
const accountLock = (userId: string) => sql`select pg_advisory_xact_lock(hashtext(${`polar-live:${userId}`}))`;

// Pure ownership matching is repeated for the checkout, subscription and orders.
// Metadata alone is not ownership proof. It recovers a durable pre-call intent
// if a provider response or database update was lost.
export async function attachLiveCheckout(checkout: Pick<models.Checkout, "id" | "metadata" | "external_customer_id" | "product_id" | "url" | "expires_at">) {
  const intentId = checkout.metadata?.hudhud_intent;
  if (typeof intentId !== "string" || !/^[0-9a-f-]{36}$/i.test(intentId)) return null;
  return db.transaction(async tx => {
    const [initial] = await tx.select().from(polarLivePurchases).where(eq(polarLivePurchases.id, intentId));
    if (!initial) return null;
    await tx.execute(accountLock(initial.userId));
    const [intent] = await tx.select().from(polarLivePurchases).where(eq(polarLivePurchases.id, intentId));
    if (!intent || (intent.checkoutId && intent.checkoutId !== checkout.id)
      || checkout.external_customer_id !== liveCustomerId(intent.userId)
      || checkout.product_id !== LIVE_COURSE_PRODUCTS[intent.plan as LivePlan]) return null;
    await assertLiveAccount(intent.userId);
    const [saved] = await tx.update(polarLivePurchases).set({
      checkoutId: checkout.id, checkoutUrl: safeLiveUrl(checkout.url),
      expiresAt: new Date(checkout.expires_at), status: intent.status === "creating" ? "pending" : intent.status,
    }).where(eq(polarLivePurchases.id, intent.id)).returning();
    return saved!;
  });
}

export async function createLiveCheckout(userId: string, email: string | undefined, plan: LivePlan, provider?: ReturnType<typeof liveApi>) {
  // These guards run before any SDK request or durable purchase is created.
  if (!liveCheckoutEnabled() || (plan === "monthly" && !liveMonthlyEnabled())) {
    throw new HttpError(503, plan === "monthly"
      ? "الدفع الشهري اليدوي غير متاح حالياً."
      : "الدفع المباشر غير مفعّل بعد. لم يتم تحصيل أي رسوم.");
  }
  await assertLiveAccount(userId);
  const api = provider ?? liveApi();
  const product = await liveCall(() => api.products.get(LIVE_COURSE_PRODUCTS[plan]));
  try { assertLiveProduct(plan, product); }
  catch { throw new HttpError(503, "سعر المنتج أو مدته لا يطابق الخطة المعروضة."); }
  // Refresh prior purchases first. A provider outage must not cause a second
  // checkout to be offered while the first payment is unresolved.
  const previous = await db.select().from(polarLivePurchases).where(eq(polarLivePurchases.userId, userId));
  for (const row of previous) if (row.checkoutId) await refreshLiveCheckout(userId, row.checkoutId, api);
  const intent = await db.transaction(async tx => {
    await tx.execute(accountLock(userId));
    const rows = await tx.select().from(polarLivePurchases).where(eq(polarLivePurchases.userId, userId));
    const active = rows.find(r => (r.accessUntil && r.accessUntil > new Date() && (plan !== "monthly" || r.plan !== "monthly"))
      || (r.subscriptionId && r.subscriptionStatus !== "canceled"));
    if (active) throw new HttpError(409, "لديك اشتراك أو وصول قائم. استخدم بوابة الفوترة.");
    const unresolved = rows.find(r => r.status === "creating" || r.status === "pending");
    if (unresolved) {
      if (unresolved.status === "pending" && unresolved.plan === plan && unresolved.expiresAt && unresolved.expiresAt > new Date()) return unresolved;
      // Polar 2026-10 exposes neither retirement nor expires_at in CheckoutUpdate.
      // A local timestamp/status change cannot make the original URL unpayable.
      throw new HttpError(409, "توجد عملية دفع معلّقة. استأنف الدفع الأصلي أو انتظر حتى يؤكد Polar انتهاء صلاحيته قبل تغيير الخطة.");
    }
    const manual = manualMonthlyState(rows);
    if (plan === "monthly" && !manual.monthlyCanPurchase) {
      throw new HttpError(409, manual.monthlyPaymentCount >= MONTHLY_PAYMENT_LIMIT
        ? "اكتملت الدفعات الشهرية الست. لن يتم تحصيل دفعة سابعة."
        : "التجديد اليدوي متاح خلال الأيام الأربعة الأخيرة قبل انتهاء الوصول، أو بعد انتهائه.");
    }
    const [row] = await tx.insert(polarLivePurchases).values({
      userId, plan, monthlyOrdinal: plan === "monthly" ? manual.monthlyPaymentCount + 1 : null,
    }).returning();
    return row!;
  });
  if (intent.checkoutId) return liveCheckoutResponse(intent);
  // Fixed public return origin, never a browser-supplied Host/redirect.
  // The domain was verified through the deployment service before setup.
  const origin = "https://ethiohudhud.com";
  let checkout: models.Checkout;
  try {
    checkout = await api.checkouts.create({
      products: [LIVE_COURSE_PRODUCTS[plan]], external_customer_id: liveCustomerId(userId),
      ...(email ? { customer_email: email } : {}),
      allow_trial: false, allow_discount_codes: false, currency: "usd",
      metadata: { application: "hudhud", environment: "live", plan, hudhud_intent: intent.id,
        ...(plan === "monthly" ? { monthly_payment_number: intent.monthlyOrdinal! } : {}) },
      success_url: `${origin}/billing/return?environment=live&checkout_id={CHECKOUT_ID}`,
      return_url: `${origin}/billing/cancel?environment=live`,
    });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // A timeout/5xx may have created a checkout. Keep its intent unresolved and
    // recover it from the provider list or a signed event, never blind-retry.
    if (status && [400, 401, 403, 404, 422].includes(status)) {
      await db.update(polarLivePurchases).set({ status: "failed" }).where(eq(polarLivePurchases.id, intent.id));
    }
    throw new HttpError(502, "تعذر تأكيد إنشاء صفحة الدفع. تحقّق من حالة العملية قبل إعادة المحاولة.");
  }
  const saved = await attachLiveCheckout(checkout);
  if (!saved) throw new HttpError(502, "تعذر تأكيد ربط الدفع بالحساب.");
  return liveCheckoutResponse(saved);
}

export async function refreshLiveCheckout(userId: string, checkoutId: string, api = liveApi()) {
  await assertLiveAccount(userId);
  return db.transaction(async tx => {
    await tx.execute(accountLock(userId));
    const [row] = await tx.select().from(polarLivePurchases)
      .where(and(eq(polarLivePurchases.checkoutId, checkoutId), eq(polarLivePurchases.userId, userId)));
    if (!row) throw new HttpError(404, "لم يتم العثور على عملية دفع لهذا الحساب.");
    const checkout = await liveCall(() => api.checkouts.get(checkoutId));
    const plan = row.plan as LivePlan;
    if (checkout.external_customer_id !== liveCustomerId(userId) || checkout.product_id !== LIVE_COURSE_PRODUCTS[plan]) {
      throw new HttpError(403, "عملية الدفع غير مرتبطة بهذا الحساب أو الخطة.");
    }
    const initial = await liveCall(() => api.orders.list({ checkout_id: checkoutId, limit: 100 }));
    if (initial.items.length >= 100) throw new HttpError(502, "تحتاج عملية الدفع إلى مراجعة الفوترة.");
    const subscriptionId = initial.items.find(o => o.subscription_id)?.subscription_id ?? row.subscriptionId;
    let orders = initial.items;
    let subscription: models.Subscription | null = null;
    if (subscriptionId) {
      subscription = await liveCall(() => api.subscriptions.get(subscriptionId));
      const page = await liveCall(() => api.orders.list({ subscription_id: subscriptionId, limit: 100 }));
      if (page.items.length >= 100) throw new HttpError(502, "تحتاج فترات الاشتراك إلى مراجعة الفوترة.");
      orders = page.items;
    }
    let payment;
    try { payment = livePaymentState({ userId, plan, checkoutStatus: checkout.status, orders, subscription }); }
    catch { throw new HttpError(403, "تعذر إثبات ملكية الاشتراك."); }
    let period = row.monthlyPeriodStart && row.paidUntil
      ? { start: row.monthlyPeriodStart, end: row.paidUntil } : null;
    if (plan === "monthly" && payment.completedOrderId && payment.completedAt) {
      if (row.monthlyOrderId && row.monthlyOrderId !== payment.completedOrderId) {
        throw new HttpError(403, "تحتاج عملية الدفع إلى مراجعة. لن يبدأ دفع جديد.");
      }
      if (!row.monthlyPaidAt) {
        const others = (await tx.select().from(polarLivePurchases).where(eq(polarLivePurchases.userId, userId)))
          .filter(r => r.id !== row.id);
        if (manualMonthlyState(others).monthlyPaymentCount >= MONTHLY_PAYMENT_LIMIT) {
          throw new HttpError(409, "اكتملت الدفعات الست. تحتاج هذه العملية إلى مراجعة الفوترة.");
        }
        period = monthlyPeriod(payment.completedAt, others);
      }
      if (!period) throw new HttpError(403, "تعذر إثبات فترة الوصول المدفوعة.");
      payment = livePaymentState({ userId, plan, checkoutStatus: checkout.status, orders, subscription, monthlyPeriod: period });
    }
    const [saved] = await tx.update(polarLivePurchases).set({
      // Provider-owned expiry can change; never infer terminal status from time.
      expiresAt: new Date(checkout.expires_at),
      status: payment.status, paidUntil: plan === "monthly" ? period?.end ?? payment.paidUntil : payment.paidUntil,
      accessUntil: payment.accessUntil,
      ...(plan === "monthly" ? {
        monthlyOrderId: row.monthlyOrderId ?? payment.completedOrderId,
        monthlyPaidAt: row.monthlyPaidAt ?? payment.completedAt,
        monthlyPeriodStart: row.monthlyPeriodStart ?? period?.start ?? null,
      } : {}),
      subscriptionId, subscriptionStatus: subscription?.status ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
      verifiedAt: new Date(), nextCheckAt: new Date(Date.now() + LIVE_VERIFICATION_TTL), attempts: 0,
    }).where(eq(polarLivePurchases.id, row.id)).returning();
    return liveCheckoutResponse(saved!);
  });
}

export async function livePortal(userId: string) {
  await assertLiveAccount(userId);
  const purchases = await db.select().from(polarLivePurchases).where(and(
    eq(polarLivePurchases.userId, userId), isNotNull(polarLivePurchases.checkoutId),
  ));
  const purchase = purchases.filter(hasLiveBillingHistory)
    .sort((a, b) => b.verifiedAt!.getTime() - a.verifiedAt!.getTime())[0];
  return liveCall(() => openLiveBillingPortal(userId, purchase, {
    getCheckout: id => liveApi().checkouts.get(id),
    createSession: input => liveApi().customerSessions.create(input),
  }), "portal");
}
