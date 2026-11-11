import { visitorAnalyticsAllowed } from '@/lib/visitor-analytics';

const ETHIODEPLOY_BEACON_URL = 'https://ethiodeploy.com/api/beacon';
const ETHIODEPLOY_PROJECT = 'ethio2-hudhud';
const ALLOWED_PATHS = new Set([
  '/',
  '/dashboard',
  '/learn',
  '/fidel',
  '/plan',
  '/review',
  '/tutor',
  '/progress',
  '/onboarding',
  '/account',
  '/premium',
  '/choose-plan',
  '/privacy',
  '/terms',
  '/lesson',
  '/billing',
  '/other',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEthioDeployBeaconPayload(path: string, visitorId: string): string | null {
  if (!ALLOWED_PATHS.has(path) || !UUID_PATTERN.test(visitorId)) return null;
  return JSON.stringify({
    project: ETHIODEPLOY_PROJECT,
    path,
    referrer: '',
    visitorId,
  });
}

/** Best-effort external pageview, gated by the app's existing explicit consent. */
export function sendEthioDeployBeacon(path: string, visitorId: string): void {
  if (typeof window === 'undefined' || !visitorAnalyticsAllowed()) return;
  const payload = createEthioDeployBeaconPayload(path, visitorId);
  if (!payload) return;

  try {
    window.navigator.sendBeacon?.(ETHIODEPLOY_BEACON_URL, payload);
  } catch {
    // External analytics must never interrupt the learning experience.
  }
}
