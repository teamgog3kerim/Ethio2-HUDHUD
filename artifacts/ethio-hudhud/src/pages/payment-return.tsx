import { useAuth } from '@/lib/auth';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocation } from 'wouter';
import { createLivePortal, createSandboxPortal, getGetBillingStatusQueryKey, getGetLiveCheckoutQueryKey, getGetProgressQueryKey, getGetSandboxCheckoutQueryKey, useGetLiveCheckout, useGetSandboxCheckout } from '@workspace/api-client-react';
import { Shell } from '@/components/shell';
import { Btn, Card, ErrorState, LinkBtn, PageHead, Skeleton } from '@/components/bits';
import { safePolarUrl } from '@/components/course-plans';
import { useApp } from '@/lib/app';

const MAX_POLLS = 12;

type Env = 'sandbox' | 'live';
function Verified({ id, userId, env }: { id: string; userId: string; env: Env }) {
  const live = env === 'live';
  const { t } = useApp();
  const cache = useQueryClient();
  const [, go] = useLocation();
  const [access, setAccess] = useState<'checking' | 'error' | 'later'>('checking');
  const [recheck, setRecheck] = useState(0);
  const opts = (key: readonly unknown[]) => ({
    query: {
      queryKey: [...key, userId, env] as const,
      refetchInterval: (query: { state: { data?: { status?: string }; dataUpdateCount: number } }) => (query.state.data?.status === 'pending' && query.state.dataUpdateCount < MAX_POLLS ? 5000 : false),
      retry: 1,
    },
  });
  const qs = useGetSandboxCheckout(id, { query: { ...opts(getGetSandboxCheckoutQueryKey(id)).query, enabled: !live } });
  const ql = useGetLiveCheckout(id, { query: { ...opts(getGetLiveCheckoutQueryKey(id)).query, enabled: live } });
  const q = (live ? ql : qs) as typeof qs;
  const status = q.data?.status;
  useEffect(() => {
    if (status !== 'paid' && status !== 'refunded' && status !== 'failed' && status !== 'expired') return;
    void cache.invalidateQueries({ queryKey: getGetBillingStatusQueryKey() });
    void cache.invalidateQueries({ queryKey: getGetProgressQueryKey() });
    if (status === 'paid' && live) {
      // Navigate only once refreshed billing confirms effective access.
      let off = false;
      setAccess('checking');
      const key = getGetBillingStatusQueryKey();
      void cache.refetchQueries({ queryKey: key }).then(() => {
        if (off) return;
        if (cache.getQueryState(key)?.status === 'error') { setAccess('error'); return; }
        const bs = cache.getQueryData<{ fullCourseAccess?: boolean }>(key);
        if (bs?.fullCourseAccess === true) go('/learn', { replace: true });
        else setAccess('later');
      }, () => { if (!off) setAccess('error'); });
      return () => { off = true; };
    }
    return undefined;
  }, [status, cache, live, go, recheck]);
  useEffect(() => {
    const f = () => {
      void cache.invalidateQueries({ queryKey: getGetBillingStatusQueryKey() });
      void cache.invalidateQueries({ queryKey: getGetProgressQueryKey() });
    };
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, [cache]);
  const identity = useRef(userId);
  identity.current = userId;
  const alive = useRef(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const openPortal = async () => {
    if (portalBusy) return;
    const owner = userId;
    setPortalBusy(true);
    setPortalError(false);
    try {
      const r = await (live ? createLivePortal() : createSandboxPortal());
      if (!alive.current || identity.current !== owner) return;
      const url = safePolarUrl(r.url, env);
      if (!url) { setPortalError(true); setPortalBusy(false); return; }
      window.location.assign(url);
    } catch {
      if (alive.current && identity.current === owner) { setPortalError(true); setPortalBusy(false); }
    }
  };
  const c = q.data;
  const stalled = c?.status === 'pending' && c.id === id && (cache.getQueryState(q.queryKey)?.dataUpdateCount ?? 0) >= MAX_POLLS;
  const starts = c?.accessStartsAt ?? null;
  const future = !!starts && new Date(starts).getTime() > Date.now();
  const until = c?.accessUntil ? new Date(c.accessUntil).toLocaleDateString() : null;
  const testNote = live ? t('الحالة أعلاه من الخادم. إن بدا شيء غير متوقع فافتح بوابة الفوترة أو أعد التحقق.', 'The status above comes from the server. If anything looks unexpected, open the billing portal or check again.') : t('هذا اختبار في بيئة Polar التجريبية فقط: لا رسوم حقيقية ولا استحقاق مدفوع حقيقي، ولم يتغير وصولك للدروس.', 'Sandbox test only: no real charges and no real paid entitlement. Your learning access has not changed.');
  if (q.isError) return <ErrorState what={live ? t('التحقق من الدفع', 'verifying the payment') : t('التحقق من الدفع التجريبي', 'verifying the sandbox checkout')} onRetry={() => void q.refetch()} />;
  if (!c) return <Skeleton className="h-48" />;
  const nav = <div className="mt-4 flex flex-wrap gap-3">
    <LinkBtn href="/learn" testId="link-return-learn">{t('تابع إلى الدروس', 'Continue to lessons')}</LinkBtn>
    <LinkBtn href="/choose-plan" variant="outline" testId="link-return-plans">{t('الاشتراك والفوترة', 'Subscription & billing')}</LinkBtn>
  </div>;
  return <Card aria-live="polite" data-testid={`state-checkout-${c.status}`}>
    {c.status === 'pending' && <>
      <h2 className="font-display text-xl font-extrabold">{live ? t('نتحقق من الدفع…', 'Verifying your payment…') : t('نتحقق من الدفع التجريبي…', 'Verifying your sandbox checkout…')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{stalled ? t('ما زال التحقق معلّقًا. جرّب مجددًا بعد قليل.', 'Verification is still pending. Try again shortly.') : t('نتحقق من الخادم كل 5 ثوانٍ.', 'Checking with the server every 5 seconds.')}</p>
      <Btn className="mt-4" variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()} data-testid="button-checkout-retry">{q.isFetching ? t('جارٍ التحقق…', 'Checking…') : t('تحقق مجددًا', 'Check again')}</Btn>
    </>}
    {c.status === 'paid' && <>
      {live && access === 'checking' && <p className="mb-1 text-sm font-semibold text-primary" data-testid="text-opening-lessons">{t('نؤكد وصولك قبل فتح الدروس…', 'Confirming your access before opening lessons…')}</p>}
      {live && access === 'error' && <div className="mb-2 text-sm" role="alert" data-testid="state-access-refresh-error"><p className="text-destructive">{t('تم التحقق من الدفع لكن تعذّر تحديث حالة وصولك.', 'Payment is verified but your access status could not be refreshed.')}</p><Btn className="mt-2" variant="outline" onClick={() => setRecheck(n => n + 1)} data-testid="button-access-retry">{t('إعادة المحاولة', 'Retry')}</Btn></div>}
      {live && access === 'later' && <p className="mb-2 text-sm" data-testid="text-access-not-effective">{t('الدفع موثّق لكن لا وصول فعّال الآن؛ تبدأ فترتك لاحقًا. راجع الاشتراك والفوترة.', 'Payment is verified but no access is effective yet; your period starts later. See Subscription & billing.')}</p>}
      <h2 className="font-display text-xl font-extrabold">{live ? t('تم التحقق من الدفع', 'Purchase verified') : t('تم التحقق من الدفع التجريبي', 'Sandbox purchase verified')}</h2>
      {until && live && c.plan === 'monthly' ? <p className="mt-2 text-sm" data-testid="text-monthly-period">{starts ? t(`الفترة: من ${new Date(starts).toLocaleDateString()} إلى ${until}.`, `Period: ${new Date(starts).toLocaleDateString()} to ${until}.`) : t(`حتى ${until}.`, `Until ${until}.`)} {future ? t('تبدأ هذه الفترة لاحقاً بعد التغطية الحالية؛ لا وصول جديد الآن.', 'This period starts later, after your current coverage; it does not grant new access now.') : ''} {t('شهر واحد، دون تجديد تلقائي.', 'One month, no automatic renewal.')}</p> : until && <p className="mt-2 text-sm">{live ? t(`حتى ${until}`, `Access until ${until}`) : t(`تاريخ الاختبار: ${until}`, `Test period until ${until}`)}</p>}
      {c.cancelAtPeriodEnd && <p className="mt-1 text-sm text-muted-foreground">{t('سيُلغى عند نهاية الفترة.', 'Set to cancel at period end.')}</p>}
      <p className="mt-2 text-sm text-muted-foreground">{testNote}</p>
      {!live && <>
        {portalError && <div className="mt-3"><ErrorState what={t('فتح بوابة الفوترة التجريبية', 'opening the sandbox billing portal')} onRetry={() => void openPortal()} /></div>}
        <Btn className="mt-4" variant="outline" disabled={portalBusy} onClick={() => void openPortal()} data-testid="button-sandbox-portal">{portalBusy ? t('جارٍ فتح البوابة…', 'Opening portal…') : t('افتح بوابة الفوترة التجريبية', 'Open sandbox billing portal')}</Btn>
      </>}
    </>}
    {c.status === 'refunded' && <>
      <h2 className="font-display text-xl font-extrabold">{live ? t('تم استرداد الدفع', 'Purchase refunded') : t('تم استرداد الدفع التجريبي', 'Sandbox purchase refunded')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{testNote}</p>
    </>}
    {c.status === 'expired' && <>
      <h2 className="font-display text-xl font-extrabold">{t('انتهت صلاحية جلسة الدفع', 'Checkout expired')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{testNote}</p>
    </>}
    {c.status === 'failed' && <>
      <h2 className="font-display text-xl font-extrabold">{live ? t('لم يكتمل الدفع', 'Checkout did not complete') : t('لم يكتمل الدفع التجريبي', 'Sandbox checkout did not complete')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{testNote}</p>
    </>}
    {nav}
  </Card>;
}

export default function PaymentReturn() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { t } = useApp();
  const [location] = useLocation();
  const sp = new URLSearchParams(window.location.search);
  const env: Env = sp.get('environment') === 'live' ? 'live' : 'sandbox';
  const live = env === 'live';
  if (!isLoaded) return <Skeleton className="m-8 h-64" />;
  if (!isSignedIn || !userId) return <Redirect to="/sign-in" replace />;
  const id = sp.get('checkout_id');
  const cancel = location.includes('/billing/cancel');
  return <Shell>
    <PageHead title={live ? (cancel ? t('عدتَ من صفحة الدفع', 'Returned from checkout') : t('نتيجة الدفع', 'Payment result')) : cancel ? t('أُلغي الدفع التجريبي', 'Sandbox checkout cancelled') : t('نتيجة الدفع التجريبي', 'Sandbox checkout result')} sub={live ? t('لا يُفتح الوصول إلا بعد تحقق الخادم من الدفع.', 'Access opens only after the server verifies payment.') : t('اختبار فقط: لا رسوم حقيقية ولا استحقاق مدفوع حقيقي.', 'Test only: no real charges and no real paid entitlement.')} />
    {cancel || !id
      ? <Card data-testid="state-checkout-cancelled">
          <p className="text-sm text-muted-foreground">{cancel ? (live ? t('لا تعني العودة وحدها أن شيئًا لم يُخصم. إن كنت غير متأكد فافتح بوابة الفوترة من صفحة الخطط أو تحقق من حالتك.', 'Returning alone does not prove nothing was charged. If unsure, open the billing portal from the plans page or check your status.') : t('لم يحدث أي خصم. يمكنك المتابعة في التعلّم أو العودة إلى الخطط.', 'Nothing was charged. Keep learning or return to plans.')) : t('رابط العودة لا يحتوي على معرّف دفع.', 'This return link has no checkout id.')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <LinkBtn href="/learn">{t('تابع إلى الدروس', 'Continue to lessons')}</LinkBtn>
            <LinkBtn href="/choose-plan" variant="outline">{t('العودة إلى الخطط', 'Back to plans')}</LinkBtn>
          </div>
        </Card>
      : <Verified key={`${userId}:${env}:${id}`} id={id} userId={userId} env={env} />}
  </Shell>;
}
