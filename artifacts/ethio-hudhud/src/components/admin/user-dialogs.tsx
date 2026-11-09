import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteAdminUser, useSetAdminUserAccess, useUpdateAdminUser, type AdminUser } from '@workspace/api-client-react';
import { Btn } from '@/components/bits';
import { Field, Modal, Notice, fieldCls } from '@/components/admin/ui';
import { useApp } from '@/lib/app';
import { errMsg, invalidateAdmin } from '@/lib/admin';

type Props = { user: AdminUser; viewerRole: 'owner' | 'admin'; isSelf: boolean; onClose: () => void; onDone: (m: string) => void };

export function EditDialog({ user, viewerRole, isSelf, onClose, onDone }: Props) {
  const { t } = useApp();
  const qc = useQueryClient();
  const [name, setName] = useState(user.displayName);
  const [goal, setGoal] = useState(user.dailyGoal);
  const [role, setRole] = useState<'admin' | 'learner'>(user.role === 'admin' ? 'admin' : 'learner');
  const [susp, setSusp] = useState(user.suspended);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const m = useUpdateAdminUser({
    mutation: {
      onSuccess: () => { invalidateAdmin(qc, 'users'); onDone(t('تم تحديث الحساب.', 'Account updated.')); onClose(); },
      onError: (e) => setErr(errMsg(e, t('تعذّر التحديث.', 'Update failed.'))),
    },
  });
  const submit = () => {
    setErr('');
    if (!name.trim() || name.length > 80) return setErr(t('الاسم مطلوب (حتى 80 حرفًا).', 'Name is required (max 80 characters).'));
    if (!(goal >= 5 && goal <= 180)) return setErr(t('الهدف اليومي بين 5 و180.', 'Daily goal must be 5 to 180.'));
    if (reason.trim().length < 3) return setErr(t('اكتب سببًا (3 أحرف على الأقل).', 'Enter a reason (at least 3 characters).'));
    const data: { displayName?: string; dailyGoal?: number; role?: 'admin' | 'learner'; suspended?: boolean; reason: string } = { reason: reason.trim() };
    if (name.trim() !== user.displayName) data.displayName = name.trim();
    if (goal !== user.dailyGoal) data.dailyGoal = goal;
    if (viewerRole === 'owner' && user.role !== 'owner' && role !== user.role) data.role = role;
    if (!isSelf && susp !== user.suspended) data.suspended = susp;
    m.mutate({ id: user.id, data });
  };
  return (
    <Modal title={t('تعديل الحساب', 'Edit account')} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="text-sm text-muted-foreground" dir="ltr">@{user.username}</p>
        <Field label={t('الاسم', 'Display name')}><input className={fieldCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="input-user-name" /></Field>
        <Field label={t('الهدف اليومي (دقيقة)', 'Daily goal (minutes)')}><input type="number" min={5} max={180} className={fieldCls} value={goal} onChange={(e) => setGoal(Number(e.target.value))} data-testid="input-user-goal" /></Field>
        <Field label={t('الدور', 'Role')} hint={viewerRole === 'owner' ? undefined : t('المالك وحده يغيّر الأدوار.', 'Only the owner can change roles.')}>
          <select className={fieldCls} value={role} disabled={viewerRole !== 'owner' || user.role === 'owner'} onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'learner')} data-testid="select-user-role">
            <option value="learner">{t('متعلّم', 'Learner')}</option>
            <option value="admin">{t('مدير', 'Admin')}</option>
          </select>
        </Field>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-[hsl(var(--primary))]" checked={susp} disabled={isSelf} onChange={(e) => setSusp(e.target.checked)} data-testid="toggle-user-suspended" />
          {t('إيقاف الحساب', 'Suspend account')}{isSelf && <span className="text-xs font-normal text-muted-foreground"> ({t('لا يمكنك إيقاف نفسك', 'you cannot suspend yourself')})</span>}
        </label>
        <Field label={t('السبب (يُسجَّل في السجل)', 'Reason (recorded in audit log)')}><textarea rows={2} maxLength={500} className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-user-reason" /></Field>
        {err && <Notice kind="err">{err}</Notice>}
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>{t('إلغاء', 'Cancel')}</Btn><Btn type="submit" disabled={m.isPending} data-testid="button-user-save">{m.isPending ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}</Btn></div>
      </form>
    </Modal>
  );
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AccessDialog({ user, onClose, onDone }: Props) {
  const { t } = useApp();
  const qc = useQueryClient();
  const has = user.accessPlan === 'complimentary';
  const [exp, setExp] = useState(user.accessExpiresAt ? toLocalInput(new Date(user.accessExpiresAt)) : '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const m = useSetAdminUserAccess({
    mutation: {
      onSuccess: () => { invalidateAdmin(qc, 'users'); onDone(t('تم تحديث الوصول المجاني.', 'Complimentary access updated.')); onClose(); },
      onError: (e) => setErr(errMsg(e, t('تعذّر التحديث.', 'Update failed.'))),
    },
  });
  const run = (enabled: boolean) => {
    setErr('');
    if (reason.trim().length < 3) return setErr(t('اكتب سببًا (3 أحرف على الأقل).', 'Enter a reason (at least 3 characters).'));
    let expiresAt: string | null = null;
    if (enabled) {
      const d = new Date(exp);
      if (!exp || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return setErr(t('اختر تاريخ انتهاء في المستقبل.', 'Choose an expiry date in the future.'));
      if (d.getTime() > Date.now() + 366 * 86400000) return setErr(t('الحد الأقصى للمنحة 366 يومًا.', 'Maximum grant length is 366 days.'));
      expiresAt = d.toISOString();
    }
    m.mutate({ id: user.id, data: { enabled, expiresAt, reason: reason.trim() } });
  };
  return (
    <Modal title={t('وصول مجاني من الإدارة', 'Complimentary access')} onClose={onClose}>
      <div className="space-y-4">
        <Notice kind="info">{t('هذه منحة من الإدارة بتاريخ انتهاء، وليست اشتراكًا مدفوعًا ولا تتضمن أي معاملة مالية.', 'This is an administrator grant with an expiry date. It is not a paid subscription and involves no payment.')}</Notice>
        <Field label={t('ينتهي في', 'Expires at')} hint={t('حتى 366 يومًا من الآن', 'Up to 366 days from now')}><input type="datetime-local" className={fieldCls} value={exp} onChange={(e) => setExp(e.target.value)} data-testid="input-access-expiry" /></Field>
        <Field label={t('السبب', 'Reason')}><textarea rows={2} maxLength={500} className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-access-reason" /></Field>
        {err && <Notice kind="err">{err}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>{t('إلغاء', 'Cancel')}</Btn>
          {has && <Btn variant="danger" disabled={m.isPending} onClick={() => run(false)} data-testid="button-access-revoke">{t('إلغاء المنحة', 'Revoke grant')}</Btn>}
          <Btn disabled={m.isPending} onClick={() => run(true)} data-testid="button-access-grant">{has ? t('تحديث المنحة', 'Update grant') : t('منح الوصول', 'Grant access')}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function DeleteDialog({ user, onClose, onDone }: Props) {
  const { t } = useApp();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const m = useDeleteAdminUser({
    mutation: {
      onSuccess: () => { invalidateAdmin(qc, 'users'); onDone(t('تم حذف الحساب نهائيًا.', 'Account permanently deleted.')); onClose(); },
      onError: (e) => setErr(errMsg(e, t('تعذّر الحذف.', 'Deletion failed.'))),
    },
  });
  const ok = username.trim().toLowerCase() === user.username.toLowerCase() && reason.trim().length >= 3;
  return (
    <Modal title={t('حذف الحساب نهائيًا', 'Permanently delete account')} onClose={onClose} tone="danger">
      <div className="space-y-4">
        <Notice kind="err">{t('تحذير: الحذف نهائي ولا يمكن التراجع عنه. تُمحى بيانات هذا المستخدم وتقدّمه.', 'Warning: deletion is permanent and cannot be undone. This user\'s data and progress will be erased.')}</Notice>
        <Field label={t('اكتب اسم المستخدم بالضبط للتأكيد', 'Type the exact username to confirm')} hint={`@${user.username}`}>
          <input dir="ltr" className={fieldCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" data-testid="input-delete-username" />
        </Field>
        <Field label={t('السبب', 'Reason')}><textarea rows={2} maxLength={500} className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-delete-reason" /></Field>
        {err && <Notice kind="err">{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>{t('إلغاء', 'Cancel')}</Btn>
          <Btn variant="danger" disabled={!ok || m.isPending} onClick={() => m.mutate({ id: user.id, data: { confirmationUsername: username.trim(), reason: reason.trim() } })} data-testid="button-delete-confirm">{m.isPending ? t('جارٍ الحذف…', 'Deleting…') : t('حذف نهائي', 'Delete permanently')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
