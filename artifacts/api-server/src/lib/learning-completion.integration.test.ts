import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import express from "express";
import { and, eq } from "drizzle-orm";
import { db, pool, learners, lessons, lessonStarts, completions, attempts, reviews } from "@workspace/db";
import type { LessonContent } from "@workspace/db";
import learningRouter from "../routes/learning";
import { defaultPreferences } from "./learner";
import { GetCoursesResponse, GetLessonResponse, GetProgressResponse, CompleteLessonResponse, GetProfileResponse, GetStudyPlanResponse } from "@workspace/api-zod";

// All cases share this pool; close it only after every isolated learner is cleaned up.
after(() => pool.end());

test("real completion credit stays with the submitting account while its response is delayed", {
  skip: process.env.RUN_LEARNING_INTEGRATION !== "1",
  timeout: 30_000,
}, async t => {
  const accountA = `regression-${randomUUID()}`;
  const accountB = `regression-${randomUUID()}`;
  const guest = randomUUID();
  const owners = [accountA, accountB, null] as const;
  const isolated = new Map<string | null, typeof learners.$inferSelect>();
  for (const owner of owners) {
    const identity = owner ? `account:${owner}` : `guest:${guest}`;
    const [learner] = await db.insert(learners).values({ identity, preferences: defaultPreferences }).returning();
    assert.ok(learner);
    isolated.set(owner, learner);
    t.after(() => db.delete(learners).where(and(eq(learners.id, learner.id), eq(learners.identity, identity))));
  }

  let activeOwner: string | null = accountA;
  let release: (() => void) | undefined;
  let captured: (() => void) | undefined;
  let heldResult: unknown;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    // Capture transport identity per request, never read the later session in
    // the completion handler. No credentials, auth bypass or test route ship.
    const requestOwner = activeOwner;
    Object.assign(req, { hudhudAuth: { userId: requestOwner }, signedCookies: { hudhud_guest: guest } });
    if (req.method === "POST" && req.path.endsWith("/complete")) {
      const send = res.json.bind(res);
      const gate = new Promise<void>(resolve => { release = resolve; });
      res.json = body => {
        heldResult = body;
        captured?.();
        void gate.then(() => send(body));
        return res;
      };
    }
    next();
  });
  app.use(learningRouter);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => {
    release?.();
    server.closeAllConnections();
    return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const catalog = GetCoursesResponse.parse(await get("/courses"));
  const selected = catalog.flatMap(c => c.lessons).slice(0, 2);
  assert.equal(selected.length, 2, "Existing seeded active curriculum is required");
  for (const [index, incoming] of [accountB, null].entries()) {
    activeOwner = accountA;
    const lessonId = selected[index]!.id;
    const [source] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    assert.ok(source);
    const committed = new Promise<void>(resolve => { captured = resolve; });
    const pending = fetch(`${base}/lessons/${lessonId}/complete`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: (source.answerKey as { correctIndex: number }[]).map(k => k.correctIndex), activeSeconds: 0 }),
      signal: AbortSignal.timeout(15_000),
    });
    // res.json is called only after the production transaction commits.
    await Promise.race([committed, pending.then(() => { throw new Error("Completion response was not delayed"); })]);
    assert.equal(CompleteLessonResponse.parse(heldResult).xpEarned, 30);
    activeOwner = incoming;
    const incomingSummary = GetProgressResponse.parse(await get("/progress/summary"));
    assert.equal(incomingSummary.xp, 0);
    assert.equal(incomingSummary.lessonsCompleted, 0);
    assert.equal(GetLessonResponse.parse(await get(`/lessons/${lessonId}`)).completed, false);
    const ownerRow = isolated.get(accountA)!;
    const saved = await db.select().from(completions)
      .where(and(eq(completions.learnerId, ownerRow.id), eq(completions.lessonId, lessonId)));
    assert.equal(saved.length, 1, "Original account already owns persisted credit before delivery");
    release!();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.equal(CompleteLessonResponse.parse(await response.json()).score, 100);
    assert.equal(GetProgressResponse.parse(await get("/progress/summary")).xp, 0);
    activeOwner = accountA;
    const original = GetProgressResponse.parse(await get("/progress/summary"));
    assert.equal(original.xp, (index + 1) * 30);
    assert.equal(original.lessonsCompleted, index + 1);
    assert.equal(GetLessonResponse.parse(await get(`/lessons/${lessonId}`)).completed, true);
    const [retained] = await db.select().from(completions)
      .where(and(eq(completions.learnerId, ownerRow.id), eq(completions.lessonId, lessonId)));
    assert.equal(retained!.id, saved[0]!.id);
    assert.equal(retained!.completedAt.getTime(), saved[0]!.completedAt.getTime());
  }
});

// Opt-in because it needs a migrated development/test database. The canonical
// test:learning-path command enables it, so the release check cannot silently
// skip persistence coverage. No seed, schema push, truncation or lesson edits.
test("real completion routes: browsing, failure, retry, reload and one-time credit", {
  skip: process.env.RUN_LEARNING_INTEGRATION !== "1",
}, async t => {
  const guest = randomUUID();
  const identity = `guest:${guest}`;
  const [learner] = await db.insert(learners).values({ identity, preferences: defaultPreferences }).returning();
  assert.ok(learner);
  t.after(async () => {
    // Cascades only this UUID learner's attempts, starts, reviews and progress.
    await db.delete(learners).where(and(eq(learners.id, learner.id), eq(learners.identity, identity)));
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Same trusted identity boundary used by the existing integration harness;
    // this middleware exists only in this test, never the application.
    Object.assign(req, { hudhudAuth: { userId: null }, signedCookies: { hudhud_guest: guest } });
    next();
  });
  app.use(learningRouter);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  // Ephemeral test harness, not a managed application service.
  const base = `http://127.0.0.1:${address.port}`;
  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const post = (id: string, body: unknown) => fetch(`${base}/lessons/${id}/complete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const rows = (table: typeof completions | typeof attempts | typeof reviews) =>
    db.select().from(table).where(eq(table.learnerId, learner.id));
  const counts = async (done: number, tries: number, words: number) => {
    assert.equal((await rows(completions)).length, done, "completion count");
    assert.equal((await rows(attempts)).length, tries, "attempt count");
    assert.equal((await rows(reviews)).length, words, "review count");
    const summary = GetProgressResponse.parse(await get("/progress/summary"));
    assert.equal(summary.lessonsCompleted, done);
    assert.equal(summary.xp, done * 30);
  };
  const catalog = GetCoursesResponse.parse(await get("/courses"));
  const lessonId = catalog[0]?.lessons[0]?.id;
  assert.ok(lessonId, "A migrated database with seeded active curriculum is required");
  const [source] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  assert.ok(source);
  const keys = source.answerKey as { correctIndex: number; explanation: string }[];
  const exercises = (source.content as LessonContent).exercises;
  const correct = keys.map(k => k.correctIndex);
  const incorrect = keys.map((k, i) => (k.correctIndex + 1) % exercises[i]!.options.length);
  const wordCount = new Set((source.content as LessonContent).words.map(w => w.id)).size;

  const rawViewed = await get(`/lessons/${lessonId}`);
  assert.ok(rawViewed && typeof rawViewed === "object");
  assert.equal("answerKey" in rawViewed, false, "Answer keys must remain server-only");
  const viewed = GetLessonResponse.parse(rawViewed);
  assert.equal(viewed.completed, false);
  assert.equal("answerKey" in viewed, false, "Answer keys must remain server-only");
  assert.ok(viewed.exercises.every((e: object) => !("correctIndex" in e)));
  // Refreshing and browsing the catalogue must never award completion.
  await get(`/lessons/${lessonId}`);
  await get("/courses");
  await counts(0, 0, 0);
  for (const answers of [[], correct.slice(1), correct.map(() => 999), correct.map(() => -1)]) {
    assert.equal((await post(lessonId, { answers, activeSeconds: 15 })).status, 400);
  }
  assert.equal((await post("regression-missing-lesson", { answers: correct, activeSeconds: 15 })).status, 404);
  await counts(0, 0, 0);
  // A forged success/score cannot override grading.
  const failed = await post(lessonId, { answers: incorrect, activeSeconds: 15, passed: true, score: 100 });
  assert.equal(failed.status, 200);
  const failure = CompleteLessonResponse.parse(await failed.json());
  assert.equal(failure.passed, false);
  assert.equal(failure.score, 0);
  assert.equal(failure.xpEarned, 0);
  await counts(0, 1, 0);
  assert.equal(GetLessonResponse.parse(await get(`/lessons/${lessonId}`)).completed, false);
  // Immediate same-answer retries are deduplicated and still cannot award credit.
  assert.equal(CompleteLessonResponse.parse(await (await post(lessonId, { answers: incorrect, activeSeconds: 15 })).json()).xpEarned, 0);
  await counts(0, 1, 0);
  // Give only this UUID learner a measurable study interval without sleeping.
  // All requests below represent the same passing submission arriving together.
  const beforePassing = await db.select().from(attempts).where(eq(attempts.learnerId, learner.id));
  const expectedStudySeconds = beforePassing.reduce((seconds, attempt) => seconds + attempt.activeSeconds, 0) + 15;
  await db.update(lessonStarts).set({ startedAt: new Date(Date.now() - 60_000) })
    .where(and(eq(lessonStarts.learnerId, learner.id), eq(lessonStarts.lessonId, lessonId)));
  const passingResponses = await Promise.all(Array.from({ length: 4 }, () =>
    post(lessonId, { answers: correct, activeSeconds: 15 })));
  const successes = await Promise.all(passingResponses.map(async response => {
    assert.equal(response.status, 200);
    return CompleteLessonResponse.parse(await response.json());
  }));
  assert.ok(successes.every(success => success.passed && success.score === 100));
  assert.equal(successes.reduce((xp, success) => xp + success.xpEarned, 0), 30,
    "simultaneous passing submissions award exactly 30 XP in total");
  assert.equal(successes.filter(success => success.xpEarned === 30).length, 1,
    "only one response awards completion credit");
  await counts(1, 2, wordCount);
  const savedReviews = await db.select().from(reviews).where(eq(reviews.learnerId, learner.id));
  assert.deepEqual(new Set(savedReviews.map(review => review.wordId)),
    new Set((source.content as LessonContent).words.map(word => word.id)),
    "each lesson word has exactly one review");
  const assertStudyTime = async () => {
    const savedAttempts = await db.select().from(attempts).where(eq(attempts.learnerId, learner.id));
    assert.equal(savedAttempts.reduce((seconds, attempt) => seconds + attempt.activeSeconds, 0), expectedStudySeconds,
      "concurrent submissions and immediate retries count the study interval once");
    assert.equal(GetProgressResponse.parse(await get("/progress/summary")).totalMinutes, Math.round(expectedStudySeconds / 6) / 10,
      "reported study time matches the single saved interval");
  };
  await assertStudyTime();
  assert.equal(GetLessonResponse.parse(await get(`/lessons/${lessonId}`)).completed, true);
  const refreshed = GetCoursesResponse.parse(await get("/courses"));
  assert.equal(refreshed.flatMap(c => c.lessons).find(l => l.id === lessonId)!.completed, true);
  assert.equal(refreshed.find(c => c.id === source.courseId)!.completedCount, 1);
  const [original] = await db.select().from(completions).where(eq(completions.learnerId, learner.id));
  assert.ok(original);
  assert.equal(CompleteLessonResponse.parse(await (await post(lessonId, { answers: correct, activeSeconds: 15 })).json()).xpEarned, 0);
  await counts(1, 2, wordCount);
  await assertStudyTime();
  // Also exercise a genuinely new passing attempt, not only the 10s duplicate
  // guard. Age only our test learner's attempt (no sleep and no real data).
  await db.update(attempts).set({ createdAt: new Date(Date.now() - 20_000) })
    .where(and(eq(attempts.learnerId, learner.id), eq(attempts.lessonId, lessonId)));
  assert.equal(CompleteLessonResponse.parse(await (await post(lessonId, { answers: correct, activeSeconds: 15 })).json()).xpEarned, 0);
  await counts(1, 3, wordCount);
  const [persisted] = await db.select().from(completions).where(eq(completions.learnerId, learner.id));
  assert.equal(persisted!.id, original.id);
  assert.equal(persisted!.completedAt.getTime(), original.completedAt.getTime());

  // Scheduling is preference data, not completion data. Exercise the actual
  // routes and stored timestamps rather than browser doubles.
  const put = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const staleProfile = GetProfileResponse.parse(await get("/profile"));
  const scheduleInput = { startDate: "2026-10-19", studyDays: [1, 3, 5], timezone: "Asia/Riyadh", paused: false };
  for (const invalid of [
    { ...scheduleInput, startDate: "2026-02-30" },
    { ...scheduleInput, timezone: "Not/A_Timezone" },
    { ...scheduleInput, studyDays: [] },
    { ...scheduleInput, studyDays: [1, 1] },
    { ...scheduleInput, studyDays: [7] },
  ]) assert.equal((await put("/study-schedule", invalid)).status, 400);
  assert.equal((await put("/study-schedule", scheduleInput)).status, 200);
  let savedProfile = GetProfileResponse.parse(await get("/profile"));
  assert.equal(savedProfile.studySchedule!.startDate, scheduleInput.startDate);
  assert.deepEqual(savedProfile.studySchedule!.studyDays, [1, 3, 5]);
  assert.equal(savedProfile.timezone, "Asia/Riyadh");
  assert.equal(savedProfile.reminderEnabled, false);
  // Older web/native clients and a language toggle omit scheduling fields.
  // A stale whole-profile save must not silently remove a newly saved schedule.
  assert.equal((await put("/profile", { ...staleProfile, displayName: "Schedule test", studySchedule: null })).status, 200);
  savedProfile = GetProfileResponse.parse(await get("/profile"));
  assert.equal(savedProfile.studySchedule!.startDate, scheduleInput.startDate);
  assert.equal(savedProfile.displayName, "Schedule test");
  assert.equal((await put("/study-schedule", { ...scheduleInput, paused: true })).status, 200);
  savedProfile = GetProfileResponse.parse(await get("/profile"));
  assert.ok(savedProfile.studySchedule!.pausedOn);
  let savedPlan = GetStudyPlanResponse.parse(await get("/study-plan"));
  assert.ok(savedPlan.every(day => !day.overdue && !!day.suggestedDate));
  assert.equal((await put("/study-schedule", { ...scheduleInput, paused: false })).status, 200);
  assert.equal(GetProfileResponse.parse(await get("/profile")).studySchedule!.pausedOn, null);
  assert.equal((await put("/study-schedule", { ...scheduleInput, startDate: "2027-01-04", studyDays: [1] })).status, 200);
  savedPlan = GetStudyPlanResponse.parse(await get("/study-plan"));
  assert.equal(savedPlan[0]!.suggestedDate, "2027-01-04");
  assert.equal(savedPlan.find(day => day.lessonId === lessonId && day.type === "lesson")!.completed, true);
  assert.equal((await put("/study-schedule", { ...scheduleInput, startDate: null })).status, 200);
  assert.equal(GetProfileResponse.parse(await get("/profile")).studySchedule, null);
  assert.ok(GetStudyPlanResponse.parse(await get("/study-plan")).every(day => day.suggestedDate === null && !day.overdue));
  await counts(1, 3, wordCount);
  const [afterSchedule] = await db.select().from(completions).where(eq(completions.learnerId, learner.id));
  assert.equal(afterSchedule!.id, original.id);
  assert.equal(afterSchedule!.completedAt.getTime(), original.completedAt.getTime());
});

test("real completion routes: concurrent different lessons both retain credit and study time", {
  skip: process.env.RUN_LEARNING_INTEGRATION !== "1",
}, async t => {
  const guest = randomUUID();
  const identity = `guest:${guest}`;
  const [learner] = await db.insert(learners).values({ identity, preferences: defaultPreferences }).returning();
  assert.ok(learner);
  t.after(async () => {
    // Never delete curriculum or records belonging to any other learner.
    await db.delete(learners).where(and(eq(learners.id, learner.id), eq(learners.identity, identity)));
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { hudhudAuth: { userId: null }, signedCookies: { hudhud_guest: guest } });
    next();
  });
  app.use(learningRouter);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    return response.json();
  };

  // Read the existing active curriculum, requiring an actual shared word so the
  // review uniqueness assertion cannot pass vacuously. No seed or lesson edits.
  const catalog = GetCoursesResponse.parse(await get("/courses"));
  const visibleIds = new Set(catalog.flatMap(course => course.lessons.map(lesson => lesson.id)));
  const sources = (await db.select().from(lessons).where(eq(lessons.active, true)))
    .filter(lesson => visibleIds.has(lesson.id));
  const pair = sources.flatMap((first, index) =>
    sources.slice(index + 1).filter(second =>
      (first.content as LessonContent).words.some(word =>
        (second.content as LessonContent).words.some(other => other.id === word.id)))
      .map(second => [first, second] as const))[0];
  assert.ok(pair, "Existing active curriculum must contain two different lessons with shared vocabulary");
  assert.notEqual(pair[0].id, pair[1].id);
  const intervals = [45, 75] as const;
  const submissions = pair.map((lesson, index) => ({
    lesson,
    answers: (lesson.answerKey as { correctIndex: number }[]).map(key => key.correctIndex),
    activeSeconds: intervals[index]!,
  }));
  const expectedWords = new Set(pair.flatMap(lesson => (lesson.content as LessonContent).words.map(word => word.id)));
  const expectedStudySeconds = intervals[0] + intervals[1];

  for (const { lesson } of submissions) {
    assert.equal(GetLessonResponse.parse(await get(`/lessons/${lesson.id}`)).completed, false);
    // Represent actual elapsed study without sleeping; scope timer changes to
    // the UUID learner and give each lesson enough time for its own interval.
    const starts = await db.update(lessonStarts).set({ startedAt: new Date(Date.now() - 120_000) })
      .where(and(eq(lessonStarts.learnerId, learner.id), eq(lessonStarts.lessonId, lesson.id)))
      .returning();
    assert.equal(starts.length, 1);
  }
  const responses = await Promise.all(submissions.map(({ lesson, answers, activeSeconds }) =>
    fetch(`${base}/lessons/${lesson.id}/complete`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers, activeSeconds }),
    })));
  const results = await Promise.all(responses.map(async response => {
    assert.equal(response.status, 200);
    return CompleteLessonResponse.parse(await response.json());
  }));
  for (const result of results) {
    assert.equal(result.passed, true);
    assert.equal(result.score, 100);
    assert.equal(result.xpEarned, 30, "a different lesson is legitimate work, not a duplicate");
  }
  assert.equal(results.reduce((xp, result) => xp + result.xpEarned, 0), 60);

  const savedCompletions = await db.select().from(completions).where(eq(completions.learnerId, learner.id));
  assert.equal(savedCompletions.length, 2);
  assert.deepEqual(new Set(savedCompletions.map(row => row.lessonId)), new Set(pair.map(lesson => lesson.id)));
  const savedAttempts = await db.select().from(attempts).where(eq(attempts.learnerId, learner.id));
  assert.equal(savedAttempts.length, 2);
  for (const { lesson, answers, activeSeconds } of submissions) {
    const lessonAttempts = savedAttempts.filter(attempt => attempt.lessonId === lesson.id);
    assert.equal(lessonAttempts.length, 1, "each lesson keeps its own attempt");
    assert.deepEqual(lessonAttempts[0]!.answers, answers);
    assert.equal(lessonAttempts[0]!.score, 100);
    assert.equal(lessonAttempts[0]!.activeSeconds, activeSeconds, "each lesson retains its actual interval");
    assert.equal(GetLessonResponse.parse(await get(`/lessons/${lesson.id}`)).completed, true);
  }
  assert.equal(savedAttempts.reduce((seconds, attempt) => seconds + attempt.activeSeconds, 0), expectedStudySeconds);
  const savedReviews = await db.select().from(reviews).where(eq(reviews.learnerId, learner.id));
  assert.equal(savedReviews.length, expectedWords.size, "shared words get only one review");
  assert.deepEqual(new Set(savedReviews.map(review => review.wordId)), expectedWords);

  // Fresh reads must reflect both committed transactions, not just response XP.
  const progress = GetProgressResponse.parse(await get("/progress/summary"));
  assert.equal(progress.lessonsCompleted, 2);
  assert.equal(progress.xp, 60);
  assert.equal(progress.totalMinutes, Math.round(expectedStudySeconds / 6) / 10);
  const refreshed = GetCoursesResponse.parse(await get("/courses"));
  for (const lesson of pair) {
    assert.equal(refreshed.flatMap(course => course.lessons).find(row => row.id === lesson.id)!.completed, true);
  }
});
