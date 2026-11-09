import { useEffect, type ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useBilling } from './billing-notice';
import { Shell } from './shell';
import { ErrorState, Skeleton } from './bits';
import { useAuth } from '@/lib/auth';
import { useApp } from '@/lib/app';

export function CourseAccessGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const billing = useBilling();
  const cache = useQueryClient();
  const { t } = useApp();
  const b = billing.data;
  const protectedPage = /^\/(?:dashboard|learn|lesson(?:\/.*)?|fidel|plan|review|tutor)\/?$/.test(location);

  useEffect(() => {
    if (!b?.enforcementEnabled || b.trial.state !== 'active') return;
    // Re-check at the actual expiry, including while a lesson stays open.
    const delay = Math.max(0, new Date(b.trial.endsAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      void billing.refetch();
    }, delay + 50);
    return () => window.clearTimeout(timer);
  }, [b?.enforcementEnabled, b?.trial.endsAt, b?.trial.state, cache, billing.refetch]);

  useEffect(() => {
    if (!b?.enforcementEnabled || b.fullCourseAccess) return;
    // Discard learning payloads only; preserve account and billing queries.
    cache.removeQueries({ predicate: q => {
      const key = q.queryKey[0];
      return typeof key === 'string' && /^\/api\/(?:courses|lessons|study-plan|vocabulary|favourites|ai\/chat)(?:\/|$)/.test(key);
    } });
  }, [b?.enforcementEnabled, b?.fullCourseAccess, cache]);

  if (!protectedPage) return children;
  if (!isLoaded) return <Shell><Skeleton className="h-64" /></Shell>;
  if (!isSignedIn) return <Redirect to="/sign-up?plan=trial" replace />;
  if (billing.isLoading) return <Shell><Skeleton className="h-64" /></Shell>;
  if (billing.isError || !b) return <Shell><ErrorState what={t('التحقق من صلاحية التعلّم', 'checking learning access')} onRetry={() => void billing.refetch()} /></Shell>;
  // A browser session may activate before its cookie reaches the API. Never
  // bounce a signed-in learner through signup repeatedly or show guest content.
  if (b.isGuest) return <Shell><ErrorState what={t('تأكيد جلسة حسابك، أعد المحاولة للمتابعة', 'confirming your account session; retry to continue')} onRetry={() => void billing.refetch()} /></Shell>;
  if (!b.enforcementEnabled || b.fullCourseAccess) return children;
  return <Redirect to="/choose-plan" replace />;
}
