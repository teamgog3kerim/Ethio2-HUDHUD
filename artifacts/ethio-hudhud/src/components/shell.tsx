import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, BookOpen, CalendarRange, Home, Languages, Layers, LogIn, UserPlus, MessageCircle,
  Menu, Moon, ShieldCheck, Sparkles, Sun, UserRound, Type,
} from 'lucide-react';
import {
  getGetProfileQueryKey, useGetAdminAccess, useGetProfile, useSaveProfile, useGetPublicSettings,
} from '@workspace/api-client-react';
import { BillingNotice } from '@/components/billing-notice';
import { StudyReminderNotice } from '@/components/study-reminder-notice';
import { PlatformNotices } from '@/components/admin/notices';
import { SignOutAction } from '@/components/sign-out';
import { Logo } from '@/components/logo';
import { useApp } from '@/lib/app';
import { toInput } from '@/lib/options';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function Toggles({ className }: { className?: string }) {
  const { lang, setLang, dark, toggleDark, t } = useApp();
  const { data: profile } = useGetProfile();
  const qc = useQueryClient();
  const save = useSaveProfile({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetProfileQueryKey() }) },
  });
  const flip = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    if (profile) save.mutate({ data: { ...toInput(profile), language: next } });
  };
  const cls = 'press grid size-11 place-items-center rounded-xl border border-border bg-card text-foreground';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button type="button" onClick={flip} className={cn(cls, 'w-auto gap-1.5 px-3 text-sm font-semibold')} data-testid="button-lang" aria-label={t('تبديل اللغة', 'Switch language')}>
        <span className="flex items-center gap-1.5"><Languages className="size-4" />{lang === 'ar' ? 'EN' : 'عربي'}</span>
      </button>
      <button type="button" onClick={toggleDark} className={cls} data-testid="button-theme" aria-label={t('الوضع الداكن', 'Dark mode')}>
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </div>
  );
}

export function Brand({ size = 40 }: { size?: number }) {
  const { t } = useApp();
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-brand">
      <Logo size={size} />
      <span className="leading-none">
        <span className="font-display block text-lg font-extrabold tracking-wide">HUDHUD</span>
        <span className="am block text-[11px] text-muted-foreground">{t('هدهد · ሁድሁድ', 'Ethio · ሁድሁድ')}</span>
      </span>
    </Link>
  );
}

export function AuthButtons() {
  const { t } = useApp();
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <SignOutAction />;
  const cls = 'press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted';
  return (
    <>
      <Link href="/sign-in" data-testid="link-signin" className={cls}><LogIn className="size-4" /> {t('تسجيل الدخول', 'Sign in')}</Link>
      <Link href="/sign-up" data-testid="link-signup-shell" className={cn(cls, 'font-semibold text-primary')}><UserPlus className="size-4" /> {t('إنشاء حساب', 'Create account')}</Link>
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useApp();
  const [loc] = useLocation();
  const { data: profile } = useGetProfile();
  const { data: access } = useGetAdminAccess();
  const { isSignedIn } = useAuth();
  const isAdmin = access?.signedIn && (access.role === 'owner' || access.role === 'admin');
  const items = [
    { href: '/dashboard', icon: Home, label: t('الرئيسية', 'Home') },
    { href: '/learn', icon: BookOpen, label: t('الدروس', 'Learn') },
    { href: '/fidel', icon: Type, label: t('الفيدل', 'Fidel') },
    { href: '/review', icon: Layers, label: t('المراجعة', 'Review') },
    { href: '/tutor', icon: MessageCircle, label: t('المعلّم', 'Tutor') },
    { href: '/plan', icon: CalendarRange, label: t('الخطة', 'Plan') },
    { href: '/progress', icon: BarChart3, label: t('التقدّم', 'Progress') },
  ];
  const active = (h: string) => loc === h || loc.startsWith(h + '/');
  const [more, setMore] = useState(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMore(false); }, [loc]);
  const coreHrefs = ['/dashboard', '/fidel', '/learn', '/plan'];
  const core = coreHrefs.flatMap((href) => items.filter((i) => i.href === href));
  const rest = [
    ...items.filter((i) => !coreHrefs.includes(i.href)),
    { href: '/premium', icon: Sparkles, label: t('الاشتراك والفوترة', 'Subscription & billing') },
    { href: '/account', icon: UserRound, label: t('الحساب', 'Account') },
    ...(isAdmin ? [{ href: '/admin', icon: ShieldCheck, label: t('الإدارة', 'Administration') }] : []),
  ];
  const moreActive = rest.some((i) => active(i.href));
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground">{t('تخطَّ إلى المحتوى', 'Skip to content')}</a>
      <aside data-testid="desktop-sidebar" className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-border bg-card/70 p-4 backdrop-blur shell-desktop:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              data-testid={`nav-${i.href.slice(1)}`}
              className={cn(
                'press flex items-center gap-3 rounded-2xl px-4 py-3 font-medium',
                active(i.href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-current={active(i.href) ? 'page' : undefined}
            >
              <i.icon className="size-5" /> {i.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border pt-4">
          <Link href="/account" data-testid="nav-account" className={cn('press flex items-center gap-3 rounded-2xl px-4 py-3', active('/account') ? 'bg-secondary' : 'hover:bg-muted')}>
            <span className="grid size-9 place-items-center rounded-full bg-gold font-bold text-gold-foreground">
              {(profile?.displayName?.trim()[0] ?? '?').toUpperCase()}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-semibold">{profile?.displayName || t('ضيف', 'Guest')}</span>
              <span className="block text-xs text-muted-foreground">{profile?.isGuest ? t('جلسة ضيف', 'Guest session') : t('حسابي', 'My account')}</span>
            </span>
          </Link>
          {isAdmin && (
            <Link href="/admin" data-testid="nav-admin" className={cn('press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold', active('/admin') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted')}>
              <ShieldCheck className="size-4" /> {t('الإدارة', 'Administration')}
            </Link>
          )}
          <Link href="/premium" className="press flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted" data-testid="nav-premium">
            <Sparkles className="size-4" /> {t('الاشتراك والفوترة', 'Subscription & billing')}
          </Link>
          <AuthButtons />
          <Toggles />
        </div>
      </aside>

      <header data-testid="mobile-header" className="app-mobile-header sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur shell-desktop:hidden">
        <Brand size={34} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Toggles />
          {isAdmin && (
            <Link href="/admin" data-testid="nav-admin-mobile" className="press grid size-10 place-items-center rounded-xl border border-border bg-card" aria-label={t('الإدارة', 'Administration')}>
              <ShieldCheck className="size-4" />
            </Link>
          )}
          {!isSignedIn && (
            <Link href="/sign-in" data-testid="link-signin-mobile" className="press grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground" aria-label={t('تسجيل الدخول', 'Sign in')}>
              <LogIn className="size-4" />
            </Link>
          )}
          <Link href="/account" data-testid="nav-account-mobile" className="press grid size-10 place-items-center rounded-xl border border-border bg-card" aria-label={t('الحساب', 'Account')}>
            <UserRound className="size-4" />
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="app-content outline-none mx-auto min-w-0 w-full max-w-5xl pt-6 shell-desktop:ms-64 shell-desktop:w-[calc(100%_-_16rem)] shell-desktop:max-w-none shell-desktop:px-12 shell-desktop:pb-12 shell-desktop:pt-10">
        <div className="mx-auto min-w-0 max-w-5xl"><PlatformNotices /><BillingNotice /><StudyReminderNotice />{children}</div>
      </main>

      <nav data-testid="mobile-tabs" aria-label={t('التنقل الرئيسي', 'Main navigation')} className="app-mobile-tabs fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur shell-desktop:hidden">
        {core.map((i) => (
          <Link key={i.href} href={i.href} data-testid={`tab-${i.href.slice(1)}`} aria-current={active(i.href) ? 'page' : undefined} className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium', active(i.href) ? 'text-primary' : 'text-muted-foreground')}>
            <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', active(i.href) && 'bg-primary/15')}>
              <i.icon className="size-5" />
            </span>
            {i.label}
          </Link>
        ))}
        <button ref={moreTrigger} type="button" data-testid="tab-more" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)} className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium', moreActive ? 'text-primary' : 'text-muted-foreground')}>
          <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', moreActive && 'bg-primary/15')}><Menu className="size-5" /></span>
          {t('المزيد', 'More')}
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" data-testid="sheet-more" closeLabel={t('إغلاق', 'Close')} onCloseAutoFocus={(event) => { event.preventDefault(); moreTrigger.current?.focus(); }} className="max-h-[85dvh] overflow-y-auto rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="font-display">{t('المزيد', 'More')}</SheetTitle>
          <SheetDescription className="sr-only">{t('بقية صفحات التطبيق', 'The rest of the app')}</SheetDescription>
          <nav aria-label={t('المزيد', 'More')} className="mt-3 grid gap-1">
            {rest.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setMore(false)} data-testid={`tab-${i.href.slice(1)}`} aria-current={active(i.href) ? 'page' : undefined} className={cn('flex min-h-12 items-center gap-3 rounded-2xl px-4 font-medium', active(i.href) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                <i.icon className="size-5" /> {i.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PublicFrame({ children }: { children: ReactNode }) {
  const { t } = useApp();
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <Toggles />
          <Link href="/dashboard" className="press hidden rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground sm:block">{t('افتح التطبيق', 'Open app')}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-8">{children}</main>
      <Footer />
    </div>
  );
}

export function Footer() {
  const { t } = useApp();
  const settings = useGetPublicSettings();
  return (
    <footer className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
      <div className="mb-2 flex justify-center gap-5">
        <Link href="/privacy" className="hover:text-foreground" data-testid="link-privacy">{t('الخصوصية', 'Privacy')}</Link>
        <Link href="/terms" className="hover:text-foreground" data-testid="link-terms">{t('الشروط', 'Terms')}</Link>
        <Link href="/premium" className="hover:text-foreground" data-testid="link-premium">{t('الاشتراك والفوترة', 'Subscription & billing')}</Link>
        {settings.data?.supportEmail && <a href={`mailto:${settings.data.supportEmail}`} className="hover:text-foreground" data-testid="link-support">{t('الدعم', 'Support')}</a>}
      </div>
      <p>{t('تعلّم الأمهرية بالعربية مع هدهد.', 'Learn Amharic with HUDHUD.')}</p>
    </footer>
  );
}
