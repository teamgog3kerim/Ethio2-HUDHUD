import type { RequestHandler } from "express";
import { getAuth } from "./auth";
import { isCourseResource } from "./billing-policy";
import { billingStatus } from "./billing-status";
import { getLearner } from "./learner";
import { db, courses, lessons } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function lockedLessonMonth(path: string, accessibleMonths: number[]) {
  const match = /^\/lessons\/([^/]+)(?:\/complete)?\/?$/.exec(path);
  if (!match) return null;
  let id: string;
  try { id = decodeURIComponent(match[1]!); } catch { return null; }
  const [lesson] = await db.select({ month: courses.month }).from(lessons)
    .innerJoin(courses, eq(courses.id, lessons.courseId)).where(eq(lessons.id, id)).limit(1);
  return lesson && !accessibleMonths.includes(lesson.month) ? lesson.month : null;
}

export const enforceCourseAccess: RequestHandler = async (req, res, next) => {
  // Resolve verified entitlements for every content response, not just the
  // global expired-trial gate. Paid monthly access is month-specific.
  if (!isCourseResource(req.method, req.path)) {
    next();
    return;
  }
  if (!getAuth(req).userId) {
    res.status(401).json({
      error: "أنشئ حساباً لبدء تجربتك المجانية لمدة 48 ساعة ومتابعة التعلّم.",
      code: "COURSE_SIGN_IN_REQUIRED",
      subscribePath: "/sign-up?plan=trial",
    });
    return;
  }
  const learner = await getLearner(req, res);
  const status = await billingStatus(learner.id, getAuth(req).userId, req.signedCookies?.hudhud_guest);
  if (!status.fullCourseAccess) {
    res.status(403).json({
      error: status.message,
      code: "COURSE_SUBSCRIPTION_REQUIRED",
      subscribePath: "/choose-plan",
    });
    return;
  }
  res.locals.courseAccess = status;
  const month = await lockedLessonMonth(req.path, status.accessibleMonths);
  if (month !== null) {
    const scheduled = status.scheduledCourseMonths.find(item => item.month === month);
    res.status(403).json({
      error: scheduled
        ? `هذا الشهر مدفوع ويبدأ في ${scheduled.startsAt}. لا تحتاج إلى الدفع مرة أخرى.`
        : `هذا الدرس من الشهر ${month} وغير مشمول في وصولك الحالي. تابع خطة الاشتراك الشهري بالترتيب أو اختر اشتراك الستة أشهر.`,
      startsAt: scheduled?.startsAt ?? null,
      code: "COURSE_MONTH_REQUIRED", month, subscribePath: "/choose-plan",
    });
    return;
  }
  next();
};
