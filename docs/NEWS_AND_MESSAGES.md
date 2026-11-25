# Новости, сообщения и контакт

## Новости

`GET /api/news?topic=top|world|technology|business|sport` — гостевой RSS-агрегатор. Источники и политики кэша смотри в `apps/api/src/services/newsService.ts`, `models/NewsCache.ts` и `controllers/newsController.ts`. Обновление координируется по теме. К существующему снимку в процессе добавляется общий снимок MongoDB. При временном сбое может отдаваться сохранённый результат, при отсутствии пригодных данных API возвращает 503.

## Сообщения

Личные диалоги с текстом, изображениями и репостами. HTTP-контракт и правила доступа задают маршруты `/api/messages`, `messageController.ts` и общие схемы. Доставка, сверка REST и индикаторы — в [контексте Socket.IO](../BUBBLE_CONTEXT.md#6-socketio-и-восстановление-состояния). Подписанные ссылки на вложения описаны в [UPLOADS.md](UPLOADS.md).

## Контакт

`POST /api/contact` сохраняет обращение в MongoDB. `contactController.ts` использует honeypot и при настройке служебного адреса/почты отправляет уведомление. Форму смотри в `ContactPage.tsx`, конфигурацию — в [DEVELOPMENT.md](DEVELOPMENT.md).
