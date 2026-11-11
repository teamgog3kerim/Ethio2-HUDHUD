import { test as base, expect, type Page } from '@playwright/test';
import { status, reminderDevice } from './billing-data';
import { courseSeed, lessonSeed } from '@workspace/db/seed-data';
import { arabicLessonContent } from '@workspace/db/pronunciation';

export { status } from './billing-data';

export const lesson = lessonSeed.find(l => l.content.words.length > 0)!;
export const conversation = lessonSeed.find(l => l.content.dialogue?.length)!;

export async function account(page: Page, signedIn: boolean) {
  await page.evaluate(id => {
    document.cookie = id ? `test-identity=${id}; Path=/` : 'test-identity=; Max-Age=0; Path=/';
    window.dispatchEvent(new CustomEvent('test-identity', { detail: id }));
  }, signedIn ? 'billing-account' : null);
}

function createState() {
  return {
    lang: 'ar' as 'ar' | 'en',
    records: new Map([[null, status()], ['billing-account', status(false)]]),
    reads: [] as (string | null)[],
    hold: false,
    fail: false,
    pending: [] as (() => void)[],
    release() {
      this.hold = false;
      for (const release of this.pending.splice(0)) release();
    },
  };
}

export const test = base.extend<{ billing: ReturnType<typeof createState> }>({
  billing: async ({ context, page }, use) => {
    const billing = createState();
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Intercept every context request, including popups. No API request may
    // reach the normal app, a real identity, a database or a payment provider.
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      // Avoid external font availability changing test timing or layout.
      if (url.origin === 'https://fonts.googleapis.com' && req.resourceType() === 'stylesheet')
        return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== 'http://127.0.0.1:4179') {
        unexpected.push(req.url());
        return route.abort();
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const id = req.headers().cookie?.match(/(?:^|; )test-identity=([^;]+)/)?.[1] ?? null;
      const record = billing.records.get(id);
      if (req.method() !== 'GET' || !record) {
        unexpected.push(`${req.method()} ${url.pathname} (${id})`);
        return route.fulfill({ status: 500, json: { error: 'Unexpected test request' } });
      }
      const json = (body: unknown) => route.fulfill({ json: body });
      if (url.pathname === '/api/auth/session') return json({
        isSignedIn: !!id,
        user: id ? { id, fullName: 'Test learner', username: id, createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null } : null,
      });
      if (/^\/api\/billing\/reminder-device\/[0-9a-f-]{36}$/.test(url.pathname)) return json(reminderDevice);
      if (url.pathname === '/api/billing/status') {
        billing.reads.push(id);
        const snapshot = structuredClone(record);
        if (billing.hold) await new Promise<void>(release => billing.pending.push(release));
        if (billing.fail) return route.fulfill({ status: 503, json: { error: 'Billing unavailable' } });
        return json(snapshot);
      }
      if (url.pathname === '/api/profile') return json({
        id: id ?? 'billing-guest', displayName: 'Fixture', isGuest: !id,
        language: billing.lang, onboardingComplete: true,
      });
      if (url.pathname === '/api/admin/me') return json({ signedIn: !!id, role: null });
      if (url.pathname === '/api/app-settings') return json({
        announcementAr: '', announcementEn: '', learningEnabled: true, aiEnabled: true,
      });
      if (url.pathname === '/api/favourites') return json([]);
      const lessons = lessonSeed.map(l => ({
        ...arabicLessonContent(l.content), id: l.id, courseId: l.courseId,
        reviewStatus: l.reviewStatus, completed: false,
      }));
      if (url.pathname === '/api/courses') return json(courseSeed.map(c => ({
        ...c, completedCount: 0, lessons: lessons.filter(l => l.courseId === c.id),
      })));
      const match = url.pathname.match(/^\/api\/lessons\/([^/]+)$/);
      if (match && lessons.some(l => l.id === match[1])) return json(lessons.find(l => l.id === match[1]));
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 500, json: { error: 'Unconfigured test request' } });
    });
    try {
      await use(billing);
    } finally {
      billing.release();
      // Fixtures and browser storage die with this test's fresh context.
      await context.unrouteAll({ behavior: 'wait' });
      expect({ unexpected, errors }, 'No unexpected requests or browser runtime errors').toEqual({ unexpected: [], errors: [] });
    }
  },
});
export { expect } from '@playwright/test';
