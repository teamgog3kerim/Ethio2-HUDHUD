import { useEffect, type ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCoursesQueryKey, getGetCoursesQueryOptions,
  getGetStudyPlanQueryKey, getGetStudyPlanQueryOptions,
} from '@workspace/api-client-react';
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
    if (!protectedPage || !isLoaded || !isSignedIn) return;
    const query = { staleTime: 30_000 };
    // Start protected, read-only page requests while the billing gate resolves.
    // The API still enforces entitlements; the gate never renders content early.
    if (location === '/learn') {
      void cache.prefetchQuery(getGetCoursesQueryOptions({ query: { ...query, queryKey: getGetCoursesQueryKey() } }));
    } else if (location === '/plan') {
      void cache.prefetchQuery(getGetStudyPlanQueryOptions({ query: { ...query, queryKey: getGetStudyPlanQueryKey() } }));
    }
  }, [cache, isLoaded, isSignedIn, location, protectedPage]);

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
  const loading = () => (
    <main className="mx-auto min-h-[55vh] max-w-5xl p-4 sm:p-6" role="status" aria-live="polite">
      <span className="sr-only">{t('جارٍ التحقق من حسابك…', 'Checking your account…')}</span>
      <Skeleton className="mb-4 h-10 w-2/3" />
      <Skeleton className="h-64" />
    </main>
  );
  if (!isLoaded) return loading();
  if (!isSignedIn) return <Redirect to="/sign-up?plan=trial" replace />;
  if (billing.isLoading) return loading();
  if (billing.isError || !b) return <Shell><ErrorState what={t('التحقق من صلاحية التعلّم', 'checking learning access')} onRetry={() => void billing.refetch()} /></Shell>;
  // A browser session may activate before its cookie reaches the API. Never
  // bounce a signed-in learner through signup repeatedly or show guest content.
  if (b.isGuest) return <Shell><ErrorState what={t('تأكيد جلسة حسابك، أعد المحاولة للمتابعة', 'confirming your account session; retry to continue')} onRetry={() => void billing.refetch()} /></Shell>;
  if (!b.enforcementEnabled || b.fullCourseAccess) return children;
  return <Redirect to="/choose-plan" replace />;
}
