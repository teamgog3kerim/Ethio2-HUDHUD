import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { CalendarRange, Check, Lock } from 'lucide-react';
import { getGetProfileQueryKey, getGetStudyPlanQueryKey, useGetStudyPlan, useGetProfile } from '@workspace/api-client-react';
import { Card, Empty, ErrorState, PageHead, PilotNote, ProgressBar, Skeleton } from '@/components/bits';
import { Shell } from '@/components/shell';
import { useApp } from '@/lib/app';
import { useBilling } from '@/components/billing-notice';
import { useMonthLock } from '@/components/course-month-dialog';
import { isMonthLocked } from '@/lib/month-access';
import { cn } from '@/lib/utils';

export default function Plan() {
  const { t, lang } = useApp();
  const q = useGetStudyPlan({ query: { queryKey: getGetStudyPlanQueryKey(), staleTime: 30_000, refetchInterval: 60_000 } });
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey(), staleTime: 30_000 } });
  const { data: bill } = useBilling();
  const lock = useMonthLock();
  const am = bill?.accessibleMonths;
  const isLocked = (d: { month: number; locked?: boolean }) => isMonthLocked(d.month, am, d.locked);
  const [month, setMonth] = useState<number | null>(null);
  const days = q.data ?? [];
  const current = useMemo(() => days.find((d) => !d.completed), [days]);
  useEffect(() => { if (month === null && current) setMonth(current.month); }, [current, month]);
  const m = month ?? 1;
  const inMonth = days.filter((d) => d.month === m);
  const lessonDays = days.filter(d => d.type === 'lesson');
  const done = lessonDays.filter(d => d.completed).length;
  const total = lessonDays.length;
  const schedule = profile.data?.studySchedule;
  const week = days[0]?.currentSuggestedWeek;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.data?.timezone ?? 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const upcoming = days.filter(d => d.suggestedDate && d.suggestedDate >= today && !d.completed).slice(0, 8);
  const overdue = days.filter(d => d.overdue).length;
  const formatDate = (date: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
  const typeLabel = (x: string) => (x === 'lesson' ? t('درس', 'Lesson') : x === 'review' ? t('مراجعة', 'Review') : x);

  return (
    <Shell>
      <PageHead eyebrow={t('ستة أشهر', 'Six months')} title={t('خطة 180 يومًا', '180-day plan')}
        sub={t('180 نشاطًا للدروس والمراجعة والممارسة. تعلّم بالوتيرة التي تناسبك، مع جدول اختياري.', '180 lesson, review and practice activities. Learn at your own pace, with optional scheduling.')} />
      <p className="mb-5 text-sm text-muted-foreground">
        <Link href="/account" className="underline underline-offset-4">{t('إدارة الجدول والتذكيرات من إعدادات الحساب', 'Manage your schedule and reminders in Account settings')}</Link>
      </p>
      {q.isLoading && <Skeleton className="h-80" />}
      {q.isError && <ErrorState onRetry={() => q.refetch()} what={t('الخطة', 'the plan')} />}
      {q.data && days.length === 0 && <Empty icon={<CalendarRange />} title={t('الخطة غير متاحة', 'No plan available')} />}
      {days.length > 0 && (
        <>
          <Card className="mb-5">
            <div className="mb-2 flex justify-between text-sm"><span>{t('الدروس المكتملة فعليًا', 'Actual lessons completed')}</span><span data-testid="text-plan-done">{done} / {total}</span></div>
            <ProgressBar value={total ? (done / total) * 100 : 0} />
            <p className="mt-2 text-xs text-muted-foreground">{t('المراجعة والممارسة اقتراحات؛ مرور الموعد لا يُكمل درسًا ولا يحذف إنجازه.', 'Review and practice are suggestions; passing a date never completes a lesson or removes credit.')}</p>
          </Card>
          {schedule && (
            <Card className="mb-5 space-y-3">
              <h2 className="font-bold">{schedule.pausedOn ? t('الاقتراحات متوقفة مؤقتًا', 'Suggestions paused')
                : week === 0 ? t('لم يبدأ الجدول بعد', 'Schedule has not started yet')
                : week === 27 ? t('انتهت فترة الجدول؛ واصل بالوتيرة التي تناسبك', 'Schedule period ended; continue at your own pace')
                : `${t('الأسبوع المقترح الحالي', 'Current suggested week')}: ${week ?? '—'} / 26`}</h2>
              <p className="text-sm" dir="auto">{t('بحسب المنطقة الزمنية', 'Timezone')}: {profile.data?.timezone}</p>
              {!schedule.pausedOn && <>
                <p className="text-sm">{t('اقتراحات دروس سابقة غير مكتملة', 'Earlier lesson suggestions not yet completed')}: {overdue}. {t('هذا ليس خصمًا من تقدمك.', 'This does not reduce your progress.')}</p>
                <h3 className="font-semibold">{t('أنشطة قادمة (بما فيها اليوم)', 'Upcoming activities (including today)')}</h3>
                {upcoming.length === 0 && <p className="text-sm">{t('لا توجد مواعيد قادمة. تابع أي درس أو أعد جدولة الخطة.', 'No upcoming dates. Continue any lesson or reschedule the plan.')}</p>}
                <ul className="space-y-2">
                  {upcoming.map(day => <li key={day.day} className="text-sm">
                    <span>{formatDate(day.suggestedDate!)} · {typeLabel(day.type)} · </span>
                    {isLocked(day) ? <button type="button" onClick={() => lock.open(day.month)} className="inline-flex items-center gap-1 underline"><Lock className="size-3" />{day.title}</button>
                    : <Link href={day.lessonId ? `/lesson/${day.lessonId}` : '/review'} className="underline">{day.title}</Link>}
                  </li>)}
                </ul>
              </>}
            </Card>
          )}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" onClick={() => setMonth(n)} data-testid={`button-month-${n}`}
                className={cn('press shrink-0 rounded-full border px-5 py-2 font-semibold', n === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
                {t('الشهر', 'Month')} {n}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2" key={m}>
            {inMonth.map((d, i) => {
              const body = (
                <>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold', d.completed ? 'bg-gold text-gold-foreground' : current?.day === d.day ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                    {d.completed ? <Check className="size-4" /> : isLocked(d) ? <Lock className="size-4" /> : d.day}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.title}</span>
                    <span className="text-xs text-muted-foreground">{t('اليوم', 'Day')} {d.day} · {typeLabel(d.type)}</span>
                    {d.suggestedDate && <span className="block text-xs text-muted-foreground">{t('موعد مقترح', 'Suggested date')}: {formatDate(d.suggestedDate)}{d.overdue ? ` · ${t('اقتراح سابق، ليس إنجازًا', 'Earlier suggestion, not progress')}` : ''}</span>}
                  </span>
                </>
              );
              const cls = cn('rise flex items-center gap-3 rounded-2xl border bg-card p-3', current?.day === d.day ? 'border-primary' : 'border-border');
              const style = { animationDelay: `${Math.min(i, 12) * 25}ms` };
              if (isLocked(d)) return (
                <button key={d.day} type="button" onClick={() => lock.open(d.month)} data-testid={`day-${d.day}`} className={cn(cls, 'lift w-full text-start opacity-80')} style={style}>{body}</button>
              );
              return d.lessonId ? (
                <Link key={d.day} href={`/lesson/${d.lessonId}`} data-testid={`day-${d.day}`} className={cn(cls, 'lift')} style={style}>{body}</Link>
              ) : (
                <div key={d.day} data-testid={`day-${d.day}`} className={cls} style={style}>{body}</div>
              );
            })}
          </div>
        </>
      )}
      {lock.dialog}
      <PilotNote className="mt-6" />
    </Shell>
  );
}
