# Публикация local-file-paths и проверка CI

Задание владельца: отправить текущую ветку на origin, создать PR в `loginom` и дождаться успешных тестов и сборок, исправляя сбои. Слияние и выпуск не поручены. Полные локальные результаты и ограничения сохранены в [отчёте](../../testing/loginom-ai-agent/local-file-paths-local-tests-2026-10-27.md).

## План

1. Независимо проверить этот план. Сверить HEAD, рабочее дерево, origin/loginom и remote feature branch; найти существующий PR. Сохранить незакоммиченные проверенные исправления отдельным conventional commit, включая перенесённый fixture и отчёт. Hooks и secret scan не обходить; временные данные — только в storage/tmp.
2. Если удалённая feature branch содержит новые изменения, сохранить их до публикации. Интегрировать свежую базу при необходимости разрешения конфликтов; после изменений повторять затронутые проверки. Не переписывать опубликованную историю и не менять чужие worktrees.
3. Push на origin; создать один PR `local-file-paths → loginom` с описанием поведения #74, проверок и ограничений. Прикрепить PR к текущему чату. Указать отдельно source-проверки и будущие CI-сборки.
4. Проверить workflow triggers и запустить отсутствующие обязательные test/typecheck/native/candidate gates штатным dispatch на опубликованном ref. Для release workflow — только `mode=candidate`, без тега, публикации или изменения версии.
5. Следить за актуальным head: сначала конфликты, затем активные замечания, затем failing CI. Для падения читать фактический log; различать регрессию, устаревший тест и среду. Исправлять минимально с RED→GREEN для кода, одной адресной и одной проверкой затронутой области перед push. Не ослаблять assertions и не менять workflow только ради зелёного статуса. Перезапускать transient failure на том же SHA только по подтверждённому сигналу.
6. Дождаться terminal status всех применимых jobs/builds текущего SHA. Свежим чтением проверить PR mergeability, head и unresolved threads. Сохранить ссылки/результаты CI и checkpoint до20 строк; при технических исправлениях — независимое ревью. Завершить, когда применимые проверки зелёные и обязательных замечаний нет. Внешнюю блокировку сообщить с фактической причиной; не выдавать её за PASS.

## Checkpoint

- Исходный HEAD: `299049c48101e479ea758da48cc34e592accef96`; ветка `local-file-paths`.
- План независимо Approved. Локальные исправления сохранены в `0157c935d0`; range scan38коммитов/3архива clean, дерево чистое до следующего исправления.
- Два actual push остановлены hook: у временного Git snapshot наследуется `GIT_DIR`; `git init` меняет source core.bare=true, затем add отказывает. Вне hook scanner clean.
- Собственное повреждение конфигурации восстановлено: core.bare=false, прежний HEAD/ветка/чистое дерево подтверждены; другие refs и файлы не менялись.
- Исправлена граница Git env: source-контекст сохранён, временные init/add/Gitleaks очищают repository-local переменные по штатному списку Git.
- Настоящий Gitleaks: RED повреждения индекса → GREEN; четыре регрессии, полный script34/34 и typecheck PASS. Независимое ревью APPROVED, обязательных замечаний нет.
- Push с hooks прошёл: scanner39коммитов/3архива clean,33 turbo typechecks PASS; опубликован `27a8d300ca`.
- PR: https://github.com/gooddaytoday/loginom-ai-agent/pull/465 → loginom, mergeable; candidate run40491959440, без выпуска.
- Native Windows2022: один DPAPI отказ около15с; same-SHA rerun20PASS/3SKIP, Windows2025 PASS. Изменения этих файлов относительно базы отсутствуют; точная причина transient отказа неизвестна, deadline не менялся.
- No-effect identity refusal исправлен одной строкой: реальный bridge/VM RED→GREEN, четыре uncertain/effectful negative cases и три полных файла71/71 PASS; syntax/diff-check PASS.
- Независимое ревью APPROVED; affected bridge hash обновлён, immutable source-map не менялся. Следующий шаг: push исправления, закрытие review thread и свежие CI/candidate. Evidence: `/home/kiselev/storage/tmp/local-paths-74-pr-ci-lq14rnwu/`.

## Уточнение после первого push

В существующем scanner разделить Git-контекст исходного репозитория и временных snapshot. На временных Git init/add и вызове Gitleaks для них убрать repository-local переменные окружения по штатному списку Git; исходные range/index/blob операции и пользовательскую Git-конфигурацию сохранить. Проверить настоящим Gitleaks на собственной fixture: hook env, секрет внутри архива с redaction, чистый архив, неизменность source config/index. Один RED→минимальный GREEN за цикл, затем полный package-local набор и typecheck, независимое ревью. Настоящий hook не повторять до исправления; shared repo не использовать как воспроизводящую fixture.

## Уточнение по PR review: отказ до загрузки

Проверить finding `PRRT_kwDOUdfARc6wpp48`: identity-only probe может вернуть подтверждённый no-effect отказ, а исключение оставляет provisional preparation как uncertain. RED через существующий bridge fixture: отказ не загружает файл; после исчезновения препятствия штатный повтор открывает пакет с одной загрузкой. Минимально передать проверенный отказ в существующее settlement подготовки; не вводить новый retry state/цикл. Неизвестный исход probe/transport и возможная начатая загрузка остаются unresolved. Сохранить исправленное продолжение после upload из `039cde6c85`. После GREEN — проверки отрицательных случаев и затронутых полных файлов, обновление только затронутого migration hash, независимое ревью, затем commit/push и новая CI-проверка.
