type AnalyticsData = Record<string, string | number | boolean>;

export type AnalyticsPrivacyState = {
  enabled: boolean;
  reason: 'browser' | 'tracker' | 'preference' | 'storage' | null;
};

declare global {
  interface Window {
    hudhudAnalyticsPrivacy?: {
      getState(): AnalyticsPrivacyState;
      setEnabled(enabled: boolean): boolean;
    };
    umami?: {
      track(name: string, data?: AnalyticsData): void | Promise<unknown>;
    };
  }
}

export function getAnalyticsPrivacy(): AnalyticsPrivacyState {
  if (typeof window === 'undefined' || !window.hudhudAnalyticsPrivacy) {
    return { enabled: false, reason: 'storage' };
  }
  return window.hudhudAnalyticsPrivacy.getState();
}

export function setAnalyticsEnabled(enabled: boolean): boolean {
  return window.hudhudAnalyticsPrivacy?.setEnabled(enabled) ?? false;
}

/** Use only the platform-injected tracker; never queue events before consent. */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;
  try {
    if (!getAnalyticsPrivacy().enabled) return;
    if (window.localStorage.getItem('umami.disabled')) return;
    // No tracker means analytics is disabled, not loaded yet, or unavailable.
    // Do not inject one, retry, or replay events if settings change later.
    const result = window.umami?.track(name, data);
    if (result) void Promise.resolve(result).catch(() => { /* Analytics is optional. */ });
  } catch {
    // Includes unavailable storage and tracker errors: fail closed.
  }
}
