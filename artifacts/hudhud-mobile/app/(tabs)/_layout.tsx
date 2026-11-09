import { Tabs, Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { Platform, StyleSheet } from "react-native";
import { useAuth } from "@/utils/auth";
import { useColors } from "@/hooks/useColors";
import { Loading } from "@/components/LearningUI";
const items = [
  { name: "index", label: "الرئيسية", icon: "home", sf: "house" },
  { name: "learn", label: "التعلّم", icon: "book-open", sf: "book" },
  { name: "review", label: "مراجعة", icon: "layers", sf: "square.stack" },
  { name: "tutor", label: "هدهد", icon: "message-circle", sf: "bubble.left" },
  { name: "progress", label: "تقدّمي", icon: "bar-chart-2", sf: "chart.bar" },
  { name: "account", label: "حسابي", icon: "user", sf: "person" },
] as const;
export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const c = useColors();
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/welcome" />;
  if (isLiquidGlassAvailable()) return <NativeTabs>
    <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf="house" /><NativeTabs.Trigger.Label>الرئيسية</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="learn"><NativeTabs.Trigger.Icon sf="book" /><NativeTabs.Trigger.Label>التعلّم</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="tutor"><NativeTabs.Trigger.Icon sf="bubble.left" /><NativeTabs.Trigger.Label>هدهد</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="progress"><NativeTabs.Trigger.Icon sf="chart.bar" /><NativeTabs.Trigger.Label>تقدّمي</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="account"><NativeTabs.Trigger.Icon sf="person" /><NativeTabs.Trigger.Label>حسابي</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  </NativeTabs>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.mutedForeground, tabBarLabelStyle: { fontFamily: "IBMPlexSansArabic_400Regular", fontSize: 10 }, tabBarStyle: { position: "absolute", backgroundColor: Platform.OS === "ios" ? "transparent" : c.card, borderTopColor: c.border, ...(Platform.OS === "web" ? { height: 84 } : {}) }, tabBarBackground: () => Platform.OS === "ios" ? <BlurView intensity={90} style={StyleSheet.absoluteFill} /> : null }}>
    {items.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label, ...(item.name === "review" ? { href: null } : {}), tabBarIcon: ({ color }) => <Feather name={item.icon} color={color} size={21} /> }} />)}
  </Tabs>;
}
