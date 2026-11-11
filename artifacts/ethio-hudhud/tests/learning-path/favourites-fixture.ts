import { test as base, expect, type Page } from '@playwright/test';
import { courseSeed, lessonSeed } from '@workspace/db/seed-data';
import { arabicLessonContent } from '@workspace/db/pronunciation';
import { status, reminderDevice } from './billing-data';

export const lesson = lessonSeed.find(l => !l.content.dialogue?.length)!;
export const conversation = lessonSeed.find(l => l.content.dialogue?.length)!;
export const otherLesson = lessonSeed.find(l => l.id !== lesson.id && !l.content.dialogue?.length)!;
export type Identity = 'learner-a' | 'learner-b' | null;

export async function switchIdentity(page: Page, identity: Identity) {
  // Keep the page, mounted React Query client and cache alive across accounts.
  await page.evaluate(id => {
    document.cookie = id ? `test-identity=${id}; Path=/` : 'test-identity=; Max-Age=0; Path=/';
    window.dispatchEvent(new CustomEvent('test-identity', { detail: id }));
  }, identity);
}

function createState() {
  return {
    identity: null as Identity,
    saves: new Map<string | null, Set<string>>([
      [null, new Set()], ['learner-a', new Set()], ['learner-b', new Set()],
    ]),
    archived: new Set<string>(),
    reads: [] as (string | null)[],
    writes: [] as { identity: Identity; method: string; id: string }[],
    holdReads: false,
    pendingReads: [] as (() => void)[],
  };
}

export const test = base.extend<{ favourites: ReturnType<typeof createState> }>({
  favourites: async ({ page }, use) => {
    const state = createState();
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = (id: string) => {
      const source = lessonSeed.find(l => l.id === id)!;
      return { ...arabicLessonContent(source.content), id, courseId: source.courseId,
        reviewStatus: source.reviewStatus, completed: false };
    };
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      // Test-only transport identity, synchronized with the SDK adapter before
      // its listener fires. Avoid evaluating a page that may be reloading.
      // This cookie is not used by any production server or authentication.
      const identity = (request.headers().cookie?.match(/(?:^|; )test-identity=([^;]+)/)?.[1] ?? null) as Identity;
      state.identity = identity;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (request.method() === 'GET' && path === '/api/auth/session') return json({
        isSignedIn: !!identity,
        user: identity ? { id: identity, fullName: 'Test learner', username: identity, createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null } : null,
      });
      if (request.method() === 'GET') {
        if (path === '/api/profile') return json({ id: identity ?? 'guest', displayName: 'متعلّم', isGuest: !identity, language: 'ar' });
        if (path === '/api/admin/me') return json({ signedIn: !!identity, role: null });
        if (path === '/api/app-settings') return json({ announcementAr: '', announcementEn: '', learningEnabled: true, aiEnabled: true });
        if (path === '/api/billing/status') return json({ ...status(!identity), plan: 'complimentary' });
        if (path === '/api/study-reminders') return json({
          enabled: false, time: '19:00', timezone: 'Africa/Addis_Ababa', scheduled: false,
          paused: false, due: false, occurrenceKey: null, nextDate: null,
          snoozedUntil: null, actionHref: '/learn',
        });
        if (/^\/api\/study-reminders\/devices\/[0-9a-f-]{36}$/.test(path)) return json(reminderDevice);
        if (/^\/api\/billing\/reminder-device\/[0-9a-f-]{36}$/.test(path)) return json(reminderDevice);
        if (path === '/api/courses') return json(courseSeed.map(c => ({
          ...c, completedCount: 0,
          lessons: lessonSeed.filter(l => l.courseId === c.id && !state.archived.has(l.id)).map(l => record(l.id)),
        })));
        if (path === '/api/favourites') {
          const snapshot = [...state.saves.get(identity)!].filter(id => !state.archived.has(id)).map(record);
          state.reads.push(identity);
          if (state.holdReads) await new Promise<void>(resolve => state.pendingReads.push(resolve));
          return json(snapshot);
        }
        const match = path.match(/^\/api\/lessons\/([^/]+)$/);
        if (match && lessonSeed.some(l => l.id === match[1])) {
          return state.archived.has(match[1]!) ? json({ error: 'Unavailable' }, 404) : json(record(match[1]!));
        }
      }
      const match = path.match(/^\/api\/favourites\/([^/]+)$/);
      if (match && ['PUT', 'DELETE'].includes(request.method())) {
        const id = match[1]!;
        expect(lessonSeed.some(l => l.id === id)).toBe(true);
        expect(request.postData(), 'Saves must not send an owner or completion payload').toBeNull();
        state.writes.push({ identity, method: request.method(), id });
        if (request.method() === 'PUT') {
          if (state.archived.has(id)) return json({ error: 'Unavailable' }, 404);
          state.saves.get(identity)!.add(id);
        } else state.saves.get(identity)!.delete(id);
        return route.fulfill({ status: 204 });
      }
      unexpected.push(`${request.method()} ${path}`);
      return json({ error: 'Unconfigured test API request' }, 500);
    });
    await use(state);
    for (const release of state.pendingReads.splice(0)) release();
    expect(unexpected, 'Unexpected API calls must fail closed').toEqual([]);
    expect(errors, 'No browser runtime errors').toEqual([]);
  },
});
export { expect } from '@playwright/test';
