# Web Push

`apps/web/src/components/PushSettings.tsx`, `hooks/usePush.ts`, `lib/push.ts` и `public/sw.js` обслуживают разрешение, подписку и переход по уведомлению. `apps/api/src/controllers/pushController.ts`, `services/pushService.ts`, `models/PushSubscription.ts` и маршруты `/api/push` проверяют подписку и отправляют Web Push.

- В браузере запрос разрешения инициируется действием пользователя. `GET /api/push/status` возвращает статус и публичный VAPID-ключ. API нужны `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY`. Для `VAPID_SUBJECT` по умолчанию используется `CLIENT_ORIGIN`. Уточни, переданы ли они в целевой процесс. Базовый Compose их не перечисляет. Смена ключевой пары требует повторной подписки устройств.
- При видимой вкладке push может подавляться через realtime. При недоступном realtime используется отправка с учётом настроек аккаунта. Endpoint подписки валидируется, недействительные подписки удаляются, а service worker разрешает только безопасные переходы внутри сайта.
- Проверяй отдельно разрешение, тестовый push, события в видимой и фоновой вкладке, выход и открытие нужной страницы. На iPhone/iPad проверяй установленную через домашний экран PWA, на Android — целевой браузер и установленный режим по задаче. См. [TESTING.md](TESTING.md).
