import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProfileQueryKey, getGetStudyReminderStatusQueryKey, getGetStudyReminderDeviceQueryKey,
  useGetStudyReminderStatus, useSaveStudyReminderSettings, useGetStudyReminderDevice,
} from '@workspace/api-client-react';
import { Btn } from '@/components/bits';
import { useApp } from '@/lib/app';
import { studyPushBinding, enableStudyPush, disableStudyPush, studyPushLimitation } from '@/lib/study-push';

export function StudyReminderSettings({ isGuest }: { isGuest?: boolean }) {
  const { userId } = useAuth();
  const { t } = useApp();
  if (isGuest || !userId) return <p className="border-t border-border pt-4 text-sm text-muted-foreground" data-testid="text-reminder-guest">{t('سجّل الدخول لتفعيل تذكيرات الدراسة المرتبطة بجدولك.', 'Sign in to turn on study reminders tied to your schedule.')}</p>;
  return <Inner key={userId} userId={userId} />;
}

function Inner({ userId }: { userId: string }) {
  const { t } = useApp();
  const qc = useQueryClient();
  const key = [...getGetStudyReminderStatusQueryKey(), userId];
  const status = useGetStudyReminderStatus({ query: { queryKey: key, refetchInterval: 45_000, refetchOnWindowFocus: true } });
  const s = status.data;
  const [draft, setDraft] = useState<{ enabled: boolean; time: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useSaveStudyReminderSettings({
    mutation: {
      onSuccess: (next) => {
        qc.setQueryData(key, next);
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        qc.invalidateQueries({ queryKey: getGetStudyReminderStatusQueryKey() });
        setDraft(null); setSaved(true);
      },
    },
  });
  const binding = studyPushBinding();
  const deviceKey = [...getGetStudyReminderDeviceQueryKey(binding.id), userId];
  const device = useGetStudyReminderDevice(binding.id, { query: { queryKey: deviceKey, refetchOnWindowFocus: true } });
  const [busy, setBusy] = useState(false);
  const [pushErr, setPushErr] = useState(false);
  const limit = studyPushLimitation();
  const d = device.data;
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const deviceOn = !!d && d.enabled && d.state === 'enabled' && binding.consent && binding.owner === userId && permission === 'granted';
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setPushErr(false);
    try { await fn(); await device.refetch(); } catch { setPushErr(true); } finally { setBusy(false); }
  };

  const cur = draft ?? { enabled: s?.enabled ?? false, time: s?.time ?? '19:00' };
  const blocked = !!s && (!s.scheduled || s.paused);
  const reason = s?.paused ? t('الجدول متوقف مؤقتًا، لذا لن تصل تذكيرات حتى تستأنفه.', 'Your schedule is paused, so reminders wait until you resume it.')
    : s && !s.scheduled ? t('احفظ تاريخ بداية وأيام دراسة أولًا؛ التذكيرات تتبع جدولك.', 'Save a start date and study days first; reminders follow your schedule.') : null;
  const last = d?.lastResult;
  const lastText = last === 'accepted' ? t('قبلت خدمة الإشعارات آخر رسالة، وهذا لا يعني أن الجهاز استلمها.', 'The push provider accepted the last message; that does not mean the device received it.')
    : last === 'confirmed' ? t('أكّد هذا الجهاز استلام آخر تذكير.', 'This device confirmed the last reminder.')
    : last === 'failed' ? t('فشل آخر إرسال.', 'The last send failed.')
    : last === 'unknown' ? t('نتيجة آخر إرسال غير معروفة.', 'The last send result is unknown.') : null;
  const inp = 'mt-1 min-h-11 rounded-xl border border-input bg-background px-3 py-2';

  if (status.isLoading) return <div className="skel h-24" aria-hidden />;
  if (status.isError || !s) return <div role="alert" className="border-t border-border pt-4 text-sm">{t('تعذّر تحميل التذكيرات.', 'Could not load reminders.')} <Btn variant="outline" size="sm" onClick={() => status.refetch()}>{t('إعادة المحاولة', 'Retry')}</Btn></div>;

  return (
    <section className="space-y-4 border-t border-border pt-4" data-testid="study-reminder-settings">
      <h3 className="font-bold">{t('تذكيرات الدراسة', 'Study reminders')}</h3>
      <p className="text-sm text-muted-foreground">{t('تذكير في أيام دراستك ووقتك المختار، حسب المنطقة الزمنية للجدول. يظهر داخل التطبيق عند فتحه، ويمكنك تفعيل إشعارات الخلفية لهذا الجهاز أدناه.', 'A reminder on your study days at your chosen time, using your schedule timezone. See it when you open the app, or enable background notifications for this device below.')}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="size-5" disabled={blocked && !cur.enabled} checked={cur.enabled} onChange={e => { setSaved(false); setDraft({ ...cur, enabled: e.target.checked }); }} data-testid="checkbox-study-reminder" />
        {t('ذكّرني حسب جدولي', 'Remind me on my schedule')}
      </label>
      <label className="block text-sm font-semibold">{t('الوقت', 'Time')}
        <input type="time" dir="ltr" required value={cur.time} onChange={e => { setSaved(false); setDraft({ ...cur, time: e.target.value }); }} className={`${inp} block`} data-testid="input-study-reminder-time" />
      </label>
      <p className="text-xs text-muted-foreground" dir="ltr">{s.timezone}</p>
      {reason && <p className="text-sm" data-testid="text-reminder-disabled-reason">{reason}</p>}
      {draft && <div className="flex flex-wrap gap-3">
        <Btn disabled={save.isPending || !cur.time} onClick={() => save.mutate({ data: cur })} data-testid="button-save-study-reminder">{save.isPending ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ التذكير', 'Save reminder')}</Btn>
        <Btn variant="ghost" disabled={save.isPending} onClick={() => setDraft(null)}>{t('إلغاء', 'Cancel')}</Btn>
      </div>}
      <p role="status" className="text-sm">{saved && t('تم الحفظ.', 'Saved.')}{!draft && s.enabled && s.nextDate && ` ${t('التذكير القادم: ', 'Next reminder: ')}${s.nextDate}`}</p>
      {save.isError && <p role="alert" className="text-sm text-destructive">{t('لم يُحفظ التذكير. حاول مرة أخرى.', 'Reminder was not saved. Try again.')}</p>}

      <div className="space-y-3 rounded-2xl border border-border p-4" data-testid="study-push-device">
        <h4 className="text-sm font-bold">{t('إشعارات الخلفية على هذا الجهاز', 'Background notifications on this device')}</h4>
        <p className="text-xs text-muted-foreground">{t('قد تتأخر الإشعارات أو لا تصل بسبب الاتصال أو إعدادات الهاتف. يمكنك دائمًا متابعة جدولك داخل التطبيق.', 'Notifications may be delayed or missed because of connectivity or phone settings. Your schedule is always available in the app.')}</p>
        {limit ? <p className="text-sm">{limit}</p>
          : device.isError ? <p role="alert" className="text-sm">{t('تعذّر قراءة حالة الجهاز.', 'Could not read device status.')} <button type="button" className="underline" onClick={() => device.refetch()}>{t('إعادة المحاولة', 'Retry')}</button></p>
          : d && !d.webConfigured ? <p className="text-sm">{t('إعداد الإشعارات الخلفية لم يكتمل بعد. التذكيرات داخل التطبيق تعمل.', 'Background setup is not complete yet. In-app reminders work.')}</p>
          : <>
            <p className="text-sm text-muted-foreground">{deviceOn ? t('مفعّلة على هذا الجهاز.', 'On for this device.') : permission === 'denied' ? t('الإشعارات محظورة في إعدادات المتصفح.', 'Notifications are blocked in browser settings.') : t('غير مفعّلة. بالضغط على تفعيل ستطلب نافذة المتصفح إذنك.', 'Off. Tapping Enable will ask your browser for permission.')}</p>
            {deviceOn ? <Btn variant="outline" disabled={busy} onClick={() => run(disableStudyPush)} data-testid="button-disable-study-push">{t('إيقاف على هذا الجهاز', 'Disable on this device')}</Btn>
              : <Btn disabled={busy || !d?.publicKey || !s.enabled || blocked} onClick={() => run(() => enableStudyPush(userId, d!.publicKey!))} data-testid="button-enable-study-push">{busy ? t('جارٍ التفعيل…', 'Enabling…') : t('تفعيل على هذا الجهاز', 'Enable on this device')}</Btn>}
            {!s.enabled && !deviceOn && <p className="text-xs text-muted-foreground">{t('فعّل التذكير واحفظه أولًا.', 'Turn on and save the reminder first.')}</p>}
            {lastText && <p className="text-xs text-muted-foreground">{lastText}</p>}
          </>}
        {pushErr && <p role="alert" className="text-sm text-destructive">{t('لم يكتمل الإجراء. حاول مرة أخرى.', 'That did not complete. Try again.')}</p>}
      </div>
    </section>
  );
}
