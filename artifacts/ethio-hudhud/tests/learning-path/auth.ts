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
export const AUTH_SESSION_QUERY_KEY = ['auth-session'] as const;
export const submitAuth = async () => {
  throw new Error('Authentication mutations are not used in isolated learning-path tests.');
};
export const changePassword = async () => {
  throw new Error('Password changes are not used in isolated learning-path tests.');
};
export const useSession = () => {
  const auth = useAuth();
  return { isLoaded: auth.isLoaded, session: auth.user ? { createdAt: new Date(auth.user.createdAt) } : null };
};
export const useAuthActions = () => ({
  signOut: async () => {
    document.cookie = 'test-identity=; Max-Age=0; Path=/';
    window.dispatchEvent(new CustomEvent('test-identity', { detail: null }));
  },
});
