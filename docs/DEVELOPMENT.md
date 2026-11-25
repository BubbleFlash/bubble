# Локальная разработка

Работай из корня репозитория с `package.json`. Для воспроизводимости используй Node.js 20, как в workflow, npm и lockfile. В ветке Node 20 нужен выпуск 20.19.0 или новее, чтобы запустить ESLint из lockfile. В Windows PowerShell можно использовать `npm.cmd`, если запуск `npm.ps1` запрещён настройкой оболочки.

## Быстрый запуск

1. Проверь порты 5173 (web), 4000 (API), 4100 (realtime), 27017 (MongoDB). Для работы с данными используй свою локальную БД. Если её ещё нет, подними MongoDB командой `docker compose up -d mongo`.
2. При отсутствии локального `.env` скопируй `.env.example` в `.env`. Убедись, что `MONGODB_URI`
   указывает на локальную БД. Для полного запуска с realtime задай `CLIENT_ORIGIN=http://localhost:5173`,
   `API_URL=http://localhost:4000`, `REALTIME_URL=http://localhost:4100` и общий для двух серверных
   процессов `REALTIME_SECRET` длиной от 32 символов. API и realtime используют один локальный
   `JWT_ACCESS_SECRET`. Для Vite передай `VITE_REALTIME_URL=http://localhost:4100` через переменную
   процесса или `apps/web/.env.local`. Иначе браузер не включает realtime в dev. Для API dev-клиент
   по умолчанию использует `http://localhost:4000/api`, переопределение — `VITE_API_URL`.
3. Выполни `npm ci`, затем `npm run dev`. Это запускает web, API и realtime. Открой `http://localhost:5173`.
   При выборе `127.0.0.1` вместо `localhost` согласованно измени URL и origin, чтобы сохранить cookie и CORS.
   Для проверки одного приложения можно использовать `npm run dev -w @commune/<workspace>`.
4. Для маршрутов с объектным хранилищем подними `docker compose up -d minio`, создай локальный бакет и проверь параметры `S3_*` по [.env.example](../.env.example) и [UPLOADS.md](UPLOADS.md). Для входа по Google, исходящей почты и платежей нужны параметры соответствующей интеграции. Для повседневной разработки используй тестовые проекты и данные.

API и realtime читают корневой `.env` при запуске через workspace (`apps/api/src/config/env.ts`, `apps/realtime/src/index.ts`). Переменные процесса имеют приоритет. Для Vite параметры `VITE_*` передавай через окружение процесса или env-файлы workspace `apps/web`, если нужны значения, отличные от локальных defaults. Меняй настройки отдельного процесса или его локального файла только при понимании приоритета. `.devcontainer/` даёт альтернативу с Mongo и пробросом портов. При удалённой работе проверь фактический origin и доступность API/realtime из браузера.

## Почта и проверки

- `npm run preview:mail -w @commune/api` создаёт HTML и текстовый предпросмотр в `dist/mail-preview/` с вымышленными данными. Без ключа Resend локальный API выводит письмо в журнал. Проверяй подтверждение адреса по ссылке из локального журнала и не включай её в отчёт. Ссылки строятся из `CLIENT_ORIGIN`.
- Запуски, MongoDB-переменные и ограничения покрытий перечислены в [TESTING.md](TESTING.md). Настройки диагностики и изолированных нагрузочных прогонов — в [PERFORMANCE.md](PERFORMANCE.md).
