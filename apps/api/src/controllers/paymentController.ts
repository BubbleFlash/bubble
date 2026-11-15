import express from "express";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Post } from "../models/Post.js";
import { Purchase } from "../models/Purchase.js";
import {
  parseWebhook,
  paymentsMode,
  verifyWebhookSignature,
} from "../services/paymentService.js";
import { applySubscriptionEvent } from "../services/billingService.js";
import { earningsFor, recordPurchase } from "../services/purchaseService.js";

export async function earnings(req: Request, res: Response) {
  res.json(await earningsFor(req.userId!));
}

/** Body parser for the webhook: the signature is over the exact bytes, so keep them raw. */
export const rawBody = express.raw({ type: "*/*", limit: "200kb" });

/**
 * Lemon Squeezy calls this after a payment. Mounted in app.ts BEFORE the JSON parser.
 * Always answers 200 for events we choose to ignore, so the provider doesn't keep retrying.
 */
export async function lemonSqueezyWebhook(req: Request, res: Response) {
  if (paymentsMode !== "lemonsqueezy") {
    res.status(503).json({ error: "Payments are not configured" });
    return;
  }
  const body = req.body as Buffer;
  const signature = req.get("X-Signature");
  if (!Buffer.isBuffer(body) || !verifyWebhookSignature(body, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const event = parseWebhook(payload);
  // Test-mode events (fake card) must never grant anything on a live site. Answer 200 so
  // Lemon Squeezy does not keep retrying, and note it in the log.
  if (event.kind !== "ignored" && event.testMode && !env.LEMONSQUEEZY_ACCEPT_TEST_MODE) {
    logger.warn(
      { kind: event.kind },
      "Ignored a test-mode webhook (LEMONSQUEEZY_ACCEPT_TEST_MODE is off)",
    );
    res.json({ received: true, ignored: "test_mode" });
    return;
  }
  if (event.kind === "refunded") {
    // Revoke access and take the sale out of the creator's earnings.
    await Purchase.deleteOne({ provider: "lemonsqueezy", providerOrderId: String(event.orderId) });
  } else if (event.kind === "subscription") {
    await applySubscriptionEvent(event);
  } else if (event.kind === "paid") {
    const valid = mongoose.isValidObjectId(event.postId) && mongoose.isValidObjectId(event.userId);
    const post = valid
      ? await Post.findById(new mongoose.Types.ObjectId(event.postId))
          .select("author priceCents")
          .lean()
      : null;
    if (!post || post.priceCents == null) {
      // Paid for a post that no longer exists. Log loudly: this needs a manual refund.
      logger.error({ event }, "Payment received for a missing or free post");
    } else {
      await recordPurchase({
        userId: event.userId,
        postId: event.postId,
        creatorId: post.author.toString(),
        amountCents: event.amountCents,
        currency: event.currency,
        provider: "lemonsqueezy",
        orderId: event.orderId,
      });
    }
  }
  res.json({ received: true });
}
