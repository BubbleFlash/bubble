# Performance notes

What makes the first screen fast, and where to change it:

- **Session restore starts at page load.** `index.html` starts the session refresh or the next public request
  (news on `/news`, public posts on `/` and `/explore`) before the app has downloaded. `src/lib/api.ts` takes those
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

## Проверка перед вливанием в `develop` (#79)

Установите зависимости через `npm ci` и запустите из корня репозитория.

```powershell
npm run check:site
```

Команда собирает веб-приложение из текущего рабочего дерева и запускает локальный Vite Preview. Playwright подставляет ответы API, поэтому для этого прогона не нужен MongoDB или аккаунт. Chrome и Edge проверяют ленту из 60 записей на ширине 1280 и 390 px, прокрутку, открытие комментариев и переход в запись. Ещё два сценария проверяют восстановление сеанса после временного обрыва сети и ответа `429` с `Retry-After`.

В `test-results/site-candidate.json` в приложении `feed-timings` сохраняются время появления ленты, открытия комментариев и записи, а также 95-й процентиль и максимальный интервал между вызовами `requestAnimationFrame` при прокрутке. Сравнивайте несколько прогонов на той же машине, в том же браузере и при той же ширине. Один замер зависит от загрузки машины. Интервалы `requestAnimationFrame` измеряют работу браузера во время сценария. Ширина 390 px воспроизводит мобильную раскладку, а замер производительности телефона требует физического устройства.

### Проверка доступности по конкретному сетевому маршруту

```powershell
$env:BUBBLE_CHECK_URL = 'https://test.bubble-web.net'
$env:BUBBLE_CHECK_NETWORK = 'ISP name, no VPN'
npm run check:site
```

Проверка открывает стенд в новом гостевом контексте, ждёт ответы HTML, проверки сеанса и публичной ленты, затем проверяет отображение страницы. Она возвращает ошибку при `429`, даже если HTML главной открылся. В `test-results/site-reachability.json` в приложении `site-diagnostics` сохраняются статусы, тайминги, сбои загрузки и заголовки `CF-Ray`, `X-Request-Id`, `Retry-After`, `RateLimit` и `X-RateLimit-Limiter`, когда они есть. `X-Request-Id` помогает сопоставить ответ с журналом API.

Для сравнения запустите эту же команду из нужной сети, например через мобильного оператора или через уже настроенный VPN. `BUBBLE_CHECK_NETWORK` подписывает результат. Если есть разрешённый HTTP или SOCKS‑прокси, задайте его адрес через `BUBBLE_CHECK_PROXY`. Скопируйте отчёт после каждого маршрута, следующий сетевой прогон перезаписывает этот файл. Для возврата к локальной проверке удалите `Env:BUBBLE_CHECK_URL`.

`BUBBLE_CHECK_BROWSERS` принимает список через запятую. По умолчанию это `chrome,msedge`, можно выбрать один установленный браузер. Для `chromium`, `firefox` и `webkit` установите соответствующий браузер через `npx playwright install <browser>`. Для `opera-gx` задайте полный путь к исполняемому файлу установленной Opera GX в `BUBBLE_OPERA_GX`.

Доступность локальной сборки проверяется на этой машине. Для проверки изменений через Cloudflare нужен отдельный URL с этой сборкой. Запуск по адресу общего стенда показывает состояние уже развёрнутой там версии и выбранного сетевого маршрута.

Lighthouse можно использовать для дополнительного аудита развёрнутого сайта в Chrome.

### Нагрузочный прогон на одном IP (#64, #79)

Для прогона нужна отдельная локальная MongoDB. Тест запускает реальные HTTP и Socket.IO серверы на случайных loopback-портах, создаёт временную базу с тестовыми аккаунтами, записями и комментариями и удаляет только эту базу при завершении. Лимитеры включены. Сценарий не принимает URL удалённой цели.

```powershell
docker run --rm -d --name bubble-load-mongo -p 127.0.0.1::27017 mongo:7
$env:BUBBLE_LOAD_MONGO_PORT = (docker port bubble-load-mongo 27017/tcp).Trim().Split(':')[-1]
npm run check:load -- --users=20
npm run check:load -- --users=50
npm run check:load -- --users=100
docker stop bubble-load-mongo
```

По умолчанию каждая ступень идёт 20 минут. Для быстрой проверки можно передать `--seconds=45`. Виртуальные пользователи имеют отдельные аккаунты и сеансы, но общий IP. Каждый проходит восстановление сеанса, читает и листает ленту, открывает запись и комментарии, переходит в профиль и выполняет фоновые запросы вместе с реальным Socket.IO соединением. Тест начинается с существующих сеансов. Массовый парольный вход, гостевой трафик, публикации и географическую доступность он не моделирует.

Артефакт `test-results/load-bubble-<users>-<seconds>s.json` содержит статусы, имена лимитеров, p50/p95/p99 по API за весь прогон и по минутам, CPU и RSS общего процесса API и realtime, память и число подключений MongoDB. В полном прогоне пользователи обновляют токен и cookie примерно на 14-й минуте. Тест проверяет, что новый токен даёт доступ к ожидаемому аккаунту, и отличает плановое переподключение Socket.IO от сетового сбоя. Отдельные проверки входа, регистрации и загрузки ожидают `429` с `Retry-After` и именем лимитера. Нештатные ответы, неожиданные переподключения или недостигнутая ступень дают ненулевой код выхода. Для регулярной проверки можно запускать эти команды последовательно на выделенном CI-раннере с локальным сервисом MongoDB и сохранять отчёты как артефакты.

## Feed/media regression workload (#3, #44, #58)

Start the local web server with `npm run dev -w @commune/web -- --host 127.0.0.1`, then run `node tools/measure-feed.mjs output.json`. In PowerShell, `$env:PERF_VERIFY='1'` additionally checks comment draft retention, track playback/pause, a separate clock subscriber, GIF/alpha preservation and fallback from an unreachable storage URL to the API. `PERF_CHANNELS` defaults to `chrome,msedge` and requires those browsers installed; `PERF_ORIGIN` can select a different local Vite origin. Screenshots from verification use ignored `.env.perf-*` paths. The harness is a development-only JSX entry and is not imported by the production application.

The workload mounts 60 real post cards with distinct external links and tracks under the real auth, query and music providers. All API requests and Audio events are synthetic: no production requests or actual media playback occur. It counts preview/library requests, React Profiler commits during 20 time updates, rAF callbacks and long tasks during 1.8 seconds of scripted scroll, plus output sizes for seeded 1200×900 JPEG pixels. The harness measures UI request scheduling and rendering, not database/CDN latency, audio throughput, visual photo quality or physical phone performance. rAF rate is not a presented-frame measurement. Avoid concurrent builds/tests when comparing timing results.

On the local Chrome/Edge runs at 1280/390 px, initial optional requests fell from 120 to 10, and playback ticks caused zero feed commits instead of 20. The time display still advanced. Synthetic image sizes and limitations are recorded in `PROJECT_HANDOFF.md`; delivery setup is in `UPLOADS.md`. The local scroll timing does not establish a sustained FPS improvement. Weak physical devices, Opera GX and regional storage reachability remain to be tested.
