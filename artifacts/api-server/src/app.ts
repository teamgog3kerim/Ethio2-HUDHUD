import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authSessionMiddleware, getAuth } from "./lib/auth";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { HttpError } from "./lib/http-error";
import { handleSandboxWebhook } from "./lib/polar-sandbox";
import { handleLiveWebhook } from "./lib/polar-live-webhook";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
function normalizeOrigin(value: string): string | undefined {
  const candidate = value.trim();
  if (!candidate) return;
  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`).origin;
  } catch {
    return;
  }
}
const allowedOrigins = new Set([
  process.env.PUBLIC_APP_ORIGIN,
  ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  process.env.REPLIT_DEV_DOMAIN,
  process.env.REPLIT_EXPO_DEV_DOMAIN,
  ...(process.env.REPLIT_DOMAINS ?? "").split(","),
].filter((origin): origin is string => !!origin).map(normalizeOrigin).filter((origin): origin is string => !!origin));
app.use(cors({ credentials: true, origin: (origin, callback) => callback(null, !!origin && allowedOrigins.has(origin)) }));
// Raw signed provider payload, before JSON parsing and browser CSRF checks.
app.post("/api/billing/polar/live/webhook",
  rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-7", legacyHeaders: false }),
  express.raw({ type: "application/json", limit: "128kb" }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Expected JSON webhook");
    await handleLiveWebhook(req.body, {
      "webhook-id": req.get("webhook-id") ?? "",
      "webhook-timestamp": req.get("webhook-timestamp") ?? "",
      "webhook-signature": req.get("webhook-signature") ?? "",
    });
    // Accepted into durable storage, NOT proof of payment or completed access.
    res.status(202).end();
  });
app.post("/api/billing/polar/sandbox/webhook", express.raw({ type: "application/json", limit: "128kb" }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Expected JSON webhook");
  await handleSandboxWebhook(req.body, {
    "webhook-id": req.get("webhook-id") ?? "",
    "webhook-timestamp": req.get("webhook-timestamp") ?? "",
    "webhook-signature": req.get("webhook-signature") ?? "",
  });
  res.status(202).end();
});
app.use(express.json({ limit: "128kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use("/api", authSessionMiddleware());
app.use("/api", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api", (req, res, next) => {
  const site = req.get("sec-fetch-site");
  const origin = req.get("origin");
  const requestOrigin = `${req.protocol}://${req.get("host")}`;
  const sameOrigin = !origin || origin === requestOrigin || allowedOrigins.has(origin);
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && (!sameOrigin || (site === "cross-site" && !origin))) {
    res.status(403).json({ error: "Cross-site request rejected" }); return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use("/api", router);
if (process.env.SERVE_WEB === "true") {
  const webPublicDir = path.resolve(
    process.env.WEB_PUBLIC_DIR
      ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../ethio-hudhud/dist/public"),
  );
  const indexPath = path.join(webPublicDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`SERVE_WEB is enabled but the built web app was not found at ${indexPath}`);
  }
  app.use(express.static(webPublicDir, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
    res.sendFile(indexPath, (err) => {
      if (err) next(err);
    });
  });
}
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  req.log.error({ err }, "Request failed");
  res.status(500).json({ error: "تعذر إتمام الطلب. حاول مرة أخرى." });
});

export default app;
