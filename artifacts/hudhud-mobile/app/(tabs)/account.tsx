import { useState } from "react";
import { Alert, Platform, Share, Switch, TextInput, View } from "react-native";
import { useAuth, useAuthActions } from "@/utils/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useGetProfile, useSaveProfile, useClearChat, useDeleteAccount, exportAccount, type Profile } from "@workspace/api-client-react";
import * as Notifications from "expo-notifications";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Action, Card, Failure, Loading, Txt, styles } from "@/components/LearningUI";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { router } from "expo-router";
import { SessionActions } from "@/components/SessionActions";
import { CourseAccess } from "@/components/CourseAccess";
import { InviteFriend } from "@/components/InviteFriend";
import { cancelStudyNotifications } from "@/utils/renewal-push";
export default function Account() {
  const query = useGetProfile();
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <Failure retry={query.refetch} />;
  return <Preferences key={query.data.id} profile={query.data} />;
}
function Preferences({ profile }: { profile: Profile }) {
  const c = useColors(); const inset = useSafeAreaInsets(); const qc = useQueryClient();
  const { signOut } = useAuthActions(); const { userId } = useAuth();
  const save = useSaveProfile(); const clear = useClearChat(); const remove = useDeleteAccount();
  const [form, setForm] = useState(profile);
  const [notice, setNotice] = useState("");
  const updateReminder = async (enabled: boolean) => {
    try {
      if (Platform.OS === "web") { setNotice("التذكيرات المحلية متاحة على الجهاز الأصلي فقط."); return; }
      if (!enabled) { await cancelStudyNotifications(); setForm(p => ({ ...p, reminderEnabled: false })); return; }
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form.reminderTime)) { setNotice("اكتب الوقت مثل 19:00."); return; }
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") { setNotice("لم تمنح إذن الإشعارات. يمكنك تفعيله من إعدادات الجهاز."); return; }
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("daily-study", { name: "تذكير التعلّم", importance: Notifications.AndroidImportance.DEFAULT });
      await cancelStudyNotifications();
      const [hour, minute] = form.reminderTime.split(":").map(Number);
      await Notifications.scheduleNotificationAsync({ identifier: `study:${profile.id}`, content: { title: "حان وقت الأمهرية", body: "درسك اليومي ينتظرك. واصل رحلتك مع هدهد.", data: { type: "study" } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: hour!, minute: minute!, channelId: "daily-study" } });
      setForm(p => ({ ...p, reminderEnabled: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
      setNotice("تم ضبط التذكير حسب الوقت المحلي لجهازك. احفظ التفضيلات.");
    } catch { setNotice("تعذر جدولة التذكير على هذا الجهاز."); }
  };
  const deleteData = () => Alert.alert("حذف بيانات التعلّم", "سيُحذف التقدم والمحادثات والتفضيلات نهائياً. سيبقى حساب تسجيل الدخول منفصلاً.", [
    { text: "إلغاء", style: "cancel" },
    { text: "حذف نهائي", style: "destructive", onPress: () => remove.mutate(undefined, { onSuccess: async () => { qc.clear(); await signOut(); router.replace("/welcome"); } }) },
  ]);
  return <KeyboardAwareScrollViewCompat style={{ backgroundColor: c.background, flex: 1 }} contentContainerStyle={{ padding: 22, gap: 18, paddingTop: Platform.OS === "web" ? 82 : inset.top + 20, paddingBottom: 130 }} bottomOffset={40} keyboardShouldPersistTaps="handled">
    <Txt style={styles.heading}>رحلتك، على طريقتك</Txt>
    <SessionActions />
    <CourseAccess />
    <InviteFriend />
    <Card><Txt>الاسم</Txt><TextInput accessibilityLabel="الاسم" value={form.displayName} onChangeText={displayName => setForm(p => ({ ...p, displayName }))} style={{ padding: 14, borderRadius: c.radius, backgroundColor: c.background, color: c.foreground, textAlign: "right" }} />
      <Txt>المستوى</Txt>{(["beginner", "intermediate", "advanced"] as const).map((level, i) => <Action key={level} secondary={form.level !== level} title={["مبتدئ", "متوسط", "متقدم"][i]!} onPress={() => setForm(p => ({ ...p, level }))} />)}
      <Txt>هدفك اليومي</Txt><View style={{ flexDirection: "row", gap: 10 }}>{[15, 30, 60].map(dailyGoal => <Action key={dailyGoal} title={`${dailyGoal} دقيقة`} secondary={form.dailyGoal !== dailyGoal} onPress={() => setForm(p => ({ ...p, dailyGoal }))} />)}</View>
      <Txt>هدف التعلّم</Txt>{[{ id: "conversation", label: "المحادثة اليومية" }, { id: "travel", label: "السفر إلى إثيوبيا" }, { id: "work", label: "العمل والأعمال" }, { id: "reading", label: "قراءة وكتابة الفيدل" }].map(goal => <Action key={goal.id} title={goal.label} secondary={!form.goals.includes(goal.id)} onPress={() => setForm(p => ({ ...p, goals: p.goals.includes(goal.id) ? p.goals.filter(g => g !== goal.id) : [...p.goals, goal.id] }))} />)}
    </Card>
    <Card><Txt>تذكير محلي حسب توقيت جهازك</Txt><TextInput accessibilityLabel="وقت التذكير" value={form.reminderTime} onChangeText={reminderTime => setForm(p => ({ ...p, reminderTime, reminderEnabled: false }))} placeholder="19:00" style={{ color: c.foreground, padding: 14, backgroundColor: c.background, borderRadius: c.radius }} /><Switch accessibilityLabel="تفعيل التذكير" value={form.reminderEnabled} onValueChange={v => void updateReminder(v)} /><Txt style={{ color: c.mutedForeground, fontSize: 12 }}>{form.timezone} · إذا سافرت، أعد تفعيل التذكير لضبط التوقيت.</Txt></Card>
    <Card><Txt>الاحتفاظ بالمحادثات</Txt><Switch accessibilityLabel="الاحتفاظ بالمحادثات" value={form.retainChat} onValueChange={retainChat => setForm(p => ({ ...p, retainChat }))} /><Txt>تعطيل الاحتفاظ وحفظ التفضيلات يحذف المحادثات المخزّنة. الرسائل تُرسل إلى مزوّد الذكاء الاصطناعي للمعالجة.</Txt></Card>
    {!!notice && <Txt style={{ color: c.primary }}>{notice}</Txt>}
    {save.isError && <Txt style={{ color: c.destructive }}>تعذر حفظ التفضيلات.</Txt>}
    <Action title={save.isPending ? "جارٍ الحفظ…" : "احفظ وابدأ التعلّم"} disabled={save.isPending || !form.displayName.trim()} icon="check" onPress={() => {
      if (!form.reminderEnabled && Platform.OS !== "web") void cancelStudyNotifications().catch(() => setNotice("تعذر إيقاف تذكير الدراسة."));
      save.mutate({ data: { ...form, onboardingComplete: true } }, { onSuccess: () => { void qc.invalidateQueries(); setNotice("تم حفظ تفضيلاتك."); } });
    }} />
    <Action title="تصدير بياناتي" secondary onPress={() => { void exportAccount().then(data => Share.share({ message: JSON.stringify(data, null, 2) })).catch(() => setNotice("تعذر تصدير البيانات.")); }} />
    <Action title="حذف المحادثات" secondary onPress={() => Alert.alert("حذف المحادثات", "هل تريد حذف سجل المعلّم؟", [{ text: "إلغاء" }, { text: "حذف", style: "destructive", onPress: () => clear.mutate(undefined, { onSuccess: () => { void qc.invalidateQueries(); setNotice("حُذفت المحادثات."); } }) }])} />
    <Txt style={{ fontSize: 12, color: c.mutedForeground }}>الاشتراك: مجاني. Premium والصوت غير مفعّلين. لا يتم تحصيل رسوم.</Txt>
    {!!userId && <Action title="حذف بيانات التعلّم نهائياً" secondary onPress={deleteData} />}
  </KeyboardAwareScrollViewCompat>;
}
