# Performance notes

What makes the first screen fast, and where to change it:

- **Session restore starts when the API module loads.** Tabs serialize refresh, login and logout with Web Locks
  before operating on the shared HttpOnly cookie. The session hint and last profile can render the shell while
  restore is pending. Guest prefetch in `index.html` is scoped to news on `/news` and public posts on `/` or `/explore`.
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

### Повторное открытие вкладок с реальным API

Запустите отдельный экземпляр MongoDB, как для нагрузочной проверки ниже, и задайте `BUBBLE_LOAD_MONGO_PORT`.

```powershell
$env:BUBBLE_TAB_CHECK_BROWSERS = 'chrome,msedge'
$env:BUBBLE_TAB_CHECK_ASSERT = '1'
npm run check:tabs
```

Сценарий собирает текущую веб-версию и использует временную MongoDB, штатный API и Socket.IO на loopback. Он измеряет холодное открытие ленты и одновременное открытие 1, 2 и 5 вкладок после прогрева. Отчёт `test-results/site-tabs.json` содержит запросы, статусы и байты ответов по endpoint, время до появления тестовой записи и WebSocket-рукопожатия. Можно указать другой файл через `BUBBLE_TAB_CHECK_REPORT`. Внешние ресурсы и service worker выключены для воспроизводимости. Замер времени зависит от машины и планировщика вкладок.

Режим `BUBBLE_TAB_CHECK_ASSERT=1` проверяет авторизацию, повторные GET, уведомления и их прочтение между вкладками, доставку и изменение сообщений, восстановление после разрыва Socket.IO, выход и смену аккаунта. `BUBBLE_TAB_CHECK_EXPIRE=1` дополнительно сокращает TTL access-токена до 12 секунд в локальном процессе и проверяет автоматический refresh и переподключение.

В живых вкладках передаются первые страницы ленты до 30 секунд и счётчики непрочитанного до 25 секунд. Доступ к обмену включается после серверной проверки аккаунта, при выходе и смене аккаунта кэш сбрасывается. Резервные сверки REST и восстановление после reconnect остаются включёнными. После закрытия всех вкладок первая вкладка получает данные с сервера.

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

### Метрики и сетевые события в админке

Откройте «Админка» → «Мониторинг». CSV на вкладке «Метрики API» включает сводку и разбивку по маршрутам, на вкладке «Сеть и 429» — все группы выбранного периода и фильтра. Время в CSV указано в UTC. «Ошибки приложения» экспортирует сводку текущих активных групп, текст и трассировки остаются в админке. Структурированная телеметрия хранит шаблоны маршрутов и значения из разрешённых полей, без IP, токенов, тел запросов и параметров URL.

CSV ошибок содержит категорию, статус внешнего сервиса и Request ID последнего события, когда они известны. Для записей, созданных до появления этих полей, категория может быть `unknown`. Request ID помогает найти соответствующую запись в журнале API.

API собирает завершённые запросы без выборки, за исключением служебных маршрутов проверки здоровья, межсервисных запросов и самого мониторинга. Счётчики сбрасываются в MongoDB пачками каждые 10 секунд. Сетевые события также включают прерванные ответы. Интервалы хранятся 8 дней. Для p95/p99 в отчёте используются верхние границы интервалов гистограммы. Потеря процесса или MongoDB до сброса может оставить пропуски, особенно при остановке serverless-инстанса. В админке данные обновляются раз в минуту или по кнопке.

Production-сборка веб-приложения отправляет ограниченную очередь диагностических событий. При восстановлении сети открытая вкладка повторяет отправку. Если сайт не загрузился или вкладка закрылась до отправки, данные нужны из журналов прокси и внешних проверок доступности. Один сбой может появиться у API и в браузере, поэтому их счётчики не складывают. `CF-Ray` помогает найти транзакцию в Cloudflare и сам по себе не определяет, кто вернул `429`. При отсутствии имени лимитера проверяйте логи Cloudflare/Nginx и API по времени и идентификаторам.

Для локального теста с отдельной MongoDB передайте её loopback-порт в `BUBBLE_MONITOR_TEST_MONGO_PORT` и запустите `npm run test -w @commune/api -- src/tests/monitor.integration.test.ts`. `npm run check:site` проверяет вкладки, фильтры, скачивание CSV и отправку браузерного события при восстановлении сеанса.

Для проверки одновременного открытия сайта из одного NAT передайте loopback-порт отдельной MongoDB в `BUBBLE_RATE_LIMIT_TEST_MONGO_PORT` и запустите `npm run test -w @commune/api -- src/tests/rateLimit.test.ts`. Для 20 и 50 аккаунтов тест исчерпывает общий бюджет IP, затем восстанавливает сеансы и запрашивает ленту и фоновые данные. Отдельно он проверяет ответ `429` при исчерпании бюджета самого восстановления. `npm run check:site` проверяет `Retry-After` между вкладками, восстановление после временных ошибок, отказ модуля, сохранение плеера и работу service worker с локальным Socket.IO.

### Нагрузочный прогон на одном IP (#64, #79)

Для тестового `test.bubble-web.net` подготовлен отдельный сценарий `node --import tsx tools/load-check/staging.mts`. Число пользователей задаётся через `BUBBLE_STAGING_USERS` (20, 50 или 100), длительность через `BUBBLE_STAGING_SECONDS` (30–1200). Он регистрирует помеченные аккаунты и соблюдает `Retry-After`, сохраняет их сеансы в игнорируемом Git файле `test-results/staging-test-accounts.json`, открывает Socket.IO, читает ленту и профили и создаёт ограниченное число тестовых сообщений, публикаций и медиа. Подготовка аккаунтов с одного IP может занять несколько окон лимитера. JSON и CSV отчёты создаются в `test-results`. Тестовые данные на стенде остаются после прогона, CPU и RAM сервера нужно собирать отдельно. Перед использованием файл с учётными данными следует защитить средствами операционной системы и не прикладывать к отчёту.

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
