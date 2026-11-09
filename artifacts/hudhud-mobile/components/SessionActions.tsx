import { useRef, useState } from "react";
import { Modal, Platform, View } from "react-native";
import { useAuth, useAuthActions, useUser } from "@/utils/auth";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Action, Card, Txt, styles } from "./LearningUI";
import { useColors } from "@/hooks/useColors";
import { disableNativeRenewalPush, cancelStudyNotifications } from "@/utils/renewal-push";

export function SessionActions() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useAuthActions();
  const qc = useQueryClient();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const confirm = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await qc.cancelQueries();
      await disableNativeRenewalPush(true, true);
      await cancelStudyNotifications();
      await signOut();
      qc.clear();
      router.replace("/welcome");
    } catch { setError("تعذر تسجيل الخروج. تحقق من اتصالك وحاول مرة أخرى."); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!isSignedIn) return <Card>
    <Txt style={styles.subheading}>أنت تتصفح كضيف</Txt>
    <Txt>أنشئ حساباً لحفظ تعلّمك عبر الأجهزة. بيانات الضيف لا تنتقل تلقائياً إلى الحساب.</Txt>
    <Action title="تسجيل الدخول" onPress={() => router.push("/sign-in")} />
    <Action title="إنشاء حساب" secondary onPress={() => router.push("/sign-up")} />
  </Card>;
  return <Card>
    <Txt style={styles.subheading}>حسابك</Txt>
    <Txt>{user?.fullName || `@${user?.username}` || "تم تسجيل الدخول"}</Txt>
    <Action title="تسجيل الخروج" secondary icon="log-out" onPress={() => { setError(""); setOpen(true); }} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "center", padding: 24 }}>
        <View style={{ maxWidth: 440, width: "100%", alignSelf: "center" }}>
          <Card accessibilityViewIsModal>
            <Txt accessibilityRole="header" style={styles.subheading}>هل تريد تسجيل الخروج؟</Txt>
            <Txt>ستبقى دروسك ومحفوظاتك محفوظة في حسابك. تسجيل الخروج لا يحذف بيانات التعلّم.</Txt>
            {!!error && <Txt accessibilityRole="alert" style={{ color: c.destructive }}>{error}</Txt>}
            <Action title={busy ? "جارٍ تسجيل الخروج…" : "نعم، تسجيل الخروج"} disabled={busy} onPress={() => void confirm()} />
            <Action title="البقاء في الحساب" secondary disabled={busy} onPress={() => setOpen(false)} />
          </Card>
        </View>
      </View>
    </Modal>
  </Card>;
}
