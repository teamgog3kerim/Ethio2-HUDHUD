import { useAuth } from '@/lib/auth';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { createLiveCheckout, createLivePortal, createSandboxCheckout, getLiveCheckout } from '@workspace/api-client-react';
import { CoursePlans, safePolarUrl } from '@/components/course-plans';
import { Shell } from '@/components/shell';
import { Btn, PageHead, Skeleton } from '@/components/bits';
import { useBilling } from '@/components/billing-notice';
import { useApp } from '@/lib/app';
import { planAction } from '@/lib/plan-action';
import { parsePlanChoice, type PlanChoice } from '@/lib/plan-choice';

type Op = 'sandbox' | 'live' | 'portal';

export default function ChoosePlan() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { t, lang } = useApp();
  const [, navigate] = useLocation();
  const billing = useBilling();
  const [choice, setChoice] = useState<PlanChoice | null>(() => parsePlanChoice(new URLSearchParams(window.location.search).get('plan')));
  const [paying, setPaying] = useState<'monthly' | 'six_month' | null>(null);
  const autoLaunched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorOp, setErrorOp] = useState<'main' | 'portal2'>('main');
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const identity = useRef(userId);
  const version = useRef(0);
  identity.current = userId;
  useEffect(() => {
    // A late response from another account must not navigate or populate cache.
    version.current++;
    busyRef.current = false; setBusy(false); setPaying(null); setError(null); setNotice(null);
    setChoice(parsePlanChoice(new URLSearchParams(window.location.search).get('plan')));
    return () => { version.current++; };
  }, [userId]);

  const bd = billing.data;
  const selected: PlanChoice | null = choice === 'monthly' || choice === 'six_month' ? choice : null;
  const a = planAction(bd, selected, !!isSignedIn, billing.isError);
    const pending = !!isSignedIn && (bd?.paymentVerificationPending === true || !!bd?.pendingCheckoutPlan);

  const pendingAction = async (resume: boolean) => {
    if (!userId || busyRef.current || billing.isError || !pending) return;
    const checkoutId = bd?.pendingCheckoutId;
    const originalPlan = bd?.resumablePlan;
    if (resume && (!checkoutId || !originalPlan || bd?.liveCheckoutEnabled !== true
      || (originalPlan === 'monthly' && bd.liveMonthlyCheckoutEnabled !== true))) return;
    const owner = userId, request = ++version.current;
    const current = () => identity.current === owner && version.current === request;
    busyRef.current = true; setBusy(true); setError(null); setErrorOp('main'); setNotice(null);
    try {
      // Verification-only, even if another plan is selected or the tab is stale.
      // Never create a replacement checkout from the resume action.
      const result = checkoutId ? await getLiveCheckout(checkoutId) : null;
      if (!current()) return;
      if (resume) {
        const url = result?.id === checkoutId && result?.plan === originalPlan && result?.status === 'pending'
          ? safePolarUrl(result.checkoutUrl, 'live') : null;
        if (url) { window.location.assign(url); return; }
        setError(t('لم يعد رابط الدفع متاحاً. تحقّق من الحالة قبل المتابعة.', 'This checkout link is no longer available. Check status before continuing.'));
      }
      // Explicit verification bypasses the billing status freshness cache.
      await billing.refetch();
    } catch (e) {
      if (!current()) return;
      const detail = (e as { data?: { error?: unknown } }).data?.error;
      setError(resume && typeof detail === 'string' ? detail : t('تعذر التحقق من Polar. يبقى تغيير الخطة متوقفاً حتى تأكيد حالة الدفع.', 'Could not verify with Polar. Switching stays blocked until checkout status is confirmed.'));
    } finally {
      if (current()) { busyRef.current = false; setBusy(false); }
    }
  };

  const run = async (op: Op, plan?: 'monthly' | 'six_month') => {
    const ap = plan ? planAction(bd, plan, !!isSignedIn, billing.isError) : a;
    const paid = ap.paid;
    if (!userId || busyRef.current || ap.kind !== op || (pending && (op === 'live' || op === 'sandbox'))) return;
    setPaying(op === 'portal' ? null : paid);
    const owner = userId, request = ++version.current;
    const current = () => identity.current === owner && version.current === request;
    busyRef.current = true; setBusy(true); setError(null); setErrorOp('main'); setNotice(null);
    const done = () => { busyRef.current = false; setBusy(false); setPaying(null); };
    const fail = (e: unknown, fallback: string) => {
      if (!current()) return;
      const detail = (e as { data?: { error?: unknown } }).data?.error;
      setError(typeof detail === 'string' ? detail : fallback);
      done();
    };
    const go = (raw: string | null | undefined, env: 'sandbox' | 'live', bad: string) => {
      const url = safePolarUrl(raw, env);
      if (!url) { setError(bad); done(); return; }
      window.location.assign(url);
    };
    try {
      if (op === 'sandbox' && paid) {
        const r = await createSandboxCheckout({ plan: paid });
        if (current()) go(r.checkoutUrl, 'sandbox', t('تعذر التحقق من رابط الدفع التجريبي.', 'Could not verify the sandbox checkout URL.'));
      } else if (op === 'live' && paid) {
        const r = await createLiveCheckout({ plan: paid });
        if (current()) go(r.checkoutUrl, 'live', t('تعذر التحقق من رابط الدفع.', 'Could not verify the checkout URL.'));
      } else if (op === 'portal') {
        const r = await createLivePortal();
        if (current()) go(r.url, 'live', t('تعذر التحقق من رابط البوابة.', 'Could not verify the portal URL.'));
      }
    } catch (e) {
      fail(e, op === 'portal' ? t('تعذر فتح بوابة الفوترة.', 'Could not open the billing portal.')
        : op === 'sandbox' ? t('تعذر بدء الدفع التجريبي. حاول مرة أخرى.', 'Could not start sandbox checkout. Try again.')
        : op === 'live' ? t('تعذر بدء الدفع. حاول مرة أخرى.', 'Could not start checkout. Try again.')
        : t('تعذر حفظ اختيار التجربة. حاول مرة أخرى.', 'Could not save your trial choice. Try again.'));
    }
  };
  // Secondary portal link is a live operation independent of the selected plan's main action.
  const openPortal = async () => {
    if (!userId || busyRef.current) return;
    const owner = userId, request = ++version.current;
    const current = () => identity.current === owner && version.current === request;
    busyRef.current = true; setBusy(true); setError(null); setErrorOp('portal2');
    try {
      const r = await createLivePortal();
      if (!current()) return;
      const url = safePolarUrl(r.url, 'live');
      if (!url) { setError(t('تعذر التحقق من رابط البوابة.', 'Could not verify the portal URL.')); busyRef.current = false; setBusy(false); return; }
      window.location.assign(url);
    } catch (e) {
      if (!current()) return;
      const d = (e as { data?: { error?: unknown } }).data?.error;
      setError(typeof d === 'string' ? d : t('تعذر فتح بوابة الفوترة.', 'Could not open the billing portal.'));
      busyRef.current = false; setBusy(false);
    }
  };

  const sp0 = new URLSearchParams(window.location.search);
  const wantsCheckout = sp0.get('checkout') === '1';
  const autoPlan = wantsCheckout ? selected : null;
  const autoKind = autoPlan ? planAction(bd, autoPlan, !!isSignedIn, billing.isError).kind : null;
  useEffect(() => {
    if (autoLaunched.current || !wantsCheckout || !autoPlan || !userId || !bd || billing.isError || billing.isFetching) return;
    autoLaunched.current = true;
    // One-shot: strip the flag so reloads never relaunch checkout.
    const u = new URL(window.location.href); u.searchParams.delete('checkout');
    window.history.replaceState(null, '', u.toString());
    if (autoKind === 'live' || autoKind === 'sandbox') void run(autoKind, autoPlan);
  });

  if (!isLoaded) return <Skeleton className="m-8 h-64" />;
  const fmt = (s: string) => new Date(s).toLocaleString(lang === 'ar' ? 'ar' : 'en');
  const hasMain = ['signup', 'portal', 'status', 'refresh'].includes(a.kind);
  const onMain = () => {
    if (a.kind === 'signup') navigate(`/sign-up${selected ? `?plan=${selected}` : ''}`);
    else if (a.kind === 'status' || a.kind === 'refresh') { if (!billing.isFetching) void billing.refetch(); }
    else if (a.kind === 'portal') void run('portal');
  };
  const mainLabel = a.kind === 'portal' ? (busy ? t('جارٍ فتح البوابة…', 'Opening portal…') : t('افتح بوابة الفوترة', 'Open billing portal')) : a.kind === 'status' ? t('تحقق من حالة الدفع', 'Check payment status') : a.kind === 'refresh' ? t('أعد تحميل الخطط', 'Reload plans') : t('أنشئ حسابًا لمتابعة هذه الخطة', 'Create an account to continue with this plan');
  const testId: Record<string, string> = { signup: 'button-plan-signup', status: 'button-payment-status', refresh: 'button-retry', portal: 'button-live-portal' };
  const comp = bd?.plan === 'complimentary';
  const paidSrc = bd?.source === 'polar_live';
  const expiry = bd?.accessExpiresAt ?? bd?.paidPeriodEndsAt;
  const gist = bd?.enforcementEnabled
    ? t('التجربة 48 ساعة بعد إنشاء الحساب. الحساب العائد لا تبدأ تجربته من جديد أبدًا، ولا تُفتح الدروس دون استحقاق موثّق.', 'The trial lasts 48 hours after you sign up. A returning account never restarts it, and lessons never open without verified access.')
    : t('الشراء اختياري حالياً ولا تُحصّل رسوم إلا بعد إتمام الدفع عبر Polar. يبقى التعلّم مفتوحاً مؤقتاً.', 'Purchasing is optional for now; you are charged only after completing Polar checkout. Learning temporarily stays open.');

  return <Shell>
    <PageHead title={t('الاشتراك والفوترة', 'Subscription & billing')} sub={t('اختر خطتك أدناه، ثم تابع إلى الدفع أو إدارة الفوترة من مكان واحد.', 'Choose your plan below, then continue to payment or manage billing in one place.')} />
    {bd && <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm" data-testid="card-billing">
      <p><span className="text-muted-foreground">{t('الخطة الحالية: ', 'Current plan: ')}</span><span className="font-semibold" data-testid="text-plan">{comp ? t('منحة مجانية', 'Complimentary') : bd.paidPlan === 'monthly' ? t('شهري', 'Monthly') : bd.paidPlan === 'six_month' ? t('ستة أشهر', 'Six months') : t('بدون اشتراك مدفوع', 'No paid plan')}</span></p>
            <p className="basis-full font-semibold" data-testid="text-access-state">{comp ? t('منحة مجانية سارية', 'Complimentary access is active') : paidSrc && bd.fullCourseAccess ? t('وصول مدفوع موثّق وساري', 'Verified paid access is active') : bd.hasLivePurchase || bd.paidPlan ? t('انتهى الوصول المدفوع الموثّق أو لم يعد ساريًا', 'Verified paid access has ended or is not active') : bd.isGuest ? t('زائر: لا وصول مدفوع', 'Guest: no paid access') : t('لا وصول مدفوع موثّق', 'No verified paid access')}</p>
      {comp && expiry && <p data-testid="text-access-expiry"><span className="text-muted-foreground">{t('انتهاء المنحة: ', 'Complimentary expiry: ')}</span>{fmt(expiry)}</p>}
      {paidSrc && expiry && <p data-testid="text-paid-expiry"><span className="text-muted-foreground">{t('الوصول المدفوع حتى: ', 'Paid access until: ')}</span>{fmt(expiry)}</p>}
      {!comp && !paidSrc && !bd.isGuest && bd.trial.state === 'active' && <p data-testid="card-trial"><span data-testid="text-trial-countdown">{t(`التجربة: متبقٍ ${bd.trial.daysRemaining} يوم، تنتهي ${fmt(bd.trial.endsAt)}`, `Trial: ${bd.trial.daysRemaining} day(s) left, ends ${fmt(bd.trial.endsAt)}`)}</span></p>}
      {bd.trial.state === 'expired' && !bd.isGuest && !comp && !paidSrc && <p data-testid="card-trial"><span data-testid="text-trial-expired">{bd.fullCourseAccess ? t('انتهت التجربة. الدروس ما زالت مفتوحة.', 'Trial ended. Lessons remain open.') : t('انتهت التجربة. اختر اشتراكاً للمتابعة. تقدمك محفوظ.', 'Your trial has ended. Choose a subscription to continue. Your progress is saved.')}</span></p>}
    </div>}
    <CoursePlans onPay={plan => { setChoice(plan); const k = planAction(bd, plan, !!isSignedIn, billing.isError).kind; if (k === 'live' || k === 'sandbox') void run(k, plan); }} payingPlan={paying} busy={busy || pending} paidOnly />
    <section className="mt-6 space-y-3 rounded-3xl border border-border bg-card p-5" aria-live="polite" aria-busy={busy || billing.isLoading} data-testid="section-plan-action">
      <p className="text-sm text-muted-foreground" data-testid="text-billing-message">{gist}</p>
      {billing.isLoading && <Skeleton className="h-12" />}
      {pending && <section className="space-y-3 rounded-2xl border border-border p-3 text-sm" data-testid="pending-checkout">
        <h2 className="font-semibold">{t('عملية الدفع الأصلية غير المكتملة', 'Original unfinished checkout')}</h2>
        {bd?.pendingCheckoutPlan && <p data-testid="pending-checkout-plan">{bd.pendingCheckoutPlan === 'monthly'
          ? t('شهر واحد — 29 دولاراً، دفع يدوي دون تجديد تلقائي.', 'One month — $29, manual payment with no auto-renewal.')
          : t('ستة أشهر — 149 دولاراً، دفعة واحدة دون تجديد تلقائي.', 'Six months — $149, one payment with no auto-renewal.')}</p>}
        {bd?.pendingCheckoutExpiresAt ? <p>{t('تنتهي صلاحية الرابط في: ', 'Link expires at: ')}<time className="break-words" data-testid="pending-checkout-expiry" dateTime={bd.pendingCheckoutExpiresAt}>{new Date(bd.pendingCheckoutExpiresAt).toLocaleString(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'full', timeStyle: 'long' })}</time></p>
          : <p>{t('لم يؤكد Polar موعد انتهاء الصلاحية بعد.', 'Polar has not confirmed the expiry time yet.')}</p>}
        <p>{t('لا يتيح Polar إلغاء صفحة الدفع الحالية بأمان من هنا. لتغيير الخطة، انتظر انتهاء الرابط ثم تحقّق من الحالة. لن نفتح عملية دفع ثانية حتى يؤكد Polar أن الأصلية لم تعد قابلة للدفع. تغيير الاختيار أو مغادرة الصفحة لا يلغي الدفع الأصلي.', 'Polar does not provide a safe way to retire this checkout here. To change plans, wait for the link to expire, then check status. We will not open a second checkout until Polar confirms the original can no longer charge. Selecting another plan or leaving this page does not cancel the original checkout.')}</p>
        {bd?.resumablePlan && bd.pendingCheckoutId && <Btn className="min-h-11 w-full" disabled={busy || billing.isFetching || billing.isError || bd.liveCheckoutEnabled !== true || (bd.resumablePlan === 'monthly' && bd.liveMonthlyCheckoutEnabled !== true)} onClick={() => void pendingAction(true)} data-testid="button-resume-checkout">{busy
          ? t('جارٍ التحقق وفتح الدفع…', 'Verifying and opening checkout…')
          : bd.resumablePlan === 'monthly' ? t('استأنف الدفع الأصلي — 29 دولاراً', 'Resume original checkout — $29') : t('استأنف الدفع الأصلي — 149 دولاراً', 'Resume original checkout — $149')}</Btn>}
        <Btn className="min-h-11 w-full" variant="outline" disabled={busy || billing.isFetching || billing.isError} onClick={() => void pendingAction(false)} data-testid="button-check-checkout">{billing.isFetching ? t('جارٍ التحقق…', 'Checking…') : t('تحقّق من حالة الدفع قبل تغيير الخطة', 'Check checkout status before switching')}</Btn>
      </section>}
      {notice && <p className="rounded-2xl bg-secondary p-3 text-sm" role="status">{notice}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {billing.isError && <p className="text-sm text-destructive" role="alert">{t('تعذّر تحميل أو تحديث بيانات الفوترة. الإجراءات متوقفة حتى إعادة التحميل.', 'Could not load or refresh billing data. Actions are paused until it reloads.')}</p>}
      {billing.isError && !bd ? <Btn className="w-full" onClick={() => void billing.refetch()} data-testid="button-retry">{t('إعادة المحاولة', 'Retry')}</Btn>
        : hasMain && (!pending || a.kind === 'refresh') ? <Btn className="min-h-11 w-full" disabled={busy || ((a.kind === 'status' || a.kind === 'refresh') && billing.isFetching)} onClick={onMain} data-testid={testId[a.kind]} data-action={a.kind}>{mainLabel}</Btn> : null}
      {a.kind === 'unavailable' && <p className="text-sm text-muted-foreground" data-testid="text-plan-unavailable">{t('لا إجراء متاحاً لهذه الخطة الآن؛ راجع التفاصيل أعلاه.', 'No action is available for this plan right now; see the details above.')}</p>}
      {a.portalSecondary && <button type="button" disabled={busy || billing.isError} onClick={() => void openPortal()} className="press inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" data-testid="link-live-portal">{errorOp === 'portal2' && error ? t('إعادة المحاولة: بوابة الفوترة', 'Retry: billing portal') : t('الإيصالات والسجل في بوابة الفوترة', 'Receipts and history in the billing portal')}</button>}
      <p className="text-xs text-muted-foreground" data-testid="text-pricing-note">{t('تظهر تنبيهات التطبيق قبل انتهاء الوصول الموثّق بأربعة أيام ولا ترسل بريداً إلكترونياً. لا استردادات طوعية، مع مراعاة حقوق المستهلك الإلزامية وشروط المشتري في Polar.', 'In-app alerts appear four days before verified access expires and do not send email. No voluntary refunds, subject to mandatory consumer rights and Polar buyer terms.')}</p>
    </section>
  </Shell>;
}
