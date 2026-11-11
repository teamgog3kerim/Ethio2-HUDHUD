import { getAnalyticsPrivacy } from '@/lib/analytics';

export const VISITOR_ANALYTICS_KEY = 'hudhud.visitor-analytics';
export const VISITOR_ID_KEY = 'hudhud.visitor-id';

export type VisitorConsent = 'on' | 'off' | 'unavailable';

export function hasPrivacySignal(): boolean {
  if (typeof window === 'undefined') return true;
  const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

export function readVisitorConsent(): VisitorConsent {
  if (typeof window === 'undefined') return 'off';
  try {
    return window.localStorage.getItem(VISITOR_ANALYTICS_KEY) === 'on' ? 'on' : 'off';
  } catch {
    return 'unavailable';
  }
}

export function setVisitorConsent(enabled: boolean): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (enabled) window.localStorage.setItem(VISITOR_ANALYTICS_KEY, 'on');
    else window.localStorage.removeItem(VISITOR_ANALYTICS_KEY);
    if (!enabled) window.localStorage.removeItem(VISITOR_ID_KEY);
    window.dispatchEvent(new CustomEvent('hudhud:visitor-analytics-change'));
    return true;
  } catch {
    // Fail closed when browser storage is unavailable.
    try { window.localStorage.removeItem(VISITOR_ID_KEY); } catch { /* Storage remains unavailable. */ }
    return false;
  }
}

export function visitorAnalyticsAllowed(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return readVisitorConsent() === 'on' && getAnalyticsPrivacy().enabled;
  } catch {
    return false;
  }
}
