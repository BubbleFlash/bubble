# Bubble Plus и платежи

Права определяет сервер. Смотри `apps/api/src/controllers/billingController.ts`, `services/billingService.ts`, `services/paymentService.ts`, `utils/plan.ts`, модели пользователя и подписки. Клиент читает статус через `/api/billing`. Конкретные лимиты возможностей проверяй в использующем их контроллере и общих схемах.

Webhook `/api/webhooks/lemonsqueezy` проверяется по сырому телу. Порядок обновлений проверяется на сервере, срок доступа зависит от статуса подписки, даты продления и применимого льготного периода. Покрывай повторный webhook, устаревший webhook, отмену, истечение и возврат в целевом сценарии.

- Тестовые ключи, variant ID, webhook и тестовая БД должны относиться к одному окружению. `LEMONSQUEEZY_ACCEPT_TEST_MODE` контролирует приём тестовых операций. Mock-режим предусмотрен вне production.
- Сверяй `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_VARIANT_ID`, `LEMONSQUEEZY_PLUS_VARIANT_ID` и `PLUS_PRICE_LABEL` по `config/env.ts` и списку фактически передаваемых параметров. Базовый Compose не перечисляет настройки Lemon Squeezy. См. [DEPLOYMENT.md](DEPLOYMENT.md).
- Для проверки используй изолированное тестовое окружение и существующие `plus.test.ts`, `plusWebhooks.test.ts`, `payment.test.ts`, `lemonsqueezy.test.ts`. Если статус не обновился, проверь код ответа webhook и журнал, не раскрывая ключи. Перевод на live-настройки, операции с платёжными данными рабочей базы и реальные платежи выполняет человек.
