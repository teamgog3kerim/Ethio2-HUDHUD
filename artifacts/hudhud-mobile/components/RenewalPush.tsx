import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@/utils/auth";
import { getReminderDevice, type ReminderDeviceStatus } from "@workspace/api-client-react";
import { Action, Txt } from "./LearningUI";
import { disableNativeRenewalPush, nativePushProject, nativeRenewalBinding, syncNativeRenewalPush, retryNativeRenewalRevocations } from "@/utils/renewal-push";

export function NativeRenewalBoundary() {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!isLoaded || Platform.OS === "web") return;
    let cancelled = false;
    const refresh = async () => {
      const b = await nativeRenewalBinding();
      if (cancelled) return;
      if (b.owner && b.owner !== userId) await disableNativeRenewalPush(true);
      else if (userId && b.consent && b.owner === userId) await syncNativeRenewalPush(userId, false);
      await retryNativeRenewalRevocations();
    };
    void refresh().catch(() => {});
    const sub = AppState.addEventListener("change", state => { if (state === "active") void refresh().catch(() => {}); });
    return () => { cancelled = true; sub.remove(); };
  }, [userId, isLoaded]);
  return null;
}

export function NativeRenewalSettings() {
  const { userId } = useAuth();
  return userId ? <Settings key={userId} userId={userId} /> : <Txt>سجّل الدخول لتفعيل تذكيرات الوصول على هذا الجهاز.</Txt>;
}
function Settings({ userId }: { userId: string }) {
  const [status, setStatus] = useState<ReminderDeviceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const supported = Platform.OS !== "web" && !!nativePushProject() && Constants.appOwnership !== "expo";
  const load = async () => {
    const b = await nativeRenewalBinding();
    const result = await getReminderDevice(b.id);
    if (alive.current) setStatus(result);
  };
  useEffect(() => {
    alive.current = true;
    const refresh = () => { void load().catch(() => { if (alive.current) setError("تعذر التحقق من حالة التسليم."); }); };
    refresh();
    const sub = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const timer = setInterval(refresh, 60_000);
    return () => { alive.current = false; sub.remove(); clearInterval(timer); };
  }, []);
  const toggle = async () => {
    setBusy(true); setError("");
    try {
      if (status?.enabled) await disableNativeRenewalPush();
      else await syncNativeRenewalPush(userId, true);
      await load();
    } catch {
      const b = await nativeRenewalBinding();
      if (alive.current) setError(b.pending.length
        ? "أُوقفت التنبيهات محليًا؛ إلغاء تسجيل الخادم ينتظر الاتصال ويُعاد عند العودة للتطبيق."
        : "تعذر تفعيل الإشعارات أو تحديثها. تحقق من الاتصال وإذن الإشعارات في إعدادات الجهاز. التذكيرات داخل التطبيق مستمرة.");
    }
    finally { if (alive.current) setBusy(false); }
  };
  return <>
    <Txt>تذكيرات الوصول والتجديد في الخلفية اختيارية، قبل الموعد الموثّق بأربعة أيام. قد يؤخرها نظام الجهاز؛ تبقى تنبيهات التطبيق متاحة.</Txt>
    <Txt accessibilityLiveRegion="polite">{!supported
      ? "تحتاج إشعارات الخلفية إلى نسخة أصلية مهيّأة بمعرّف مشروع Expo وإعدادات Apple/Android Push؛ لا تعمل في Expo Go أو معاينة الويب."
      : !status ? "جارٍ التحقق من حالة التسليم…"
      : status.enabled ? status.nextAt ? `مفعّلة. الموعد: ${new Date(status.nextAt).toLocaleString("ar")}` : "مفعّلة؛ لا يوجد موعد جديد موثّق ينتظر الإرسال."
      : "إشعارات الخلفية متوقفة على هذا الجهاز."}</Txt>
    {status?.lastResult && <Txt>آخر محاولة: {({
      sending: "قيد الإرسال؛ لا تأكيد وصول",
      accepted: "قبلها المزوّد؛ وصول الجهاز غير مؤكد",
      confirmed: "مرّرها المزوّد لنظام الجهاز؛ القراءة غير مؤكدة",
      failed: "فشلت؛ راجع التنبيه داخل التطبيق",
      unknown: "النتيجة غير معروفة؛ لن نكرر الإرسال تلقائيًا لتجنب التكرار",
    })[status.lastResult]}</Txt>}
    <Action title={busy ? "جارٍ التحديث…" : status?.enabled ? "إيقاف إشعارات الخلفية" : "تفعيل إشعارات الخلفية"} secondary disabled={busy || !status || (!supported && !status.enabled)} onPress={() => void toggle()} />
    {!!error && <Txt accessibilityRole="alert">{error}</Txt>}
    {!!error && Platform.OS !== "web" && <Action title="فتح إعدادات الجهاز" secondary onPress={() => { void Linking.openSettings().catch(() => setError("تعذر فتح الإعدادات. افتح إعدادات الإشعارات يدويًا.")); }} />}
  </>;
}
