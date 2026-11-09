import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useGetAdminAccess, useGetAdminUsers, type AdminUser } from '@workspace/api-client-react';
import { Btn, Card, Empty, ErrorState, Skeleton } from '@/components/bits';
import { AdminLayout } from '@/components/admin/layout';
import { AccessDialog, DeleteDialog, EditDialog } from '@/components/admin/user-dialogs';
import { Notice, fieldCls } from '@/components/admin/ui';
import { useApp } from '@/lib/app';
import { fmtDate } from '@/lib/admin';

const STATES: Record<string, [string, string]> = {
  not_started: ['لم يبدأ', 'Not started'], trial: ['تجربة', 'Trial'], trial_expired: ['انتهت التجربة', 'Trial expired'],
  paid_monthly: ['شهري مسجّل', 'Monthly (recorded)'], paid_six_month: ['ستة أشهر مسجّلة', 'Six months (recorded)'],
  payment_pending: ['دفع معلّق', 'Payment pending'], paid_expired: ['انتهى الوصول المدفوع', 'Paid access ended'],
  refunded: ['مُسترد', 'Refunded'], complimentary: ['وصول مجاني', 'Complimentary'], suspended: ['موقوف', 'Suspended'], admin: ['إدارة', 'Admin'],
};

function BillingBlock({ u }: { u: AdminUser }) {
  const { t, lang } = useApp();
  const b = u;
  if (!b.billingState) return null;
  const st = STATES[b.billingState] ?? [b.billingState, b.billingState];
  const hist = b.billingHistory ?? [];
  const expiry = u.accessPlan !== 'free' ? u.accessExpiresAt : b.billingState === 'trial' || b.billingState === 'trial_expired' ? b.trialEndsAt ?? null : null;
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs" data-testid={`billing-${u.id}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold" data-testid={`billing-state-${u.id}`}>{t(st[0], st[1])}</span>
        <span>{t('الانتهاء', 'Expires')}: {fmtDate(expiry, lang)}</span>
        <span>{t('الدفعات الشهرية المسجّلة', 'Recorded monthly payments')}: {b.monthlyPaymentCount ?? 0}</span>
        {b.trialStartedAt && <span>{t('بدأت التجربة', 'Trial started')}: {fmtDate(b.trialStartedAt, lang)}</span>}
      </div>
      <p className="mt-1.5 text-muted-foreground">{t('هذه لقطات مسجّلة وليست تحققًا مباشرًا ولا إثباتًا لاستلام المال.', 'These are recorded snapshots, not live verification and not proof that money was received.')}
        {b.billingVerificationStale && <strong className="ms-1 text-destructive">{t('آخر تحقق قديم.', 'Verification is stale.')}</strong>}</p>
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary" data-testid={`billing-toggle-${u.id}`}>{t(`محاولات الدفع (${hist.length}) وآخر تحقق`, `Payment attempts (${hist.length}) and last verification`)}</summary>
        <p className="mb-2">{t('آخر تحقق', 'Last verified')}: {fmtDate(b.lastPaymentVerifiedAt ?? null, lang)}</p>
        {hist.length === 0 ? <p className="text-muted-foreground">{t('لا محاولات مسجّلة.', 'No attempts recorded.')}</p> : (
          <ul className="space-y-2">
            {hist.map((h) => (
              <li key={h.id} className="min-w-0 break-words rounded-lg bg-card p-2" data-testid={`billing-attempt-${h.id}`}>
                <p className="font-semibold">{h.plan === 'monthly' ? t('شهري', 'Monthly') : t('ستة أشهر', 'Six months')} · ${h.priceUsd} · {h.status}</p>
                <p className="text-muted-foreground">{t('أُنشئ', 'Created')}: {fmtDate(h.createdAt, lang)} · {t('تحقق', 'Verified')}: {fmtDate(h.verifiedAt, lang)}</p>
                <p className="text-muted-foreground">{t('الوصول', 'Access')}: {fmtDate(h.accessStartsAt, lang)} → {fmtDate(h.accessUntil ?? h.paidUntil, lang)}</p>
                {h.checkoutId && <p className="text-muted-foreground" dir="ltr">{h.checkoutId}</p>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

type Dlg = { kind: 'edit' | 'access' | 'delete'; user: AdminUser } | null;

function Body() {
  const { t, lang } = useApp();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [done, setDone] = useState('');
  const access = useGetAdminAccess();
  const { userId } = useAuth();
  const q = useGetAdminUsers({ ...(search ? { search } : {}), page });
  const viewer = access.data?.role === 'owner' ? 'owner' : 'admin';
  const roleLabel = (r: string) => (r === 'owner' ? t('مالك', 'Owner') : r === 'admin' ? t('مدير', 'Admin') : t('متعلّم', 'Learner'));
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / (q.data.pageSize || 25))) : 1;
  const close = () => setDlg(null);
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(input.trim()); }}>
        <input className={fieldCls} value={input} maxLength={100} onChange={(e) => setInput(e.target.value)} placeholder={t('ابحث بالاسم أو اسم المستخدم', 'Search by name or username')} data-testid="input-user-search" />
        <Btn type="submit" data-testid="button-user-search"><Search className="size-4" />{t('بحث', 'Search')}</Btn>
      </form>
      {done && <Notice kind="ok">{done}</Notice>}
      {q.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : q.isError || !q.data ? <ErrorState what={t('المستخدمين', 'users')} onRetry={() => void q.refetch()} />
        : q.data.users.length === 0 ? <Empty icon={<Users className="size-6" />} title={t('لا يوجد مستخدمون', 'No users found')} body={search ? t('جرّب بحثًا آخر.', 'Try a different search.') : undefined} />
        : (
          <ul className="space-y-2">
            {q.data.users.map((u) => {
              const self = !!userId && userId === u.id;
              const locked = u.role === 'owner';
              return (
                <li key={u.id} data-testid={`row-user-${u.id}`}>
                  <Card className="space-y-3 !p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{u.displayName}{self && <span className="ms-2 text-xs font-normal text-muted-foreground">({t('أنت', 'you')})</span>}</p>
                        <p className="truncate text-sm text-muted-foreground" dir="ltr">@{u.username}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                        <span className="rounded-full bg-secondary px-2.5 py-1">{roleLabel(u.role)}</span>
                        {u.suspended && <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-destructive">{t('موقوف', 'Suspended')}</span>}
                        {u.accessPlan === 'complimentary' && <span className="rounded-full bg-gold/20 px-2.5 py-1">{t('وصول مجاني', 'Complimentary')}</span>}
                        {(u.accessPlan === 'monthly' || u.accessPlan === 'six_month') && <span className="rounded-full bg-primary/10 px-2.5 py-1">{u.accessPlan === 'monthly' ? t('شهري مدفوع', 'Paid monthly') : t('ستة أشهر مدفوعة', 'Paid six months')}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('دروس', 'Lessons')}: {u.lessonsCompleted} · XP: {u.xp} · {t('الهدف', 'Goal')}: {u.dailyGoal} · {t('انضم', 'Joined')}: {fmtDate(u.createdAt, lang)} · {t('آخر دخول', 'Last sign-in')}: {fmtDate(u.lastSignInAt, lang)}
                      {u.accessPlan !== 'free' && ` · ${t('ينتهي', 'Expires')}: ${fmtDate(u.accessExpiresAt, lang)}`}
                    </p>
                    <BillingBlock u={u} />
                    {locked ? <p className="text-xs text-muted-foreground">{t('حساب المالك محميّ ولا يمكن إدارته هنا.', 'The owner account is protected and cannot be managed here.')}</p> : (
                      <div className="flex flex-wrap gap-2">
                        <Btn size="sm" variant="outline" onClick={() => setDlg({ kind: 'edit', user: u })} data-testid={`button-edit-${u.id}`}>{t('تعديل', 'Edit')}</Btn>
                        <Btn size="sm" variant="outline" onClick={() => setDlg({ kind: 'access', user: u })} data-testid={`button-access-${u.id}`}>{t('وصول مجاني', 'Complimentary access')}</Btn>
                        {!self && <Btn size="sm" variant="danger" onClick={() => setDlg({ kind: 'delete', user: u })} data-testid={`button-delete-${u.id}`}>{t('حذف', 'Delete')}</Btn>}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      {q.data && q.data.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground" data-testid="text-user-total">{q.data.total} {t('مستخدم', 'users')} · {t('صفحة', 'Page')} {page}/{pages}</span>
          <div className="flex gap-2">
            <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('السابق', 'Previous')} data-testid="button-prev-page"><ChevronRight className="size-4 ltr:rotate-180" /></Btn>
            <Btn size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('التالي', 'Next')} data-testid="button-next-page"><ChevronLeft className="size-4 ltr:rotate-180" /></Btn>
          </div>
        </div>
      )}
      {dlg && (() => {
        const p = { user: dlg.user, viewerRole: viewer as 'owner' | 'admin', isSelf: !!userId && userId === dlg.user.id, onClose: close, onDone: setDone };
        return dlg.kind === 'edit' ? <EditDialog {...p} /> : dlg.kind === 'access' ? <AccessDialog {...p} /> : <DeleteDialog {...p} />;
      })()}
    </div>
  );
}

export default function AdminUsers() {
  const { t } = useApp();
  return <AdminLayout title={t('المستخدمون', 'Users')} sub={t('25 مستخدمًا في كل صفحة. كل تغيير يُسجَّل مع سببه.', '25 users per page. Every change is logged with its reason.')}><Body /></AdminLayout>;
}
