import { getGetAdminAccessQueryKey, useGetAdminAccess } from '@workspace/api-client-react';
import { type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthQueryCacheInvalidator } from '@/components/auth-query-cache-invalidator';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InstallPrompt } from '@/components/install-prompt';
import PaymentReturn from '@/pages/payment-return';
import ChoosePlan from '@/pages/choose-plan';
import { SignInPage, SignUpPage } from '@/components/auth-pages';
import { AppProvider, useApp } from '@/lib/app';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import Learn from '@/pages/learn';
import LessonPage from '@/pages/lesson';
import Fidel from '@/pages/fidel';
import Plan from '@/pages/plan';
import Review from '@/pages/review';
import Tutor from '@/pages/tutor';
import ProgressPage from '@/pages/progress';
import Onboarding from '@/pages/onboarding';
import Account from '@/pages/account';
import Premium from '@/pages/premium';
import AdminOverview from '@/pages/admin/overview';
import AdminUsers from '@/pages/admin/users';
import AdminSettings from '@/pages/admin/settings';
import AdminContent from '@/pages/admin/content';
import AdminAudit from '@/pages/admin/audit';
import AdminVisitors from '@/pages/admin/visitors';
import { Privacy, Terms } from '@/pages/legal';
import { RenewalIdentityBoundary } from '@/components/renewal-push';
import { CourseAccessGate } from '@/components/course-access-gate';
import { ErrorState, Skeleton } from '@/components/bits';
import { NewUserWelcome } from '@/components/new-user-welcome';
import { StudyPushIdentityBoundary } from '@/components/study-push-identity';
import { StartupWelcome } from '@/components/startup-welcome';
import { VisitorPageviewTracker } from '@/components/visitor-pageview-tracker';

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
