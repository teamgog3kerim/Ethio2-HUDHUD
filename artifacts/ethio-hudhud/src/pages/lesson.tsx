import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff, ChevronLeft, ChevronRight, Lock, RotateCw, Timer, X } from 'lucide-react';
import {
  getGetCoursesQueryKey, getGetLessonQueryKey, getGetProgressQueryKey, getGetStudyPlanQueryKey, getGetFavouritesQueryKey,
  getGetVocabularyQueryKey, getLessonPosition, useCompleteLesson, useGetCourses, useGetLesson, type LessonResult,
} from '@workspace/api-client-react';
import { Am, Btn, Card, ErrorState, LinkBtn, PilotNote, ProgressBar, Skeleton } from '@/components/bits';
import { Shell } from '@/components/shell';
import { useActiveTimer } from '@/hooks/use-active-timer';
import { useApp } from '@/lib/app';
import { useBilling } from '@/components/billing-notice';
import { CourseMonthDialog } from '@/components/course-month-dialog';
import { isMonthLocked, monthRequiredFromError } from '@/lib/month-access';
import { isEthiopic } from '@/lib/options';
import { cn } from '@/lib/utils';
import { PronunciationNote } from '@/components/pronunciation-note';
import { ConversationCard } from '@/components/conversation-card';
import { FavouriteButton } from '@/components/favourites';
import { getIdentityGeneration } from '@/lib/identity-generation';

type Phase = 'vocab' | 'quiz' | 'result';

export default function LessonPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { userId } = useAuth();
  return <LessonView key={`${userId ?? 'guest'}:${id}`} id={id} />;
}

function LessonView({ id }: { id: string }) {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const [identityGeneration] = useState(() => getIdentityGeneration(qc));
  const q = useGetLesson(id);
  const { data: bill } = useBilling();
  const am = bill?.accessibleMonths;
  const [dismissed, setDismissed] = useState(false);
  const [dlg, setDlg] = useState<number | null>(null);
  const courses = useGetCourses();
  const pos = courses.data ? getLessonPosition(courses.data, id) : null;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [phase, setPhase] = useState<Phase>('vocab');
  const [vi, setVi] = useState(0);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<LessonResult | null>(null);
  const [showTr, setShowTr] = useState(() => { try { return id.startsWith('numbers-course-') || localStorage.getItem('hh-tr') === '1'; } catch { return id.startsWith('numbers-course-'); } });
  const toggleTr = () => setShowTr((v) => { try { localStorage.setItem('hh-tr', v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  const { seconds, reset } = useActiveTimer(phase !== 'result');

  const complete = useCompleteLesson({
    mutation: {
      onSuccess: (r) => {
        // The server may have saved this learner's credit already. Ignore only
        // the obsolete UI/cache effects, never undo or reassign the write.
        if (getIdentityGeneration(qc) !== identityGeneration) return;
        if (alive.current) {
          setResult(r);
          setPhase('result');
        }
        // Navigation within the same session still needs fresh saved progress.
        qc.invalidateQueries({ queryKey: getGetProgressQueryKey() });
        qc.invalidateQueries({ queryKey: getGetCoursesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetLessonQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetVocabularyQueryKey() });
        qc.invalidateQueries({ queryKey: getGetStudyPlanQueryKey() });
        qc.invalidateQueries({ queryKey: getGetFavouritesQueryKey() });
      },
      onError: (e) => { const m = monthRequiredFromError(e); if (m !== null) setDlg(m); },
    },
  });

  const lesson = q.data;
  const currentMonth = lesson?.month ?? courses.data?.find(c => c.id === lesson?.courseId)?.month;
  const redacted = lesson && (isMonthLocked(currentMonth, am, lesson.locked)
    || (Array.isArray(am) && am.length < 6 && currentMonth === undefined));
  const denied = monthRequiredFromError(q.error) ?? (redacted ? (currentMonth ?? 0) : null);
  const submit = (final: number[]) =>
    complete.mutate({ id, data: { answers: final, activeSeconds: Math.min(3600, seconds) } });

  const pick = (opt: number) => {
    if (!lesson) return;
    const next = [...answers.slice(0, qi), opt];
    setAnswers(next);
    window.setTimeout(() => {
      if (!alive.current || getIdentityGeneration(qc) !== identityGeneration) return;
      if (qi + 1 < lesson.exercises.length) setQi(qi + 1);
      else submit(next);
    }, 320);
  };

  const retry = () => {
    setAnswers([]); setQi(0); setResult(null); setPhase('quiz'); reset(); complete.reset();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const readingSteps = lesson?.dialogue?.length ? 1 : (lesson?.words.length ?? 0);
  const total = lesson ? readingSteps + lesson.exercises.length : 1;
  const done = phase === 'vocab' ? vi : phase === 'quiz' ? readingSteps + qi : total;
  const navLink = (l: { id: string; month?: number; locked?: boolean }, fallbackMonth: number) => isMonthLocked(l.month ?? fallbackMonth, am, l.locked) ? (m: number) => { setDlg(m); } : null;
  const NextIcon = lang === 'ar' ? ChevronLeft : ChevronRight;
  const PrevIcon = lang === 'ar' ? ChevronRight : ChevronLeft;

  return (
    <Shell>
      {q.isLoading && <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-72" /></div>}
      {denied !== null && (
        <div className="mx-auto max-w-md py-10 text-center" data-testid="panel-month-locked">
          <Lock className="mx-auto mb-3 size-8 text-gold" />
          <p className="font-semibold">{t('هذا الدرس يحتاج دفعة موثّقة لشهره', 'This lesson needs a verified payment for its month')}</p>
          <Btn className="mt-4" variant="gold" onClick={() => setDlg(denied)} data-testid="button-open-month-lock">{t('التفاصيل', 'Details')}</Btn>
          <LinkBtn href="/learn" variant="outline" testId="link-locked-back">{t('العودة إلى الدروس', 'Back to lessons')}</LinkBtn>
        </div>
      )}
      {q.isError && denied === null && <ErrorState onRetry={() => q.refetch()} what={t('الدرس', 'the lesson')} />}
      {lesson && !redacted && (
        <div className="mx-auto max-w-2xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display truncate text-2xl font-extrabold">{lang === 'ar' ? lesson.titleAr : lesson.titleEn}</h1>
              <Am className="text-muted-foreground">{lesson.titleAm}</Am>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums" title={t('وقت التركيز الفعلي', 'Active focus time')} data-testid="text-timer">
              <Timer className="size-4 text-primary" />{mm}:{ss}
            </span>
          </div>
          <div className="mb-3"><FavouriteButton id={id} /></div>
          {pos && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" data-testid="lesson-position">
              <span data-testid="text-lesson-position">{lang === 'ar' ? pos.stage.titleAr : pos.stage.titleEn} · {t('الشهر', 'Month')} {pos.course.month} · {t('الأسبوع', 'Week')} {pos.week} · {t('الدرس', 'Lesson')} <bdi dir="ltr">{pos.index + 1} / {pos.total}</bdi></span>
              <span className="tabular-nums" data-testid="text-path-progress"><bdi dir="ltr">{pos.completed} / {pos.total}</bdi> {t('مكتمل', 'completed')} (<bdi dir="ltr">{pos.total ? Math.round(pos.completed / pos.total * 100) : 0}%</bdi>)</span>
            </div>
          )}
          {pos && (
            <div className="mb-4 flex justify-between gap-2 text-sm">
              {pos.previous && navLink(pos.previous, pos.course.month) ? <button type="button" onClick={() => setDlg((pos.previous as { month?: number }).month ?? pos.course.month)} data-testid="link-prev-lesson" className="press inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5"><Lock className="size-3.5" />{t('الدرس السابق', 'Previous lesson')}</button> : pos.previous ? <Link href={`/lesson/${pos.previous.id}`} data-testid="link-prev-lesson" className="press inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5"><PrevIcon className="size-4" />{t('الدرس السابق', 'Previous lesson')}</Link> : <span />}
              {pos.next && navLink(pos.next, pos.course.month) ? <button type="button" onClick={() => setDlg((pos.next as { month?: number }).month ?? pos.course.month)} data-testid="link-next-lesson-top" className="press inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5">{t('الدرس التالي', 'Next lesson')}<Lock className="size-3.5" /></button> : pos.next ? <Link href={`/lesson/${pos.next.id}`} data-testid="link-next-lesson-top" className="press inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5">{t('الدرس التالي', 'Next lesson')}<NextIcon className="size-4" /></Link> : <span />}
            </div>
          )}
          <ProgressBar value={(done / total) * 100} className="mb-6" />

          {phase === 'vocab' && (
            <div key={vi} className="rise">
              {vi === 0 && (
                <Card className="mb-4">
                  <p className="text-sm font-bold text-primary">{t('الهدف', 'Objective')}</p>
                  <p className="mt-1">{lesson.objective}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{lesson.explanation}</p>
                </Card>
              )}
              {lesson.dialogue?.length ? (
                <>
                  <ConversationCard key={lesson.id} turns={lesson.dialogue} />
                  <div className="mt-5 flex justify-end">
                    <Btn variant="gold" onClick={() => setPhase('quiz')} data-testid="button-start-quiz">{t('ابدأ التمارين', 'Start exercises')}</Btn>
                  </div>
                </>
              ) : <>
              {lesson.words[vi] && (
                <Card className="py-10 text-center" data-testid={`card-word-${lesson.words[vi].id}`}>
                  <p className="mb-3 text-xs text-muted-foreground"><bdi dir="ltr">{vi + 1} / {lesson.words.length}</bdi></p>
                  <Am className={cn('block break-words font-bold leading-relaxed text-primary', lesson.words[vi].amharic.length > 18 ? 'text-3xl sm:text-4xl' : 'text-6xl sm:text-7xl')}>{lesson.words[vi].amharic}</Am>
                  {showTr && <p className="pop mt-3 text-lg leading-loose text-muted-foreground" dir="rtl" lang="ar" data-testid="text-transliteration">{lesson.words[vi].transliteration}</p>}
                  <p className="font-display mt-5 text-3xl font-bold">{lesson.words[vi].arabic}</p>
                  <p className="text-muted-foreground" dir="ltr">{lesson.words[vi].english}</p>
                  <button type="button" onClick={toggleTr} aria-pressed={showTr} data-testid="button-toggle-transliteration" className="press mx-auto mt-5 flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm">
                    {showTr ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{showTr ? t('إخفاء النطق بالعربية', 'Hide Arabic pronunciation') : t('إظهار النطق بالعربية', 'Show Arabic pronunciation')}
                  </button>
                  {showTr && <PronunciationNote />}
                  <p className="mx-auto mt-4 w-fit rounded-full bg-gold/15 px-3 py-1 text-xs">{t('الصوت بانتظار تسجيلات مراجَعة', 'Audio awaiting reviewed recordings')}</p>
                </Card>
              )}
              <div className="mt-5 flex justify-between gap-3">
                <Btn variant="outline" disabled={vi === 0} onClick={() => setVi(vi - 1)} data-testid="button-prev"><PrevIcon className="size-4" />{t('السابق', 'Back')}</Btn>
                {vi + 1 < lesson.words.length ? (
                  <Btn onClick={() => setVi(vi + 1)} data-testid="button-next-word">{t('التالي', 'Next')}<NextIcon className="size-4" /></Btn>
                ) : (
                  <Btn variant="gold" onClick={() => (lesson.exercises.length ? setPhase('quiz') : submit([]))} data-testid="button-start-quiz">{t('ابدأ التمارين', 'Start exercises')}</Btn>
                )}
              </div>
              </>}
            </div>
          )}

          {phase === 'quiz' && lesson.exercises[qi] && (
            <div key={qi} className="rise">
              <p className="mb-2 text-sm text-muted-foreground">{t('تمرين', 'Exercise')} <bdi dir="ltr">{qi + 1} / {lesson.exercises.length}</bdi></p>
              <Card>
                <p className="font-display text-xl font-bold leading-relaxed" dir="auto">{lesson.exercises[qi].prompt}</p>
              </Card>
              <div className="mt-4 grid gap-2.5">
                {lesson.exercises[qi].options.map((o, i) => {
                  const chosen = answers[qi] === i;
                  const am = isEthiopic(o[0] ?? '');
                  return (
                    <button key={i} type="button" disabled={complete.isPending || answers[qi] !== undefined} onClick={() => pick(i)} data-testid={`button-option-${i}`}
                      className={cn('press rounded-2xl border-2 px-5 py-4 text-start text-lg font-medium', chosen ? 'pop border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
                      dir={am ? 'ltr' : 'auto'}>
                      {am ? <Am>{o}</Am> : o}
                    </button>
                  );
                })}
              </div>
              {complete.isPending && <p className="mt-4 text-center text-sm text-muted-foreground">{t('يصحّح الخادم إجاباتك...', 'The server is grading your answers...')}</p>}
              {complete.isError && monthRequiredFromError(complete.error) === null && (
                <div className="mt-4"><ErrorState what={t('النتيجة', 'the result')} onRetry={() => submit(answers)} /></div>
              )}
            </div>
          )}

          {phase === 'result' && result && (
            <div className="rise space-y-4" data-testid="panel-result">
              <div role="status" aria-live="polite" className="sr-only">{result.passed ? t('أحسنت، نجحت في الدرس', 'Well done, lesson passed') : t('لم تصل إلى حدّ النجاح بعد. يمكنك المحاولة مرة أخرى.', 'Not at the pass mark yet. You can try again.')}</div>
              <Card className={cn('pop text-center', result.passed ? 'border-primary' : 'border-destructive/50')}>
                <p className="font-display text-5xl font-extrabold" data-testid="text-score">{Math.round(result.score <= 1 ? result.score * 100 : result.score)}%</p>
                <p className="mt-2 text-lg font-semibold">{result.passed ? t('أحسنت، نجحت في الدرس', 'Well done, lesson passed') : t('لم تصل إلى حدّ النجاح بعد', 'Not at the pass mark yet')}</p>
                {result.passed ? <p className="mt-1 text-sm text-primary">+{result.xpEarned} XP</p> : <p className="mt-1 text-sm text-muted-foreground">{t('الخطأ جزء من التعلّم. راجع الشرح أدناه ثم أعد المحاولة.', 'Mistakes are part of learning. Read the notes below, then try again.')}</p>}
              </Card>
              {result.feedback.map((f, i) => {
                const ex = lesson.exercises[i];
                return (
                  <Card key={i} className={cn('flex gap-3', f.correct ? 'border-primary/40' : 'border-destructive/40')} data-testid={`feedback-${i}`}>
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', f.correct ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground')}>
                      {f.correct ? <Check className="size-4" /> : <X className="size-4" />}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold" dir="auto">{ex?.prompt}</p>
                      {!f.correct && ex && (
                        <p className="mt-1 text-muted-foreground">{t('إجابتك: ', 'Your answer: ')}<span dir="auto">{ex.options[answers[i]]}</span></p>
                      )}
                      <p className="mt-1">{t('الصحيح: ', 'Correct: ')}<span className="font-semibold" dir="auto">{ex?.options[f.correctIndex]}</span></p>
                      <p className="mt-1 text-muted-foreground" dir="auto">{f.explanation}</p>
                    </div>
                  </Card>
                );
              })}
              <div className="flex flex-wrap gap-3">
                {result.passed && pos?.next && !navLink(pos.next, pos.course.month) && <LinkBtn href={`/lesson/${pos.next.id}`} variant="gold" size="lg" testId="link-next-lesson">{t('الدرس التالي', 'Next lesson')}<NextIcon className="size-4" /></LinkBtn>}
                {!result.passed && <Btn size="lg" onClick={retry} data-testid="button-retry-lesson"><RotateCw className="size-4" />{t('أعد المحاولة', 'Try again')}</Btn>}
                <LinkBtn href="/learn" variant="outline" testId="link-back-learn">{t('العودة إلى الدروس', 'Back to lessons')}</LinkBtn>
                {result.passed && <LinkBtn href="/review" variant="outline" testId="link-to-review">{t('راجع الكلمات', 'Review words')}</LinkBtn>}
              </div>
            </div>
          )}
          <PilotNote className="mt-8" />
        </div>
      )}
      <CourseMonthDialog month={dlg ?? (denied !== null && !dismissed ? denied : null)} onClose={() => { setDlg(null); setDismissed(true); }} />
    </Shell>
  );
}
