import { Router, type IRouter } from "express";
import { db, authUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "../lib/auth";
import { rateLimit } from "express-rate-limit";
import {
  CreateLiveCheckoutBody, CreateLiveCheckoutResponse, GetLiveCheckoutParams,
  GetLiveCheckoutResponse, CreateLivePortalResponse,
} from "@workspace/api-zod";
import { createLiveCheckout, liveCheckoutEnabled, liveMonthlyEnabled, livePortal, refreshLiveCheckout } from "../lib/polar-live";
import { HttpError } from "../lib/http-error";

const router: IRouter = Router();
router.use("/billing/polar/live", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
function user(req: Parameters<typeof getAuth>[0]) {
  const id = getAuth(req).userId;
  if (!id) throw new HttpError(401, "سجّل الدخول للمتابعة إلى الفوترة.");
  return id;
}
router.post("/billing/polar/live/checkout", async (req, res): Promise<void> => {
  const userId = user(req);
  const body = CreateLiveCheckoutBody.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "خطة غير صالحة.");
  if (!liveCheckoutEnabled() || (body.data.plan === "monthly" && !liveMonthlyEnabled())) {
    throw new HttpError(503, "الدفع المباشر لهذه الخطة غير مفعّل بعد. لم يتم تحصيل أي رسوم.");
  }
  // Polar collects any billing contact details it needs on its hosted checkout.
  if (!await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.id, userId)).limit(1).then(rows => rows.length)) {
    throw new HttpError(401, "سجّل الدخول للمتابعة إلى الفوترة.");
  }
  res.json(CreateLiveCheckoutResponse.parse(await createLiveCheckout(userId, undefined, body.data.plan)));
});
router.get("/billing/polar/live/checkout/:id", async (req, res): Promise<void> => {
  const userId = user(req);
  const params = GetLiveCheckoutParams.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "معرّف دفع غير صالح.");
  res.json(GetLiveCheckoutResponse.parse(await refreshLiveCheckout(userId, params.data.id)));
});
router.post("/billing/polar/live/portal", async (req, res): Promise<void> => {
  res.json(CreateLivePortalResponse.parse(await livePortal(user(req))));
});
export default router;
