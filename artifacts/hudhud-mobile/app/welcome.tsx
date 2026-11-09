import { Platform, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/utils/auth";
import { Redirect } from "expo-router";
import { Action, Screen, Txt, styles } from "@/components/LearningUI";
import { AnimatedHudhud } from "@/components/AnimatedHudhud";
import { useColors } from "@/hooks/useColors";
import * as WebBrowser from "expo-web-browser";

export default function Welcome() {
  const { isSignedIn, isLoaded } = useAuth();
  const c = useColors();
  if (isLoaded && isSignedIn) return <Redirect href="/" />;
  return <Screen title="لغة جديدة، صلة أقرب." subtitle="تعلّم الأمهرية. وتواصل مع إثيوبيا.">
    <View style={{ alignItems: "center", paddingVertical: 30, gap: 22 }}>
      <AnimatedHudhud size={180} radius={42} />
      <Txt style={[styles.fidel, { fontSize: 48, color: c.primary }]}>ሰላም</Txt>
      <Txt style={{ textAlign: "center", fontSize: 20 }}>مرحباً بك في هدهد</Txt>
    </View>
    <Txt>دروس أمهرية بشرح عربي، حروف الفيدل، ومراجعة ذكية. رحلة يومية تبدأ بكلمة واحدة.</Txt>
    <Action title="ابدأ رحلتك" icon="arrow-left" onPress={() => router.push("/sign-in")} />
    <Action title="إنشاء حساب جديد" secondary onPress={() => router.push("/sign-up")} />
    <Action title="استكشف تجربة الويب كضيف" secondary onPress={() => void WebBrowser.openBrowserAsync(`https://${process.env.EXPO_PUBLIC_DOMAIN}/dashboard`)} />
    <Txt style={{ fontSize: 12, color: c.mutedForeground }}>التسجيلات الصوتية وتقييم النطق غير متاحين بعد.</Txt>
    {Platform.OS === "web" && <Txt style={{ fontSize: 12 }}>هذه معاينة التطبيق الأصلي. استخدم حسابك لحفظ تقدمك بين الأجهزة.</Txt>}
  </Screen>;
}
