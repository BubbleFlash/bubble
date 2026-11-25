# Развёртывание Bubble

Эксплуатационные операции выполняет человек. Топология ниже следует из конфигурации репозитория. Запущенные контейнеры, внешние правила и состояние интеграций сверяются отдельно.

## Состав окружения

- [docker-compose.prod.yml](../docker-compose.prod.yml) запускает MongoDB с постоянным томом, API, realtime и web Nginx. API и realtime взаимодействуют внутри docker-сети. Веб-порт опубликован на loopback, публичный вход обеспечивает внешний HTTPS-прокси.
- [nginx/default.conf](../nginx/default.conf) обслуживает SPA, передаёт `/api/` и `/uploads/` в API, `/socket.io/` в realtime с поддержкой upgrade. Контракт клиентской сборки — same-origin (`lib/api.ts`, `lib/realtime.ts`); локальная dev-сборка может использовать отдельные `VITE_*_URL`.
- Тестовый workflow дополняет базовый Compose файлом [docker-compose.test-gate.yml](../docker-compose.test-gate.yml) и конфигурацией [nginx/test-gate.conf](../nginx/test-gate.conf). Политика доступа и приёмка — в [TEST_ACCESS.md](TEST_ACCESS.md).
- API использует S3-совместимое хранилище по конфигурации `S3_*`. Проверяй внешний endpoint, TLS, CORS и подписанные ссылки по [UPLOADS.md](UPLOADS.md). Внешние параметры proxy, cookie и upstream сверяй с [контекстом безопасности](../BUBBLE_CONTEXT.md#4-api-mongodb-и-безопасность).
- `apps/*/vercel.json`, API Vercel adapter и `render.yaml` остаются в дереве как унаследованные конфигурации. Действующие workflow в checkout используют Docker-образы и Compose.

## Поставка и проверка

Workflow публикуют образы в GHCR по SHA и доставляют их по SSH. Образы web, API и realtime должны соответствовать одному кандидату. Файл env хранится на сервере; исходники переменных и полномочия задаёт владелец. Для конкретной интеграции сравнивай `apps/api/src/config/env.ts`, `.env.example`, Compose и фактический список переменных окружения без раскрытия значений. Само наличие ключа в схеме API не гарантирует его передачу из Compose.

Проверь `/api/health`, `/api/health/ready`, доступность SPA и Socket.IO с внешнего маршрута. Посмотри логи API и прокси при ошибке. Регламент допуска и приёмки описан в [RELEASING.md](RELEASING.md).
