# Git, стенд и выпуск Bubble

Ветками, PR и workflow управляют люди. ИИ-агент готовит документацию и результаты проверок
в рамках [AGENTS.md](../AGENTS.md). Перед интеграцией человек сверяет целевую ветку и последствия
триггера. История интеграции показывает PR в `develop`.

## Триггеры в репозитории

| Workflow | Триггер | Проверки до сборки образов |
| --- | --- | --- |
| [Test environment](../.github/workflows/deploy-test.yml) | Push в `develop` и ручной запуск | npm ci, typecheck, lint, unit-тест шлюза, build |
| [Prod environment](../.github/workflows/deploy-prod.yml) | Ручной запуск (`workflow_dispatch`) | npm ci, typecheck, lint, build |

Обе цепочки собирают GHCR-образы с тегом полного SHA и запускают Compose. Схема окружений есть
в [DEPLOYMENT.md](DEPLOYMENT.md). В текущем checkout отсутствуют автоматический Release Please,
проверка Conventional PR title, E2E и CodeQL workflow. Активность rulesets и настройки GitHub
человек сверяет по [GITHUB_SETTINGS.md](GITHUB_SETTINGS.md).

## Приёмка человеком

1. Зафиксировать среду и SHA кандидата. Сверить проверку кандидата по
   [Definition of Done](../BUBBLE_CONTEXT.md#10-definition-of-done). Workflow выполняют проверки из таблицы.
2. Сверить SHA run, результат сборки, образы и доставку. Для решения об откате учитывать совместимость
   предыдущего SHA с текущими данными.
3. После доставки сверить запущенные образы, готовность API, маршруты и функциональный smoke.
   Для шлюза есть [TEST_ACCESS.md](TEST_ACCESS.md). Указывать раздельно SHA checkout, кандидата
   и развёрнутых образов. Если сведений об окружении нет, зафиксировать этот пробел.
