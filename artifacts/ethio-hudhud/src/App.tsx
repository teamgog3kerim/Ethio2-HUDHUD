import { getGetAdminAccessQueryKey, useGetAdminAccess } from '@workspace/api-client-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthQueryCacheInvalidator } from '@/components/auth-query-cache-invalidator';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InstallPrompt } from '@/components/install-prompt';
import { AppProvider, useApp } from '@/lib/app';
import { RenewalIdentityBoundary } from '@/components/renewal-push';
import { CourseAccessGate } from '@/components/course-access-gate';
import { ErrorState, Skeleton } from '@/components/bits';
import { NewUserWelcome } from '@/components/new-user-welcome';
import { StudyPushIdentityBoundary } from '@/components/study-push-identity';
import { StartupWelcome } from '@/components/startup-welcome';
import { VisitorPageviewTracker } from '@/components/visitor-pageview-tracker';

const PaymentReturn = lazy(() => import('@/pages/payment-return'));
const ChoosePlan = lazy(() => import('@/pages/choose-plan'));
const SignInPage = lazy(() => import('@/components/auth-pages').then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import('@/components/auth-pages').then((m) => ({ default: m.SignUpPage })));
const NotFound = lazy(() => import('@/pages/not-found'));
const Landing = lazy(() => import('@/pages/landing'));
const Dashboard = lazy(() => import('@/pages/dashboard'));
const Learn = lazy(() => import('@/pages/learn'));
const LessonPage = lazy(() => import('@/pages/lesson'));
const Fidel = lazy(() => import('@/pages/fidel'));
const Plan = lazy(() => import('@/pages/plan'));
const Review = lazy(() => import('@/pages/review'));
const Tutor = lazy(() => import('@/pages/tutor'));
const ProgressPage = lazy(() => import('@/pages/progress'));
const Onboarding = lazy(() => import('@/pages/onboarding'));
const Account = lazy(() => import('@/pages/account'));
const Premium = lazy(() => import('@/pages/premium'));
const AdminOverview = lazy(() => import('@/pages/admin/overview'));
const AdminUsers = lazy(() => import('@/pages/admin/users'));
const AdminSettings = lazy(() => import('@/pages/admin/settings'));
const AdminContent = lazy(() => import('@/pages/admin/content'));
const AdminAudit = lazy(() => import('@/pages/admin/audit'));
const AdminVisitors = lazy(() => import('@/pages/admin/visitors'));
const Privacy = lazy(() => import('@/pages/legal').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('@/pages/legal').then((m) => ({ default: m.Terms })));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function StartRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey(), enabled: !!isSignedIn } });
  const { t } = useApp();
  if (!isLoaded || (isSignedIn && access.isLoading)) return <div className="mx-auto max-w-lg p-8" role="status"><Skeleton className="h-36" /><p className="mt-3 text-sm">{t('نجهّز مسار تعلّمك…', 'Opening your learning path…')}</p></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" replace />;
  if (access.isError || !access.data) return <div className="mx-auto max-w-lg p-8"><ErrorState what={t('فتح حسابك', 'opening your account')} onRetry={() => void access.refetch()} /></div>;
  if (!access.data.signedIn) return <div className="mx-auto max-w-lg p-8"><ErrorState what={t('تأكيد جلسة حسابك', 'confirming your account session')} onRetry={() => void access.refetch()} /></div>;
  const admin = access.data.signedIn && (access.data.role === 'owner' || access.data.role === 'admin');
  return <Redirect to={admin ? '/admin' : '/learn'} replace />;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="mx-auto max-w-lg p-8" role="status"><Skeleton className="h-36" /></div>;
  return isSignedIn ? <Redirect to="/start" /> : <Landing />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function RouteLoading() {
  const { t } = useApp();
  return (
    <main className="mx-auto min-w-0 w-full max-w-5xl p-4 sm:p-6" role="status" aria-live="polite">
      <span className="sr-only">{t('جارٍ فتح الصفحة…', 'Opening page…')}</span>
      <Skeleton className="mb-4 h-10 w-2/3" />
      <Skeleton className="mb-3 h-5 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </main>
  );
}

function AppRoutes() {
  return (
    <>
      <AuthQueryCacheInvalidator />
      <VisitorPageviewTracker />
      <RenewalIdentityBoundary />
      <StudyPushIdentityBoundary />
      <NewUserWelcome />
      <RoutedErrorBoundary>
        <CourseAccessGate>
          <Suspense fallback={<RouteLoading />}>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/start" component={StartRedirect} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/learn" component={Learn} />
              <Route path="/lesson/:id" component={LessonPage} />
              <Route path="/fidel" component={Fidel} />
              <Route path="/plan" component={Plan} />
              <Route path="/review" component={Review} />
              <Route path="/tutor" component={Tutor} />
              <Route path="/progress" component={ProgressPage} />
              <Route path="/onboarding" component={Onboarding} />
              <Route path="/account" component={Account} />
              <Route path="/premium" component={Premium} />
              <Route path="/choose-plan" component={ChoosePlan} />
              <Route path="/billing/return" component={PaymentReturn} />
              <Route path="/billing/cancel" component={PaymentReturn} />
              <Route path="/admin" component={AdminOverview} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/settings" component={AdminSettings} />
              <Route path="/admin/content" component={AdminContent} />
              <Route path="/admin/audit" component={AdminAudit} />
              <Route path="/admin/visitors" component={AdminVisitors} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/terms" component={Terms} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </CourseAccessGate>
      </RoutedErrorBoundary>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <AppRoutes />
          </WouterRouter>
          <StartupWelcome />
          <Toaster />
          <InstallPrompt />
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
