import { Router, type IRouter } from "express";
import { count, countDistinct, gte, like, sql } from "drizzle-orm";
import { db, learners, visitorPageviews } from "@workspace/db";
import { GetAdminVisitorsResponse } from "@workspace/api-zod";
import { z } from "zod/v4";
import { HttpError } from "../lib/http-error";
import { pruneExpiredVisitorPageviews } from "../lib/visitor-analytics";

const router: IRouter = Router();

router.get("/visitors", async (req, res): Promise<void> => {
  const query = z.object({ days: z.enum(["7", "30"]).optional() }).safeParse(req.query);
  if (!query.success) throw new HttpError(400, "الفترة المطلوبة غير صالحة.");
  const days = Number(query.data.days ?? "30");
  const since = new Date(Date.now() - days * 86400000);
  await pruneExpiredVisitorPageviews();
  const utcDay = sql<string>`to_char(${visitorPageviews.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const level = sql<string>`coalesce(${learners.preferences}->>'level', 'unknown')`;
  const profileLanguage = sql<string>`coalesce(${learners.preferences}->>'language', 'unknown')`;

  const [
    [totals],
    daily,
    countries,
    devices,
    browsers,
    languages,
    audiences,
    levels,
    profileLanguages,
  ] = await Promise.all([
    db.select({ visitors: countDistinct(visitorPageviews.visitorId), pageviews: count() })
      .from(visitorPageviews).where(gte(visitorPageviews.createdAt, since)),
    db.select({ date: utcDay, visitors: countDistinct(visitorPageviews.visitorId), pageviews: count() })
      .from(visitorPageviews).where(gte(visitorPageviews.createdAt, since))
      .groupBy(utcDay).orderBy(utcDay),
    db.select({ country: visitorPageviews.country, visitors: countDistinct(visitorPageviews.visitorId), pageviews: count() })
      .from(visitorPageviews).where(gte(visitorPageviews.createdAt, since))
      .groupBy(visitorPageviews.country).orderBy(sql`count(distinct ${visitorPageviews.visitorId}) desc`).limit(15),
    db.select({ category: visitorPageviews.device, visitors: countDistinct(visitorPageviews.visitorId) })
      .from(visitorPageviews).where(gte(visitorPageviews.createdAt, since))
      .groupBy(visitorPageviews.device).orderBy(sql`count(distinct ${visitorPageviews.visitorId}) desc`),
    db.select({ category: visitorPageviews.browser, visitors: countDistinct(visitorPageviews.visitorId) })
      .from(visitorPageviews).where(gte(visitorPageviews.createdAt, since))
      .groupBy(visitorPageviews.browser).orderBy(sql`count(distinct ${visitorPageviews.visitorId}) desc`),
    db.select({ category: visitorPageviews.language, visitors: countDistinct(visitorPageviews.visitorId) })
      .from(visitorPageviews).where(gte(visitorPageviews.createdAt, since))
      .groupBy(visitorPageviews.language).orderBy(sql`count(distinct ${visitorPageviews.visitorId}) desc`),
    db.select({
      category: visitorPageviews.audience,
      visitors: countDistinct(visitorPageviews.visitorId),
      pageviews: count(),
    }).from(visitorPageviews).where(gte(visitorPageviews.createdAt, since))
      .groupBy(visitorPageviews.audience),
    db.select({ category: level, visitors: count() }).from(learners)
      .where(like(learners.identity, "account:%")).groupBy(level).orderBy(sql`count(*) desc`),
    db.select({ category: profileLanguage, visitors: count() }).from(learners)
      .where(like(learners.identity, "account:%")).groupBy(profileLanguage).orderBy(sql`count(*) desc`),
  ]);

  const learningProfiles = {
    totalLearners: profileLanguages.reduce((total, item) => total + item.visitors, 0),
    levels,
    languages: profileLanguages,
  };
  const audienceCounts = new Map(audiences.map((item) => [item.category, item]));
  const audienceBreakdown = (["admin", "learner", "visitor", "unclassified"] as const).map((category) => ({
    category,
    visitors: audienceCounts.get(category)?.visitors ?? 0,
    pageviews: audienceCounts.get(category)?.pageviews ?? 0,
  }));

  res.json(GetAdminVisitorsResponse.parse({
    days,
    visitors: totals?.visitors ?? 0,
    pageviews: totals?.pageviews ?? 0,
    daily,
    countries,
    devices,
    browsers,
    languages,
    audiences: audienceBreakdown,
    learningProfiles,
  }));
});

export default router;
