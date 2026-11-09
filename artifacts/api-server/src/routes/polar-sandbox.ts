import { Router, type IRouter } from "express";
import { getAuth } from "../lib/auth";
import { rateLimit } from "express-rate-limit";
import { CreateSandboxCheckoutBody, CreateSandboxCheckoutResponse, GetSandboxCheckoutResponse, CreateSandboxPortalResponse } from "@workspace/api-zod";
import { createSandboxCheckout, refreshSandboxCheckout, sandboxPortal } from "../lib/polar-sandbox";
import { HttpError } from "../lib/http-error";
import { z } from "zod";

const router: IRouter = Router();
router.use("/billing/polar/sandbox", rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false,
}));
function user(req: Parameters<typeof getAuth>[0]) {
  const id = getAuth(req).userId;
  if (!id) throw new HttpError(401, "سجّل الدخول لإجراء عملية دفع تجريبية.");
  return id;
}
router.post("/billing/polar/sandbox/checkout", async (req, res) => {
  const userId = user(req);
  const body = CreateSandboxCheckoutBody.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "خطة غير صالحة.");
  res.json(CreateSandboxCheckoutResponse.parse(await createSandboxCheckout(userId, undefined, body.data.plan)));
});
router.get("/billing/polar/sandbox/checkout/:id", async (req, res) => {
  const userId = user(req);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new HttpError(400, "معرّف دفع غير صالح.");
  res.json(GetSandboxCheckoutResponse.parse(await refreshSandboxCheckout(userId, id.data)));
});
router.post("/billing/polar/sandbox/portal", async (req, res) => {
  res.json(CreateSandboxPortalResponse.parse(await sandboxPortal(user(req))));
});
export default router;
