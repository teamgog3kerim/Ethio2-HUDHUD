import { useSyncExternalStore } from 'react';

let identity: string | null = sessionStorage.getItem('test-identity');
const subscribers = new Set<() => void>();
window.addEventListener('test-identity', event => {
  identity = (event as CustomEvent<string | null>).detail;
  if (identity) sessionStorage.setItem('test-identity', identity);
  else sessionStorage.removeItem('test-identity');
  for (const subscriber of subscribers) subscriber();
});
const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
};
export const useAuth = () => {
  const userId = useSyncExternalStore(subscribe, () => identity);
  return { isLoaded: true, isSignedIn: !!userId, userId, user: userId ? { id: userId, fullName: 'Test learner', username: userId, createdAt: new Date().toISOString(), lastSignInAt: null } : null };
};
export const useUser = () => {
  const auth = useAuth();
  return { isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, user: auth.user };
};
export const useAuthActions = () => ({
  signOut: async () => {
    document.cookie = 'test-identity=; Max-Age=0; Path=/';
    window.dispatchEvent(new CustomEvent('test-identity', { detail: null }));
  },
});
