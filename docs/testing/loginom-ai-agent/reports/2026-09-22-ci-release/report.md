# Выпуск 0.1.7 — 2026-09-22

Статус: подготовлены объединённые исходники; CI и публикация ожидаются.
Пользователь разрешил push в `loginom`, новый релиз и сборки всех поддерживаемых платформ.

## История и изменения

Локальная ветка `4b8c4f51e` (36 новых коммитов) объединена с удалённой
`108803cd98bdcce93c7c9c137f1fce70ab9c7574` (5 новых коммитов)
merge-коммитом `bacf27ebf`. Переписывания истории не было. Единственный конфликт
в canonical checkpoint разрешён сохранением обеих исторических записей.
Сохранены исправления runtime/Host/recovery, CLI `recover --acknowledge ids`,
Loginom AI wordmark и новые платформенные иконки. В source-transforms добавлено
объяснение изменённого favicon импортированного сайта; upstream map сохранён.
Версии root/Desktop и lockfile согласованы на 0.1.7.

## Локальные проверки объединённых исходников

Bun 1.3.14, Node 24.19.0, macOS arm64:

- Desktop: 140 PASS / 3 platform SKIP / 0 FAIL; draft-store исключён,
  поскольку Bun не предоставляет используемый Electron `node:sqlite`.
- Product: 4 PASS; CLI status/management: 4 PASS; TUI presentation: 1 PASS;
  UI wordmark animation: 13 PASS.
- Typecheck product/agent/app/desktop/ui/tui: PASS.
- Source attribution: 5045 файлов PASS; `git diff --check`: PASS.
- Полный runtime suite: выполняется.
- Локальный frozen install: заблокирован неверным DNS-ответом для `pkg.pr.new`
  и ERR_TLS_CERT_ALTNAME_INVALID. Проверка сертификата не отключалась.
  Запрос с независимым DNS-адресом и обычной проверкой TLS дал HTTP 200.
  До создания тега обязательна успешная frozen-установка в GitHub Actions.

## Границы приёмки

Предыдущая установленная macOS-сборка `0.1.7-local.20260922.6` из `361b13682`
прошла 10/10 description/dataset сценариев в пять клиентов. Это историческое
свидетельство исправлений, не installed live acceptance будущих CI-артефактов.
[Отчёт](../../description-dataset-debugging-results.md).

Выпуск должен включить Desktop и standalone CLI для Linux x64, Windows x64 и
macOS arm64, все обязательные CI gates, provenance и SHA256SUMS. Сохраняется
формат pre-release предыдущих версий. Linux/Windows unsigned, собственный код
macOS ad-hoc signed без notarization; пользовательские установки не заменяются.
