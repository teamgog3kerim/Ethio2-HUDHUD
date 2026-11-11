import { useEffect, useRef, useState } from 'react';
import { useRecordVisitorPageview } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useApp } from '@/lib/app';
import { sendEthioDeployBeacon } from '@/lib/ethiodeploy-beacon';
import { VISITOR_ID_KEY, visitorAnalyticsAllowed } from '@/lib/visitor-analytics';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function uuid(): string | null {
  try {
    return window.crypto.randomUUID();
  } catch {
    return null;
  }
}

function anonymousPath(pathname: string): string {
  if (!pathname.startsWith('/') || pathname === '/admin' || pathname.startsWith('/admin/')) return '';
  const clean = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return '/';
  const routes = ['/dashboard', '/learn', '/fidel', '/plan', '/review', '/tutor', '/progress', '/onboarding', '/account', '/premium', '/choose-plan', '/privacy', '/terms'];
  if (routes.includes(clean)) return clean;
  if (/^\/lesson\/[^/]+$/.test(clean)) return '/lesson';
  if (/^\/billing\/(return|cancel)$/.test(clean)) return '/billing';
  return '/other';
}

export function VisitorPageviewTracker() {
  const [location] = useLocation();
  const { lang } = useApp();
  const record = useRecordVisitorPageview();
  const [consentRevision, setConsentRevision] = useState(0);
  const previousPath = useRef('');
  const mutateRef = useRef(record.mutate);
  mutateRef.current = record.mutate;

  useEffect(() => {
    const pathname = window.location.pathname;
    const path = anonymousPath(pathname);
    if (!path) {
      previousPath.current = pathname;
      return;
    }
    if (!visitorAnalyticsAllowed()) {
      previousPath.current = '';
      return;
    }
    if (pathname === previousPath.current) return;
    previousPath.current = pathname;

    try {
      const now = Date.now();
      const stored = window.localStorage.getItem(VISITOR_ID_KEY);
      let visitorId: string | null = null;
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && 'id' in parsed && 'expiresAt' in parsed) {
          const candidate = parsed as { id: unknown; expiresAt: unknown };
          if (typeof candidate.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id)
            && typeof candidate.expiresAt === 'number' && candidate.expiresAt > now) {
            visitorId = candidate.id;
          }
        }
      }
      if (!visitorId) {
        visitorId = uuid();
        if (!visitorId) return;
        window.localStorage.setItem(VISITOR_ID_KEY, JSON.stringify({ id: visitorId, expiresAt: now + THIRTY_DAYS }));
      }
      const pageViewId = uuid();
      if (!pageViewId) return;
      const language = lang === 'ar' || lang === 'en' ? lang : 'other';
      mutateRef.current({ data: { visitorId, pageViewId, path, language } });
      sendEthioDeployBeacon(path, visitorId);
    } catch {
      // Visitor analytics is optional; storage and network failures must not interrupt learning.
    }
  }, [location, lang, consentRevision]);

  useEffect(() => {
    const refreshConsent = () => {
      if (!visitorAnalyticsAllowed()) {
        try { window.localStorage.removeItem(VISITOR_ID_KEY); } catch { /* Fail closed. */ }
      }
      setConsentRevision((revision) => revision + 1);
    };
    window.addEventListener('hudhud:visitor-analytics-change', refreshConsent);
    window.addEventListener('hudhud:analytics-change', refreshConsent);
    return () => {
      window.removeEventListener('hudhud:visitor-analytics-change', refreshConsent);
      window.removeEventListener('hudhud:analytics-change', refreshConsent);
    };
  }, []);
  return null;
}
