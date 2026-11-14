# Dashboard startup implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. Продолжение Task18 M3; владелец разрешил найти и сократить задержку без изменения порога и полноты проверки.

**Goal:** Уменьшить запуск обычного CLI M3 до прироста не более 2 секунд относительно M2 при полной проверке поставки.
**Architecture:** В существующем `inventory()` заменить только последовательные metadata-вызовы `node:fs/promises` на стандартные `node:fs` `*Sync`. Оставить async API и прежний потоковый SHA256 каждого файла; контракт и формат манифеста не меняются.
**Tech Stack:** TypeScript, Node fs/crypto, закреплённые Bun/Node из окружения M3.
**Spec:** [M3 Task18](2026-11-12-dashboard-m3.md#task-18-сборка-поставки-обновление-стенда-и-приёмка), [результаты S6](../../testing/loginom-ai-agent/dashboard-m3.md#предустановочный-результат-2026-11-14).

## Global Constraints

- Порог прироста на Linux — 2 секунды; сохранить разницу медиан трёх замеров и условия согласованного контроля M2.
- Сохранить полную проверку каждого запуска: все пути/байты SHA256/mode/link, escape/extra/missing/required files, Linux skills, Windows PE/resources и macOS symlinks.
- Не добавлять cache, частичную проверку, pool/queue, settings, зависимости или новый формат. Большие файлы хэшируются прежним bounded stream.
- Не менять пользовательские профили/артефакты, конфигурацию ОС, стенд и исторические результаты. Установка DEB требует отдельного разрешения.

## Review Focus

- Изменённый файл/лишний путь/mode после успешной проверки: следующая проверка отказывает; существующие cli-manifest tests.
- Ссылка на внешний путь: отказ; существующие escape tests. Сохранение отдельной ветки точного `..` проверяется review кода; отдельного такого assertion в текущем test-файле нет.
- macOS directory symlink: текст ссылки хэшируется, рекурсивного обхода нет; существующий darwin-layout тест.
- Windows PE/resource binding и duplicate paths: прежний отказ; существующие win32-layout тесты, native CI.
- Неверный Linux skills kit или неполная поставка: прежний отказ; существующие skills/required-file tests.

## Scope and rationale

Диагностика в локальном scratch M3 `s6-startup-diagnosis.md`: штатный verifier — дорогой участок; отдельный metadata-sync probe прошёл полную проверку с наблюдаемым уменьшением примерно на 808 мс. Обычные OS caches и единичные component-пробы не доказывают native результат. Замена на Bun streaming существенного улучшения не показала и не включается.

Синхронные metadata-вызовы убирают межпоточные ожидания на каждом leaf без очереди или дополнительного состояния. Цена: metadata операции блокируют event loop текущего CLI/build/install процесса; план-review проверяет фактических callers и сохранение async отказов. Потоковое хэширование по-прежнему освобождает event loop и ограничивает память. Если native результат не улучшается, не наращивать механизм без новой конкретной гипотезы.

Ожидаемый tracked diff: 5 файлов, до 150 изменённых строк, включая этот план и итоговые документы; production — один файл, около 20 строк. Тесты используют имеющиеся проверки наблюдаемого контракта. Исключены resource staging, UI, Protocol/HttpApi, SDK generation, deps/locks и общие рефакторинги.

## Task 1: Minimal verifier optimization

**Files:** Modify `packages/loginom-host/src/cli-manifest.ts`; verify existing `packages/loginom-host/test/cli-manifest.test.ts`, `test/cli-install.test.ts`, `test/cli-install-windows.test.ts`.
**Interface:** `writeCliManifest`/`verifyCliManifest` и результаты/ошибки прежние; меняется только получение metadata внутри `inventory`.

- [x] **Step 1:** Независимое plan-review с учётом измеренной диагностики и callers — Approved, обязательных замечаний нет; описание покрытия точного `..` уточнено по optional замечанию.
- [x] **Step 2:** Зафиксировать TDD RED: существующие шесть корректных S6 M2/new samples уже показали превышение; перечитать raw summary. До изменения выполнить существующие manifest/install tests как baseline полноты проверки. Это performance RED реального пути; новые тесты имён `*Sync` и нестабильные unit-таймеры не нужны.
- [x] **Step 3:** Fresh implementer меняет только metadata calls и imports в inventory: `readdirSync`, `lstatSync`, `realpathSync`, `readlinkSync`, `statSync`; все проверки, порядок и SHA stream остаются прежними. Результат — существующие tests и package `bun typecheck` проходят. Из `packages/loginom-host`: `bun test test/cli-manifest.test.ts test/cli-install.test.ts test/cli-install-windows.test.ts`; `bun typecheck`. Покрывающие platform cases выполняются и при синтетическом target; native OS checks остаются CI.
- [x] **Step 4:** Owned commit `fix(host): reduce manifest metadata overhead`; independent diff review (compliance, quality и integrity guarantees). Покрывающие проверки reviewer не повторяет без новой причины. При замечаниях максимум три адресных fix/re-review раунда.
- [ ] **Step 5:** Из чистого нового source собрать verified native CLI в новом каталоге штатным builder (`--no-archive` допустим для первого сквозного результата). Прежние M2/new artifacts сохраняются. Первая сквозная проверка — полный обычный S6 M2/new с прежним методом, всеми raw samples и порогом; при превышении — остановка по Task18, без выбора лучшего прогона. Component timing не является GREEN.
- [ ] **Step 6:** После GREEN — текущий CI и согласованные Desktop/CLI archive builds из одной чистой ревизии, статические/source/archive проверки. Обновить основной план M3, runbook и checkpoint; старые результаты сохранить. Перед DEB-установкой остановиться для отдельного разрешения по Task18 Step3.

Результат Task1 принимается только после native GREEN и обязательных review/checks. Если данных для следующего изменения нет, сохранить конкретный blocker и условие продолжения; обход проверки и ослабление порога исключены.
