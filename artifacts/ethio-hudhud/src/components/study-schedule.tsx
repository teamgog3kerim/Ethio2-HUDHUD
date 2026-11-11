import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProfileQueryKey, getGetStudyPlanQueryKey, getGetProgressQueryKey, getGetStudyReminderStatusQueryKey,
  useGetProfile, useSaveStudySchedule, type Profile, type StudyScheduleInput,
} from '@workspace/api-client-react';
import { Btn, Card, ErrorState, Skeleton } from '@/components/bits';
import { StudyReminderSettings } from '@/components/study-reminder-settings';
import { useApp } from '@/lib/app';

export function StudyScheduleSettings() {
  const { t } = useApp();
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey(), staleTime: 0 } });
  if (profile.isLoading) return <Skeleton className="mb-5 h-40" />;
  if (profile.isError) return <ErrorState onRetry={() => profile.refetch()} what={t('إعدادات الجدول', 'schedule settings')} />;
  if (!profile.data) return null;
  return <ScheduleForm key={`${profile.data.id}:${profile.data.timezone}:${JSON.stringify(profile.data.studySchedule)}`} profile={profile.data} />;
}

function ScheduleForm({ profile }: { profile: Profile }) {
  const { t } = useApp();
  const qc = useQueryClient();
  const schedule = profile.studySchedule;
  const [startDate, setStartDate] = useState(schedule?.startDate ?? '');
  const [studyDays, setStudyDays] = useState(schedule?.studyDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fallbackTimezone = browserTimezone || 'UTC';
  const [timezone, setTimezone] = useState(profile.timezone || fallbackTimezone);
  const timezones = Array.from(new Set([
    profile.timezone,
    browserTimezone,
    'Africa/Addis_Ababa', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'America/New_York',
    ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []),
  ])).filter((zone): zone is string => typeof zone === 'string' && zone.length > 0);
  const [saved, setSaved] = useState(false);
  const save = useSaveStudySchedule({
    mutation: {
      onSuccess: (updated) => {
        qc.setQueryData(getGetProfileQueryKey(), updated);
        qc.invalidateQueries({ queryKey: getGetStudyReminderStatusQueryKey() });
        qc.invalidateQueries({ queryKey: getGetStudyPlanQueryKey() });
        qc.invalidateQueries({ queryKey: getGetProgressQueryKey() });
        setSaved(true);
      },
    },
  });
  const submit = (data: StudyScheduleInput) => { setSaved(false); save.mutate({ data }); };
  const inputClass = 'mt-1 w-full rounded-xl border border-input bg-background px-3 py-2';
  const dayLabels = [
    t('الأحد', 'Sun'), t('الاثنين', 'Mon'), t('الثلاثاء', 'Tue'), t('الأربعاء', 'Wed'),
    t('الخميس', 'Thu'), t('الجمعة', 'Fri'), t('السبت', 'Sat'),
  ];
  return (
    <Card className="mb-5 space-y-4">
      <h2 className="font-bold">{t('جدول اختياري', 'Optional schedule')}</h2>
      <p className="text-sm text-muted-foreground">
        {t('وزّع 180 نشاطًا على أيام الدراسة خلال 180 يومًا تقويميًا؛ قد يجتمع أكثر من نشاط في اليوم. المواعيد اقتراحات وليست مقياسًا لتقدمك أو ضمانًا للطلاقة. لا يفعّل هذا أي إشعارات.',
          'Spread 180 activities over your study days within 180 calendar days; a day may have several activities. Dates are suggestions, not progress or a fluency guarantee. This does not enable notifications.')}
      </p>
      {profile.isGuest && <p className="text-sm">{t('يُحفظ جدول الزائر في هذا المتصفح فقط. سجّل الدخول لحفظ جدول مستقل لحسابك عبر الأجهزة.', 'Guest schedules belong to this browser. Sign in to save a separate account schedule across devices.')}</p>}
      <form onSubmit={e => { e.preventDefault(); submit({ startDate, studyDays, timezone, paused: !!schedule?.pausedOn }); }} className="space-y-4">
        <fieldset disabled={save.isPending} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{t('تاريخ البداية', 'Start date')}
              <input type="date" required min="1900-01-01" max="2100-12-31" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm font-semibold">{t('المنطقة الزمنية', 'Timezone')}
              <select required value={timezone} onChange={e => setTimezone(e.target.value)} dir="ltr" className={inputClass} data-testid="select-study-timezone">
                {timezones.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('أيام الدراسة (اختر يومًا واحدًا على الأقل)', 'Study days (choose at least one)')}</legend>
            <div className="flex flex-wrap gap-3">
              {dayLabels.map((label, day) => <label key={day} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <input type="checkbox" checked={studyDays.includes(day)} onChange={e => setStudyDays(days => e.target.checked ? [...days, day] : days.filter(d => d !== day))} />
                {label}
              </label>)}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">{t('تغيير التاريخ أو الأيام يعيد توزيع الاقتراحات فقط. الإيقاف والاستئناف يستخدمان الإعدادات المحفوظة، ويؤجّل الاستئناف الجدول بمدة التوقف. تبقى الدروس المكتملة وتواريخها كما هي.',
            'Changing the date or weekdays redistributes suggestions only. Pause and resume use saved settings; resuming shifts suggestions by the paused days. Completed lessons and their completion dates stay unchanged.')}</p>
          <div className="flex flex-wrap gap-3">
            <Btn type="submit" disabled={!startDate || studyDays.length === 0 || save.isPending}>
              {save.isPending ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الجدول', 'Save schedule')}
            </Btn>
            {schedule && <Btn variant="outline" onClick={() => submit({ startDate: schedule.startDate, studyDays: schedule.studyDays, timezone: profile.timezone, paused: !schedule.pausedOn })}>
              {schedule.pausedOn ? t('استئناف الجدول', 'Resume schedule') : t('إيقاف الجدول مؤقتًا', 'Pause schedule')}
            </Btn>}
            {schedule && <Btn variant="ghost" onClick={() => submit({ startDate: null, studyDays: schedule.studyDays, timezone: profile.timezone, paused: false })}>
              {t('متابعة دون تواريخ', 'Continue without dates')}
            </Btn>}
          </div>
        </fieldset>
      </form>
      <p role="status" className="text-sm">
        {schedule?.pausedOn ? t('الجدول متوقف مؤقتًا. يمكنك الدراسة بحرية دون تغيير الاقتراحات.', 'Schedule paused. You can still study freely.')
          : schedule ? t('الجدول محفوظ وفعّال.', 'Schedule saved and active.') : t('مسار ذاتي دون تواريخ.', 'Undated, self-paced path.')}
        {saved && ` ${t('تم الحفظ.', 'Saved.')}`}
      </p>
      <StudyReminderSettings isGuest={profile.isGuest} />
      {save.isError && <p role="alert" className="text-sm text-destructive">{t('لم يُحفظ الجدول. تحقّق من التاريخ والمنطقة الزمنية واتصالك ثم أعد المحاولة.', 'Schedule was not saved. Check the date, timezone and connection, then try again.')}</p>}
    </Card>
  );
}
