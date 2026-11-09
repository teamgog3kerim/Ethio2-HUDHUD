import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import {
  getGetStudyReminderStatusQueryKey, useActOnStudyReminder, useGetStudyReminderStatus,
} from '@workspace/api-client-react';
import { useApp } from '@/lib/app';

export function StudyReminderNotice() {
  const { t } = useApp();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [failed, setFailed] = useState(false);
  const key = [...getGetStudyReminderStatusQueryKey(), userId];
  const status = useGetStudyReminderStatus({ query: { queryKey: key, enabled: !!userId, refetchInterval: 45_000, refetchOnWindowFocus: true } });
  const act = useActOnStudyReminder({
    mutation: {
      onSuccess: (next) => { setFailed(false); qc.setQueryData(key, next); },
      onError: () => setFailed(true),
    },
  });
  const s = status.data;
  if (!userId || !s || !s.due || !s.occurrenceKey) return null;
  const occurrenceKey = s.occurrenceKey;
  const run = (action: 'dismiss' | 'snooze') => { setFailed(false); act.mutate({ data: { occurrenceKey, action } }); };
  const b = 'press inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold';
  return (
    <div className="mb-4 rounded-2xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm" data-testid="study-reminder-notice" role="status">
      <p className="flex items-center gap-2 font-semibold"><BellRing className="size-4 shrink-0" />{t('حان وقت دراستك. خطوة صغيرة اليوم تكفي.', 'Time to study. One small step today is enough.')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={s.actionHref} onClick={() => { if (!act.isPending) run('dismiss'); }} className={`${b} bg-primary text-primary-foreground`} data-testid="link-study-reminder-start">{t('ابدأ أو تابع', 'Start or continue')}</Link>
        <button type="button" disabled={act.isPending} onClick={() => run('snooze')} className={`${b} border border-input bg-card disabled:opacity-50`} data-testid="button-study-reminder-snooze">{t('أجّل 10 دقائق', 'Snooze 10 minutes')}</button>
        <button type="button" disabled={act.isPending} onClick={() => run('dismiss')} className={`${b} hover:bg-muted disabled:opacity-50`} data-testid="button-study-reminder-dismiss">{t('تجاهل لليوم', 'Dismiss for today')}</button>
      </div>
      {failed && <p role="alert" className="mt-2 text-destructive">{t('تعذّر حفظ اختيارك. يمكنك الدراسة الآن وإعادة المحاولة.', 'Could not save your choice. You can still study and try again.')}</p>}
    </div>
  );
}
