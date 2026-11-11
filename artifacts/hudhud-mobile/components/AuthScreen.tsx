import { useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "./KeyboardAwareScrollViewCompat";
import { Action, Card, Txt, styles } from "./LearningUI";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/utils/auth";

export function AuthScreen({ mode }: { mode: "in" | "up" }) {
  const register = mode === "up";
  const auth = useAuth();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const lock = useRef(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputStyle = { color: c.foreground, borderColor: c.border, borderWidth: 1, borderRadius: c.radius, padding: 15, backgroundColor: c.background, fontSize: 16, textAlign: "left" as const, writingDirection: "ltr" as const };

  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (register) await auth.signUp(fullName.trim(), username.trim(), password);
      else await auth.signIn(username.trim(), password);
      router.replace(register ? "/account" : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر إكمال الطلب. تحقّق من بياناتك وحاول مجدداً.");
    } finally {
      lock.current = false; setBusy(false);
    }
  };

  if (auth.isLoaded && auth.isSignedIn) return <Redirect href="/" />;
  return <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 22, paddingTop: Platform.OS === "web" ? 50 : insets.top + 24, paddingBottom: 60 }} bottomOffset={40} keyboardShouldPersistTaps="handled">
    <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 18 }}>
      <Txt style={{ color: c.primary, letterSpacing: 2, fontSize: 13 }}>ETHIO HUDHUD · هدهد</Txt>
      <View style={{ flexDirection: "row-reverse", gap: 10 }}>
        <View style={{ flex: 1 }}><Action title="تسجيل الدخول" secondary={register} disabled={busy} onPress={() => { if (register) router.replace("/sign-in"); }} /></View>
        <View style={{ flex: 1 }}><Action title="إنشاء حساب" secondary={!register} disabled={busy} onPress={() => { if (!register) router.replace("/sign-up"); }} /></View>
      </View>
      <Card>
        <Txt accessibilityRole="header" style={styles.heading}>{register ? "ابدأ رحلتك مع هدهد" : "مرحباً بعودتك"}</Txt>
        <Txt style={{ color: c.mutedForeground }}>{register ? "أنشئ حساباً باسمك واسم مستخدم وكلمة مرور. لا تحتاج إلى بريد إلكتروني." : "أدخل اسم المستخدم وكلمة المرور لمتابعة دروسك."}</Txt>
        {register && <>
          <Txt>الاسم الكامل</Txt>
          <TextInput testID="input-full-name" accessibilityLabel="الاسم الكامل" value={fullName} onChangeText={setFullName} editable={!busy} autoComplete="name" maxLength={80} style={inputStyle} />
        </>}
        <Txt>اسم المستخدم</Txt>
        <TextInput testID="input-username" accessibilityLabel="اسم المستخدم" value={username} onChangeText={setUsername} editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={24} placeholder="letters_numbers" placeholderTextColor={c.mutedForeground} style={inputStyle} />
        {register && <Txt style={{ color: c.mutedForeground, fontSize: 12 }}>3–24 حرفاً إنجليزياً أو رقماً أو شرطة سفلية.</Txt>}
        <Txt>كلمة المرور</Txt>
        <TextInput testID="input-password" accessibilityLabel="كلمة المرور" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={register ? "new-password" : "current-password"} maxLength={128} style={inputStyle} onSubmitEditing={() => void submit()} />
        <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={() => setShowPassword(v => !v)}><Txt style={{ color: c.primary, fontSize: 13 }}>{showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}</Txt></Pressable>
        {register && <Txt style={{ fontSize: 12, color: c.mutedForeground }}>استخدم 6 أحرف على الأقل. احفظ كلمة المرور؛ لا يتوفر استرداد عبر البريد الإلكتروني.</Txt>}
        {!!error && <Txt accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: c.destructive }}>{error}</Txt>}
        <Action title={busy ? "جارٍ المتابعة…" : register ? "إنشاء الحساب وبدء التعلّم" : "تسجيل الدخول"} onPress={() => void submit()} disabled={busy || !username.trim() || !password || (register && (!fullName.trim() || password.length < 6))} />
      </Card>
      <Txt style={{ color: c.mutedForeground, fontSize: 12 }}>تقدّم الضيف ومحفوظاته منفصلة عن الحساب ولا تنتقل إليه تلقائياً. تسجيل الخروج لا يحذف بيانات تعلّمك.</Txt>
      <Action title="العودة إلى البداية" secondary disabled={busy} onPress={() => router.replace("/welcome")} />
    </View>
  </KeyboardAwareScrollViewCompat>;
}
