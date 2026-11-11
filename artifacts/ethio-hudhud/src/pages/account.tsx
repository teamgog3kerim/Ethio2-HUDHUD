import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth, useAuthActions, useUser, changePassword } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  getGetProfileQueryKey, useDeleteAccount,
  useGetProfile, useSaveProfile, type ProfileInput,
} from '@workspace/api-client-react';
import { Btn, Card, ErrorState, PageHead, Skeleton } from '@/components/bits';
import { Shell } from '@/components/shell';
import { useToast } from '@/hooks/use-toast';
import { useApp } from '@/lib/app';
import { toInput } from '@/lib/options';
import { cn } from '@/lib/utils';
import { SignOutAction } from '@/components/sign-out';
import { PasswordInput } from '@/components/password-input';
import { AnalyticsPreference } from '@/components/analytics-preference';
import { VisitorAnalyticsPreference } from '@/components/visitor-analytics-preference';
import { InviteFriend } from '@/components/invite-friend';
import { StudyScheduleSettings } from '@/components/study-schedule';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Account() {
  const { t, setLang } = useApp();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, nav] = useLocation();
  const { isSignedIn } = useAuth();
  const { signOut } = useAuthActions();
  const { user } = useUser();
  const q = useGetProfile();
  const [f, setF] = useState<ProfileInput | null>(null);
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  useEffect(() => { if (q.data && !f) setF(toInput(q.data)); }, [q.data, f]);
  const set = (p: Partial<ProfileInput>) => setF((x) => (x ? { ...x, ...p } : x));

  const save = useSaveProfile({
    mutation: {
      onSuccess: (p) => {
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        setLang(p.language);
        toast({ title: t('تم حفظ الإعدادات', 'Settings saved') });
      },
    },
  });
  const del = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        qc.clear();
        if (isSignedIn) void signOut({ redirectUrl: basePath || '/' });
        else { nav('/'); qc.invalidateQueries(); }
      },
    },
  });

  const input = 'h-11 w-full rounded-2xl border border-input bg-background px-4 outline-none focus:border-primary';
  const word = t('احذف', 'DELETE');

  return (
    <Shell>
      <PageHead eyebrow={q.data?.isGuest ? t('جلسة ضيف', 'Guest session') : t('حسابي', 'My account')} title={t('الإعدادات', 'Settings')} right={<InviteFriend />} />
      {isSignedIn && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-4" data-testid="card-identity">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gold font-bold text-gold-foreground">{(user?.fullName?.[0] ?? '?').toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user?.fullName || user?.username || t('حسابي', 'My account')}</p>
              <p dir="ltr" className="truncate text-start text-sm text-muted-foreground">@{user?.username}</p>
            </div>
          </div>
          <SignOutAction testId="button-signout-account" className="press inline-flex h-11 items-center gap-2 rounded-2xl border border-input bg-card px-5 text-sm font-semibold" />
        </Card>
      )}
      <AnalyticsPreference />
      <VisitorAnalyticsPreference />
      {q.isLoading && <Skeleton className="h-96" />}
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {f && q.data && (
        <div className="space-y-5">
          {q.data.isGuest && (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-gold/60 bg-gold/10">
              <p className="max-w-md text-sm">{t('تقدّم الضيف مرتبط بهذا المتصفح ولا يُدمج تلقائياً مع الحساب. سجّل الدخول قبل بدء الدروس لحفظ التقدّم بين أجهزتك.', 'Guest progress stays in this browser and is not automatically merged. Sign in before studying to save progress across devices.')}</p>
              <div className="flex gap-2"><Link href="/sign-up" className="press rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="link-signup">{t('إنشاء حساب', 'Sign up')}</Link><Link href="/sign-in" className="press rounded-xl border border-input px-4 py-2 text-sm font-semibold" data-testid="link-signin-account">{t('دخول', 'Log in')}</Link></div>
            </Card>
          )}
          <Card className="space-y-4">
            <label className="block text-sm font-semibold">{t('الاسم', 'Name')}<input className={cn(input, 'mt-1.5')} value={f.displayName} maxLength={80} onChange={(e) => set({ displayName: e.target.value })} data-testid="input-name" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">{t('المستوى', 'Level')}
                <select className={cn(input, 'mt-1.5')} value={f.level} onChange={(e) => set({ level: e.target.value as ProfileInput['level'] })} data-testid="select-level">
                  <option value="beginner">{t('مبتدئ', 'Beginner')}</option><option value="intermediate">{t('متوسط', 'Intermediate')}</option><option value="advanced">{t('متقدّم', 'Advanced')}</option>
                </select></label>
              <label className="block text-sm font-semibold">{t('اللغة', 'Language')}
                <select className={cn(input, 'mt-1.5')} value={f.language} onChange={(e) => set({ language: e.target.value as ProfileInput['language'] })} data-testid="select-language">
                  <option value="ar">العربية</option><option value="en">English</option>
                </select></label>
              <label className="block text-sm font-semibold">{t('دقائق يوميًا', 'Daily minutes')}<input type="number" min={5} max={180} className={cn(input, 'mt-1.5')} value={f.dailyGoal} onChange={(e) => set({ dailyGoal: Math.min(180, Math.max(5, Number(e.target.value) || 5)) })} data-testid="input-minutes" /></label>
            </div>
            <label className="flex items-center justify-between rounded-2xl border border-border p-3 text-sm font-semibold">{t('حفظ سجل المعلّم', 'Keep tutor chat history')}
              <input type="checkbox" className="size-5 accent-[hsl(var(--primary))]" checked={f.retainChat} onChange={(e) => set({ retainChat: e.target.checked })} data-testid="switch-retain" /></label>
            <Btn disabled={save.isPending || !f.displayName.trim()} onClick={() => save.mutate({ data: {
              ...toInput(q.data),
              displayName: f.displayName, level: f.level, language: f.language,
              dailyGoal: f.dailyGoal, retainChat: f.retainChat,
            } })} data-testid="button-save-profile">{save.isPending ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save changes')}</Btn>
            {save.isError && <p className="text-sm text-destructive">{t('تعذّر الحفظ.', 'Could not save.')}</p>}
          </Card>

          <StudyScheduleSettings />

          {isSignedIn && (
            <Card>
              <h2 className="font-display mb-3 font-bold">{t('تغيير كلمة المرور', 'Change password')}</h2>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={async event => {
                event.preventDefault(); setPasswordMessage(''); setPasswordBusy(true);
                try {
                  await changePassword(currentPassword, newPassword);
                  setCurrentPassword(''); setNewPassword('');
                  setPasswordMessage(t('تم تغيير كلمة المرور وتحديث جلسات الدخول.', 'Password changed and sessions refreshed.'));
                } catch (error) {
                  setPasswordMessage(error instanceof Error ? error.message : t('تعذّر تغيير كلمة المرور.', 'Could not change password.'));
                } finally { setPasswordBusy(false); }
              }}>
                <div>
                  <label htmlFor="current-password" className="block text-sm font-semibold">{t('كلمة المرور الحالية', 'Current password')}</label>
                  <PasswordInput id="current-password" autoComplete="current-password" className={input} value={currentPassword} required maxLength={128} onChange={event => setCurrentPassword(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="new-password" className="block text-sm font-semibold">{t('كلمة المرور الجديدة', 'New password')}</label>
                  <PasswordInput id="new-password" autoComplete="new-password" className={input} value={newPassword} required minLength={6} maxLength={128} onChange={event => setNewPassword(event.target.value)} />
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{t('6 أحرف على الأقل.', 'At least 6 characters.')}</span>
                </div>
                <div className="sm:col-span-2">
                  <Btn type="submit" disabled={passwordBusy || newPassword.length < 6}>{passwordBusy ? t('جارٍ التحديث…', 'Updating…') : t('حفظ كلمة المرور', 'Save password')}</Btn>
                  {passwordMessage && <p role="status" className="mt-2 text-sm">{passwordMessage}</p>}
                </div>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">{t('لا يوجد استرداد ذاتي لكلمة المرور دون بريد إلكتروني. احفظ بيانات الدخول في مكان آمن.', 'Without email, there is no self-service password recovery. Keep your sign-in details somewhere safe.')}</p>
            </Card>
          )}

          <Card className="border-destructive/40">
            <h2 className="font-display mb-1 font-bold text-destructive">{t('حذف بيانات التعلّم', 'Delete learning data')}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t('يحذف التقدّم والمحادثات والتفضيلات فقط. يبقى حساب تسجيل الدخول محفوظًا.', 'Deletes learning progress, chats, and preferences only. Your sign-in account remains active.')}</p>
            <p className="mb-3 text-sm text-muted-foreground">{t(`لا يمكن التراجع. اكتب "${word}" للتأكيد.`, `This cannot be undone. Type "${word}" to confirm.`)}</p>
            <div className="flex flex-wrap gap-2">
              <input className={cn(input, 'max-w-48')} value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="input-confirm-delete" />
              <Btn variant="danger" disabled={confirm !== word || del.isPending} onClick={() => del.mutate()} data-testid="button-delete-account"><Trash2 className="size-4" />{t('احذف نهائيًا', 'Delete permanently')}</Btn>
            </div>
            {del.isError && <p className="mt-2 text-sm text-destructive">{t('تعذّر الحذف.', 'Deletion failed.')}</p>}
          </Card>
        </div>
      )}
    </Shell>
  );
}
