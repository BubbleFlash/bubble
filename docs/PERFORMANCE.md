# Performance notes

What makes the first screen fast, and where to change it:

- **Session restore starts at page load.** `index.html` fires the session refresh, the news request and
  (for visitors) the public posts request before the app has downloaded; `src/lib/api.ts` takes those
  responses over. Browsers remember a session hint (`commune_session`) and the last profile
  (`commune_user`), so the left menu and feed shell appear instantly and the session is confirmed in the
  background. Logged-out visitors skip the check entirely.
- **Code splitting.** Only the feed and Explore pages are in the first download; every other page loads
  when opened (`React.lazy` in `App.tsx`). React, the router and React Query are separate cached files.
- **CDN caching.** `/api/news` and `/api/public/posts` send `s-maxage` so Vercel's edge can answer without
  waking the API.
- **Ads load last.** AdSense waits for the first scroll/tap/key press (or 8 seconds after load).
- **Layout stays still.** Placeholders for posts and news, `content-visibility` for long feeds.
- **SEO.** `robots.txt`, `sitemap.xml` (update the domain in both when you add a custom domain), a canonical
  link and a title per page.

Measure with Lighthouse in an incognito window, mobile mode, on the deployed site (not localhost).

## Feed/media regression workload (#3, #44, #58)

Start the local web server with `npm run dev -w @commune/web -- --host 127.0.0.1`, then run `node tools/measure-feed.mjs output.json`. In PowerShell, `$env:PERF_VERIFY='1'` additionally checks comment draft retention, track playback/pause, a separate clock subscriber, GIF/alpha preservation and fallback from an unreachable storage URL to the API. `PERF_CHANNELS` defaults to `chrome,msedge` and requires those browsers installed; `PERF_ORIGIN` can select a different local Vite origin. Screenshots from verification use ignored `.env.perf-*` paths. The harness is a development-only JSX entry and is not imported by the production application.

The workload mounts 60 real post cards with distinct external links and tracks under the real auth, query and music providers. All API requests and Audio events are synthetic: no production requests or actual media playback occur. It counts preview/library requests, React Profiler commits during 20 time updates, rAF callbacks and long tasks during 1.8 seconds of scripted scroll, plus output sizes for seeded 1200×900 JPEG pixels. The harness measures UI request scheduling and rendering, not database/CDN latency, audio throughput, visual photo quality or physical phone performance. rAF rate is not a presented-frame measurement. Avoid concurrent builds/tests when comparing timing results.

On the local Chrome/Edge runs at 1280/390 px, initial optional requests fell from 120 to 10, and playback ticks caused zero feed commits instead of 20. The time display still advanced. Synthetic image sizes and limitations are recorded in `PROJECT_HANDOFF.md`; delivery setup is in `UPLOADS.md`. The local scroll timing does not establish a sustained FPS improvement. Weak physical devices, Opera GX and regional storage reachability remain to be tested.
