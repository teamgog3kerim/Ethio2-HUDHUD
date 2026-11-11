import { useEffect, useState } from 'react';
import { useApp } from '@/lib/app';
import { getAnalyticsPrivacy, setAnalyticsEnabled } from '@/lib/analytics';
import { hasPrivacySignal, readVisitorConsent, setVisitorConsent, type VisitorConsent } from '@/lib/visitor-analytics';

export function VisitorAnalyticsPreference() {
  const { t } = useApp();
  const [consent, setConsent] = useState<VisitorConsent>(readVisitorConsent);
  const [saveError, setSaveError] = useState(false);
  const [privacyEnabled, setPrivacyEnabled] = useState(getAnalyticsPrivacy().enabled);
  const privacyState = getAnalyticsPrivacy();
  useEffect(() => {
    const refresh = () => {
      setConsent(readVisitorConsent());
      setPrivacyEnabled(getAnalyticsPrivacy().enabled);
    };
    window.addEventListener('hudhud:visitor-analytics-change', refresh);
    window.addEventListener('hudhud:analytics-change', refresh);
    refresh();
    return () => {
      window.removeEventListener('hudhud:visitor-analytics-change', refresh);
      window.removeEventListener('hudhud:analytics-change', refresh);
    };
  }, []);
  const blocked = consent === 'unavailable' || ['tracker', 'storage'].includes(privacyState.reason ?? '');
  const canEnableBoth = !blocked;
  const bothEnabled = consent === 'on' && privacyEnabled;
  const enableBoth = () => {
    const analyticsSaved = setAnalyticsEnabled(true);
    const visitorSaved = setVisitorConsent(true);
    const analyticsState = getAnalyticsPrivacy();
    setSaveError(!analyticsSaved || !visitorSaved || !analyticsState.enabled);
    setPrivacyEnabled(analyticsState.enabled);
    setConsent(readVisitorConsent());
    if (analyticsSaved && visitorSaved && analyticsState.enabled) window.location.reload();
  };

  return (
    <section className="my-5 space-y-3 rounded-2xl border border-border bg-card p-5" aria-labelledby="visitor-analytics-heading" data-testid="section-visitor-analytics">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('اختيار مستقل', 'Separate choice')}</p>
          <h2 id="visitor-analytics-heading" className="font-display text-lg font-bold">{t('تحليلات لوحة الزوار', 'Visitor dashboard analytics')}</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${bothEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {bothEnabled ? t('مفعّلة', 'On') : t('متوقفة', 'Off')}
        </span>
      </div>
      <p id="visitor-analytics-description" className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t(
          'هذا الاختيار متوقف افتراضيًا ويتطلب أيضًا السماح بالتحليلات الاختيارية أعلاه. إذا أرسل متصفحك إشارة عدم التتبع أو التحكم العالمي بالخصوصية، تبقى التحليلات متوقفة حتى تفعّلها صراحةً هنا؛ ويطبق اختيارك على هذا الموقع وهذا المتصفح فقط. عند تفعيله، يسجل تقرير الزيارات معرف متصفح مجهولًا يتجدد كل 30 يومًا، ومعرف مشاهدة جديدًا، ومسارًا عامًا للصفحة ولغة التطبيق، وفئة عامة: إدارة أو متعلم مسجل أو زائر غير مسجل. تُستنتج الفئة من الجلسة ولا نحفظ معرف الحساب. نرسل معرّف المشروع والمعرّف المجهول ومسار الصفحة المنقح إلى منارة EthioDeploy؛ دون جهة الإحالة أو تفاصيل الأداء. قد تقدّر EthioDeploy البلد من طلب الشبكة. لا نرسل البريد أو الاسم أو نصوصًا حرة أو موقع المتصفح. نحتفظ ببياناتنا 90 يومًا، أما احتفاظ EthioDeploy فيخضع لإعدادات خدمتها. الأعداد تقريبية ومجمّعة فقط.',
          'This opt-in is off by default and also requires optional analytics above to be allowed. If your browser sends a Do Not Track or Global Privacy Control signal, analytics stays off until you explicitly enable it here; that choice applies only to this site in this browser. When enabled, our visitor report records a rotating anonymous browser ID (30 days), a fresh pageview ID, a broad page path and app language, plus a broad audience category: admin, signed-in learner, or anonymous visitor. The category comes from the session; we do not store account IDs. We send the project ID, anonymous ID, and normalized public page paths to EthioDeploy’s beacon; admin-panel paths, referrer and performance details are omitted. EthioDeploy may estimate country from the network request. We do not send email, names, free text, or browser location. Our records are kept for 90 days; EthioDeploy retention follows its service settings. Counts are approximate and aggregate only.',
        )}
      </p>
      {!bothEnabled && canEnableBoth && (
        <button type="button" onClick={enableBoth} className="press min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="button-enable-both-analytics">
          {t('تفعيل الخيارين لهذا المتصفح', 'Enable both settings in this browser')}
        </button>
      )}
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-sm font-semibold">
        <span>{t('السماح بقياس الزيارات المجهولة', 'Allow anonymous visitor measurement')}</span>
        <input
          type="checkbox"
          className="size-5 accent-[hsl(var(--primary))]"
          checked={consent === 'on'}
          disabled={blocked}
          aria-describedby="visitor-analytics-description visitor-analytics-status"
          data-testid="switch-visitor-analytics"
          onChange={(event) => {
            const enabled = event.target.checked;
            const saved = setVisitorConsent(enabled);
            setSaveError(!saved);
            setConsent(readVisitorConsent());
          }}
        />
      </label>
      <p id="visitor-analytics-status" role="status" className="text-sm text-muted-foreground">
        {saveError || consent === 'unavailable'
          ? t('تخزين المتصفح غير متاح؛ لذلك تبقى هذه التحليلات متوقفة.', 'Browser storage is unavailable, so these analytics remain off.')
          : privacyState.reason === 'storage'
            ? t('تعذّر حفظ الاختيار في تخزين المتصفح؛ لذلك تبقى هذه التحليلات متوقفة.', 'The browser could not save this choice, so these analytics remain off.')
            : privacyState.reason === 'tracker'
              ? t('يوجد إعداد إيقاف تتبع من أداة أخرى؛ لن نتجاوزه.', 'Another tracker opt-out is active; we will not override it.')
              : hasPrivacySignal() && bothEnabled
                ? t('فعّلت الخيارين صراحةً لهذا الموقع رغم إشارة المتصفح. يطبق اختيارك على هذا المتصفح فقط.', 'You explicitly enabled both settings for this site despite your browser signal. This applies to this browser only.')
                : hasPrivacySignal()
                  ? t('يرسل متصفحك إشارة عدم التتبع أو التحكم العالمي بالخصوصية. تبقى التحليلات متوقفة حتى تفعّل الخيارين صراحةً هنا.', 'Your browser sends a Do Not Track or Global Privacy Control signal. Analytics stays off until you explicitly enable both settings here.')
              : !privacyEnabled
              ? t('لن تُرسل بيانات لوحة الزوار حتى تسمح بالتحليلات الاختيارية أعلاه أيضًا.', 'Visitor data will not be sent until optional analytics above is allowed too.')
              : consent === 'on'
                ? t('مفعّلة لهذا المتصفح فقط. يمكنك إيقافها في أي وقت؛ عند الإيقاف يُحذف المعرّف المحلي.', 'On for this browser only. Turn it off any time; opting out clears the local visitor ID.')
                : t('متوقفة افتراضيًا. لا تُرسل زيارات الصفحات حتى تختار تفعيلها.', 'Off by default. Pageviews are not sent unless you explicitly turn this on.')}
      </p>
    </section>
  );
}
