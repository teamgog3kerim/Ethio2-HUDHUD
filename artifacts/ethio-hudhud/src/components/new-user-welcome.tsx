import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { claimSignupWelcome, scheduleWelcomeDismiss } from '@/lib/signup-welcome';
import { WelcomePopup } from './welcome-popup';

export function NewUserWelcome() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [welcomeFor, setWelcomeFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let justRegistered = false;
    try {
      justRegistered = window.sessionStorage.getItem('hudhud:signup-welcome') === userId;
      if (justRegistered) window.sessionStorage.removeItem('hudhud:signup-welcome');
    } catch { /* welcome is optional */ }
    if (!justRegistered) return;
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage is optional. */ }
    if (claimSignupWelcome(userId, storage)) setWelcomeFor(userId);
  }, [isLoaded, isSignedIn, userId]);

  // Separate from the once-only claim so Strict Mode's effect replay cannot
  // consume the welcome and cancel its only dismissal timer.
  useEffect(() => {
    if (!welcomeFor) return;
    return scheduleWelcomeDismiss(() => setWelcomeFor(null));
  }, [welcomeFor]);

  if (!isSignedIn || !userId || welcomeFor !== userId) return null;
  return <WelcomePopup onDismiss={() => setWelcomeFor(null)} />;
}
