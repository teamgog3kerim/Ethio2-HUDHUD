import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, BookOpenCheck, Repeat, Sprout } from 'lucide-react';
import { useGetCourseCatalog } from '@workspace/api-client-react';
import { Am, ErrorState, LinkBtn, Skeleton } from '@/components/bits';
import { Brand, Footer, Toggles } from '@/components/shell';
import { useApp } from '@/lib/app';
import { FIDEL_FAMILIES, fidelForms } from '@/lib/options';
import { CoursePlans } from '@/components/course-plans';
import { PronunciationNote } from '@/components/pronunciation-note';

export default function Landing() {
  const { t, lang } = useApp();
  const courses = useGetCourseCatalog();
  const [fam, setFam] = useState(7);
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div className="grain min-h-[100dvh] bg-background">
      <section className="relative overflow-hidden bg-deep text-[hsl(75_30%_96%)]">
        <div aria-hidden className="am pointer-events-none absolute -top-10 end-[-2rem] select-none text-[22rem] font-extrabold leading-none text-white/[0.05] sm:text-[34rem]">ሁ</div>
        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="text-white [&_.text-muted-foreground]:text-white/60"><Brand /></div>
          <div className="flex items-center gap-2 [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white">
            <Toggles />
            <Link href="/sign-in" data-testid="link-signin" className="press rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10">{t('دخول', 'Login')}</Link>
          </div>
        </header>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-8 sm:pt-16">
          <p className="rise mb-4 inline-block rounded-full border border-gold/50 px-4 py-1 text-xs font-semibold tracking-wider text-gold">
            {t('رفيقك الشخصي لتعلّم الأمهرية', 'A personal Amharic companion for Arabic speakers')}
          </p>
          <h1 className="rise font-display max-w-3xl text-4xl font-extrabold leading-[1.25] sm:text-6xl sm:leading-[1.2]" style={{ animationDelay: '.08s' }}>
            {t('تعلّم الأمهرية ', 'Learn Amharic ')}
            <span className="text-gold">{t('حرفًا حرفًا', 'one letter at a time')}</span>
          </h1>
          <p className="rise mt-5 max-w-xl text-lg leading-relaxed text-white/75" style={{ animationDelay: '.16s' }}>
            {t('ابدأ من الفيدل — أحرف الأمهرية — ثم انتقل إلى كلمات وجمل تستعملها فعلًا، مع مراجعة متباعدة وخطة لستة أشهر.', 'Start from Fidel, the Amharic script, then move to words and phrases you will actually use — with spaced review and a six-month plan.')}
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '.24s' }}>
            <a href="#course-plans" className="press inline-flex items-center rounded-2xl border border-white/30 px-5 py-3 font-semibold text-white hover:bg-white/10" data-testid="link-home-plans">{t('عرض الخطط', 'View plans')}</a>
            <LinkBtn href="/sign-up?plan=trial" variant="gold" size="lg" testId="button-signup">
              {t('ابدأ 48 ساعة مجانًا', 'Start 48 free hours')} <Arrow className="size-5" />
            </LinkBtn>
          </div>
          <p className="mt-3 text-sm text-white/60">{t('أنشئ حسابًا باسمك واسم مستخدم وكلمة مرور، وابدأ فورًا دون بطاقة.', 'Create an account with your name, username, and password. No card needed.')}</p>
        </div>
      </section>

      <section className="mx-auto -mt-8 max-w-6xl px-4 sm:px-8">
        <div className="rise rounded-[2rem] border border-border bg-card p-5 shadow-xl shadow-deep/10 sm:p-8" data-testid="panel-fidel-preview">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">{t('الفيدل: كل حرف له سبع صور', 'Fidel: every letter has seven forms')}</h2>
            <span className="text-sm text-muted-foreground">{t('اضغط على عائلة حروف', 'Tap a letter family')}</span>
          </div>
          <div className="mb-5 flex flex-wrap gap-1.5" dir="ltr">
            {FIDEL_FAMILIES.map((f, i) => (
              <button key={f.base} type="button" onClick={() => setFam(i)} data-testid={`button-family-${i}`}
                className={`am press size-11 rounded-xl border text-xl ${i === fam ? 'border-gold bg-gold text-gold-foreground' : 'border-border bg-background'}`}>
                {String.fromCodePoint(f.base)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2" dir="ltr" key={fam}>
            {fidelForms(FIDEL_FAMILIES[fam].base).map((c, i) => (
              <div key={c.ch} className="pop rounded-2xl bg-secondary py-3 text-center" style={{ animationDelay: `${i * 40}ms` }}>
                <Am className="block text-3xl font-semibold text-primary sm:text-5xl">{c.ch}</Am>
                <span className="block text-sm text-muted-foreground" dir="rtl" lang="ar">{c.pronunciation}</span>
              </div>
            ))}
          </div>
          <PronunciationNote />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="font-display text-3xl font-extrabold leading-snug">{t('دروس صغيرة، مراجعة متكررة', 'Small lessons, repeated review')}</h2>
            <p className="mt-3 text-muted-foreground">{t('الخطة 180 يومًا من الدروس والمراجعة المتكررة، وليست وعدًا بإتقان سريع.', 'The plan is 180 days of lessons and repeated review — not a promise of fast fluency.')}</p>
          </div>
          <ol className="space-y-3">
            {[
              { i: Sprout, a: 'تعلّم الكلمات', e: 'Learn the words', da: 'بطاقات بالأمهرية والمعنى بالعربية والنطق بالحروف العربية.', de: 'Cards with Amharic, Arabic meanings and Arabic-script pronunciation.' },
              { i: BookOpenCheck, a: 'تمارين يصحّحها الخادم', e: 'Server-graded exercises', da: 'تحصل على التصحيح والشرح، وتعيد المحاولة إن لم تنجح.', de: 'You get grading and explanations, and retry if you miss.' },
              { i: Repeat, a: 'مراجعة متباعدة', e: 'Spaced review', da: 'الكلمات التي نسيتها تعود مبكرًا، والتي تتقنها تتباعد.', de: 'Forgotten words return sooner; known ones space out.' },
            ].map((s, n) => (
              <li key={n} className="rise flex gap-4 rounded-3xl border border-border bg-card p-5" style={{ animationDelay: `${n * 80}ms`, marginInlineStart: `${n * 14}px` }}>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><s.i className="size-6" /></span>
                <div><p className="font-display font-bold">{t(s.a, s.e)}</p><p className="text-sm text-muted-foreground">{t(s.da, s.de)}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-secondary/60 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t('المقررات الحالية', 'Current courses')}</h2>
          </div>
          {courses.isLoading && <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
          {courses.isError && <ErrorState what={t('المقررات', 'courses')} onRetry={() => courses.refetch()} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.data?.map((c, i) => (
              <Link key={c.id} href="/sign-up?plan=trial" data-testid={`card-course-${c.id}`} className="lift rise block rounded-3xl border border-border bg-card p-5" style={{ animationDelay: `${i * 60}ms` }}>
                <p className="text-xs font-bold text-primary">{t('الشهر', 'Month')} {c.month}</p>
                <p className="font-display mt-1 font-bold">{lang === 'ar' ? c.titleAr : c.titleEn}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8"><CoursePlans /></div>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-8">
        <h2 className="font-display text-3xl font-extrabold">{t('ابدأ بحرف واحد اليوم', 'Begin with one letter today')}</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkBtn href="/sign-up?plan=trial" size="lg" testId="button-signup-2">{t('ابدأ 48 ساعة مجانًا', 'Start 48 free hours')}</LinkBtn>
          <LinkBtn href="/sign-in" variant="ghost" size="lg" testId="button-signin-2">{t('تسجيل الدخول', 'Log in')}</LinkBtn>
        </div>
      </section>
      <Footer />
    </div>
  );
}
