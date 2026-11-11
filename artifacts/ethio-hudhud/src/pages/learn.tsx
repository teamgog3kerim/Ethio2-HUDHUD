import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Lock, MessageCircle, Play } from 'lucide-react';
import { buildLearningPath, getGetCoursesQueryKey, learningStages, useGetCourses } from '@workspace/api-client-react';
import { Am, Card, Empty, ErrorState, PageHead, PilotNote, ProgressBar, Skeleton, btnClass } from '@/components/bits';
import { Shell } from '@/components/shell';
import { useApp } from '@/lib/app';
import { useBilling } from '@/components/billing-notice';
import { useMonthLock } from '@/components/course-month-dialog';
import { isMonthLocked } from '@/lib/month-access';
import { cn } from '@/lib/utils';
import { FavouriteButton, SavedItems } from '@/components/favourites';

type View = 'all' | 'courses' | 'conversations';

export default function Learn() {
  const { t, lang } = useApp();
  const ar = lang === 'ar';
  const q = useGetCourses({ query: { queryKey: getGetCoursesQueryKey(), staleTime: 30_000 } });
  const { data: bill } = useBilling();
  const lock = useMonthLock();
  const am = bill?.accessibleMonths;
  const courseLocked = (c: { month: number; accessible?: boolean }) => isMonthLocked(c.month, am, c.accessible === undefined ? undefined : !c.accessible);
  const lessonLocked = (c: { month: number; accessible?: boolean }, l: { locked?: boolean }) => isMonthLocked(c.month, am, l.locked ?? (courseLocked(c) ? true : undefined));
  const [savedView, setSavedView] = useState(() => new URLSearchParams(window.location.search).get('view') === 'saved');
  const [sel, setSel] = useState<number | null>(() => {
    const month = Number(new URLSearchParams(window.location.search).get('month'));
    return month >= 1 && month <= 6 && Number.isInteger(month) ? month : null;
  });
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get('view') === 'conversations' ? 'conversations' : 'all');
  const path = useMemo(() => (q.data ? buildLearningPath(q.data) : null), [q.data]);
  const months = path?.months ?? [];
  const nextMonth = path?.nextLesson ? months.find(x => x.course.lessons.some(l => l.id === path.nextLesson!.id))?.course.month : undefined;
  const nextOpen = useMemo(() => {
    const n = path?.nextLesson;
    if (!n) return null;
    for (const m of months) {
      const open = m.course.lessons.filter(l => !lessonLocked(m.course, l));
      if (open.some(l => l.id === n.id)) return n;
    }
    for (const m of months) { const f = m.course.lessons.find(l => !l.completed && !lessonLocked(m.course, l)); if (f) return f; }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, months, am]);
  const idx = Math.max(0, months.findIndex(m => m.course.month === (sel ?? nextMonth)));
  const cur = months[idx];
  const Prev = ar ? ChevronRight : ChevronLeft;
  const Next = ar ? ChevronLeft : ChevronRight;
  const isConv = (l: { dialogue?: unknown[] }) => !!l.dialogue?.length;
  const convCount = path?.lessons.filter(isConv).length ?? 0;
  const lessonCount = (path?.total ?? 0) - convCount;
  const go = (i: number) => { const m = months[i]; if (m) setSel(m.course.month); };
  const title = (c: { titleAr: string; titleEn: string }) => (ar ? c.titleAr : c.titleEn);

  return (
    <Shell>
      <PageHead eyebrow={t('برنامج ستة أشهر', 'Six-month programme')} title={t('رحلتك في الأمهرية', 'Your Amharic path')}
        sub={t('أربعة وعشرون أسبوعًا مقترحًا، بوتيرتك أنت: ثلاث مراحل، ستة أشهر، ودروس ومحادثات. المرحلة المتقدمة دراسة داخلية وليست شهادة طلاقة.', 'Twenty-four suggested weeks at your own pace: three stages, six months, lessons and conversations. The advanced stage is internal study, not certified fluency.')} />
      <div className="mb-4 flex gap-2" role="group" aria-label={t('عرض المواد', 'Browse materials')}>
        <button className={btnClass(savedView ? 'outline' : 'primary')} aria-pressed={!savedView} onClick={() => setSavedView(false)}>{t('البرنامج', 'Programme')}</button>
        <button className={btnClass(savedView ? 'primary' : 'outline')} aria-pressed={savedView} onClick={() => setSavedView(true)} data-testid="button-saved-items">{t('المحفوظات', 'Saved items')}</button>
      </div>
      {savedView ? <SavedItems /> : <>
      {q.isLoading && <div className="grid gap-3 md:grid-cols-[1fr_1.6fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>}
      {q.isError && <ErrorState onRetry={() => q.refetch()} what={t('المقررات', 'courses')} />}
      {path && months.length === 0 && <Empty icon={<BookOpen />} title={t('لا مقررات بعد', 'No courses yet')} />}
      {path && cur && (
        <>
          <Card className="rise mb-5 flex flex-wrap items-center gap-4" data-testid="panel-overall">
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm text-muted-foreground">{t('تقدّمك الكلي', 'Overall progress')}</p>
              <p className="font-display text-3xl font-extrabold tabular-nums" data-testid="text-overall"><bdi dir="ltr">{path.completed} / {path.total}</bdi> <bdi dir="ltr" className="text-lg text-primary">{path.percent}%</bdi></p>
              <ProgressBar className="mt-2" value={path.percent} />
              <details className="mt-2 text-xs text-muted-foreground" data-testid="details-programme">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">{t('تفاصيل البرنامج', 'Programme details')}</summary>
                <p>{t('يُحسب الدرس عند اجتياز اختباره بنسبة ٧٥٪، وليس عند فتحه.', 'A lesson counts after passing its quiz at 75%, not just opening it.')}</p>
              </details>
            </div>
            {nextOpen
              ? <Link href={`/lesson/${nextOpen.id}`} data-testid="link-continue-learning" className={btnClass('gold', 'lg')}><Play className="size-5 rtl:-scale-x-100" />{t('تابع التعلّم', 'Continue learning')}</Link>
              : path.total > 0 && <p className="font-semibold text-primary" data-testid="text-path-done">{t('أنهيت كل الدروس المتاحة', 'All available lessons completed')}</p>}
          </Card>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {learningStages.map((s, si) => {
              const ms = months.filter(m => m.stage.id === s.id);
              const tot = ms.reduce((a, m) => a + m.total, 0);
              const done = ms.reduce((a, m) => a + m.completed, 0);
              const on = cur.stage.id === s.id;
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setSel(s.months[0])} data-testid={`stage-${s.id}`} className={cn('press rise rounded-3xl border p-4 text-start transition-colors duration-300', on ? 'border-primary bg-secondary' : 'border-border bg-card')} style={{ animationDelay: `${si * 60}ms` }}>
                  <p className="text-xs font-bold text-primary">{t('الأشهر', 'Months')} <bdi dir="ltr">{s.months[0]}–{s.months[1]}</bdi></p>
                  <p className="font-display text-lg font-bold">{ar ? s.titleAr : s.titleEn}</p>
                  <p className="text-xs text-muted-foreground tabular-nums"><bdi dir="ltr">{done} / {tot} · {tot ? Math.round(done / tot * 100) : 0}%</bdi></p>
                  <ProgressBar className="mt-2" value={tot ? done / tot * 100 : 0} />
                  {s.id === 'advanced' && <p className="mt-2 text-xs text-muted-foreground">{t('دراسة داخلية، لا تعني طلاقة معتمدة.', 'Internal study; not certified fluency.')}</p>}
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('نوع التعلّم', 'Learning view')}>
            {(['all', 'courses', 'conversations'] as const).map(v => (
              <button key={v} type="button" aria-pressed={view === v} data-testid={`button-view-${v}`} onClick={() => setView(v)}
                className={cn('press min-h-11 rounded-full border px-5 py-2 text-sm font-semibold', view === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
                {v === 'all' ? `${t('الكل', 'All')} (${path.total})` : v === 'courses' ? `${t('الدروس', 'Lessons')} (${lessonCount})` : `${t('المحادثات', 'Conversations')} (${convCount})`}
              </button>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_1.6fr]">
            <div className="space-y-2">
              {months.map((m, i) => (
                <button key={m.course.id} type="button" onClick={() => setSel(m.course.month)} data-testid={`button-course-${m.course.id}`} aria-current={i === idx}
                  className={cn('lift rise w-full rounded-3xl border p-4 text-start', i === idx ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
                  style={{ animationDelay: `${i * 50}ms` }}>
                  <p className={cn('text-xs font-bold', i === idx ? 'text-gold' : 'text-primary')}>{ar ? m.stage.titleAr : m.stage.titleEn} · {t('الشهر', 'Month')} {m.course.month}{courseLocked(m.course) && <Lock className="ms-1 inline size-3" />}</p>
                  <p className="font-display font-bold">{title(m.course)}</p>
                  <p className="mt-1 text-xs tabular-nums opacity-80"><bdi dir="ltr">{m.completed} / {m.total} · {m.percent}%</bdi></p>
                  <ProgressBar className="mt-2 bg-black/10" value={m.percent} />
                </button>
              ))}
            </div>

            <Card key={`${cur.course.id}-${view}`} className="rise" data-testid="panel-course">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="press grid size-11 place-items-center rounded-full border border-border disabled:opacity-40" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label={t('الشهر السابق', 'Previous month')} data-testid="button-prev-month"><Prev className="size-5" /></button>
                <p className="text-center text-sm font-bold text-primary">{t('الشهر', 'Month')} <bdi dir="ltr">{cur.course.month} / {months.length}</bdi></p>
                <button type="button" className="press grid size-11 place-items-center rounded-full border border-border disabled:opacity-40" disabled={idx === months.length - 1} onClick={() => go(idx + 1)} aria-label={t('الشهر التالي', 'Next month')} data-testid="button-next-month"><Next className="size-5" /></button>
              </div>
              <h2 className="font-display mt-3 text-2xl font-extrabold">{title(cur.course)}</h2>
              <p className="mt-1 text-muted-foreground">{cur.course.description}</p>
              <p className="mt-2 text-sm tabular-nums" data-testid="text-month-progress"><bdi dir="ltr">{cur.completed} / {cur.total}</bdi> {t('مكتمل', 'completed')} · <bdi dir="ltr">{cur.percent}%</bdi></p>
              <ProgressBar className="mt-1" value={cur.percent} />
              <div className="mt-5 space-y-5">
                {cur.weeks.map(w => {
                  const items = w.lessons.filter(l => view === 'all' || (view === 'conversations') === isConv(l));
                  if (!items.length) return null;
                  return (
                    <section key={w.number} aria-label={`${t('الأسبوع', 'Week')} ${w.number}`}>
                      <h3 className="mb-2 text-xs font-bold tracking-wider text-muted-foreground">{t('الأسبوع المقترح', 'Suggested week')} <bdi dir="ltr">{w.number} / 24</bdi></h3>
                      <ul className="space-y-2">
                        {items.map(l => {
                          const conv = isConv(l);
                          const locked = lessonLocked(cur.course, l);
                          const Row = (locked ? 'button' : Link) as React.ElementType;
                          const rowProps = locked ? { type: 'button', onClick: () => lock.open(cur.course.month) } : { href: `/lesson/${l.id}` };
                          return (
                            <li key={l.id} className="flex items-center gap-2">
                              <Row {...rowProps} data-testid={conv ? `conversation-link-${l.id}` : `link-lesson-${l.id}`} className="lift flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-background p-4 text-start">
                                {locked ? <Lock className="size-6 shrink-0 text-gold" /> : l.completed ? <CheckCircle2 className="pop size-6 shrink-0 text-primary" /> : <Circle className="size-6 shrink-0 text-muted-foreground" />}
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold">{title(l)}</p>
                                  {conv && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><MessageCircle className="size-3.5" />{t('محادثة', 'Conversation')} · {l.dialogue!.length} {t('جمل', 'turns')}</span>}
                                  <Am className="block text-sm text-muted-foreground">{l.titleAm}</Am>
                                </div>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />{l.minutes}{t(' د', 'm')}</span>
                              </Row>
                              {!locked && <FavouriteButton id={l.id} />}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
                {cur.weeks.every(w => !w.lessons.some(l => view === 'all' || (view === 'conversations') === isConv(l))) && (
                  <Empty icon={view === 'conversations' ? <MessageCircle /> : <BookOpen />} title={view === 'conversations' ? t('لا محادثات في هذا الشهر بعد', 'No conversations this month yet') : t('لا دروس في هذا الشهر بعد', 'No lessons this month yet')} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}
      </>}
      {lock.dialog}
      <PilotNote className="mt-6" />
    </Shell>
  );
}
