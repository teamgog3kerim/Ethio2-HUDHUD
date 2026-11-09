import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { Bell, Users, X } from "lucide-react";
import { getGetAdminOverviewQueryKey, useGetAdminOverview } from "@workspace/api-client-react";
import { useApp } from "@/lib/app";
import {
  advanceSignupNotifications,
  createSignupNotificationState,
  dismissSignupNotifications,
  isSignupNotificationState,
  type SignupNotificationState,
} from "@/lib/admin-signup-notifications";

function storageKey(adminId: string) {
  return `hudhud.admin-signups.v1:${adminId}`;
}

export function AdminSignupNotifications() {
  const { userId } = useAuth();
  const { t } = useApp();
  const overview = useGetAdminOverview({
    query: {
      queryKey: getGetAdminOverviewQueryKey(),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });
  const [state, setState] = useState<SignupNotificationState | null>(null);
  const accountCount = overview.data?.registeredUsers;

  useEffect(() => {
    if (!userId || accountCount === undefined) return;
    const key = storageKey(userId);
    try {
      const raw = window.localStorage.getItem(key);
      let previous: SignupNotificationState | null = null;
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isSignupNotificationState(parsed)) previous = parsed;
      }
      const next = previous
        ? advanceSignupNotifications(previous, accountCount)
        : createSignupNotificationState(accountCount);
      window.localStorage.setItem(key, JSON.stringify(next));
      setState(next);
    } catch {
      setState((previous) => previous
        ? advanceSignupNotifications(previous, accountCount)
        : createSignupNotificationState(accountCount));
    }
  }, [userId, accountCount]);

  if (!state || state.unreadSignupCount === 0) return null;
  const count = state.unreadSignupCount;

  const dismiss = () => {
    const next = dismissSignupNotifications(state);
    setState(next);
    try {
      if (userId) window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // Keep the notice dismissed for this view even when browser storage is unavailable.
    }
  };

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="admin-new-signups"
      className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Bell className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {count === 1
              ? t("حساب جديد", "New account")
              : t("حسابات جديدة", "New accounts")}
          </p>
          <p className="text-sm text-muted-foreground">
            {count === 1
              ? t("تم إنشاء حساب جديد منذ آخر مراجعة.", "One account was created since your last check.")
              : t(`تم إنشاء ${count} حسابات منذ آخر مراجعة.`, `${count} accounts were created since your last check.`)}
          </p>
        </div>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Link
          href="/admin/users"
          data-testid="link-new-signups-users"
          className="press inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:flex-none"
        >
          <Users className="size-4" aria-hidden="true" />
          {t("عرض المستخدمين", "View users")}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("إخفاء إشعار الحسابات الجديدة", "Dismiss new account notification")}
          className="press grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
