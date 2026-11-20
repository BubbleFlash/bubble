import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { fontUploadUrlSchema, uploadUrlSchema } from "@commune/shared";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { asyncHandler } from "./utils/errors.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { noStore, originGuard } from "./middleware/security.js";
import { clientNetworkLimiter, globalLimiter, LIMITER_HEADER } from "./middleware/rateLimit.js";
import { lemonSqueezyWebhook, rawBody } from "./controllers/paymentController.js";
import { router } from "./routes/index.js";
import { hasRealtimeSecret, verifySession } from "./controllers/internalController.js";
import { uploadIsModerated } from "./services/uploadService.js";
import { createDownloadUrl, getObject } from "./services/storageService.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { observeApi } from "./services/telemetry.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Needed for correct client IPs (rate limiting) behind reverse proxies. Set TRUST_PROXY to
  // the number of proxies in front of the API (2 for a Vercel rewrite in front of Render).
  app.set("trust proxy", env.TRUST_PROXY);

  // Only method, path (no query string) and status are logged. The default serializers would
  // write every request header (cookies, tokens, client IPs) to the log on every call.
  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      customSuccessObject(_req, res, log) {
        const limiter = res.getHeader(LIMITER_HEADER);
        return limiter ? { ...log, limiter } : log;
      },
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );
  app.use((req, res, next) => {
    res.set("X-Request-Id", String(req.id));
    next();
  });
  app.use(observeApi);
  app.use(
    helmet({
      // The web app runs on another origin and must be allowed to display uploaded images.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true, exposedHeaders: ["Retry-After", LIMITER_HEADER, "X-Request-Id", "CF-Ray"] }));
  app.get("/api/internal/session", asyncHandler(async (req, res, next) => {
    if (!hasRealtimeSecret(req)) return next();
    res.set("Cache-Control", "no-store");
    await verifySession(req, res);
  }));
  app.post("/api/client-network", clientNetworkLimiter);
  app.use(globalLimiter);

  // Uploaded images and fonts. Revalidate before reuse so moderation still takes effect.
  // Helmet already sets X-Content-Type-Options: nosniff on these responses.

  app.get(
    "/uploads/:file",
    asyncHandler(async (req, res) => {
      const file = req.params.file ?? "";
      res.set("Cache-Control", "no-store");

      if (!uploadUrlSchema.safeParse(`/uploads/${file}`).success &&
          !fontUploadUrlSchema.safeParse(`/uploads/${file}`).success) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      if (uploadUrlSchema.safeParse("/uploads/" + file).success && await uploadIsModerated("/uploads/" + file)) {
        res.status(404).set("Cache-Control", "no-store").json({ error: "Not found" });
        return;
      }

      if (env.S3_DIRECT_IMAGES && env.S3_PUBLIC_ENDPOINT && req.query.direct === "1" &&
          uploadUrlSchema.safeParse(`/uploads/${file}`).success) {
        try {
          const url = await createDownloadUrl(`uploads/${file}`, 60, undefined, "no-store");
          res.redirect(302, url);
          return;
        } catch (err) {
          // Signing failures use the same proxy path as clients without direct storage access.
          logger.warn({ err }, "Direct image signing failed; using proxy");
        }
      }

      let object;
      const validator = req.get("If-None-Match");

      try {
        object = validator
          ? await getObject(`uploads/${file}`, validator)
          : await getObject(`uploads/${file}`);
      } catch (err) {
        if (validator && err instanceof Error && (err.name === "NotModified" || (err as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 304)) {
          res.status(304).set("Cache-Control", "private, no-cache").end();
          return;
        }
        const isNotFound =
          err instanceof Error &&
          (err.name === "NoSuchKey" ||
            err.name === "NotFound" ||
            (err as Error & {
              $metadata?: { httpStatusCode?: number };
            }).$metadata?.httpStatusCode === 404);

        if (isNotFound) {
          res.status(404).json({ error: "Not found" });
          return;
        }

        throw err;
      }

      if (!object.Body) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      if (object.ContentType) {
        res.setHeader("Content-Type", object.ContentType);
      }

      if (object.ContentLength !== undefined) {
        res.setHeader("Content-Length", String(object.ContentLength));
      }

      res.setHeader("Cache-Control", "private, no-cache");
      if (object.ETag) res.setHeader("ETag", object.ETag);

      await pipeline(Readable.fromWeb(
        object.Body.transformToWebStream() as unknown as import("node:stream/web").ReadableStream,
      ), res);
    }),
  );


  // The payment webhook needs the raw bytes to check the provider's signature, so it is
  // registered before the JSON parser.
  app.post("/api/webhooks/lemonsqueezy", rawBody, asyncHandler(lemonSqueezyWebhook));

  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  // API answers carry personal data and tokens: never let a browser or proxy cache them. Handlers
  // that are meant to be cached (the news feed) set their own Cache-Control afterwards.
  app.use("/api", noStore, originGuard, router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
