import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Clock } from 'lucide-react';
import { getGetBillingStatusQueryKey, getGetCoursesQueryKey, getGetFavouritesQueryKey, getGetStudyPlanQueryKey, getGetVocabularyQueryKey, useGetAdminAccess, useGetBillingStatus } from '@workspace/api-client-react';
import { useApp } from '@/lib/app';
import { RenewalPushSettings } from './renewal-push';

export function useBilling(enabled = true) {
  return useGetBillingStatus({ query: { queryKey: getGetBillingStatusQueryKey(), enabled, staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true } });
}

// Refetch gated content whenever the server's accessible-month set changes.
function useEntitlementSync(months: number[] | undefined) {
  const qc = useQueryClient();
  const prev = useRef<string | undefined>(undefined);
  const key = Array.isArray(months) ? [...months].sort((a, b) => a - b).join(',') : undefined;
  useEffect(() => {
    if (key === undefined) return;
    if (prev.current !== undefined && prev.current !== key) {
      for (const queryKey of [getGetCoursesQueryKey(), getGetStudyPlanQueryKey(), getGetVocabularyQueryKey(), getGetFavouritesQueryKey()]) void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/lessons/') });
    }
    prev.current = key;
  }, [key, qc]);
}

export function BillingNotice() {
  const { t, lang } = useApp();
  const { data: b } = useBilling();
  useEntitlementSync(b?.accessibleMonths);
  const { data: access } = useGetAdminAccess();
  const admin = access?.signedIn === true && (access.role === 'owner' || access.role === 'admin');
  if (!b) return null; // loading/error never blocks the app
  const comp = b.plan === 'complimentary';
  const fmt = (s: string) => new Date(s).toLocaleDateString(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' });
  const row = 'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm';
  const link = 'press rounded-xl bg-primary px-3 py-1.5 font-semibold text-primary-foreground';
  const rem = b.reminder;
  const remText = rem && (rem.kind === 'complimentary_expiring'
    ? t('منحتك المجانية تنتهي قريبًا', 'Your complimentary access ends soon')
    : rem.kind === 'renewal_due' ? t('موعد التجديد يقترب', 'Renewal is coming up') : t('وصول الدورة ينتهي قريبًا', 'Your course access ends soon'));
  return (
    <div className="mb-4 space-y-2" data-testid="billing-notice">
      {b.source === 'polar_live' ? (() => {
        const end = b.accessExpiresAt ?? b.paidPeriodEndsAt;
        const pastDue = b.subscriptionStatus === 'past_due';
        const name = b.paidPlan === 'six_month' ? t('ستة أشهر', 'six-month') : b.paidPlan === 'monthly' ? t('شهري', 'monthly') : t('مدفوعة', 'paid');
        return <p className={`${row} ${pastDue ? 'border-gold/50 bg-gold/10' : 'border-border bg-card'}`} data-testid="text-live-paid-plan"><Clock className="size-4 shrink-0" />
          <span className="flex-1">{pastDue
            ? t('تعذّرت معالجة الدفع. وصولك مستمر خلال مهلة السماح؛ راجع بوابة الفوترة.', 'Your payment could not be processed. Access continues during the grace period; check the billing portal.')
            : t(`خطتك ${name} مفعّلة`, `Your ${name} plan is active`)}{end ? ` · ${t('حتى ', 'until ')}${fmt(end)}` : ''}{b.cancelAtPeriodEnd || b.paidPlan === 'monthly' ? ` · ${t('ستنتهي دون تجديد تلقائي', 'ends without automatic renewal')}` : ''}</span>
          {b.paidPlan === 'monthly' && b.monthlyCanPurchase === true && b.reminder?.kind === 'renewal_due' && <Link href="/choose-plan?plan=monthly" className={link} data-testid="link-renew-monthly">{t('جدّد يدوياً', 'Renew manually')}</Link>}
        </p>;
      })() : comp ? (
        b.accessExpiresAt && <p className={`${row} border-gold/50 bg-gold/10`} data-testid="text-complimentary-expiry"><Clock className="size-4 shrink-0" />{t('منحة مجانية حتى ', 'Complimentary access until ')}{fmt(b.accessExpiresAt)}</p>
      ) : b.isGuest || admin ? null : b.trial.state === 'active' ? (() => {
        const ms = Math.max(0, new Date(b.trial.endsAt).getTime() - Date.now());
        const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
        const left = h >= 1 ? t(`${h} ساعة`, `${h}h`) : t(`${m} دقيقة`, `${m}m`);
        return <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/50 bg-gradient-to-l from-gold/15 to-secondary px-4 py-3 text-sm" data-testid="text-trial-remaining">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-gold-foreground"><Clock className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="font-bold">{t(`تجربتك المجانية: متبقٍ ${left}`, `Free trial: ${left} left`)}</span>
            <span className="block text-xs text-muted-foreground">{t(`تنتهي ${fmt(b.trial.endsAt)}. تقدّمك محفوظ.`, `Ends ${fmt(b.trial.endsAt)}. Your progress is kept.`)}</span></span>
          <Link href="/choose-plan" className={link} data-testid="link-trial-subscribe">{t('اشترك', 'Subscribe')}</Link>
        </div>;
      })() : null}
      {rem && (
        <p className={`${row} border-gold/50 bg-gold/10`} data-testid="text-billing-reminder">
          <BellRing className="size-4 shrink-0" />{remText} · {fmt(rem.expiresAt)} · {t(`${rem.daysRemaining} يوم`, `${rem.daysRemaining} day(s)`)}
          <span className="text-xs text-muted-foreground">{t('تنبيه داخل التطبيق فقط', 'In-app alert only')}</span>
        </p>
      )}
      <RenewalPushSettings />
    </div>
  );
}
