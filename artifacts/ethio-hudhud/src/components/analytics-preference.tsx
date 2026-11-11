import { useEffect, useState } from 'react';
import { useApp } from '@/lib/app';
import { getAnalyticsPrivacy, setAnalyticsEnabled } from '@/lib/analytics';
import { hasPrivacySignal } from '@/lib/visitor-analytics';

export function AnalyticsPreference() {
  const { t } = useApp();
  const [state, setState] = useState(getAnalyticsPrivacy);
  const [error, setError] = useState(false);
  useEffect(() => {
    const refresh = () => setState(getAnalyticsPrivacy());
    window.addEventListener('hudhud:analytics-change', refresh);
    refresh();
    return () => window.removeEventListener('hudhud:analytics-change', refresh);
  }, []);
  const locked = state.reason === 'tracker' || state.reason === 'storage';

  return (
    <section className="my-6 space-y-3 rounded-2xl border border-border p-5" aria-labelledby="analytics-heading">
      <h2 id="analytics-heading" className="font-display text-lg font-bold">{t('تحليلات الاستخدام الاختيارية', 'Optional usage analytics')}</h2>
      <p id="analytics-description" className="text-sm leading-relaxed text-muted-foreground">
        {t('يتحكم هذا الخيار بتحليلات Replit/Umami الاختيارية فقط، مثل زيارات الصفحات وتفاعلات التثبيت. لا يغيّر موافقة لوحة الزوار المنفصلة أدناه، ولا يرسل معرّفات المتعلمين أو نصوص المحادثات. يُحفظ الاختيار في هذا المتصفح فقط.', 'This controls optional Replit/Umami analytics only, such as pageviews and install interactions. It does not change the separate visitor-dashboard choice below and does not send learner identifiers or chat content. This choice is stored in this browser only.')}
      </p>
      <label className="flex items-center justify-between gap-4 text-sm font-semibold">
        {t('السماح بالتحليلات الاختيارية', 'Allow optional analytics')}
        <input type="checkbox" className="size-5 accent-[hsl(var(--primary))]"
          checked={state.enabled} disabled={locked} aria-describedby="analytics-description analytics-status"
          data-testid="switch-analytics" onChange={e => {
            const enabled = e.target.checked;
            const saved = setAnalyticsEnabled(enabled);
            setError(!saved);
            setState(getAnalyticsPrivacy());
            // A tracker skipped at startup may not have initialized automatic pageviews.
            if (saved && enabled && getAnalyticsPrivacy().enabled) window.location.reload();
          }} />
      </label>
      <p id="analytics-status" role="status" className="text-sm text-muted-foreground">
        {error || state.reason === 'storage'
          ? t('تعذّر الوصول إلى تخزين المتصفح أو حفظ الاختيار. التحليلات الاختيارية متوقفة؛ تحقق من إعدادات المتصفح.', 'Browser storage is unavailable or the choice could not be saved. Optional analytics is off; check browser settings.')
          : state.reason === 'tracker'
            ? t('يوجد إعداد إيقاف تتبع من أداة أخرى؛ لن نتجاوزه.', 'Another tracker opt-out is active; we will not override it.')
            : state.enabled && hasPrivacySignal()
              ? t('فعّلت التحليلات لهذا الموقع صراحةً رغم إشارة المتصفح. يطبق اختيارك على هذا المتصفح فقط.', 'You explicitly enabled analytics for this site despite your browser signal. This choice applies to this browser only.')
              : state.reason === 'browser'
                ? t('يرسل متصفحك إشارة عدم التتبع أو التحكم العالمي بالخصوصية. تبقى التحليلات متوقفة حتى تفعّلها صراحةً هنا لهذا الموقع.', 'Your browser sends a Do Not Track or Global Privacy Control signal. Analytics stays off until you explicitly enable it here for this site.')
                : state.enabled
                  ? t('مسموح بها عند توفر خدمة التحليلات. إعادة التفعيل تُحدّث الصفحة؛ لا نعيد إرسال أحداث سابقة.', 'Allowed when analytics is available. Re-enabling reloads the page; past events are not replayed.')
                  : t('متوقفة افتراضيًا. فعّلها هنا للسماح بالتحليلات الاختيارية على هذا المتصفح فقط.', 'Off by default. Turn it on here to allow optional analytics in this browser only.')}
      </p>
      <p className="text-xs text-muted-foreground">{t('لا يؤثر ذلك على التعلّم أو تسجيل الدخول أو عدّادات التشغيل الضرورية أو سجلات الاستضافة، ولا يحذف بيانات أُرسلت سابقًا.', 'This does not affect learning, sign-in, necessary operational counters, or hosting logs, and does not delete data already sent.')}</p>
    </section>
  );
}
