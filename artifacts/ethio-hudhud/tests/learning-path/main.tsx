import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch } from 'wouter';
import { AppProvider } from '@/lib/app';
import Learn from '@/pages/learn';
import Lesson from '@/pages/lesson';
import Dashboard from '@/pages/dashboard';
import Premium from '@/pages/premium';
import ChoosePlan from '@/pages/choose-plan';
import Account from '@/pages/account';
import { AuthQueryCacheInvalidator } from '@/components/auth-query-cache-invalidator';
import './styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// Observe invalidation calls, including inactive keys with no network observer.
// This instrumentation exists only in the isolated regression entry.
const invalidateQueries = client.invalidateQueries.bind(client);
client.invalidateQueries = (...args) => {
  window.dispatchEvent(new CustomEvent('test-query-invalidation', { detail: args[0]?.queryKey }));
  return invalidateQueries(...args);
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <AppProvider>
      <AuthQueryCacheInvalidator />
      <Switch>
        <Route path="/account" component={Account} />
        <Route path="/premium" component={Premium} />
        <Route path="/choose-plan" component={ChoosePlan} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/lesson/:id" component={Lesson} />
        <Route component={Learn} />
      </Switch>
    </AppProvider>
  </QueryClientProvider>,
);
