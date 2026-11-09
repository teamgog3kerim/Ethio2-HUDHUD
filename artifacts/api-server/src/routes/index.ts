import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import learningRouter from "./learning";
import tutorRouter from "./tutor";
import renewalRouter from "./renewal";
import adminRouter from "./admin";
import polarSandboxRouter from "./polar-sandbox";
import polarLiveRouter from "./polar-live";
import { enforceAccountStatus } from "../lib/admin-auth";
import { getAppSettings } from "../lib/app-settings";
import { HttpError } from "../lib/http-error";
import { enforceCourseAccess } from "../lib/course-access";
import studyReminderRouter from "./study-reminders";
import visitorAnalyticsRouter from "./visitor-analytics";
import { db, courses } from "@workspace/db";
import { asc } from "drizzle-orm";
import { GetCourseCatalogResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.get("/course-catalog", async (_req, res) => {
  const outlines = await db.select({
    id: courses.id, month: courses.month, titleAr: courses.titleAr,
    titleEn: courses.titleEn, description: courses.description,
  }).from(courses).orderBy(asc(courses.month));
  res.json(GetCourseCatalogResponse.parse(outlines));
});
router.get("/app-settings", async (_req, res) => {
  const { defaultDailyGoal: _privateDefault, ...settings } = await getAppSettings();
  res.json(settings);
});
router.use("/visitor/pageview", visitorAnalyticsRouter);
router.use(enforceAccountStatus);
router.use("/admin", adminRouter);
router.use(polarSandboxRouter);
router.use(polarLiveRouter);
router.use(async (req, _res, next) => {
  if (req.method === "POST") {
    const settings = await getAppSettings();
    if (!settings.learningEnabled && (/^\/lessons\/[^/]+\/complete$/.test(req.path) || /^\/vocabulary\/[^/]+\/review$/.test(req.path))) {
      throw new HttpError(503, "تم إيقاف التمارين والمراجعات مؤقتاً بواسطة الإدارة.");
    }
    if (!settings.aiEnabled && req.path === "/ai/chat") throw new HttpError(503, "المعلّم الآلي متوقف مؤقتاً بواسطة الإدارة.");
  }
  next();
});
router.use(studyReminderRouter);
router.use(enforceCourseAccess);
router.use(learningRouter);
router.use(renewalRouter);
router.use(tutorRouter);

export default router;
