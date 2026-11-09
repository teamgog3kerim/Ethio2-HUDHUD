import { useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuthActions } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useApp } from '@/lib/app';
import { cn } from '@/lib/utils';
import { disableRenewalPush } from '@/lib/renewal-push';
import { disableStudyPush, setStudyPushIdentity } from '@/lib/study-push';

export function SignOutAction({ className, children, testId = 'button-signout' }: { className?: string; children?: ReactNode; testId?: string }) {
  const { t } = useApp();
  const { signOut } = useAuthActions();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      await qc.cancelQueries();
      setStudyPushIdentity(null);
      await disableStudyPush(false, true);
      await disableRenewalPush(false, true);
      await signOut();
      qc.clear();
      setOpen(false);
      nav('/', { replace: true });
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) setFailed(false); } }}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={className ?? 'press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'}
        >
          {children ?? (<><LogOut className="size-4" /> {t('تسجيل الخروج', 'Sign out')}</>)}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%_-_2rem)] max-w-md rounded-3xl border-border bg-card p-6">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle className="font-display text-xl font-extrabold">{t('تسجيل الخروج من حسابك؟', 'Sign out of your account?')}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {t('سيبقى تقدّمك ومفضّلاتك محفوظة في حسابك ولن تُحذف. يمكنك العودة بتسجيل الدخول في أي وقت.', 'Your progress and favourites stay saved in your account and are not deleted. Sign back in any time.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-signout-error">{t('تعذّر تسجيل الخروج. حاول مرة أخرى.', 'Could not sign out. Please try again.')}</p>}
        <AlertDialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={pending} className="mt-0 h-11 rounded-2xl border border-input bg-card px-5 text-sm font-semibold" data-testid="button-signout-cancel">{t('إلغاء', 'Cancel')}</AlertDialogCancel>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            aria-busy={pending}
            data-testid="button-signout-confirm"
            className={cn('press inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-destructive px-5 text-sm font-semibold text-destructive-foreground disabled:opacity-60')}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {pending ? t('جارٍ الخروج...', 'Signing out...') : failed ? t('إعادة المحاولة', 'Retry') : t('تسجيل الخروج', 'Sign out')}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
