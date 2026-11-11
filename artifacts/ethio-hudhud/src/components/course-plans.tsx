import { Check, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ErrorState, LinkBtn, Skeleton } from '@/components/bits';
import { useBilling } from '@/components/billing-notice';
import { useApp } from '@/lib/app';
import { planAction } from '@/lib/plan-action';

export function safePolarUrl(raw: string | null | undefined, environment: 'sandbox' | 'live' = 'sandbox'): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = environment === 'live' ? 'polar.sh' : 'sandbox.polar.sh';
    const ok = u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === host;
    return ok ? u.toString() : null;
  } catch { return null; }
}

type PlanId = 'trial' | 'monthly' | 'six_month';

export function CoursePlans({ onPay, payingPlan, busy, paidOnly = false }: { onPay?: (plan: 'monthly' | 'six_month') => void; payingPlan?: string | null; busy?: boolean; paidOnly?: boolean }) {
  const { t } = useApp();
  const { isSignedIn } = useAuth();
  const q = useBilling();
  const b = q.data;
  const monthly = b?.offers.find((o) => o.id === 'monthly');
  const six = b?.offers.find((o) => o.id === 'six_month');
  const current: string | null | undefined = b?.paidPlan;
  const expired = b?.enforcementEnabled && b.trial.state === 'expired';
  const hideTrial = paidOnly || expired || !!onPay || !!isSignedIn;

  const action = (id: PlanId, label: string) => {
    if (id === 'trial') return <LinkBtn href="/sign-up?plan=trial" className="mt-4 w-full" testId="button-choose-trial">{t('ابدأ 48 ساعة مجانًا', 'Start 48 free hours')}</LinkBtn>;
    const price = id === 'monthly' ? monthly?.priceUsd : six?.priceUsd;
    const note = (id === 'monthly'
      ? t('دفعة يدوية واحدة، بلا تجديد تلقائي. ', 'One manual payment, no auto-renewal. ')
      : t('دفعة واحدة، بلا تجديد تلقائي. ', 'One payment, no auto-renewal. '))
      + t('لا استردادات طوعية، مع مراعاة القانون الإلزامي وشروط Polar. تظهر الضرائب المطبّقة والإجمالي النهائي في Polar قبل الدفع.', 'No voluntary refunds, subject to mandatory law and Polar terms. Applicable taxes and the final total are shown in Polar before you pay.');
    const noteEl = <p hidden className="mt-3 text-xs text-muted-foreground" data-testid={`text-pay-note-${id}`}>{note}</p>;
    if (!isSignedIn) return <>{noteEl}<LinkBtn href={`/sign-up?plan=${id}`} variant={id === 'six_month' ? 'primary' : 'outline'} className="mt-3 w-full" testId={`button-choose-${id}`}>{t(`سجّل ثم ادفع $${price}`, `Sign up, then pay $${price}`)}</LinkBtn></>;
    if (!onPay) return <>{noteEl}<LinkBtn href={`/choose-plan?plan=${id}&checkout=1`} className="mt-3 w-full" testId={`button-choose-${id}`}>{t(`ادفع $${price}`, `Pay $${price}`)}</LinkBtn></>;
    const a = planAction(b, id, true, q.isError);
    const ready = a.kind === 'live' || a.kind === 'sandbox';
    const why = a.pendingRaw ? t('أنهِ التحقق من الدفع المعلّق أدناه أولًا.', 'Resolve the pending checkout below first.')
      : a.livePurchase ? t('وصولك المدفوع فعّال. استخدم بوابة الفوترة أو التجديد اليدوي عند الاستحقاق.', 'Your paid access is active. Use the billing portal or manual renewal when due.')
      : t('غير متاح الآن.', 'Not available right now.');
    return <>
      {noteEl}
      <Btn className="mt-3 min-h-12 w-full" disabled={!ready || busy} onClick={() => onPay(id)} data-testid={`button-pay-${id}`}>
        {payingPlan === id ? t('جارٍ فتح الدفع…', 'Opening checkout…') : t(`ادفع $${price}`, `Pay $${price}`)}{a.kind === 'sandbox' ? t(' (تجريبي)', ' (sandbox)') : ''}
      </Btn>
      {!ready && <p className="mt-2 text-xs font-semibold" data-testid={`text-pay-why-${id}`}>{why}</p>}
    </>;
  };
  const cls = (id: string, extra = '') => `flex flex-col ${extra} ${current === id ? 'border-primary ring-2 ring-primary/40' : ''} ${busy ? 'opacity-70' : ''}`;

  return (
    <section id="course-plans" data-testid="section-course-plans" aria-busy={busy || q.isLoading}>
      <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{hideTrial ? t('اختر طريقة الدفع لمتابعة التعلّم', 'Choose how to pay to continue learning') : t('اختر خطتك للتعلّم', 'Choose your learning plan')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('نفس البرنامج في الخطتين المدفوعتين. اختر الدفع لشهر أو لستة أشهر مرة واحدة.', 'Both paid options include the same programme. Pay for one month or six months at once.')}</p>
      <p className="mt-2 rounded-2xl bg-secondary p-3 text-sm" data-testid="text-plans-note">
        {b?.liveCheckoutEnabled
          ? b.enforcementEnabled
            ? t('تجربتك المجانية 48 ساعة. بعدها يلزم تأكيد الدفع لمتابعة الدروس. لا تجديد تلقائي، ولا رسوم بمجرد اختيار خطة.', 'Your free trial lasts 48 hours. After that, confirmed payment is required to continue lessons. No automatic renewal or charge just for choosing a plan.')
            : t('التعلّم مفتوح حاليًا. لا تُحصّل رسوم إلا عند إتمام الدفع عبر Polar، ولا تجديد تلقائي.', 'Learning is currently open. You are charged only when you complete Polar checkout. No automatic renewal.')
          : b?.sandboxCheckoutEnabled
          ? t('يمكنك اختبار الدفع عبر Polar التجريبي دون أموال حقيقية. لا يفعّل الاختبار اشتراكًا حقيقيًا ولا يغيّر وصولك للدروس.', 'Polar sandbox checkout is available for testing without real money. A test does not activate a real subscription or change lesson access.')
          : !b
            ? t('جارٍ التحقق من الخطط المتاحة…', 'Checking available plans…')
            : t('الدفع غير متاح حاليًا. اختيار خطة لا يُحصّل رسومًا ولا يمنح وصولًا مدفوعًا.', 'Payment is currently unavailable. Selecting a plan does not charge you or grant paid access.')}
      </p>
      {q.isLoading && <div className="mt-4 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {(q.isError || (b && (!monthly || !six))) && <div className="mt-4"><ErrorState what={t('الخطط', 'plans')} onRetry={() => q.refetch()} /></div>}
      {b && monthly && six && (
        <div className={`mt-4 grid gap-4 ${hideTrial ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {!hideTrial && <Card data-testid="card-plan-trial" className={cls('trial')}>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('تجربة مجانية', 'Free trial')}</p>
            <p className="font-display mt-2 text-3xl font-extrabold">{t('يومان', '48 hours')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('أنشئ حسابك باسمك واسم مستخدم وكلمة مرور، وابدأ 48 ساعة مجانًا بلا بطاقة.', 'Create an account with your name, username, and password for 48 free hours. No card needed.')}</p>
            {action('trial', t('ابدأ التجربة', 'Choose trial'))}
          </Card>}
          <Card data-testid="card-plan-monthly" className={cls('monthly')}>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('شهري', 'Monthly')}</p>
            <p className="font-display mt-2 text-3xl font-extrabold" data-testid="text-price-monthly">${monthly.priceUsd}<span className="text-base font-medium text-muted-foreground"> {t('/ شهر واحد', '/ one month')}</span></p>
            <p className="mb-4 mt-2 text-sm text-muted-foreground" data-testid="text-total-monthly">{t(`شهر واحد لكل دفعة يدوية، حتى 6 دفعات ($${monthly.sixMonthTotalUsd}). لا تجديد تلقائي.`, `One month per manual payment, up to 6 payments ($${monthly.sixMonthTotalUsd}). No auto-renewal.`)}</p>
            <ul className="mb-3 mt-2 space-y-3 text-sm leading-relaxed" aria-label={t('ما تتضمنه الباقة الشهرية', 'What the monthly package includes')} data-testid="list-monthly-benefits">
              {[
                t('تعلّم الحروف الأمهرية (الفيدل)', 'Learn Amharic letters (Fidel)'),
                t('تعلّم الكلمات والمفردات الأمهرية', 'Learn Amharic words and vocabulary'),
                t('تعلّم المحادثات الأمهرية لمواقف الحياة اليومية', 'Learn Amharic conversations for everyday situations'),
                t('تعلّم الأرقام الأمهرية', 'Learn Amharic numbers'),
                t('وصول شهري إلى الدروس والتمارين وفق الأشهر المدفوعة من خطتك', 'Monthly access to courses and practices for your paid course months'),
              ].map((benefit, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" aria-hidden="true" /></span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            {current === 'monthly' && b.liveCheckoutEnabled !== true && !b.sandboxCheckoutEnabled && <p className="mt-2 text-xs text-muted-foreground" data-testid="text-plan-monthly-cap">{t('شراء الشهري غير متاح بسبب الإعداد الحالي. لا رسوم.', 'Monthly purchase is unavailable under the current configuration. Nothing is charged.')}</p>}
            {action('monthly', t('اختر الشهري', 'Choose monthly'))}
          </Card>
          <Card data-testid="card-plan-six_month" className={cls('six_month', 'relative border-2 border-primary/60 bg-gradient-to-br from-primary/10 via-card to-gold/15 shadow-lg shadow-primary/10')}>
            <span className="mb-4 inline-flex w-fit items-center gap-2 self-start rounded-full bg-gold px-3 py-1.5 text-sm font-bold text-gold-foreground" data-testid="badge-plan-recommended">
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
              {t('موصى بها', 'Recommended')}
            </span>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('ستة أشهر دفعة واحدة', 'Six months, once')}</p>
            <p className="font-display mt-2 text-3xl font-extrabold" data-testid="text-price-six_month">${six.priceUsd}<span className="text-base font-medium text-muted-foreground"> {t('مرة واحدة', 'one time')}</span></p>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="text-total-six_month">{t(`وصول ${six.durationMonths} أشهر.`, `${six.durationMonths} months of access.`)}</p>
            {six.savingsUsd > 0 && <p className="mb-4 mt-3 flex w-fit items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary" data-testid="text-savings"><Check className="size-4 shrink-0" aria-hidden="true" />{t(`توفير $${six.savingsUsd} (${six.savingsPercent}%)`, `Save $${six.savingsUsd} (${six.savingsPercent}%)`)}</p>}
            <ul className="mb-3 mt-2 space-y-3 text-sm leading-relaxed" aria-label={t('ما تتضمنه الباقة', 'What this package includes')} data-testid="list-six-month-benefits">
              {[
                t('تعلّم الحروف الأمهرية (الفيدل)', 'Learn Amharic letters (Fidel)'),
                t('تعلّم الكلمات والمفردات الأمهرية', 'Learn Amharic words and vocabulary'),
                t('تعلّم المحادثات الأمهرية لمواقف الحياة اليومية', 'Learn Amharic conversations for everyday situations'),
                t('تعلّم الأرقام الأمهرية من 0 إلى 100', 'Learn Amharic numbers from 0 to 100'),
                t(`وصول كامل إلى جميع الدورات والتمارين لمدة ${six.durationMonths} أشهر`, `Full access to all courses and practices for ${six.durationMonths} months`),
                t('تمارين تفاعلية ومراجعة الكلمات وتتبع تقدّمك', 'Interactive exercises, vocabulary review, and progress tracking'),
              ].map((benefit, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" aria-hidden="true" /></span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            {action('six_month', t('اختر ستة أشهر', 'Choose six months'))}
          </Card>
        </div>
      )}
    </section>
  );
}
