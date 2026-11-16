# Dashboard M6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить эксплуатационный журнал, выключатель и независимую установленную проверку безопасности dashboard.

**Architecture:** События publisher/web/CSP идут в ограниченные JSON-строки stdout существующих контейнеров. Сохраняются их ротация, текущие лимиты и lifecycle; dev получает stop/start установленных контейнеров. Приёмка проверяет итоговую цепочку безопасности поверх принятого M5, без новой платформы мониторинга.

**Tech Stack:** TypeScript, Node из Product pins, Bun, node:test, Playwright, Bash, Docker Compose/rootless Podman, существующие Loginom master и release-стенды.

**Spec:** [Согласованный дизайн M6](../specs/2026-11-16-dashboard-m6-design.md).

**Статус:** план подготовлен 16 ноября 2026 года; независимое ревью — Approved, обязательных замечаний нет. Исправлены полнота coverage reporter и размещение owner-проверки на установленном стенде; отдельное операционное ревью Tasks 1–3 учтено. Реализация не начата. M5 выполняется в отдельном чате; начало реализации зависит от принятого результата M5.

## Global Constraints

- Дизайн M6 согласован; исходниковый срез планирования `004a74be52` не является базой реализации. Task 0 закрепляет принятый итоговый SHA M5 и повторно проверяет карту изменений.
- M5 сохраняет ответственность за свои Tasks 0–5, выбор движков/compose, release-установку и полную матрицу обновления/CA/Desktop/CLI. Не продолжать их в M6.
- Dashboard — недоверенный код. Не менять sandbox, CSP, MessagePort v1, права Loginom, подтверждение публикации, набор разрешённых инструментов или изоляцию builder.
- Оперативные журналы: существующая ротация `10m × 3`, без фиксированного срока и постоянного архива. Выгрузка до stop/обновления — обязанность оператора.
- Выключатель прекращает работу служб, но не отзывает уже переданные браузеру данные. Открытые dashboard пользователь закрывает сам.
- Публикации и `.lgp` сохраняются; userstorage у publisher RO. Нет пользовательских квот, удаления живых публикаций ради лимита, Docker socket или новой службы.
- Прежние лимиты сохраняются: 100 снимков/15 минут, 640 КиБ запрос/512 КиБ образец, 1 МиБ/200 файлов публикации, 20 МиБ результат, одна серверная сборка/90 секунд. Остальные значения сверить с принятым кодом M5.
- Новые нетривиальные изменения — последовательные RED → GREEN → REFACTOR по установленному skill `tdd` из каталога сессии. Не писать сразу весь набор тестов.
- Тесты и `bun typecheck` выполняются из `packages/dashboard`. Сохраняются существующие пороги покрытия; shell проверяется `bash -n` и ShellCheck. Использовать закреплённые Node/Chromium, а не произвольный системный браузер.
- Реальные пути, credentials и сырые журналы хранятся вне Git. Временные данные — в выделенном пользователем storage-каталоге через короткий `$TMPDIR`; длинный путь профиля Chromium может нарушить системный предел Unix socket.
- Перед каждым коммитом проверять только собственный staged diff через `bun run secrets staged`; hooks не обходить. Слияние/выпуск — отдельная команда владельца.

---

## Основа и размер

Прочитать `packages/dashboard/AGENTS.md`, roadmap M6, `docs/security/dashboard-isolation.md`, дизайн и итоговый runbook M5. До работы со стендами также прочитать `docs/migration/linux-implementation-checkpoint.md`, `docs/testing/loginom-ai-agent/README.md` и owning instructions затронутых модулей.

Первый новый сквозной результат — настоящий CSP POST от установленного тестового dashboard превращается в безопасную JSON-строку контейнерного журнала. Проверить его в Task 1 до расширения журнала publisher. Наличие тестового callback в исходниках не заменяет этот результат.

Ориентир изменений: 15–22 файла, около 700–1 200 добавленных/удалённых строк вместе с тестами и документами. Это оценка, не квота. Если нужны новая служба/хранилище, большой рефакторинг установщиков или размер превышает оценку вдвое, сначала пересмотреть более простой способ. Не менять гарантии ради размера. Одноразовые скрипты приёмки не становятся продуктом.

## Карта файлов и интерфейсов

| Часть | Файлы | Задача |
|---|---|---|
| Формат/ограничение событий | новый `packages/dashboard/src/log.ts` | Малый общий writer для web и publisher; один набор счётчиков на роль, без очереди и карты клиентов |
| HTTP/CSP | `src/web/apps.ts`, `src/web/server.ts`, `src/entry.ts` | Разбор известного отчёта, события отказов; общий writer web создаётся один раз при запуске двух listeners |
| Publisher | `src/publisher/index.ts`, `src/entry.ts` | События переходов на основе существующего state, точные hashes и metadata своей задачи |
| Identity и выключатель | `deploy/compose.yaml`, `compose-release.yaml`, `containers.sh`, `dev-master.sh`, `check-release.mjs` | Передача фактического builder image ID; dev stop/start; проверка сохранения текущего lifecycle |
| Поведенческие проверки | `test/web/{apps,server}.test.mjs`, новый `test/web/log.test.mjs`, `test/browser/reporting.test.mjs`, `test/publisher/publisher.test.mjs`, `test/deploy/containers.test.mjs` | Sanitization, ограничения, состояния, identity и отказы CLI/inspect |
| Подключение проверок | `package.json`, `script/check-coverage.mjs`, при необходимости `test/browser/fixture.mjs` | Включить новый log helper в существующий coverage web, его тест и точный ожидаемый набор reporter; не вводить новое CI-задание |
| Документы | новые `docs/testing/loginom-ai-agent/dashboard-m6.md` и `dashboard-m6-checkpoint.md`; owning `AGENTS.md`, `dashboard/README.md`, roadmap/isolation | Команды оператора, матрица доказательств, актуальные ограничения и checkpoint до 20 строк |

Пути без префикса в таблице относятся к `packages/dashboard`. Public Protocol, SDK, формат публикации и builder algorithm не меняются; сгенерированный клиент не затрагивается. Включение `src/log.ts` в TypeScript достигается реальными импортами; отдельная конфигурация компилятора не нужна.

Внутренний writer, реализуемый Task 1 и используемый Task 2:

```ts
export type EventName = "request_rejected" | "request_failed" | "report_rejected" | "csp_violation" | "connection_violation" | "publication_pending" | "build_started" | "publication_rejected" | "build_failed" | "build_ready" | "publication_removed"
export type EventFields = {
  code?: string; key?: string; sourceHash?: string; buildHash?: string
  publication?: string; template?: number; builderImage?: string
  directive?: string; disposition?: "enforce" | "report"
}
export type EventWriter = (event: EventName, fields?: EventFields) => void
export declare function createEventLog(role: "web" | "publisher", write?: (line: string) => void, now?: () => number): EventWriter
```

Это внутренний контракт плана, не новый API продукта. Callers передают только явно выбранные поля; writer также перечисляет эти поля явно, не сериализует входной объект целиком. `code`/`directive` — известные значения, назначенные/проверенные caller, а не текст исключения. `events_suppressed` с числом подавлений пишет сам writer. `write`/`now` — узкие точки для тестов без глобальных моков. Если итоговый M5 уже предоставляет подходящий writer, использовать его и согласованно обновить этот внутренний интерфейс.

## Review Focus

1. Сырые CSP/URL/errors/headers и snapshot ID не проникают в stdout; stream нарушений не создаёт неограниченную память/очередь.
2. Журнал не меняет исход публикации, не повторяет неизменённый failed каждый scan и не приписывает старую сборку новому образу.
3. Image ID приходит от установленного engine, а не из публикации; read-only/mounts/network/SELinux не ослаблены.
4. Stop/start затрагивает только свои контейнеры, сохраняет режим и данные, не включает их после reboot; не обещает закрытие открытых страниц.
5. Установленная безопасность и ACL доказаны на подходящих версиях Loginom; журнал отчёта не считается доказательством его подлинности или блокировки.

### Task 0: Принять итог M5 и подготовить воспроизводимую проверку

**Files:** создать runbook M6 и checkpoint, обновить статус этого плана.

**Interfaces:** consumes — принятые design/plan/runbook M5, SHA и фактические артефакты; produces — записанные исходная база M6, доступные master/release-стенды и команды существующего инструментария. Это проверка входов, новый installer/VM framework не создаётся.

- [ ] Подтвердить завершение M5 по итоговому checkpoint и ревью. Если M5 не принят, реализацию не начинать; указать конкретный недостающий результат. Не трактовать старое локальное «Task 4 ожидает решения» как текущий статус.
- [ ] Создать отдельную ветку реализации от принятого M5, перенести только документы M6 и сверить затрагиваемые callers/тесты. Сохранить чужие незавершённые изменения.
- [ ] Записать SHA M5, версии Loginom и движков, hashes артефактов, пины Node/Chromium и применимые прежние результаты. Приватные параметры держать вне Git.
- [ ] Подготовить существующие master и release-среды из принятых рецептов. Иметь двух тестовых пользователей, synthetic пакет и прежнюю рабочую публикацию; проверить доступ к мишени сетевых проб из контрольной страницы. Нет лицензии/учётных записей/подходящего стенда — соответствующая приёмка заблокирована, а не PASS.
- [ ] Определить короткий `$TMPDIR` в разрешённом storage, экспортировать `LOGINOM_AI_AGENT_TEST_NODE`, `PLAYWRIGHT_BROWSERS_PATH`; выполнить package-local `bun typecheck` и адресные существующие тесты web/publisher. Уже имеющийся применимый green не повторять без причины.
- [ ] Независимо сверить уточнённый план с итоговым M5; зафиксировать только необходимые поправки, commit `docs(dashboard): prepare M6 acceptance`.

**Done:** точная принятая база и готовый путь первой установленной CSP-пробы. Отсутствие M5 не компенсировано дополнительной инфраструктурой.

### Task 1: Безопасный журнал web и настоящего CSP-нарушения

**Files:** создать `src/log.ts`, `test/web/log.test.mjs`; изменить web, browser reporting/fixture, `package.json` и `script/check-coverage.mjs` из карты.

**Interfaces:** consumes — существующие `appHost(options)` с `log?: (line: string) => void`, `dashboardServer(options)`, `startDashboard(env, shell)`; produces — `createEventLog`/`EventWriter` выше, необязательное `events?: EventWriter` у обоих HTTP-конструкторов. `startDashboard` создаёт один writer роли web и передаёт обоим listeners. Существующий `appHost.log` остаётся тестовым sink, обёрнутым writer при отсутствии `events`; новые параллельные системы логов не вводятся.

- [ ] **RED:** добавить один настоящий HTTP-тест в `apps.test.mjs`, используя его `listen` и `send`:

```js
test("CSP report logs only safe fields", async t => {
  const stand = await listen(t)
  const marker = "synthetic-sensitive-value"
  const response = await send(stand.server, "POST", "/_reports", {
    headers: { "content-type": "application/csp-report", cookie: marker, authorization: marker },
    body: JSON.stringify({ "csp-report": {
      "document-uri": `${dash}/apps/${stand.key}/${stand.hash}/?token=${marker}`,
      "effective-directive": "connect-src", disposition: "enforce",
      "blocked-uri": `https://blocked.invalid/${marker}`, "script-sample": marker,
    } }),
  })
  assert.equal(response.status, 204)
  const event = JSON.parse(stand.lines.at(-1))
  assert.equal(event.event, "csp_violation")
  assert.equal(event.key, stand.key)
  assert.equal(event.buildHash, stand.hash)
  assert.equal(event.directive, "connect-src")
  assert.equal(stand.lines.join("\n").includes(marker), false)
})
```

Run: `"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-name-pattern='CSP report logs only safe fields' test/web/apps.test.mjs`. Ожидается отказ старой сырой строки. Фикстуры и значение marker искусственные.

- [ ] **GREEN:** разобрать `application/csp-report` и известные Reporting API envelopes без копирования тела в журнал. Выбрать только собственные `/apps/<64 hex>/<64 hex>/`, допустимые directive/disposition; неизвестную привязку не выдумывать. Поддержать полученные connection reports по известной структуре, не требуя их доставки. Реализовать writer с временем/ролью/event и явной проекцией полей. Сохранить CSP/CORS на всех ответах. Существующий тест сырого тела заменить проверкой нового принятого поведения.
- [ ] **Следующий RED → GREEN:** по одному добавить malformed/unknown envelope (отказ 400 и безопасное событие), >64 КиБ (413), чужой document origin, управляющие символы, массив отчётов. Валидный отчёт — 204; запрос не отражает тело в ответ/лог. Разбор выполняется в пределах существующего body limit, записи ограничивает writer.
- [ ] **Следующий RED → GREEN:** для writer зафиксировать начальные внутренние пределы: до 8 КиБ UTF-8 на JSON-строку и 60 обычных записей за 60 секунд на роль. В новом окне допускается ещё одна summary о подавлениях; таймер/очередь/карта IP не нужны. Длинные поля обрезаются до сериализации; JSON остаётся валидным. Подавления учитываются до следующего события нового окна.

```js
let now = 0
const lines = []
const log = createEventLog("web", line => lines.push(JSON.parse(line)), () => now)
for (let i = 0; i < 65; i++) log("request_rejected", { code: "host" })
assert.equal(lines.length, 60)
now = 60_000
log("request_rejected", { code: "origin" })
assert.equal(lines.at(-2).event, "events_suppressed")
assert.equal(lines.at(-2).count, 5)
```

- [ ] **Следующий RED → GREEN:** реальными HTTP-запросами проверить события отказов Host/Origin/schema/body и безопасный 500. Не писать полный URL, body, snapshot ID или `String(error)`. Ошибка sink не меняет ответ/готовый результат: проверить throwing sink и ограниченный best-effort write без рекурсивного логирования или повторов.
- [ ] **REFACTOR/проверка:** подключить новый тест и `src/log.ts` в существующую coverage web; в `script/check-coverage.mjs` добавить ровно `src/log.ts` к ожидаемому набору web. Сохранить точное сравнение состава измеренных файлов, workers scope и пороги. Обновить `test/browser/reporting.test.mjs` на новое событие, сохранив доказательство настоящего browser POST. Выполнить `bun typecheck`, `bun run test:coverage:web`, адресный browser reporting и `bun run check:size` после сборки.
- [ ] **Первый установленный результат:** из package directory собрать `bun run build:release --out "$M6_RELEASE_OUT"`, где каталог вне Git; Node в PATH соответствует Product. Установить артефакт штатным путём M5 в собственную release-среду, вызвать реальное CSP-нарушение и увидеть очищенное событие в container log. Если итоговый installer сохраняет проверку совпадения `image.ref` прежней установки, заменить только собственную установку dashboard штатными uninstall/install после выгрузки журналов; UserStorage/публикации/`.lgp` сохранить и сравнить. Не редактировать `.env` в обход проверки и не добавлять систему обновления dashboard ради приёмки. Нормальное приложение продолжает работать. Записать hash артефакта, событие и отсутствие synthetic marker в runbook.
- [ ] Независимое scoped review, исправить обязательные замечания; commit `feat(dashboard): add safe web security events`.

**Done:** реальный browser → установленный web → ограниченный безопасный журнал; прежняя защита и ответы основного пути сохранены.

### Task 2: Журнал publisher с фактической сборкой и образом

**Files:** `src/publisher/index.ts`, `src/entry.ts`, оба compose, `containers.sh`, `dev-master.sh`, `check-release.mjs`, publisher/deploy tests.

**Interfaces:** consumes — `createEventLog` из Task 1, существующие state/jobs/`buildNext`, фактический engine image ID; produces — необязательные `events?: EventWriter` и `builderImage?: string` в input `scanPublications`. Installed entry передаёт writer publisher и проверенный `DASHBOARD_BUILDER_IMAGE`. Это внутренняя переменная из inspect, не новый пользовательский флаг. `job.json` может хранить template/image своей задачи; публичный JSON и builder input не меняются.

- [ ] **RED:** в `publisher.test.mjs` использовать реальные `fixture`, `buildNext` и `scanPublications`, не имитировать результат сборки:

```js
test("publisher logs a verified build once", async t => {
  const input = await fixture(t)
  const lines = []
  const events = createEventLog("publisher", line => lines.push(JSON.parse(line)))
  const builderImage = "sha256:" + "1".repeat(64)
  await scanPublications({ ...input, events, builderImage })
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications({ ...input, events, builderImage })
  await scanPublications({ ...input, events, builderImage })
  const ready = lines.filter(line => line.event === "build_ready")
  assert.equal(ready.length, 1)
  assert.equal(ready[0].sourceHash, createHash("sha256").update(content).digest("hex"))
  assert.equal(ready[0].template, 1)
  assert.equal(ready[0].builderImage, builderImage)
  assert.equal(ready[0].buildHash, JSON.parse(await readFile(join(input.builds, "state.json")))[path].buildHash)
})
```

Run: `"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-name-pattern='publisher logs a verified build once' test/publisher/publisher.test.mjs`; RED — отсутствует событие. Добавить импорт writer из Task 1.

- [ ] **GREEN:** сравнить переходы существующего state и писать событие после подтверждения соответствующего результата; использовать уже вычисленные sourceHash/buildHash и `template: 1` из проверенной публикации. Не вычислять второй hash тех же bytes, не создавать реестр событий/повторный селектор current. Старый ready после restart не объявлять новым build_ready.
- [ ] **Следующий RED → GREEN:** отдельно проверить повреждённую публикацию/чужую binding, failed build и сохранение прежней версии, удаление публикации, неизменённый failed на повторном scan, restart незавершённой задачи. Стабильные коды причин выбирает платформа; source/error output не копируется в журнал. Throwing sink не меняет ready/state/cleanup. Для файла без подтверждённых metadata соответствующие поля отсутствуют.
- [ ] **Identity RED → GREEN:** установленный publisher должен получить фактический builder image ID. После load/build получить его существующим inspect; передать `DASHBOARD_BUILDER_IMAGE` через оба compose и существующий release `.env` whitelist. `check-release.mjs`/dev check сравнивают значение с настоящим `builder.Image`, учитывая существующие Docker/Podman формы digest. Отсутствующий/чужой ID installed-среды — понятный отказ проверки, не ложные metadata. Source-only tests могут не иметь image ID и не выдают его за проверенный.
- [ ] В `test/deploy/containers.test.mjs` расширить существующие `inspectPublisher` и матрицу: одинаковый ID проходит, изменённый/отсутствующий отказывает на Docker/Podman; проверить env у publisher. Изменение test fixture не считается установленной проверкой. Старые записи state остаются читаемыми без мигратора, незавершённые jobs переподготавливает существующий restart.
- [ ] Выполнить `bun typecheck`, `bun run test:coverage:workers`, deploy tests, `bash -n`/ShellCheck изменённых скриптов. На установленном артефакте сравнить logged image ID с inspect builder, а logged sourceHash — с точными bytes synthetic JSON. Выполнить два scan без нового duplicate ready.
- [ ] Независимое scoped review; commit `feat(dashboard): log verified publication transitions`.

**Done:** publisher журналирует исход своей реальной работы и точное происхождение сборки; состояние/права/формат публикации сохранены.

### Task 3: Выключатель и эксплуатационные пределы на обоих движках

**Files:** `deploy/dev-master.sh`, `test/deploy/containers.test.mjs`; release lifecycle менять только при доказанном дефекте. Обновить README, owning AGENTS и runbook.

**Interfaces:** consumes — существующий `--config` dev и сохранённая установка release; produces — `dev-master.sh stop|start --config FILE`. Release `containers.sh stop|start --engine ...` остаётся прежним. Нет режима `enabled`, административного HTTP endpoint или клиентского heartbeat.

- [ ] **RED на собственном установленном master:** выполнить assert-проверку реального stop. Config и его owner уже проверены в Task 0; чужой стенд не используется. До реализации команда должна завершиться Usage, поэтому assert успеха упадёт. Сохранить эту короткую приёмочную проверку вне Git и повторить после изменения; отдельный fake Docker не строить.

```js
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
assert.ok(process.env.DASHBOARD_MASTER_CONFIG)
const stopped = spawnSync("/bin/bash", ["deploy/dev-master.sh", "stop", "--config", process.env.DASHBOARD_MASTER_CONFIG], { encoding: "utf8" })
assert.equal(stopped.status, 0, stopped.stderr)
```

- [ ] **GREEN:** расширить разрешённые action и добавить раннюю ветку lifecycle после проверки config/точных имён/owner. Собрать полные ID всех трёх собственных контейнеров до первой мутации; затем `docker stop`/`docker start` только этих ID. Не запускать build/install/compose up, не менять Apache/режим/UID/mounts. Для отсутствующей установки start отказывает с указанием install; stop сообщает отсутствие без изменения чужих объектов. При частичном отказе вернуть ненулевой результат и безопасное описание незавершённого действия.
- [ ] Добавить CLI regression tests в существующий `containers.test.mjs`: `stop --strict` и `start --cli-button` отказывают до engine/mutations; отсутствующий config также отказывает. Использовать существующий `spawnSync`-подход. Чужую owner-метку проверять на собственной установленной среде: создать временную копию config с неверным ожидаемым owner, выполнить stop/start, подтвердить отказ и неизменность всех контейнеров по inspect до/после; реальные метки/контейнеры не менять. Positive-path подтверждать фактической остановкой всех трёх контейнеров, а не только кодом возврата.
- [ ] **Положительная проверка:** на dev с strict и включённой CLI-кнопкой снять inspect, выполнить stop/start, сравнить image/env/mounts, проверить сервер/клиент. Отдельно запрос к новой странице/сборке во время stop отказывает, Studio открывает пакет, `.lgp`/публикации неизменны. Уже открытая страница может работать — это принятая граница.
- [ ] **Release Docker и rootless Podman:** из готового архива проверить просмотр/выгрузку stdout, ротацию, stop → отсутствие своих служб → reboot → по-прежнему выключено → start → server/client check. Podman cron сохраняет `compose start`, не `up`. Dev сохраняет `unless-stopped`. Проверять reboot только собственной среды; не перезагружать общую рабочую машину ради smoke.
- [ ] **Пределы:** сопоставить существующие behavioral tests снимков, публикации, output, timeout и iframe с фактическими лимитами артефакта. Выполнить bounded burst отчётов и oversized report; inspect подтвердит memory/PID/tmpfs и log options обоих движков. После отказов обычный dashboard работает, прежняя публикация сохранена. Не повторять все нагрузочные тесты M5 и не менять размеры ради PASS.
- [ ] Для ротации подтвердить фактическую смену/ограничение log-файлов, не только наличие YAML. Чтобы не ждать заполнения рабочего журнала при ограниченной частоте, допустим одноразовый собственный контейнер того же образа с точно такими же driver/options, без сети и пользовательских mounts: штатный Node пишет конечный synthetic объём больше `3 × 10m`, затем средствами движка проверяются предел и вытеснение старых записей. Сопоставить его настройки с установленными ролями и удалить только эту пробу. Если штатный driver Podman не реализует указанную ротацию, это дефект текущей гарантии: найти минимальную поддерживаемую конфигурацию без постоянного архива, отразить проверку; не выдавать опцию inspect за доказанную ротацию.
- [ ] `bash -n`, ShellCheck, deploy tests; scoped review. В runbook дать точные команды Docker/Podman logs и выгрузки для реально принятой конфигурации, предупредить о потере логов при удалении контейнеров. Commit `feat(dashboard): complete operations controls`.

**Done:** оператор получает журнал и управляет только dashboard, выключенное состояние/данные сохраняются; ограничения проверены без новой системы квот.

### Task 4: Независимая безопасность и итоговая приёмка M6

**Files:** runbook/checkpoint M6, актуальные разделы roadmap/isolation и owning AGENTS. Код — только для воспроизведённых дефектов M6 с отдельным RED → GREEN; не превращать этап в общий аудит репозитория.

**Interfaces:** consumes — точный финальный артефакт Tasks 1–3, матрица M5 и текущие тестовые сценарии; produces — приёмка по каждому требованию, перечень закрытых/принятых замечаний, ограничения и финальный SHA. Нет нового runner или CI-платформы.

- [ ] На окончательном коде из `packages/dashboard` выполнить:

```sh
bun typecheck
bun run test
bun run test:browser
bun run check:size
bash -n deploy/containers.sh deploy/dev-master.sh
shellcheck deploy/containers.sh deploy/dev-master.sh
```

Успех включает существующие coverage web и publisher/builder, сборку, contract/SDK и браузерные тесты. Не повторять green после документационных правок. Если менялись другие owning packages, выполнить их обязательные package-local checks. Существующие CI jobs сохраняются; новый тест должен реально входить в их команды.

- [ ] Собрать и закрепить hash конечного release-архива. Подтвердить server и отдельный установленный client check M5; изменённые в Tasks 1–3 свойства перепроверить на этом артефакте. Не переносить PASS от промежуточного архива после затрагивающих поведение изменений.
- [ ] Отдельный агент, не реализовавший изменение, делает security-review всей требуемой цепочки: профиль модели/подтверждение/Host/ACL/publisher/builder/web/sandbox. Дать ему design, diff от принятого M5, матрицу evidence и Review Focus. Замечания должны иметь конкретный риск и проверку; опциональные улучшения не блокируют.
- [ ] На собственном установленном release выполнить ручные попытки, переиспользуя `test/browser/apps/malicious`, `isolation.test.mjs`, `strict.test.mjs` и publisher test fixtures: доступ к parent/credentials, сеть/навигация, подмена/replay сообщений, подмена publication binding и результата сборки. Сначала доказать работоспособность каналов наблюдения, затем фиксировать ожидаемый отказ и сохранение основного пути. Не ослаблять production CSP ради атаки.
- [ ] Strict: отдельный регистрируемый домен и доверенный TLS, закреплённый Chromium 152+ открывает обычный пример и блокирует выбранные атаки; Firefox с включённым WebRTC отвергается до расчёта/данных. Проверить реальные headers/process isolation. Записать известные ограничения WebRTC-пробы, DNS/preconnect и доставки Connection-Allowlist reports; не требовать недоступный отчёт вместо behavioral evidence.
- [ ] Master: автор публикует; отдельный read-only пользователь открывает разрешённый пакет, но не записывает/заменяет чужой JSON. Release 7.4.2: другой пользователь без доступа не записывает защищённую папку; split read/write прав здесь не заявляется. На обоих второй пользователь пробует чужую binding в своей writable папке — publisher отказывает. До/после сравнить protected JSON/`.lgp` и текущую сборку; использовать разные реальные Studio-сессии.
- [ ] Подтвердить в журнале безопасные события реально вызванных CSP/HTTP/publication нарушений, отсутствие synthetic sensitive markers и наличие ограничений при flood. Для статуса нарушения использовать одновременно наблюдаемое поведение и запись, а не только недоверенный report.
- [ ] Исправить обязательные дефекты, пройти scoped re-review и затронутую приёмку. Неразрешённый остаточный риск представить владельцу отдельно; агент сам его не принимает. Не спрашивать о повторной проверке уже согласованного исправления.
- [ ] Обновить канонические документы: commands/evidence/границы в runbook, checkpoint до 20 строк, roadmap M6 и точные изменившиеся утверждения isolation/AGENTS. Сохранить историю M2/M4/M5. Финальный независимый просмотр проверяет соответствие дизайну и лишние additions; commit `docs(dashboard): accept M6 operations and security` только если приёмка действительно завершена.

**Done:** все четыре критерия roadmap M6 подтверждены; обязательных непринимаемых владельцем замечаний нет. Отсутствующий стенд/вход или незавершённая проверка остаются явным блокером, а не заменяются исходниковым PASS. Merge/release не выполнять.

## Самопроверка плана и передача

Покрытие дизайна: зависимость M5 — Task 0; web/CSP/ограничения журнала — Task 1; publisher/provenance — Task 2; stop/start/лимиты/оператор — Task 3; независимое ревью, ручной обход, strict и разные ACL master/release — Task 4. State/публикация не дублируются, постоянный архив и общая платформа управления не вводятся.

Самопроверка покрытия дизайна, файлов/callers, внутренних интерфейсов и команд выполнена; относительные ссылки и diff проверены. Это проверка документов по исходникам, не выполнение описанных тестов или установленная приёмка.

Выполнение последовательно: Tasks 1–3 используют общие файлы; делить их между одновременно пишущими агентами не нужно. Независимые ревью и чтение evidence можно выполнять параллельно. Предпочтительный следующий шаг после приёмки M5 — subagent-driven-development с отдельным исполнителем задачи и scoped review; допустим inline executing-plans с теми же checks. Этот план сам по себе не запускает реализацию.
