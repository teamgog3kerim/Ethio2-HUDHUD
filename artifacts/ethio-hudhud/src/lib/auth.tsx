import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type AuthUser = {
  id: string;
  fullName: string;
  username: string;
  createdAt: string;
  lastSignInAt: string | null;
};
export type AuthSession = { isSignedIn: boolean; user: AuthUser | null };
export const AUTH_SESSION_QUERY_KEY = ["auth-session"] as const;

async function getSession(): Promise<AuthSession> {
  const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Could not check sign-in status");
  return response.json() as Promise<AuthSession>;
}

export async function submitAuth(path: "login" | "register", data: Record<string, string>): Promise<AuthSession> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({})) as AuthSession & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not complete sign-in");
  return payload;
}

export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: getSession,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return {
    isLoaded: query.isFetched,
    isSignedIn: !!query.data?.isSignedIn,
    userId: query.data?.user?.id ?? null,
    user: query.data?.user ?? null,
    error: query.error,
  };
}

export function useUser() {
  const auth = useAuth();
  return { isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, user: auth.user };
}

export function useSession() {
  const auth = useAuth();
  const createdAt = auth.user ? new Date(auth.user.createdAt) : null;
  return { isLoaded: auth.isLoaded, session: createdAt ? { createdAt } : null };
}

export function useAuthActions() {
  const queryClient = useQueryClient();
  const signOut = useCallback(async (options?: { redirectUrl?: string }) => {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not sign out");
    queryClient.clear();
    queryClient.setQueryData<AuthSession>(AUTH_SESSION_QUERY_KEY, { isSignedIn: false, user: null });
    if (options?.redirectUrl) window.location.assign(options.redirectUrl);
  }, [queryClient]);
  return { signOut };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch("/api/auth/password", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not change password");
  }
}
