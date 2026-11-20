import mongoose, { type PipelineStage } from "mongoose";
import {
  cfRayPattern,
  requestIdPattern,
  telemetryLimiters,
  telemetryMethods,
  telemetryRoute,
  type ApiMetricRow,
  type ClientNetworkEvent,
  type MetricsReport,
  type NetworkIncidentRow,
  type NetworkReport,
  type TelemetryHours,
} from "@commune/shared";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { TelemetryBucket } from "../models/TelemetryBucket.js";

const BUCKET_MS = 5 * 60 * 1000;
const FLUSH_MS = 10_000;
const MAX_PENDING = 2000;
// Inclusive upper bounds in milliseconds. Slowest samples are reported as above 30s.
const latencyBounds = [10, 25, 50, 100, 200, 400, 800, 1500, 3000, 6000, 12_000, 30_000];
const bins = Array.from({ length: latencyBounds.length + 1 }, (_, index) => String(index));

type Dimensions = Pick<
  NetworkIncidentRow,
  "source" | "method" | "route" | "kind" | "status" | "limiter" | "limit" | "windowSeconds"
>;
type Sample = Pick<NetworkIncidentRow, "retryAfter" | "requestId" | "cfRay">;
type Pending = {
  dimensions: Dimensions;
  bucket: Date;
  count: number;
  histogram: Record<string, number>;
  firstSeen: Date;
  lastSeen: Date;
  sample: Sample | null;
};
type Metric = {
  method: string;
  route: string;
  count: number;
  limited: number;
  serverErrors: number;
  clientErrors: number;
  histogram: number[];
};

const pending = new Map<string, Pending>();
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | undefined;

function scheduleFlush() {
  if (!timer && !writing) {
    timer = setTimeout(() => {
      void flushTelemetry();
    }, FLUSH_MS);
    timer.unref();
  }
}

function record(dimensions: Dimensions, at: number, latency: number | null, sample: Sample | null) {
  if (env.NODE_ENV === "test" || mongoose.connection.readyState !== 1) return;
  const bucket = Math.floor(at / BUCKET_MS) * BUCKET_MS;
  const key = JSON.stringify([
    bucket,
    dimensions.source,
    dimensions.method,
    dimensions.route,
    dimensions.kind,
    dimensions.status,
    dimensions.limiter,
    dimensions.limit,
    dimensions.windowSeconds,
  ]);
  let entry = pending.get(key);
  const seen = new Date(at);
  if (!entry) {
    if (pending.size >= MAX_PENDING) return;
    entry = {
      dimensions,
      bucket: new Date(bucket),
      count: 0,
      histogram: {},
      firstSeen: seen,
      lastSeen: seen,
      sample,
    };
    pending.set(key, entry);
  }
  entry.count++;
  if (seen < entry.firstSeen) entry.firstSeen = seen;
  if (seen >= entry.lastSeen) {
    entry.lastSeen = seen;
    entry.sample = sample;
  }
  if (latency !== null) {
    const index = latencyBounds.findIndex((bound) => latency <= bound);
    const bin = String(index < 0 ? latencyBounds.length : index);
    entry.histogram[bin] = (entry.histogram[bin] ?? 0) + 1;
  }
  scheduleFlush();
}

export async function flushTelemetry(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (writing) {
    await writing;
    return pending.size ? flushTelemetry() : undefined;
  }
  if (!pending.size) return;
  const operations = Array.from(pending, ([key, entry]) => ({
    updateOne: {
      filter: { _id: key },
      update: [
        {
          $set: {
            ...entry.dimensions,
            bucket: entry.bucket,
            firstSeen: { $min: [{ $ifNull: ["$firstSeen", entry.firstSeen] }, entry.firstSeen] },
            lastSeen: { $max: [{ $ifNull: ["$lastSeen", entry.lastSeen] }, entry.lastSeen] },
            sample: {
              $cond: [
                { $lte: [{ $ifNull: ["$lastSeen", entry.lastSeen] }, entry.lastSeen] },
                { $literal: entry.sample },
                "$sample",
              ],
            },
            count: { $add: [{ $ifNull: ["$count", 0] }, entry.count] },
            ...Object.fromEntries(
              Object.entries(entry.histogram).map(([bin, count]) => [
                `histogram.${bin}`,
                { $add: [{ $ifNull: [`$histogram.${bin}`, 0] }, count] },
              ]),
            ),
          },
        },
      ],
      upsert: true,
      setDefaultsOnInsert: false,
    },
  }));
  pending.clear();
  writing = TelemetryBucket.bulkWrite(operations, { ordered: false })
    .then(() => undefined)
    .catch(() => {
      logger.warn("Could not persist monitoring counters");
    });
  await writing;
  writing = undefined;
  if (pending.size) scheduleFlush();
}

function headerValue(value: unknown, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

export const observeApi: RequestHandler = (req, res, next) => {
  const path = req.path;
  if (
    !/^\/(?:api|uploads)\//i.test(path) ||
    /^\/api\/(?:admin\/(?:telemetry|errors)|internal|health|client-network|client-errors)(?:\/|$)/i.test(
      path,
    )
  ) {
    return next();
  }
  const started = performance.now();
  const capture = (closed: boolean) => {
    const status = closed ? null : res.statusCode;
    const policy = res.locals.limiterPolicy as
      { name: string; limit: number; windowSeconds: number } | undefined;
    const matched = req.route?.path;
    const route =
      typeof matched === "string" && /^\/[\w:./-]+$/.test(matched) ? matched : telemetryRoute(path);
    const method = telemetryMethods.find((part) => part === req.method) ?? "OTHER";
    const retryAfter = Number(res.getHeader("Retry-After"));
    const incident = status === 429 || (status ?? 0) >= 500 || closed;
    const sample = incident
      ? {
          retryAfter: status === 429 && Number.isFinite(retryAfter) ? retryAfter : null,
          requestId: headerValue(String(req.id ?? ""), requestIdPattern),
          cfRay: headerValue(req.get("CF-Ray"), cfRayPattern),
        }
      : null;
    record(
      {
        source: "api",
        method,
        route,
        kind: closed ? "closed" : "http",
        status,
        limiter: status === 429 ? (policy?.name ?? null) : null,
        limit: status === 429 ? (policy?.limit ?? null) : null,
        windowSeconds: status === 429 ? (policy?.windowSeconds ?? null) : null,
      },
      Date.now(),
      closed ? null : performance.now() - started,
      sample,
    );
  };
  res.once("finish", () => capture(false));
  res.once("close", () => {
    if (!res.writableFinished) capture(true);
  });
  next();
};

export function recordClientNetwork(events: ClientNetworkEvent[]) {
  const now = Date.now();
  for (const event of events) {
    if (event.at < now - 24 * 60 * 60 * 1000 || event.at > now + 60_000) continue;
    record(
      {
        source: "web",
        method: event.method,
        route: telemetryRoute(event.route),
        kind: event.kind,
        status: event.status ?? null,
        limiter:
          event.status === 429
            ? (telemetryLimiters.find((name) => name === event.limiter) ?? null)
            : null,
        limit: null,
        windowSeconds: null,
      },
      Math.min(now, event.at),
      null,
      {
        retryAfter: event.status === 429 ? (event.retryAfter ?? null) : null,
        requestId: event.requestId ?? null,
        cfRay: event.cfRay ?? null,
      },
    );
  }
}

function period(hours: TelemetryHours) {
  const until = new Date();
  const from = new Date(
    Math.floor((until.getTime() - Number(hours) * 60 * 60 * 1000) / BUCKET_MS) * BUCKET_MS,
  );
  return { from, until };
}

export function latencyPercentile(histogram: number[], fraction: number): number | null {
  let rank = Math.ceil(histogram.reduce((sum, value) => sum + value, 0) * fraction);
  if (!rank) return null;
  for (const [index, count] of histogram.entries()) {
    rank -= count;
    if (rank <= 0) return latencyBounds[index] ?? -1;
  }
  return null;
}

function metricRow({ histogram, ...row }: Metric): ApiMetricRow {
  return {
    ...row,
    p95Ms: latencyPercentile(histogram, 0.95),
    p99Ms: latencyPercentile(histogram, 0.99),
  };
}

export async function apiMetrics(hours: TelemetryHours): Promise<MetricsReport> {
  const { from, until } = period(hours);
  const rows = await TelemetryBucket.aggregate<Metric>([
    { $match: { bucket: { $gte: from, $lte: until }, source: "api", kind: "http" } },
    {
      $group: {
        _id: { method: "$method", route: "$route" },
        count: { $sum: "$count" },
        limited: { $sum: { $cond: [{ $eq: ["$status", 429] }, "$count", 0] } },
        serverErrors: { $sum: { $cond: [{ $gte: ["$status", 500] }, "$count", 0] } },
        clientErrors: {
          $sum: {
            $cond: [{ $and: [{ $gte: ["$status", 400] }, { $lt: ["$status", 500] }] }, "$count", 0],
          },
        },
        ...Object.fromEntries(bins.map((bin) => [`bin${bin}`, { $sum: `$histogram.${bin}` }])),
      },
    },
    { $sort: { count: -1, "_id.route": 1, "_id.method": 1 } },
    {
      $project: {
        _id: 0,
        route: "$_id.route",
        method: "$_id.method",
        count: 1,
        limited: 1,
        serverErrors: 1,
        clientErrors: 1,
        histogram: bins.map((bin) => `$bin${bin}`),
      },
    },
  ]).option({ maxTimeMS: 4000 });
  const total: Metric = {
    route: "",
    method: "",
    count: 0,
    limited: 0,
    serverErrors: 0,
    clientErrors: 0,
    histogram: bins.map(() => 0),
  };
  for (const row of rows) {
    total.count += row.count;
    total.limited += row.limited;
    total.serverErrors += row.serverErrors;
    total.clientErrors += row.clientErrors;
    row.histogram.forEach((count, index) => {
      total.histogram[index]! += count;
    });
  }
  return {
    from: from.toISOString(),
    until: until.toISOString(),
    total: metricRow(total),
    rows: rows.map(metricRow),
  };
}

export async function networkIncidents(hours: TelemetryHours): Promise<NetworkReport> {
  const { from, until } = period(hours);
  const dimensions = [
    "source",
    "kind",
    "method",
    "route",
    "status",
    "limiter",
    "limit",
    "windowSeconds",
  ];
  const pipeline: PipelineStage[] = [
    {
      $match: {
        bucket: { $gte: from, $lte: until },
        $or: [{ source: "web" }, { status: 429 }, { status: { $gte: 500 } }, { kind: "closed" }],
      },
    },
    { $sort: { lastSeen: -1 } },
    {
      $group: {
        _id: Object.fromEntries(dimensions.map((key) => [key, `$${key}`])),
        count: { $sum: "$count" },
        firstSeen: { $min: "$firstSeen" },
        lastSeen: { $max: "$lastSeen" },
        sample: { $first: "$sample" },
      },
    },
    { $sort: { lastSeen: -1, count: -1 } },
    {
      $project: {
        _id: 0,
        ...Object.fromEntries(dimensions.map((key) => [key, `$_id.${key}`])),
        count: 1,
        firstSeen: 1,
        lastSeen: 1,
        retryAfter: "$sample.retryAfter",
        requestId: "$sample.requestId",
        cfRay: "$sample.cfRay",
      },
    },
  ];
  const rows = await TelemetryBucket.aggregate<NetworkIncidentRow>(pipeline).option({
    maxTimeMS: 4000,
  });
  return { from: from.toISOString(), until: until.toISOString(), rows };
}
