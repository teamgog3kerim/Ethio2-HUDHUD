import { test as base, expect } from '@playwright/test';
import { courseSeed, lessonSeed } from '@workspace/db/seed-data';
import { arabicLessonContent } from '@workspace/db/pronunciation';
import { status } from './billing-data';

export const orderedCourses = [...courseSeed].sort((a, b) => a.month - b.month);
export const orderedLessons = orderedCourses.flatMap(course =>
  lessonSeed.filter(l => l.courseId === course.id).sort((a, b) => a.sequence - b.sequence));
export const boundary = orderedLessons.filter(l => l.courseId === orderedCourses[0]!.id).at(-1)!;
export const afterBoundary = orderedLessons[orderedLessons.indexOf(boundary) + 1]!;

// Each test owns this in-memory learner. It survives page reloads, but cannot
// access a database, production account or the running application's API.
export const test = base.extend<{ learner: {
  completed: Set<string>;
  submissions: { id: string; answers: number[] }[];
  unexpected: string[];
  failNext: boolean;
} }>({
  learner: async ({ page }, use) => {
    const learner = { completed: new Set<string>(), submissions: [] as { id: string; answers: number[] }[], unexpected: [] as string[], failNext: false };
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const catalog = () => orderedCourses.map(c => ({
      ...c,
      completedCount: lessonSeed.filter(l => l.courseId === c.id && learner.completed.has(l.id)).length,
      lessons: orderedLessons.filter(l => l.courseId === c.id).map(l => ({
        ...arabicLessonContent(l.content), id: l.id, courseId: l.courseId,
        completed: learner.completed.has(l.id), reviewStatus: l.reviewStatus,
      })),
    }));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path === '/api/courses') return json(catalog());
      if (path === '/api/profile') return json({ id: 'isolated-browser-learner', displayName: 'متعلّم', isGuest: true, language: 'ar' });
      if (path === '/api/admin/me') return json({ signedIn: false, role: null });
      if (path === '/api/app-settings') return json({ announcementAr: '', announcementEn: '', learningEnabled: true, aiEnabled: true });
      if (path === '/api/billing/status') return json({ ...status(), plan: 'complimentary' });
      if (path === '/api/favourites') return json([]);
      const match = path.match(/^\/api\/lessons\/([^/]+)(\/complete)?$/);
      if (match) {
        const lesson = lessonSeed.find(l => l.id === match[1]);
        if (!lesson) return json({ error: 'Unknown lesson' }, 404);
        if (!match[2]) return json(catalog().flatMap(c => c.lessons).find(l => l.id === lesson.id));
        expect(request.method()).toBe('POST');
        const body = request.postDataJSON();
        // Lock down the generated client's request contract; never accept a
        // client-supplied score, pass flag or owner.
        expect(Object.keys(body).sort()).toEqual(['activeSeconds', 'answers']);
        expect(body.answers).toHaveLength(lesson.answerKey.length);
        expect(body.activeSeconds).toBeGreaterThanOrEqual(0);
        expect(body.activeSeconds).toBeLessThanOrEqual(3600);
        learner.submissions.push({ id: lesson.id, answers: body.answers });
        if (learner.failNext) {
          learner.failNext = false;
          return json({ error: 'Temporary grading failure' }, 503);
        }
        // Contract double only. Real grading and persistence are checked
        // separately against the production Express completion route.
        const feedback = lesson.answerKey.map((k, i) => ({ ...k, correct: body.answers[i] === k.correctIndex }));
        const score = Math.round(100 * feedback.filter(f => f.correct).length / feedback.length);
        const passed = score >= 75;
        const xpEarned = passed && !learner.completed.has(lesson.id) ? 30 : 0;
        if (passed) learner.completed.add(lesson.id);
        return json({ score, passed, xpEarned, feedback });
      }
      learner.unexpected.push(`${request.method()} ${path}`);
      return json({ error: 'Unconfigured test API request' }, 500);
    });
    await use(learner);
    expect(learner.unexpected, 'Every API request must be intercepted explicitly').toEqual([]);
    expect(pageErrors, 'Pages must not throw runtime errors').toEqual([]);
  },
});
export { expect } from '@playwright/test';
