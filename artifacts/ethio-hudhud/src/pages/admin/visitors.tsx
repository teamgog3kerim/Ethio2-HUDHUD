import { useMemo, useState } from 'react';
import { useGetAdminVisitors } from '@workspace/api-client-react';
import { ArrowUpRight, Globe2, MonitorSmartphone, RefreshCw, Users, Eye, ShieldCheck } from 'lucide-react';
import { AdminLayout } from '@/components/admin/layout';
import { Card, ErrorState, Skeleton } from '@/components/bits';
import { Notice } from '@/components/admin/ui';
import { useApp } from '@/lib/app';
import type { AdminVisitorAudience, AdminVisitorDaily, AdminVisitorSegment } from '@workspace/api-client-react';

function formatCount(value: number) {
  return Number(value || 0).toLocaleString();
}

function categoryName(category: string, t: (ar: string, en: string) => string): string {
  const key = category.toLowerCase();
  const known: Record<string, [string, string]> = {
    beginner: ['مبتدئ', 'Beginner'], intermediate: ['متوسط', 'Intermediate'], advanced: ['متقدم', 'Advanced'],
    ar: ['العربية', 'Arabic'], en: ['الإنجليزية', 'English'], other: ['أخرى', 'Other'],
    mobile: ['هاتف', 'Mobile'], desktop: ['حاسوب', 'Desktop'], tablet: ['جهاز لوحي', 'Tablet'],
    chrome: ['Chrome', 'Chrome'], safari: ['Safari', 'Safari'], firefox: ['Firefox', 'Firefox'], edge: ['Edge', 'Edge'],
    android: ['Android', 'Android'], ios: ['iOS', 'iOS'],
  };
  return known[key] ? t(...known[key]) : category;
}

function audienceName(category: AdminVisitorAudience['category'], t: (ar: string, en: string) => string): string {
  const labels: Record<AdminVisitorAudience['category'], [string, string]> = {
    admin: ['الإدارة والمالك', 'Admins and owner'],
    learner: ['المتعلمون المسجلون', 'Signed-in learners'],
    visitor: ['الزوار غير المسجلين', 'Public visitors'],
    unclassified: ['سجلات أقدم غير مصنفة', 'Earlier unclassified records'],
  };
  return t(...labels[category]);
}

function CountryName({ code }: { code: string }) {
  const { t } = useApp();
  if (code === 'XX') return <>{t('غير متاح', 'Unavailable')}</>;
  try {
    const displayNames = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' });
    return <>{displayNames.of(code) || code}</>;
  } catch {
    return <>{code}</>;
  }
}

function AudienceBreakdown({ rows }: { rows: AdminVisitorAudience[] }) {
  const { t } = useApp();
  return (
    <Card className="overflow-hidden p-0" data-testid="panel-visitor-audiences">
      <div className="border-b border-border px-5 py-4">
        <p className="text-sm text-muted-foreground">{t('من جلسة الدخول', 'From the active session')}</p>
        <h2 className="font-display text-xl font-bold">{t('زيارات الإدارة والمتعلمين', 'Admin and learner visits')}</h2>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-border bg-muted/35 px-5 py-3 text-xs font-semibold text-muted-foreground">
        <span>{t('الفئة', 'Audience')}</span>
        <span className="text-end">{t('زوار فريدون', 'Unique visitors')}</span>
        <span className="text-end">{t('مشاهدات', 'Pageviews')}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.category} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 px-5 py-3.5 text-sm">
            <span className="font-medium">{audienceName(row.category, t)}</span>
            <span className="text-end font-mono tabular-nums">{formatCount(row.visitors)}</span>
            <span className="text-end font-mono tabular-nums">{formatCount(row.pageviews)}</span>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        {t('تُحدد الفئة من جلسة الدخول دون حفظ معرف الحساب. السجلات السابقة لإضافة هذا التصنيف تظهر ضمن السجلات الأقدم.', 'Audience is derived from the signed-in session without storing account IDs. Events recorded before this category was added appear as earlier unclassified records.')}
      </p>
    </Card>
  );
}

function TrendChart({ rows }: { rows: AdminVisitorDaily[] }) {
  const { t } = useApp();
  const points = useMemo(() => {
    const values = rows.map((row) => row.visitors);
    const max = Math.max(1, ...values);
    const width = 720;
    const height = 190;
    const coords = values.map((value, index) => ({
      x: values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width,
      y: height - (value / max) * (height - 22) - 8,
    }));
    return { coords, max, width, height };
  }, [rows]);
  const line = points.coords.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${line} ${points.width},${points.height} 0,${points.height}`;
  const labelIndices = [0, Math.floor((rows.length - 1) / 2), Math.max(0, rows.length - 1)];
  return (
    <Card className="overflow-hidden p-0" data-testid="chart-visitors">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-sm text-muted-foreground">{t('إيقاع الزيارات', 'Visitor rhythm')}</p>
          <h2 className="font-display text-xl font-bold">{t('زوار فريدون يوميًا', 'Unique visitors per day')}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-primary" />{t('زوار تقريبيون', 'Approx. visitors')}</div>
      </div>
      {rows.length === 0 ? (
        <div className="grid min-h-56 place-items-center px-5 text-center text-sm text-muted-foreground">{t('لا توجد بيانات لهذه الفترة بعد.', 'No data for this period yet.')}</div>
      ) : (
        <div className="px-4 pb-4 pt-6">
          <svg viewBox={`0 0 ${points.width} ${points.height}`} role="img" aria-label={t('مخطط الزوار اليومي', 'Daily visitor chart')} className="h-48 w-full overflow-visible">
            <defs><linearGradient id="visitor-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity=".22" /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" /></linearGradient></defs>
            {[0, 1, 2, 3].map((n) => <line key={n} x1="0" x2={points.width} y1={n * 58 + 4} y2={n * 58 + 4} stroke="hsl(var(--border))" strokeDasharray="3 7" />)}
            <polygon points={area} fill="url(#visitor-area)" />
            <polyline points={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {points.coords.map((point, index) => <circle key={`${rows[index]?.date}-${index}`} cx={point.x} cy={point.y} r={rows.length < 10 ? 4 : 2.5} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />)}
          </svg>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
            {labelIndices.map((index, i) => <span key={`${index}-${i}`}>{rows[index]?.date ? new Date(`${rows[index].date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function SegmentList({ title, rows, total, icon }: { title: string; rows: AdminVisitorSegment[]; total: number; icon: 'device' | 'browser' | 'language' | 'level' }) {
  const { t } = useApp();
  const Icon = icon === 'device' ? MonitorSmartphone : icon === 'language' ? Globe2 : Users;
  const max = Math.max(1, ...rows.map((row) => row.visitors));
  return (
    <Card className="h-full" data-testid={`panel-${icon}-segments`}>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div><h3 className="font-display font-bold">{title}</h3><p className="text-xs text-muted-foreground">{t('توزيع إجمالي', 'Aggregate distribution')}</p></div>
      </div>
      <div className="space-y-4">
        {rows.length ? rows.map((row) => (
          <div key={row.category}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{categoryName(row.category, t)}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatCount(row.visitors)} <span className="font-sans">· {total ? `${Math.round((row.visitors / total) * 100)}%` : '0%'}</span></span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/80 transition-transform" style={{ width: `${Math.min(100, (row.visitors / max) * 100)}%` }} /></div>
          </div>
        )) : <p className="py-4 text-sm text-muted-foreground">{t('لا توجد بيانات مجمّعة بعد.', 'No aggregate data yet.')}</p>}
      </div>
    </Card>
  );
}

function VisitorsBody() {
  const { t } = useApp();
  const [days, setDays] = useState<7 | 30>(30);
  const q = useGetAdminVisitors({ days });
  if (q.isLoading) return (
    <div className="space-y-5" role="status" aria-label={t('جارٍ تحميل التقرير', 'Loading report')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-32" />)}</div>
      <Skeleton className="h-72" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  );
  if (q.isError || !q.data) return <ErrorState what={t('تقرير الزوار', 'the visitors report')} onRetry={() => void q.refetch()} />;
  const data = q.data;
  const avgPages = data.visitors ? data.pageviews / data.visitors : 0;
  const statCards = [
    { label: t('زوار تقريبيون', 'Approx. visitors'), value: data.visitors, icon: Users, tint: 'bg-primary/10 text-primary' },
    { label: t('مشاهدات الصفحات', 'Pageviews'), value: data.pageviews, icon: Eye, tint: 'bg-gold/20 text-gold-foreground' },
    { label: t('صفحات لكل زائر', 'Pages per visitor'), value: avgPages.toFixed(1), icon: ArrowUpRight, tint: 'bg-secondary text-secondary-foreground' },
    { label: t('ملفات تعلّم مسجلة', 'Learner profiles'), value: data.learningProfiles.totalLearners, icon: ShieldCheck, tint: 'bg-muted text-foreground' },
  ];
  const maxCountry = Math.max(1, ...data.countries.map((country) => country.visitors));
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-[hsl(var(--primary))] px-6 py-7 text-primary-foreground sm:px-8">
        <div className="pointer-events-none absolute -left-12 -top-24 size-64 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -left-2 -top-14 size-44 rounded-full border border-white/15" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] opacity-75">{t('نبض المجتمع', 'Community pulse')}</p>
            <h2 className="font-display max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">{t('صورة مجمّعة عن الوصول إلى HUDHUD.', 'A collective view of how learners find HUDHUD.')}</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-80">{t('زوار مجهولون تقريبًا، بجانب شرائح التعلّم المجمّعة من تفضيلات الحساب.', 'Approximate anonymous visitors alongside aggregate learning segments from account preferences.')}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-1" role="group" aria-label={t('الفترة الزمنية', 'Reporting period')}>
            {([7, 30] as const).map((period) => (
              <button key={period} type="button" onClick={() => setDays(period)} aria-pressed={days === period} data-testid={`button-visitors-${period}-days`}
                className={`press rounded-lg px-4 py-2 text-sm font-bold ${days === period ? 'bg-card text-foreground' : 'text-primary-foreground/80 hover:bg-white/10'}`}>
                {t(`${period} أيام`, `${period} days`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item, index) => {
          const Icon = item.icon;
          return <Card key={item.label} className={`relative overflow-hidden ${index === 0 ? 'sm:col-span-2 xl:col-span-1' : ''}`} data-testid={`stat-visitors-${index}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <span className={`grid size-9 place-items-center rounded-xl ${item.tint}`}><Icon className="size-4" /></span>
            </div>
            <p className="font-display mt-3 text-4xl font-extrabold tabular-nums">{typeof item.value === 'number' ? formatCount(item.value) : item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(`آخر ${days} أيام`, `Last ${days} days`)}</p>
          </Card>;
        })}
      </div>

      <AudienceBreakdown rows={data.audiences} />

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <TrendChart rows={data.daily} />
        <Card className="overflow-hidden p-0" data-testid="panel-countries">
          <div className="flex items-end justify-between gap-3 border-b border-border px-5 py-4">
            <div><p className="text-sm text-muted-foreground">{t('بلد تقريبي', 'Approximate country')}</p><h2 className="font-display text-xl font-bold">{t('مصادر الزيارات', 'Visitor origins')}</h2></div>
            <Globe2 className="mb-1 size-5 text-primary" />
          </div>
          {data.countries.length ? <div className="divide-y divide-border">
            {data.countries.map((country) => <div key={country.country} className="px-5 py-3.5">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold"><CountryName code={country.country} /></span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatCount(country.visitors)} {t('زائر', 'visitors')}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (country.visitors / maxCountry) * 100)}%` }} /></div>
            </div>)}
          </div> : <div className="grid min-h-44 place-items-center px-5 text-center text-sm text-muted-foreground">{t('لا توجد بيانات بلد لهذه الفترة.', 'No country data for this period.')}</div>}
          <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">{t('تقدير عام من وكيل الاستضافة عند توفره؛ XX يعني أن البلد غير متاح.', 'A broad estimate from the hosting proxy when available; XX means unavailable.')}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SegmentList title={t('الأجهزة', 'Devices')} rows={data.devices} total={data.visitors} icon="device" />
        <SegmentList title={t('المتصفحات', 'Browsers')} rows={data.browsers} total={data.visitors} icon="browser" />
        <SegmentList title={t('لغة التطبيق', 'App language')} rows={data.languages} total={data.visitors} icon="language" />
      </div>

      <section aria-labelledby="learning-profile-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('من إعدادات الحساب', 'From account settings')}</p><h2 id="learning-profile-title" className="font-display text-2xl font-bold">{t('ملامح التعلّم', 'Learning profile mix')}</h2></div>
          <span className="text-sm text-muted-foreground">{formatCount(data.learningProfiles.totalLearners)} {t('ملفًا تعليميًا', 'learner profiles')}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SegmentList title={t('المستوى الحالي', 'Current level')} rows={data.learningProfiles.levels} total={data.learningProfiles.totalLearners} icon="level" />
          <SegmentList title={t('لغة الواجهة المفضّلة', 'Preferred interface language')} rows={data.learningProfiles.languages} total={data.learningProfiles.totalLearners} icon="language" />
        </div>
      </section>

      <Notice kind="info">
        <div className="flex items-start gap-2"><RefreshCw className="mt-0.5 size-4 shrink-0" /><span>{t('هذه أعداد تقريبية ومجمّعة فقط. لا تظهر هويات أو مواقع دقيقة؛ مستويات المتعلمين ولغاتهم مأخوذة من تفضيلات الحساب الحالية.', 'These are approximate, aggregate counts only. No identities or precise locations are shown; learner levels and languages come from current account preferences.')}</span></div>
      </Notice>
    </div>
  );
}

export default function AdminVisitors() {
  const { t } = useApp();
  return <AdminLayout title={t('الزوار', 'Visitors')} sub={t('اتجاهات مجمّعة، لا ملفات أفراد.', 'Aggregate trends, never individual profiles.')}><VisitorsBody /></AdminLayout>;
}
