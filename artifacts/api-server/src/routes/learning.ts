import { restrictCatalog } from "../lib/course-month-policy";
import 
{
 Router, type IRouter 
}
 from "express"
;

import 
{
 db, learners, lessons, completions, attempts, reviews, chatMessages, lessonStarts, favourites, type LessonContent 
}
 from "@workspace/db"
;

import 
{
 eq, and, desc, asc, sql 
}
 from "drizzle-orm"
;

import 
{

  GetProfileResponse, SaveProfileBody, GetCoursesResponse, GetLessonParams, GetLessonResponse,
  CompleteLessonBody, CompleteLessonParams, CompleteLessonResponse, GetProgressResponse,
  GetStudyPlanResponse, GetVocabularyResponse, ReviewVocabularyBody, ReviewVocabularyParams,
  ReviewVocabularyResponse, GetBillingStatusResponse, GetFavouritesResponse, SaveFavouriteParams, RemoveFavouriteParams,
  SaveStudyScheduleBody, SelectCoursePlanBody,
}
 from "@workspace/api-zod"
;

import 
{
 getLearner, profileOf 
}
 from "../lib/learner"
;

import 
{
 getCatalog, getWordQueue, progressSummary 
}
 from "../lib/learning"
;

import 
{
 gradeAnswers, nextReviewInterval, boundedActiveSeconds 
}
 from "../lib/scoring"
;

import 
{
 getAuth 
}
 from "../lib/auth"
;

import 
{
 arabicAnswerKey 
}
 from "@workspace/db/pronunciation"
;

import 
{
 buildStudyPlan 
}
 from "../lib/study-plan"
;

import 
{
 billingStatus 
}
 from "../lib/billing-status"
;

import 
{
 schedulePlan, updateSchedule, validStartDate 
}
 from "../lib/study-schedule"
;


const router: IRouter = Router()
;

router.get("/favourites", async (req, res) => 
{

  const learner = await getLearner(req, res)
;

  const [saved, catalog] = await Promise.all([
    db.select().from(favourites).where(eq(favourites.learnerId, learner.id)).orderBy(desc(favourites.savedAt)),
    getCatalog(learner.id),
  ])
;

  const active = new Map(restrictCatalog(catalog, res.locals.courseAccess?.accessibleMonths ?? []).flatMap(c => c.lessons).map(l => [l.id, l]))
;

  res.json(GetFavouritesResponse.parse(saved.flatMap(s => active.has(s.lessonId) ? [active.get(s.lessonId)!] : [])))
;

}
)
;

router.put("/favourites/:id", async (req, res) => 
{

  const p = SaveFavouriteParams.safeParse(req.params)
;

  if (!p.success) 
{
 res.status(400).json(
{
 error: "Invalid lesson" 
}
)
;
 return
;
 
}

  const learner = await getLearner(req, res)
;

  const [lesson] = await db.select(
{
 id: lessons.id 
}
).from(lessons).where(and(eq(lessons.id, p.data.id), eq(lessons.active, true)))
;

  if (!lesson) 
{
 res.status(404).json(
{
 error: "الدرس غير متاح." 
}
)
;
 return
;
 
}

  await db.insert(favourites).values(
{
 learnerId: learner.id, lessonId: lesson.id 
}
).onConflictDoNothing()
;

  res.sendStatus(204)
;

}
)
;

router.delete("/favourites/:id", async (req, res) => 
{

  const p = RemoveFavouriteParams.safeParse(req.params)
;

  if (!p.success) 
{
 res.status(400).json(
{
 error: "Invalid lesson" 
}
)
;
 return
;
 
}

  const learner = await getLearner(req, res)
;

  await db.delete(favourites).where(and(eq(favourites.learnerId, learner.id), eq(favourites.lessonId, p.data.id)))
;

  res.sendStatus(204)
;

}
)
;

router.get("/profile", async (req, res) => 
{

  res.json(GetProfileResponse.parse(profileOf(await getLearner(req, res))))
;

}
)
;

router.put("/profile", async (req, res) => 
{

  const parsed = SaveProfileBody.safeParse(req.body)
;

  if (!parsed.success) 
{
 res.status(400).json(
{
 error: "بيانات الحساب غير صالحة." 
}
)
;
 return
;
 
}

  try 
{
 new Intl.DateTimeFormat("en", 
{
 timeZone: parsed.data.timezone 
}
).format()
;
 
}

  catch 
{
 res.status(400).json(
{
 error: "المنطقة الزمنية غير صالحة." 
}
)
;
 return
;
 
}

  if (
    !/^\d{2}:\d{2}$/.test(parsed.data.reminderTime)
    || Number(parsed.data.reminderTime.slice(0, 2)) > 23
    || Number(parsed.data.reminderTime.slice(3)) > 59
  )
{

    res.status(400).json(
{
 error: "وقت التذكير غير صالح." 
}
)
;
 return
;

  
}

  const learner = await getLearner(req, res)
;

  const preferences = await db.transaction(async tx => 
{

    const [saved] = await tx.update(learners).set(
{
 preferences: sql`${learners.preferences} || ${JSON.stringify(parsed.data)}::jsonb` 
}
).where(eq(learners.id, learner.id)).returning()
;

    if (!parsed.data.retainChat) await tx.delete(chatMessages).where(eq(chatMessages.learnerId, learner.id))
;

    return saved!.preferences as object
;

  
}
)
;

  res.json(GetProfileResponse.parse(
{
 ...learner.preferences, ...preferences, id: learner.id, isGuest: learner.isGuest, joinedAt: learner.joinedAt.toISOString() 
}
))
;

}
)
;

router.put("/study-schedule", async (req, res) => 
{

  const body = SaveStudyScheduleBody.safeParse(req.body)
;

  if (!body.success || (body.data.startDate !== null && !validStartDate(body.data.startDate))
    || (body.success && new Set(body.data.studyDays).size !== body.data.studyDays.length)) 
{

    res.status(400).json(
{
 error: "اختر تاريخًا صالحًا وأيام دراسة غير مكررة." 
}
)
;
 return
;

  
}

  try 
{
 new Intl.DateTimeFormat("en", 
{
 timeZone: body.data.timezone 
}
).format()
;
 
}

  catch 
{
 res.status(400).json(
{
 error: "المنطقة الزمنية غير صالحة." 
}
)
;
 return
;
 
}

  const learner = await getLearner(req, res)
;

  const preferences = await db.transaction(async tx => 
{

    const [row] = await tx.select().from(learners).where(eq(learners.id, learner.id)).for("update")
;

    const previous = GetProfileResponse.parse(
{
 ...profileOf(learner), ...(row!.preferences as object) 
}
)
;

    const studySchedule = updateSchedule(previous.studySchedule ?? null, body.data)
;

    const updated = 
{
 ...(row!.preferences as object), timezone: body.data.timezone, studySchedule 
}
;

    await tx.update(learners).set(
{
 preferences: updated 
}
).where(eq(learners.id, learner.id))
;

    return updated
;

  
}
)
;

  res.json(GetProfileResponse.parse(
{
 ...profileOf(learner), ...preferences 
}
))
;

}
)
;

router.get("/courses", async (req, res) => 
{

  const learner = await getLearner(req, res)
;

  res.json(GetCoursesResponse.parse(restrictCatalog(await getCatalog(learner.id), res.locals.courseAccess?.accessibleMonths ?? [])))
;

}
)
;

router.get("/lessons/:id", async (req, res) => 
{

  const p = GetLessonParams.safeParse(req.params)
;

  if (!p.success) 
{
 res.status(400).json(
{
 error: "Invalid lesson" 
}
)
;
 return
;
 
}

  const learner = await getLearner(req, res)
;

  const catalog = await getCatalog(learner.id)
;

  const lesson = catalog.flatMap(c => c.lessons).find(l => l.id === p.data.id)
;

  if (!lesson) 
{
 res.status(404).json(
{
 error: "الدرس غير موجود." 
}
)
;
 return
;
 
}

  await db.insert(lessonStarts).values(
{
 learnerId: learner.id, lessonId: lesson.id 
}
)
    .onConflictDoNothing()
;

  res.json(GetLessonResponse.parse(lesson))
;

}
)
;

router.post("/lessons/:id/complete", async (req, res) => 
{

  const p = CompleteLessonParams.safeParse(req.params)
;

  const body = CompleteLessonBody.safeParse(req.body)
;

  if (!p.success || !body.success) 
{
 res.status(400).json(
{
 error: "إجابات غير صالحة." 
}
)
;
 return
;
 
}

  const learner = await getLearner(req, res)
;

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, p.data.id))
;

  if (!lesson?.active) 
{
 res.status(404).json(
{
 error: "الدرس غير موجود أو تم إخفاؤه بواسطة الإدارة." 
}
)
;
 return
;
 
}

  const keys = arabicAnswerKey(lesson.answerKey as { correctIndex: number; explanation: string }[])
;

  const exercises = (lesson.content as LessonContent).exercises
;

  if (body.data.answers.length !== keys.length || body.data.answers.some((v, i) => v >= exercises[i]!.options.length)) 
{

    res.status(400).json(
{
 error: "أجب عن جميع الأسئلة أولاً." 
}
)
;
 return
;

  
}

  const 
{
 feedback, score, passed 
}
 = gradeAnswers(body.data.answers, keys)
;

  let xpEarned = 0
;

  await db.transaction(async tx =>
{
  // Serialize submissions for this learner before reading the duplicate guard
  // and timer. Completion/review uniqueness alone cannot protect study time.
  await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, learner.id)).for("update")
;

  const [start] = await tx.select().from(lessonStarts).where(and(eq(lessonStarts.learnerId, learner.id), eq(lessonStarts.lessonId, lesson.id)))
;

  const activeSeconds = boundedActiveSeconds(body.data.activeSeconds, start?.startedAt)
;

  const [last] = await tx.select().from(attempts).where(and(eq(attempts.learnerId, learner.id), eq(attempts.lessonId, lesson.id))).orderBy(desc(attempts.createdAt)).limit(1)
;

  const duplicate = last && Date.now() - last.createdAt.getTime() < 10_000 && JSON.stringify(last.answers) === JSON.stringify(body.data.answers)
;

  if (!duplicate)
{

      await tx.insert(attempts).values(
{
 learnerId: learner.id, lessonId: lesson.id, answers: body.data.answers, score, activeSeconds 
}
)
;

      await tx.update(lessonStarts).set(
{
 startedAt: new Date() 
}
).where(and(eq(lessonStarts.learnerId, learner.id), eq(lessonStarts.lessonId, lesson.id)))
;

      if (passed) 
{

        const inserted = await tx.insert(completions).values(
{
 learnerId: learner.id, lessonId: lesson.id, score 
}
).onConflictDoNothing().returning()
;

        xpEarned = inserted.length ? 30 : 0
;

        for (const word of (lesson.content as LessonContent).words) 
{

          await tx.insert(reviews).values(
{
 learnerId: learner.id, wordId: word.id 
}
).onConflictDoNothing()
;

        
}

      
}

    
}

}
)
;

  res.json(CompleteLessonResponse.parse(
{
 score, passed, xpEarned, feedback 
}
))
;

}
)
;

router.get("/progress/summary", async (req, res) => 
{

  const learner = await getLearner(req, res)
;

  res.json(GetProgressResponse.parse(await progressSummary(learner.id, learner.preferences.timezone)))
;

}
)
;

router.get("/study-plan", async (req, res) => 
{

  const learner = await getLearner(req, res)
;

  const catalog = await getCatalog(learner.id)
;

  const plan = schedulePlan(buildStudyPlan(catalog), learner.preferences.studySchedule, learner.preferences.timezone)
;

  res.json(GetStudyPlanResponse.parse(plan.map(day => ({
    ...day, locked: !(res.locals.courseAccess?.accessibleMonths ?? []).includes(day.month),
  }))))
;

}
)
;

router.get("/vocabulary", async (req, res) => 
{

  res.json(GetVocabularyResponse.parse(await getWordQueue((await getLearner(req, res)).id, res.locals.courseAccess?.accessibleMonths ?? [])))
;

}
)
;

router.post("/vocabulary/:id/review", async (req, res) => 
{

  const p = ReviewVocabularyParams.safeParse(req.params)
;

  const body = ReviewVocabularyBody.safeParse(req.body)
;

  if (!p.success || !body.success) 
{
 res.status(400).json(
{
 error: "Invalid review" 
}
)
;
 return
;
 
}

  const learner = await getLearner(req, res)
;

  const words = await getWordQueue(learner.id, res.locals.courseAccess?.accessibleMonths ?? [])
;

  const word = words.find(w => w.id === p.data.id)
;

  if (!word) 
{
 res.status(404).json(
{
 error: "الكلمة غير موجودة." 
}
)
;
 return
;
 
}

  if (!word.due) 
{
 res.json(ReviewVocabularyResponse.parse(word))
;
 return
;
 
}

  const interval = nextReviewInterval(body.data.remembered, word.interval)
;

  const nextReview = new Date(Date.now() + (interval ? interval * 86400000 : 10 * 60000))
;

  await db.insert(reviews).values(
{
 learnerId: learner.id, wordId: word.id, interval, nextReview, remembered: body.data.remembered 
}
)
    .onConflictDoUpdate(
{
 target: [reviews.learnerId, reviews.wordId], set: 
{
 interval, nextReview, remembered: body.data.remembered 
}
 
}
)
;

  res.json(ReviewVocabularyResponse.parse(
{
 ...word, interval, due: false 
}
))
;

}
)
;

router.post("/billing/selection", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "سجّل الدخول لحفظ اختيار خطتك." });
    return;
  }
  const parsed = SelectCoursePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "اختر التجربة المجانية أو الخطة الشهرية أو خطة الستة أشهر." });
    return;
  }
  const learner = await getLearner(req, res);
  // Preference only: never write payment grants, expiry dates, or trial clocks.
  await db.update(learners).set({
    preferences: sql`${learners.preferences} || ${JSON.stringify({ selectedPlan: parsed.data.plan })}::jsonb`,
  }).where(eq(learners.id, learner.id));
  res.json(GetBillingStatusResponse.parse(await billingStatus(learner.id, userId, req.signedCookies?.hudhud_guest)));
});

router.get("/billing/status", async (req, res) => 
{

  res.setHeader("Cache-Control", "private, no-store")
;

  const learner = await getLearner(req, res)
;

  res.json(GetBillingStatusResponse.parse(await billingStatus(learner.id, getAuth(req).userId, req.signedCookies?.hudhud_guest)))
;

}
)
;

router.get("/account/export", async (req, res) => 
{

  const learner = await getLearner(req, res)
;

  const [history, vocabulary, messages, saved] = await Promise.all([
    db.select().from(attempts).where(eq(attempts.learnerId, learner.id)),
    db.select().from(reviews).where(eq(reviews.learnerId, learner.id)),
    db.select().from(chatMessages).where(eq(chatMessages.learnerId, learner.id)).orderBy(asc(chatMessages.createdAt)),
    db.select(
{
 lessonId: favourites.lessonId, savedAt: favourites.savedAt 
}
).from(favourites)
      .innerJoin(lessons, and(eq(favourites.lessonId, lessons.id), eq(lessons.active, true)))
      .where(eq(favourites.learnerId, learner.id)),
  ])
;

  res.json(
{
 profile: profileOf(learner), progress: await progressSummary(learner.id, learner.preferences.timezone), history, vocabulary, messages, favourites: saved 
}
)
;

}
)
;

router.delete("/account", async (req, res) => 
{

  const learner = await getLearner(req, res)
;

  await db.delete(learners).where(eq(learners.id, learner.id))
;

  res.clearCookie("hudhud_guest", 
{
 path: "/api" 
}
)
;

  res.clearCookie("hudhud_lesson_start", 
{
 path: "/api" 
}
)
;

  res.json(
{
 status: "Learning data deleted. Your username and sign-in account remain active."
}
)
;

}
)
;

export default router
;
