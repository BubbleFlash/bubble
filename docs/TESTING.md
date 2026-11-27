# Команды проверки Bubble

Запуск окружения описан в [DEVELOPMENT.md](DEVELOPMENT.md).
Выбор проверок по задаче и критерии готовности — в [Definition of Done](../BUBBLE_CONTEXT.md#10-definition-of-done).

## Имеющиеся инструменты

- `npm test` запускает Vitest для API и realtime. Для конкретного набора используй `npm run test -w @commune/api -- src/tests/<имя>.test.ts` или аналог для `@commune/realtime`. HTTP-тесты API используют Supertest. Тест шлюза — `node --test tools/test-gate/server.test.mjs`.
- Mongo-наборы считывают отдельные переменные `BUBBLE_*_TEST_MONGO_PORT` из своих файлов в `apps/api/src/tests/`. Используй выделенную loopback MongoDB, без рабочих данных. Суффиксы перед `_TEST_MONGO_PORT`: `ACCOUNT`, `GATE`, `MODERATION`, `MONITOR`, `MUSIC`, `RATE_LIMIT` (также антиспам), `RELATIONSHIPS`, `REPOST`. Для отношений дополнительно задай `BUBBLE_LOCAL_MONGO_TEST=1`, для шлюза — временный `TEST_GATE_SECRET` в локальном тестовом запуске. Без нужных условий набор пропускается. Сверяй число skip в отчёте.
- `npm run e2e` использует `playwright.config.ts`, реальный локальный API, MongoDB и Chromium. Проверь `MONGODB_URI` и порты перед запуском. Конфиг по умолчанию выбирает `commune_e2e`, но при заданном `MONGODB_URI` использует его. Вне CI Playwright также может переиспользовать процессы на 4000 и 5173. Перед прогоном проверь, что они отсутствуют или обслуживают изолированное окружение. Перед запуском сверь [ограничение текущего smoke](../BUBBLE_CONTEXT.md#11-открытые-ограничения-и-обновление-контекста). При ручной замене используй изолированную среду и проверь регистрацию с подтверждением, публикацию, reload, выход и повторный вход.
- `npm run check:site` без `BUBBLE_CHECK_URL` собирает текущий frontend, запускает Vite Preview и подставляет API-ответы. Для выбора проектов в PowerShell задай `$env:BUBBLE_CHECK_BROWSERS = 'chrome,firefox,webkit'`. Для движков Playwright установи их через `npx playwright install chromium firefox webkit`, Chrome и Edge используют установленные каналы. Для узкого прогона передай `-- --grep '<фрагмент имени теста>'`. Проверка URL стенда включает другой набор сценариев, описанный в [PERFORMANCE.md](PERFORMANCE.md).
- `check:tabs`, `check:load` и `tools/measure-feed.mjs` покрывают разные уровни. Настройки и артефакты описаны в [PERFORMANCE.md](PERFORMANCE.md).

Для проверки установленной PWA оставь отдельную отметку в отчёте. Для диагностики падения
движка можно проверить создание минимальной страницы тем же Playwright. [Пример прогона](PROJECT_HANDOFF.md#локальная-проверка-при-ревизии-от-24112026).

Интеграционный тест музыки использует изолированную MongoDB, реальные ffmpeg/ffprobe из PATH и тестовый адаптер хранилища. Задай BUBBLE_MUSIC_TEST_MONGO_PORT и BUBBLE_TEST_MUSIC_ENCODING=1, затем запусти `npm test -w @commune/api -- musicEncoding.integration`. Сценарий проверяет форматы, повтор завершения, публикацию одной записи и удаление временного источника.
