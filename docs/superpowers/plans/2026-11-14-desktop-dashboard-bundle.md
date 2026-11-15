# Desktop dashboard bundling implementation plan

> **For agentic workers:** Use subagent-driven-development; это исправление дефекта, обнаруженного в Task18 M3, с native RED до изменения и GREEN после него.

**Goal:** Установленный Desktop открывает рабочее окно в обычном постоянном изолированном профиле; затем продолжается исходная приёмка M3.
**Architecture:** В существующем `main.build.externalizeDeps.exclude` добавить только `@loginom-ai-agent/dashboard`, как уже сделано для других workspace-пакетов с TypeScript exports. Main/sidecar получают JavaScript из штатной сборки; платформа Node и публичные контракты прежние.
**Tech Stack:** Закреплённые Bun/Node/Electron, electron-vite/Rollup, существующие native launch и Playwright CDP.
**Spec:** [M3 Task18](2026-11-12-dashboard-m3.md#task-18-сборка-поставки-обновление-стенда-и-приёмка); диагноз и actual RED — локальный `scratch/task-18-main-packaging-diagnosis.md` в workspace M3.

## Global Constraints

- Не обходить Node type stripping, не менять runtime, ASAR вручную, sandbox, зависимости/lockfiles или интерфейсы.
- Сохранить Node-ветку `#sqlite` и существующие целостность/source/archive проверки. Упаковка должна работать без Bun во время запуска.
- Исходные профили/авторизация/данные пользователя не меняются. Для live-проверки — свои HOME/XDG, обычная БД, headed UI; внешняя сеть через существующий proxy 127.0.0.1:10808.
- Все старые кандидаты, backup Server/Studio и результаты S6/CI сохраняются. Исправленная поставка — из одной чистой ревизии; установка только после проверок и без чужих запущенных Desktop.

Для живой публикации собственный HOME должен видеть тот же `loginom-dashboard/builds`, что и web. После штатного M3 install в обычном HOME создать в тестовом HOME обычный каталог `loginom-dashboard` и ссылку только `builds` на каталог сборок стенда. Перед созданием подтвердить mount target установщика, отсутствие заменяемых объектов и затем совпадение realpath. Профили, auth/config и БД остаются внутри своих XDG. Это связывает уже разрешённый каталог публикаций, без нового production параметра, изменения HOME, Docker context или установщика. Независимое review дополнения — Approved; ссылка создаётся после установки стенда.

## Scope and evidence

Обычный запуск установленного кандидата подтвердил `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` для `app.asar/node_modules/@loginom-ai-agent/dashboard/src/agent/folder.ts` до создания окна. Static PASS с `executableNotRun:true` этот контракт не проверяет. Пакет отсутствует в exclude, wildcard exports ведут в `.ts`; это первая неверная граница.

Транзитивный `node:sqlite` доступен в фактическом Electron42.3.3/Node24.15.0 (отдельная дешёвая проверка runtime, не замена native GREEN). Условие `node` задаёт существующий main preset. Не расширять fix на платформы или проверки, которых этот дефект не требует.

Ожидаемый diff: 6 файлов, до 140 изменённых строк с этим планом и итоговыми docs; production — один config, около 1–8 строк, новых тестовых файлов нет. В исходном дизайне и плане также исправляется единица ROI: сумма кампаний, а не число агрегированных строк; независимое review подтвердило сохранение исходного критерия 500 → 453 → 500. Список exclude не тестировать его копией. Готового дешёвого bundle/import fixture нет; новый fake-Electron harness был бы дороже исправления. Достаточны actual native RED→GREEN и имеющиеся проверки сборки/caller.

## Review Focus

- Любой обычный старт требует статический dashboard import, не только deep link: native окно обязательно.
- `#sqlite` выбирает Node, не `bun:sqlite`; проверить generated output и настоящий startup.
- Bundling сохраняет `prepareDashboard`/`findDashboard`; существующий dashboard-target test.
- Новый sandbox/profile или launcher workaround не скрывает loader error: обычный packaged executable и постоянный профиль.
- Static/resource/CI PASS не объявлять GUI PASS; snapshot/draft/publish остаются последующими проверками Task18.

## Task 1: Bundle the shared main dependency

- [x] **Step 1:** Независимое plan-review до production. Один config entry, без нового механизма; обязательные замечания устранить.
- [x] **Step 2:** Fresh implementer перечитывает actual RED, выполняет baseline из `packages/desktop`: `bun test electron.vite.config.test.ts electron-builder.config.test.ts scripts/release/artifact.test.ts src/main/dashboard-target.test.ts`. Затем добавляет один workspace package в exclude, повторяет те же tests и `bun typecheck`; owned commit `fix(desktop): bundle dashboard in the main process`.
- [x] **Step 3:** Независимое diff review (SPEC+QUALITY), максимум три адресных fix/re-review раунда. Не менять посторонние imports/config/runtime и не чинить необязательную слабость startup-failure smoke в этом diff.
- [x] **Step 4:** Из чистой ревизии штатно собрать Desktop и unpacked production package (`package:linux --x64 --dir --publish never`, новый output parent). Ранний сквозной результат: обычный запуск packaged executable, без `--no-sandbox` и Electron test shim; headed окно и штатная инициализация в своём persistent profile. При ошибке — её точная причина, без дополнительных обходов.
- [x] **Step 5:** После раннего GREEN — текущий CI и полные Desktop/CLI artifacts из той же чистой ревизии. Их подготовка может идти параллельно; оба PASS обязательны для итоговой приёмки. Текущий порядок независимых installed/CI проверок — в [configured M3](2026-11-14-configured-m3-stand.md). Метка этого исправляющего кандидата `0.3.10-m3.20261114.1`, новые каталоги сохраняют прежний кандидат; metadata не переписывается. Согласие владельца на замену Desktop для Task18 уже получено; корректирующая переустановка входит в это обновление, профили пользователя не менять.
- [x] **Step 6:** Повторить проверку установленного payload и обычный native startup. GREEN — работающее окно/штатная инициализация, не отсутствие текста ошибки. Обновить основной план/runbook/checkpoint и продолжить исходную Task18. CLI S6 переиспользовать только при подтверждённой неизменности релевантного runtime; при отличии сначала выяснить причину.

Стоимость выбранного порядка: при новом CI-дефекте часть упаковки может оказаться напрасной; проверка до установки и единство исходников сохраняются. Новые helper frameworks, настройки, транспилятор в runtime, обновление зависимостей, очистка чужих файлов, слияние/выпуск исключены.

Installed window/init и payload подтвердили исправление упаковки. Настоящий Loginom Check выявил отсутствующий штатный build input; продолжение — по [плану configured M3](2026-11-14-configured-m3-stand.md), с новым S6 для окончательной конфигурации.
