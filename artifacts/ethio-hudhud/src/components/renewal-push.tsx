import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useGetReminderDevice, saveReminderDevice } from "@workspace/api-client-react";
import { disableRenewalPush, renewalBinding, saveRenewalBinding, webPushLimitation, workerBinding, withRenewalLock, retryWebRenewalRevocations, flushWebRenewalRevocations } from "@/lib/renewal-push";
import { useApp } from "@/lib/app";

export function RenewalIdentityBoundary() {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    const b = renewalBinding();
    if (b.owner && b.owner !== userId) void disableRenewalPush(false).catch(() => {});
    const retry = () => { void retryWebRenewalRevocations().catch(() => {}); };
    retry();
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => { window.removeEventListener("focus", retry); window.removeEventListener("online", retry); };
  }, [userId, isLoaded]);
  return null;
}

export function RenewalPushSettings() {
  const { userId } = useAuth();
  // Scope all state to this identity. No guest consent or automatic transfer.
  return userId ? <SignedInRenewalSettings key={userId} userId={userId} /> : null;
}
function SignedInRenewalSettings({ userId }: { userId: string }) {
  const { t } = useApp();
  const [location] = useLocation();
  const [binding] = useState(renewalBinding);
  const q = useGetReminderDevice(binding.id, { query: { queryKey: ["renewal-device", userId, binding.id], refetchOnWindowFocus: true, refetchInterval: 60_000 } });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const limitation = webPushLimitation();
  const sync = (request: boolean) => withRenewalLock(async () => {
    if (!alive.current) return;
    await flushWebRenewalRevocations();
    if (!q.data?.webConfigured || limitation) throw new Error("unavailable");
    if (request && Notification.permission !== "granted") await Notification.requestPermission();
    if (Notification.permission !== "granted") throw new Error("permission");
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    if (!registration?.active) throw new Error("worker");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const key = q.data.publicKey!;
      const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    }
    if (!alive.current) { await subscription.unsubscribe(); return; }
    const json = subscription.toJSON();
    const current = renewalBinding();
    const saved = await saveReminderDevice(binding.id, { expectedUserId: userId, revocationToken: current.revocationToken, channel: "web", address: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    // Persist the receipt/capability even if this identity unmounted in-flight.
    saveRenewalBinding({ ...renewalBinding(), owner: userId, consent: true, bindingKey: saved.bindingKey });
    if (!alive.current) { await subscription.unsubscribe(); return; }
    if (!saved.bindingKey) throw new Error("Missing account binding");
    await workerBinding(saved.bindingKey);
    if (!alive.current) { await workerBinding(null); await subscription.unsubscribe(); return; }
    saveRenewalBinding({ ...renewalBinding(), owner: userId, consent: true, bindingKey: saved.bindingKey });
    await q.refetch();
  });
  // Refresh token/permission/timezone on return, never ask permission implicitly.
  useEffect(() => {
    if (!q.data?.webConfigured) return;
    const refresh = () => {
      const b = renewalBinding();
      if (b.owner !== userId || !b.consent) return;
      if ("Notification" in window && Notification.permission !== "granted") {
        void disableRenewalPush().then(() => q.refetch()).catch(() => setMessage(t("تعذر تحديث إيقاف الإشعارات. التنبيهات داخل التطبيق مستمرة.", "Could not update notification cancellation. In-app alerts remain available.")));
      } else void sync(false).catch(() => setMessage(t("تعذر تحديث تسجيل الجهاز؛ تحقق من الاتصال والإذن.", "Could not refresh this device; check connection and permission.")));
    };
    window.addEventListener("focus", refresh);
    refresh();
    return () => window.removeEventListener("focus", refresh);
  }, [q.data?.webConfigured, userId]);
  const change = async () => {
    setBusy(true); setMessage("");
    try {
      if (q.data?.enabled) { await disableRenewalPush(); await q.refetch(); }
      else {
        try { await sync(true); }
        catch (err) { await disableRenewalPush().catch(() => {}); throw err; }
      }
    } catch {
      if (alive.current && renewalBinding().pending.length) setMessage(t(
        "أُوقفت التنبيهات محليًا؛ إلغاء تسجيل الخادم ينتظر الاتصال ويُعاد تلقائيًا عند العودة.",
        "Alerts are off locally; server revocation is pending and will retry when you reconnect or return.",
      ));
      else if (alive.current) setMessage(t(
        "لم تُفعّل الإشعارات أو تعذر تحديثها. إذا رُفض الإذن، غيّره من إعدادات الموقع ثم حاول مجددًا. تبقى التذكيرات داخل التطبيق.",
        "Notifications were not enabled or could not be updated. If permission was denied, change it in site settings and retry. In-app reminders remain available.",
      ));
    } finally { if (alive.current) setBusy(false); }
  };
  // Keep device synchronization active everywhere; show its settings only on Account.
  return <section hidden={location.replace(/\/+$/, "") !== "/account"} className="rounded-2xl border border-border bg-card p-4 text-sm space-y-2" aria-label={t("تذكيرات الخلفية", "Background reminders")}>
    <p className="font-semibold">{t("تذكيرات الوصول والتجديد على هذا الجهاز", "Access and renewal reminders on this device")}</p>
    <p>{t("اختياري: قبل الموعد الموثّق بأربعة أيام، حتى والتطبيق مغلق. لا موعد لاشتراك مدفوع قبل تفعيل Polar. قد يؤخر النظام الإشعار، وتبقى التنبيهات داخل التطبيق.", "Optional: four days before a verified date, even with the app closed. No paid subscription dates until Polar is connected. Your system may delay notifications; in-app alerts remain available.")}</p>
    <p role="status" aria-live="polite">{limitation || (q.data?.enabled && "Notification" in window && Notification.permission !== "granted"
      ? t("إذن الإشعارات غير ممنوح؛ لا يمكن لهذا المتصفح عرض تذكير بالخلفية. راجع إعدادات الموقع.", "Notification permission is not granted; this browser cannot display background reminders. Check site settings.")
      : q.isError ? t("تعذر التحقق من حالة التسليم.", "Could not check delivery status.") : !q.data ? t("جارٍ التحقق…", "Checking…") : !q.data.webConfigured
      ? t("إرسال الويب غير مُعدّ بعد؛ لا يتم إرسال إشعارات خلفية من هذا المتصفح.", "Web delivery is not configured; this browser is not receiving background notifications.")
      : q.data.enabled
        ? q.data.nextAt ? t("مفعّل. الموعد: ", "Enabled. Scheduled for: ") + new Date(q.data.nextAt).toLocaleString()
          : t("مفعّل؛ لا يوجد موعد جديد موثّق ينتظر الإرسال.", "Enabled; no new verified reminder is awaiting dispatch.")
        : t("إشعارات الخلفية متوقفة على هذا الجهاز.", "Background notifications are off on this device."))}</p>
    {q.data?.lastResult && <p>{t("آخر محاولة: ", "Last attempt: ")}{({
      sending: t("قيد الإرسال، لا تأكيد وصول بعد", "Sending; not confirmed"),
      accepted: t("قبلها مزوّد الإشعارات؛ ليس تأكيدًا لوصولها للجهاز", "Accepted by the provider; device delivery is not confirmed"),
      confirmed: t("مرّرها المزوّد لنظام الجهاز؛ ليس تأكيدًا للقراءة", "Handed to the device service; reading is not confirmed"),
      failed: t("فشلت؛ راجع التنبيه داخل التطبيق", "Failed; see the in-app reminder"),
      unknown: t("النتيجة غير معروفة؛ لن نكررها تلقائيًا لتجنب التكرار", "Outcome unknown; not automatically repeated to avoid duplicates"),
    })[q.data.lastResult]}</p>}
    <button type="button" className="press rounded-xl border px-3 py-2 font-semibold" disabled={busy || (!q.data?.enabled && (!!limitation || !q.data?.webConfigured))} onClick={() => void change()}>
      {busy ? t("جارٍ التحديث…", "Updating…") : q.data?.enabled ? t("إيقاف إشعارات الخلفية", "Turn off background notifications") : t("تفعيل إشعارات الخلفية", "Enable background notifications")}
    </button>
    {message && <p role="alert">{message}</p>}
  </section>;
}
