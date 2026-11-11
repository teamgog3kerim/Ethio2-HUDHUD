import { Router, type IRouter } from "express";
import { db, visitorPageviews } from "@workspace/db";
import { RecordVisitorPageviewBody } from "@workspace/api-zod";
import { HttpError } from "../lib/http-error";
import { getAuth } from "../lib/auth";
import { getAppRole } from "../lib/admin-auth";
import { classifyVisitorAudience, classifyVisitorBrowser, classifyVisitorDevice, normalizeVisitorCountry, pruneExpiredVisitorPageviews } from "../lib/visitor-analytics";

const router: IRouter = Router();

router.post("/", async (req, res): Promise<void> => {
  const parsed = RecordVisitorPageviewBody.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "بيانات زيارة غير صالحة.");

  const { userId } = getAuth(req);
  const role = userId ? await getAppRole(userId) : null;
  const audience = classifyVisitorAudience(role);
  // Only a verified administrator's generic admin-page visit is counted.
  if (parsed.data.path === "/admin" && audience !== "admin") {
    res.status(202).end();
    return;
  }

  await db.insert(visitorPageviews).values({
    ...parsed.data,
    audience,
    country: normalizeVisitorCountry(req.get("x-replit-ip-country") ?? req.get("cf-ipcountry")),
    device: classifyVisitorDevice(req.get("user-agent")),
    browser: classifyVisitorBrowser(req.get("user-agent")),
  }).onConflictDoNothing();

  await pruneExpiredVisitorPageviews();
  res.status(202).end();
});

export default router;
