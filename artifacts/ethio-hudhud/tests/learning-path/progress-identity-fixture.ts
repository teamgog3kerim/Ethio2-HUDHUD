import { test as base, expect, type Page } from '@playwright/test';
import { courseSeed, lessonSeed } from '@workspace/db/seed-data';
import { arabicLessonContent } from '@workspace/db/pronunciation';
import { status, reminderDevice } from './billing-data';

export type Identity = 'progress-a' | 'progress-b' | null;
export const lessons = [...courseSeed].sort((a, b) => a.month - b.month)
  .flatMap(c => lessonSeed.filter(l => l.courseId === c.id).sort((a, b) => a.sequence - b.sequence));
export const identities: Identity[] = [null, 'progress-a', 'progress-b'];

export async function switchIdentity(page: Page, identity: Identity) {
  // Only the isolated auth adapter and this route fixture recognize this cookie.
  // Update transport identity before the production listener starts refetching.
  await page.evaluate(id => {
    document.cookie = id ? `test-identity=${id}; Path=/` : 'test-identity=; Max-Age=0; Path=/';
    window.dispatchEvent(new CustomEvent('test-identity', { detail: id }));
  }, identity);
}

function createState() {
  return {
    // Deliberately different completed sets, XP and next lessons for every owner.
    records: new Map(identities.map((id, index) => [id, {
      // A unique non-prefix lesson ensures accidentally merging the guest's
      // completions into an account cannot look like a correct prefix total.
      completed: new Set([...lessons.slice(0, index + 1), lessons[index + 5]!].map(l => l.id)),
      xp: (index + 2) * 30,
    }])),
    hold: undefined as { identity: Identity; paths: string[] } | undefined,
    pending: [] as { identity: Identity; path: string; release: () => void }[],
    reads: [] as { identity: Identity; path: string }[],
    submissions: [] as { identity: Identity; id: string; score: number; xpEarned: number }[],
    release() {
      this.hold = undefined;
      for (const pending of this.pending.splice(0)) pending.release();
    },
  };
}

export const test = base.extend<{ progress: ReturnType<typeof createState> }>({
  progress: async ({ page }, use) => {
    const state = createState();
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const identity = (request.headers().cookie?.match(/(?:^|; )test-identity=([^;]+)/)?.[1] ?? null) as Identity;
      const record = state.records.get(identity);
      if (request.method() === 'GET' && path === '/api/auth/session') return route.fulfill({ json: {
        isSignedIn: !!identity,
        user: identity ? { id: identity, fullName: 'Test learner', username: identity, createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null } : null,
      } });
      const completion = path.match(/^\/api\/lessons\/([^/]+)\/complete$/);
      if (request.method() === 'POST' && completion && record) {
        const lesson = lessons.find(l => l.id === completion[1]);
        expect(lesson, 'Completion must reference isolated curriculum').toBeDefined();
        const body = request.postDataJSON();
        expect(Object.keys(body).sort()).toEqual(['activeSeconds', 'answers']);
        expect(body.answers).toHaveLength(lesson!.answerKey.length);
        expect(body.activeSeconds).toBeGreaterThanOrEqual(0);
        expect(body.activeSeconds).toBeLessThanOrEqual(3600);
        const feedback = lesson!.answerKey.map((key, i) => ({ ...key, correct: body.answers[i] === key.correctIndex }));
        const score = Math.round(100 * feedback.filter(f => f.correct).length / feedback.length);
        const passed = score >= 75;
        const xpEarned = passed && !record.completed.has(lesson!.id) ? 30 : 0;
        // Model a committed write with only its HTTP response still in flight.
        // Real database persistence is covered by the API integration suite.
        if (passed) record.completed.add(lesson!.id);
        record.xp += xpEarned;
        state.submissions.push({ identity, id: lesson!.id, score, xpEarned });
        if (state.hold?.identity === identity && state.hold.paths.includes(path)) {
          await new Promise<void>(release => state.pending.push({ identity, path, release }));
        }
        return route.fulfill({ json: { score, passed, xpEarned, feedback } });
      }
      if (request.method() !== 'GET' || !record) {
        unexpected.push(`${request.method()} ${path} (${identity})`);
        return route.fulfill({ status: 500, json: { error: 'Unexpected test request' } });
      }
      state.reads.push({ identity, path });
      const catalog = () => courseSeed.map(c => ({
        ...c,
        completedCount: lessonSeed.filter(l => l.courseId === c.id && record.completed.has(l.id)).length,
        lessons: lessons.filter(l => l.courseId === c.id).map(l => ({
          ...arabicLessonContent(l.content), id: l.id, courseId: l.courseId,
          reviewStatus: l.reviewStatus, completed: record.completed.has(l.id),
        })),
      }));
      let body: unknown;
      if (path === '/api/courses') body = catalog();
      else if (/^\/api\/lessons\/[^/]+$/.test(path)) {
        body = catalog().flatMap(c => c.lessons).find(l => l.id === path.split('/').at(-1));
        expect(body, 'Lesson must exist in isolated curriculum').toBeDefined();
      }
      else if (path === '/api/progress/summary') body = {
        lessonsCompleted: record.completed.size, totalLessons: lessons.length,
        xp: record.xp, vocabularyLearned: 0, totalMinutes: 0, todayMinutes: 0,
        streak: 0, averageScore: 100, activity: [], recentLessons: [...record.completed],
      };
      else if (path === '/api/profile') body = {
        id: identity ?? 'isolated-progress-guest', displayName: identity ?? 'ضيف',
        isGuest: !identity, language: 'ar', onboardingComplete: true, dailyGoal: 15,
      };
      else if (path === '/api/admin/me') body = { signedIn: !!identity, role: null };
      else if (path === '/api/app-settings') body = { announcementAr: '', announcementEn: '', learningEnabled: true, aiEnabled: true };
      else if (path === '/api/billing/status') body = { ...status(!identity), plan: 'complimentary' };
      else if (/^\/api\/billing\/reminder-device\/[0-9a-f-]{36}$/.test(path)) body = reminderDevice;
      else if (['/api/vocabulary', '/api/study-plan', '/api/favourites'].includes(path)) body = [];
      else {
        unexpected.push(`${request.method()} ${path}`);
        return route.fulfill({ status: 500, json: { error: 'Unconfigured test API request' } });
      }
      // Capture the outgoing owner's snapshot before blocking its response.
      if (state.hold?.identity === identity && state.hold.paths.includes(path)) {
        await new Promise<void>(release => state.pending.push({ identity, path, release }));
      }
      await route.fulfill({ json: body });
    });
    try {
      await use(state);
    } finally {
      state.release();
      expect(unexpected, 'Every API call must stay inside the isolated identity fixture').toEqual([]);
      expect(errors, 'No browser runtime errors').toEqual([]);
    }
  },
});
export { expect } from '@playwright/test';
