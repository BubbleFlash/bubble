/* eslint no-console: "off" */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const quantiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => Number(sorted[Math.ceil(sorted.length * fraction) - 1]?.toFixed(2)) || 0;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) };
};
const round = (value) => Number(value.toFixed(2));

for (const dir of process.argv.slice(2)) {
  const results = [];
  for (const file of readdirSync(dir).filter((name) => /-\d+\.json$/.test(name))) {
    const run = JSON.parse(readFileSync(join(dir, file)));
    for (const depth of run.depths.filter((d) => d.traceFile)) {
      const trace = JSON.parse(gunzipSync(readFileSync(join(dir, depth.traceFile)))).traceEvents;
      const marks = trace.filter((event) => event.name.startsWith("bubble:start:"));
      const rows = marks.map((marker) =>
        summarize(trace, marker, depth.windows, run.serverRequests ?? []),
      );
      results.push({
        profile: run.profile,
        variant: run.variant,
        run: run.run,
        depth: depth.depth,
        traceFile: depth.traceFile,
        structure: depth.structure,
        dom: depth.dom,
        heap: depth.heap,
        rows,
        cursors: run.serverRequests
          ?.filter((request) => request.path === "/api/posts")
          .map((request) => request.cursor),
      });
    }
  }
  writeFileSync(join(dir, "summary.json"), JSON.stringify(results, null, 2));
  for (const r of results) {
    console.log(
      r.profile,
      r.variant,
      r.run,
      r.depth,
      r.structure.elements,
      r.rows
        .map((row) =>
          [
            row.action,
            row.presentationIntervalsMs.p95,
            row.keyPresentationMs.p95,
            row.engineMs.Layout,
            row.engineMs.UpdateLayoutTree,
            row.engineMs.RasterTask,
            row.mediaReadyMs,
          ].join("/"),
        )
        .join(" "),
    );
  }
}

function spans(events, name) {
  const active = new Map();
  const completed = [];
  for (const event of events) {
    if (event.name !== name) continue;
    const id = event.id2?.local ?? event.id;
    const key = `${event.pid}/${event.cat}/${id}`;
    if (event.ph === "b") active.set(key, event);
    if (event.ph === "e" && active.has(key)) {
      const begin = active.get(key);
      active.delete(key);
      completed.push({ begin, end: event.ts });
    }
  }
  return completed;
}

function summarize(trace, marker, probe, serverRequests) {
  const action = marker.name.slice("bubble:start:".length);
  const end = trace.find((event) => event.name === "bubble:end:" + action)?.ts;
  if (!end) throw new Error("No end marker for " + action);
  const inWindow = (ts) => ts >= marker.ts && ts <= end;
  const thread = trace.filter((event) => event.pid === marker.pid);
  const pipelines = spans(thread, "PipelineReporter").filter(({ end }) => inWindow(end));
  const layerCounts = new Map();
  for (const { begin } of pipelines) {
    const id = begin.args.frame_reporter.layer_tree_host_id;
    layerCounts.set(id, (layerCounts.get(id) ?? 0) + 1);
  }
  const layer = [...layerCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const frames = pipelines.filter(
    ({ begin }) => begin.args.frame_reporter.layer_tree_host_id === layer,
  );
  const presented = [
    ...new Set(
      frames
        .filter(({ begin }) => begin.args.frame_reporter.state.startsWith("STATE_PRESENTED"))
        .map(({ end }) => end),
    ),
  ].sort((a, b) => a - b);
  const gaps = presented.slice(1).map((time, i) => (time - presented[i]) / 1000);
  const moving = [
    ...new Set(
      thread
        .filter(
          (e) =>
            e.name === "PresentedFrameInformation" &&
            e.args?.scroll_deltas?.original_delta_in_gpu_frame_y &&
            inWindow(e.ts),
        )
        .map((e) => e.ts),
    ),
  ].sort((a, b) => a - b);
  const movementGaps = moving.slice(1).map((time, index) => (time - moving[index]) / 1000);
  const inputs = spans(thread, "EventLatency");
  const keys = inputs.filter(
    ({ begin }) =>
      inWindow(begin.ts) &&
      begin.args?.event_latency?.event_type === "KEY_PRESSED" &&
      begin.args?.event_latency?.display_trace_id,
  );
  const engineMs = {};
  const engineCount = {};
  const engineThreadMs = {};
  const engineMaxMs = {};
  for (const name of [
    "FunctionCall",
    "EventDispatch",
    "UpdateLayoutTree",
    "Layout",
    "PrePaint",
    "Paint",
    "Commit",
    "RasterTask",
    "ImageDecodeTask",
    "Decode Image",
    "MinorGC",
    "MajorGC",
  ]) {
    const events = thread.filter(
      (event) => event.name === name && event.ph === "X" && inWindow(event.ts),
    );
    engineMs[name] = round(events.reduce((sum, event) => sum + event.dur, 0) / 1000);
    const threadTimes = events.filter((event) => Number.isFinite(event.tdur));
    engineThreadMs[name] = threadTimes.length
      ? round(threadTimes.reduce((sum, event) => sum + event.tdur, 0) / 1000)
      : null;
    engineCount[name] = events.length;
    engineMaxMs[name] = round(events.reduce((max, event) => Math.max(max, event.dur), 0) / 1000);
  }
  const ms = marker.args.data.startTime;
  const endMs = ms + (end - marker.ts) / 1000;
  const requests = serverRequests.filter(
    (request) => request.at >= probe.timeOrigin + ms && request.at <= probe.timeOrigin + endMs,
  );
  const mediaRequests = requests.filter((request) => request.path.startsWith("/perf-media/"));
  const mediaBefore = new Set(
    serverRequests
      .filter(
        (request) => request.at < probe.timeOrigin + ms && request.path.startsWith("/perf-media/"),
      )
      .map((request) => request.path),
  );
  let repeatedMedia = 0;
  for (const request of mediaRequests) {
    if (mediaBefore.has(request.path)) repeatedMedia++;
    mediaBefore.add(request.path);
  }
  const media = probe.media.find((entry) => action === "media-" + entry.label);
  const click =
    media &&
    thread
      .filter(
        (e) =>
          e.name === "EventTiming" &&
          e.ph === "b" &&
          inWindow(e.ts) &&
          e.args.data.type === "click",
      )
      .at(-1);
  const clickMs = media?.click?.time ?? click?.args.data.timeStamp ?? ms;
  return {
    action,
    durationMs: round(endMs - ms),
    presentationIntervalsMs: quantiles(gaps),
    scrollPresentationIntervalsMs: quantiles(movementGaps),
    scrollInputPresentationMs: quantiles(
      inputs
        .filter(
          ({ begin }) =>
            inWindow(begin.ts) &&
            /GESTURE_SCROLL_UPDATE/.test(begin.args?.event_latency?.event_type) &&
            begin.args?.event_latency?.display_trace_id,
        )
        .map(({ begin, end }) => (end - begin.ts) / 1000),
    ),
    framesPresented: presented.length,
    frameIntervalsOver50: gaps.filter((ms) => ms > 50).length,
    dropped: frames.filter(({ begin }) => begin.args.frame_reporter.state === "STATE_DROPPED")
      .length,
    partial: frames.filter(
      ({ begin }) => begin.args.frame_reporter.state === "STATE_PRESENTED_PARTIAL",
    ).length,
    rafMs: quantiles(probe.frames[action] ?? []),
    keyPresentationMs: quantiles(keys.map(({ begin, end }) => (end - begin.ts) / 1000)),
    keyToNextRafMs: quantiles(
      probe.keys.filter((k) => k.start >= ms && k.start <= endMs).map((k) => k.observed - k.start),
    ),
    longTasks: quantiles(
      probe.longTasks
        .filter((e) => e.startTime >= ms && e.startTime <= endMs)
        .map((e) => e.duration),
    ),
    longAnimationFrames: quantiles(
      probe.loaf.filter((e) => e.startTime >= ms && e.startTime <= endMs).map((e) => e.duration),
    ),
    engineMs,
    engineThreadMs,
    engineCount,
    engineMaxMs,
    network: {
      requests: requests.length,
      media: mediaRequests.length,
      repeatedMedia,
      mediaBytes: mediaRequests.reduce((sum, request) => sum + request.bytes, 0),
    },
    layoutObjects: quantiles(
      thread
        .filter((e) => e.name === "Layout" && inWindow(e.ts))
        .map((e) => e.args?.beginData?.totalObjects)
        .filter(Number.isFinite),
    ),
    ...(media && {
      mediaReadyMs: round(media.ready - clickMs),
      clickFound: Boolean(media.click || click),
      loadedAtClick: media.click?.loaded,
      resources: media.resources,
      imageBox: media.imageBox,
      screenshotOffsetsMs: trace
        .filter((e) => e.name === "Screenshot" && inWindow(e.ts))
        .map((e) => round(ms + (e.ts - marker.ts) / 1000 - clickMs)),
    }),
  };
}
