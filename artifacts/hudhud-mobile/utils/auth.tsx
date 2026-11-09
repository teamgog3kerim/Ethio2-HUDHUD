import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export type NativeAuthUser = {
  id: string;
  fullName: string;
  username: string;
  createdAt: string;
  lastSignInAt: string | null;
};
type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  user: NativeAuthUser | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (fullName: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const TOKEN_KEY = "hudhud.auth.session.v1";
const Context = createContext<AuthState | null>(null);
let activeToken: string | null = null;

function apiOrigin() {
  const value = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!value) return "";
  return value.startsWith("http://") || value.startsWith("https://") ? value.replace(/\/$/, "") : `https://${value.replace(/\/$/, "")}`;
}

async function readToken(): Promise<string | null> {
  if (activeToken) return activeToken;
  try {
    activeToken = Platform.OS === "web"
      ? window.localStorage.getItem(TOKEN_KEY)
      : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch { activeToken = null; }
  return activeToken;
}

async function storeToken(token: string | null) {
  activeToken = token;
  try {
    if (Platform.OS === "web") {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } else if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    if (token) throw new Error("تعذّر حفظ جلسة الحساب على هذا الجهاز.");
  }
}

async function requestAuth(path: string, body?: Record<string, string>) {
  const origin = apiOrigin();
  if (!origin) throw new Error("تعذّر الاتصال بالخدمة؛ لم يتم إعداد نطاق التطبيق.");
  const token = await readToken();
  const response = await fetch(`${origin}/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-Hudhud-Client": "native",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as {
    isSignedIn?: boolean; user?: NativeAuthUser | null; accessToken?: string; error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "تعذّر إكمال الطلب.");
  return payload;
}

export function getStoredAuthToken() {
  return readToken();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "signIn" | "signUp" | "signOut">>({
    isLoaded: false, isSignedIn: false, userId: null, user: null,
  });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setAuthTokenGetter(getStoredAuthToken);
    void (async () => {
      try {
        const result = await requestAuth("session");
        if (alive.current) setState({
          isLoaded: true, isSignedIn: !!result.isSignedIn,
          userId: result.user?.id ?? null, user: result.user ?? null,
        });
      } catch {
        if (alive.current) setState({ isLoaded: true, isSignedIn: false, userId: null, user: null });
      }
    })();
    return () => { alive.current = false; };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await requestAuth("login", { username, password });
    if (!result.user || !result.accessToken) throw new Error("تعذّر إنشاء جلسة آمنة. حاول مجددًا.");
    await storeToken(result.accessToken);
    setState({ isLoaded: true, isSignedIn: true, userId: result.user.id, user: result.user });
  }, []);

  const signUp = useCallback(async (fullName: string, username: string, password: string) => {
    const result = await requestAuth("register", { fullName, username, password });
    if (!result.user || !result.accessToken) throw new Error("تعذّر إنشاء جلسة آمنة. حاول مجددًا.");
    await storeToken(result.accessToken);
    setState({ isLoaded: true, isSignedIn: true, userId: result.user.id, user: result.user });
  }, []);

  const signOut = useCallback(async () => {
    try { await requestAuth("logout", {}); } finally {
      await storeToken(null);
      setState({ isLoaded: true, isSignedIn: false, userId: null, user: null });
    }
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signUp, signOut }), [state, signIn, signUp, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
export function useUser() {
  const auth = useAuth();
  return { isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, user: auth.user };
}
export function useAuthActions() {
  const { signOut } = useAuth();
  return { signOut };
}
