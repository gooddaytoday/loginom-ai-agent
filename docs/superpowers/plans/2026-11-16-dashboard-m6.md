# Dashboard M6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить эксплуатационный журнал, выключатель и независимую установленную проверку безопасности dashboard.

**Architecture:** События publisher/web/CSP идут в ограниченные JSON-строки stdout существующих контейнеров. Сохраняются их ротация, текущие лимиты и lifecycle; dev получает stop/start установленных контейнеров. Приёмка проверяет итоговую цепочку безопасности поверх принятого M5, без новой платформы мониторинга.

**Tech Stack:** TypeScript, Node из Product pins, Bun, node:test, Playwright, Bash, Docker Compose/rootless Podman, существующие Loginom master и release-стенды.

**Spec:** [Согласованный дизайн M6](../specs/2026-11-16-dashboard-m6-design.md).

**Статус:** M5 принят 17 ноября 2026 года. Изменения M6 и независимое защитное ревью завершены. Установлены итоговые release-копии, пройдены серверные и эксплуатационные проверки. Границы свидетельств и согласованный backlog зафиксированы в [runbook M6](../../testing/loginom-ai-agent/dashboard-m6.md).

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
- После каждого проверенного этапа обновить внешний Git bundle ветки от базы M5 и выполнить `git bundle verify`. Проверять staged diff по текущему этапу. Runbook ссылается на SHA принятой базы и результаты, checkpoint указывает следующий шаг.

---

## Основа и размер

Прочитать `packages/dashboard/AGENTS.md`, roadmap M6, `docs/security/dashboard-isolation.md`, дизайн и итоговый runbook M5. До работы со стендами также прочитать `docs/migration/linux-implementation-checkpoint.md`, `docs/testing/loginom-ai-agent/README.md` и owning instructions затронутых модулей.

Первый новый сквозной результат — Chromium отправляет CSP POST для обычного inline-стиля на синтетической установленной странице, а web пишет безопасную JSON-строку в контейнерный журнал. Проверить его в Task 1 сразу после первого RED → GREEN, перед остальными изменениями журнала.

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

- [x] Подтвердить приёмку M5 по итоговому checkpoint и ревью. Принятый HEAD отличается от источника архивной сборки M5 только документами и инструкциями. Архивную приёмку и новый baseline build фиксировать с их собственными SHA256.
- [x] Начать с чистой ветки от принятого M5 и сверить затрагиваемые callers/тесты. Точная база и пины записаны в runbook.
- [x] Подтвердить на собственных release-стендах установку, TLS, две разные Studio-сессии, синтетический пакет и прежнюю готовую публикацию. Для master нужны отдельный допущенный dev deployment и доступ к согласованной синтетической папке от автора и read-only пользователя. Указать фактически отсутствующие входы.
- [x] Подготовить короткий `$TMPDIR`, pinned Node/Chromium и зависимости. Из `packages/dashboard` пройдены `bun typecheck`, адресные coverage web и workers. Метрики приведены в runbook.
- [x] Независимо сверить уточнённый план с итоговым M5; зафиксировать только необходимые поправки, commit `docs(dashboard): prepare M6 acceptance`.

**Done:** точная принятая база и готовый путь первой установленной CSP-пробы. Отсутствие M5 не компенсировано дополнительной инфраструктурой.

### Task 1: Безопасный журнал web и настоящего CSP-нарушения

**Files:** создать `src/log.ts`, `test/web/log.test.mjs`; изменить web, browser reporting/fixture, `package.json` и `script/check-coverage.mjs` из карты.

**Interfaces:** consumes — существующие `appHost(options)`, `dashboardServer(options)`, `startDashboard(env, shell)`; produces — `createEventLog`/`EventWriter` выше, необязательное `events?: EventWriter` у обоих HTTP-конструкторов. `startDashboard` передаёт один writer роли web обоим listeners. При отсутствии `events` существующий `appHost.log` служит sink writer. Вызывающий код `src/draft/server.ts` сохраняет тихий sink. Проверить это на валидном синтетическом отчёте через loopback app host черновика.

- [x] **RED:** добавить один настоящий HTTP-тест в `apps.test.mjs`, используя его `listen` и `send`:

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

- [x] **GREEN:** разобрать `application/csp-report` и известные Reporting API envelopes без копирования тела в журнал. Выбрать только собственные `/apps/<64 hex>/<64 hex>/` и допустимые directive/disposition, включая `style-src-elem` для первой браузерной проверки. Неизвестную привязку не выдумывать. Поддержать полученные connection reports по известной структуре, не требуя их доставки. Реализовать writer с временем/ролью/event и явной проекцией полей. Сохранить CSP/CORS на всех ответах. Существующий тест сырого тела заменить проверкой нового принятого поведения.
- [x] **Первая установленная проверка:** собрать `bun run build:release --out "$M6_RELEASE_OUT"` с Node из Product pins и установить в собственную release-среду по [runbook](../../testing/loginom-ai-agent/dashboard-m6.md). Открыть синтетическую страницу с нормальной готовой публикацией и получить один CSP-отчёт браузера для обычного inline-стиля. Подтвердить наблюдённый POST и очищенное событие web с привязкой сборки, а также доступность обычного приложения. Записать SHA256 артефакта и обезличенное подтверждение. Если нужно сменить сохранённый `image.ref`, выгрузить журнал, заменить только собственный dashboard штатными uninstall/install и сверить сохранность UserStorage и `.lgp`.
- [x] **Следующий RED → GREEN:** по одному добавить malformed/unknown envelope (отказ 400 и безопасное событие), >64 КиБ (413), чужой document origin, управляющие символы, массив отчётов. Валидный отчёт — 204; запрос не отражает тело в ответ/лог. Разбор выполняется в пределах существующего body limit, записи ограничивает writer.
- [x] **Следующий RED → GREEN:** для writer зафиксировать начальные внутренние пределы: до 8 КиБ UTF-8 на JSON-строку и 60 обычных записей за 60 секунд на роль. В новом окне допускается ещё одна summary о подавлениях; таймер/очередь/карта IP не нужны. Длинные поля обрезаются до сериализации; JSON остаётся валидным. Подавления учитываются до следующего события нового окна.

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

- [x] **Следующий RED → GREEN:** реальными HTTP-запросами проверить события отказов Host/Origin/schema/body и безопасный 500. Не писать полный URL, body, snapshot ID или `String(error)`. Ошибка sink не меняет ответ/готовый результат: проверить throwing sink и ограниченный best-effort write без рекурсивного логирования или повторов.
- [x] **REFACTOR/проверка:** подключить новый тест и `src/log.ts` в существующую coverage web; в `script/check-coverage.mjs` добавить ровно `src/log.ts` к ожидаемому набору web. Сохранить точное сравнение состава измеренных файлов, workers scope и пороги. В `test/browser/reporting.test.mjs` заменить trigger из adversarial fixture обычным inline-стилем на синтетической странице и подтвердить настоящий browser POST и новое событие. Выполнить `bun typecheck`, `bun run test:coverage:web`, адресный browser reporting и `bun run check:size` после сборки.
- [x] Независимое scoped review, исправить обязательные замечания; commit `feat(dashboard): add safe web security events`.

**Done:** реальный browser → установленный web → ограниченный безопасный журнал; прежняя защита и ответы основного пути сохранены.

### Task 2: Журнал publisher с фактической сборкой и образом

**Files:** `src/publisher/index.ts`, `src/entry.ts`, оба compose, `containers.sh`, `dev-master.sh`, `check-release.mjs`, publisher/deploy tests.

**Interfaces:** consumes — `createEventLog` из Task 1, существующие state/jobs/`buildNext`, фактический engine image ID; produces — необязательные `events?: EventWriter` и `builderImage?: string` в input `scanPublications`. Installed entry передаёт writer publisher и проверенный `DASHBOARD_BUILDER_IMAGE`. Это внутренняя переменная из inspect, не новый пользовательский флаг. `job.json` может хранить template/image своей задачи; публичный JSON и builder input не меняются.

- [x] **RED:** в `publisher.test.mjs` использовать реальные `fixture`, `buildNext` и `scanPublications`, не имитировать результат сборки:

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

- [x] **GREEN:** сравнить переходы существующего state и писать событие после сохранения соответствующего состояния. Использовать уже вычисленные sourceHash/buildHash и `template: 1` из проверенной публикации. Старый ready после restart не объявлять новым build_ready.
- [x] **Следующий RED → GREEN:** отдельно проверить повреждённую публикацию/чужую binding, failed build и сохранение прежней версии, удаление публикации, неизменённый failed на повторном scan, restart незавершённой задачи. Стабильные коды причин выбирает платформа; source/error output не копируется в журнал. Throwing sink не меняет ready/state/cleanup. Для файла без подтверждённых metadata соответствующие поля отсутствуют.
- [x] **Identity RED → GREEN:** получить фактический builder image ID существующим inspect после load/build. На dev выполнить build и inspect до проверки compose с обязательным ID. Передать `DASHBOARD_BUILDER_IMAGE` через оба compose и release `.env` whitelist. `check-release.mjs` и dev check сверяют значение с настоящим `builder.Image` с существующей нормализацией Docker/Podman digest. При release start/recreate сверять, что сохранённый тег по-прежнему указывает на проверенный ID. Отсутствующий или чужой ID установленной среды даёт понятный отказ. Source-only тесты могут работать без image ID.
- [x] В `test/deploy/containers.test.mjs` расширить существующие `inspectPublisher` и матрицу: одинаковый ID проходит, изменённый/отсутствующий отказывает на Docker/Podman; проверить env у publisher. Изменение test fixture не считается установленной проверкой. Старые записи state остаются читаемыми без мигратора, незавершённые jobs переподготавливает существующий restart.
- [x] Выполнить `bun typecheck`, `bun run test:coverage:workers`, deploy tests, `bash -n`/ShellCheck изменённых скриптов. На установленном артефакте сравнить logged image ID с inspect builder, а logged sourceHash — с точными bytes synthetic JSON. Выполнить два scan без нового duplicate ready.
- [x] Независимое scoped review; commit `feat(dashboard): log verified publication transitions`.

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

- [x] **GREEN:** расширить разрешённые action и добавить раннюю ветку lifecycle после проверки config/точных имён/owner. Собрать полные ID всех трёх собственных контейнеров до первой мутации; затем `docker stop`/`docker start` только этих ID. Не запускать build/install/compose up, не менять Apache/режим/UID/mounts. Для отсутствующей установки start отказывает с указанием install; stop сообщает отсутствие без изменения чужих объектов. При частичном отказе вернуть ненулевой результат и безопасное описание незавершённого действия.
- [x] Добавить CLI regression tests в существующий `containers.test.mjs`: `stop --strict` и `start --cli-button` отказывают до engine/mutations; отсутствующий config также отказывает. Использовать существующий `spawnSync`-подход. Чужую owner-метку проверять на собственной установленной среде: создать временную копию config с неверным ожидаемым owner, выполнить stop/start, подтвердить отказ и неизменность всех контейнеров по inspect до/после; реальные метки/контейнеры не менять. Positive-path подтверждать фактической остановкой всех трёх контейнеров, а не только кодом возврата.
- [x] **Dev master:** оператор подтвердил, что stop/start затронул только три управляемые роли. Во время stop Studio отвечала 200. При старте вернулись те же контейнеры и готовая сборка. Контрольные суммы данных совпали.
- [x] **Release Docker и rootless Podman:** сохранены результаты stop → reboot → start и серверной готовности обоих движков. Для архива из передачи оператора отдельно подтверждены TLS, синтетическая публикация и очистка, на Podman также cron, отсутствие ролей после stop и перезагрузки, ручной start и ротация. Точные архивы и применимость клиентских проверок указаны в runbook.
- [x] **Пределы:** сопоставить существующие behavioral tests снимков, публикации, output, timeout и iframe с фактическими лимитами артефакта. Выполнить bounded burst отчётов и oversized report; inspect подтвердит memory/PID/tmpfs и log options обоих движков. После отказов обычный dashboard работает, прежняя публикация сохранена. Не повторять все нагрузочные тесты M5 и не менять размеры ради PASS.
- [x] Для ротации подтвердить фактическую смену/ограничение log-файлов, не только наличие YAML. Чтобы не ждать заполнения рабочего журнала при ограниченной частоте, допустим одноразовый собственный контейнер того же образа с точно такими же driver/options, без сети и пользовательских mounts: штатный Node пишет конечный synthetic объём больше `3 × 10m`, затем средствами движка проверяются предел и вытеснение старых записей. Сопоставить его настройки с установленными ролями и удалить только эту пробу. Если штатный driver Podman не реализует указанную ротацию, это дефект текущей гарантии: найти минимальную поддерживаемую конфигурацию без постоянного архива, отразить проверку; не выдавать опцию inspect за доказанную ротацию.
- [x] `bash -n`, ShellCheck, deploy tests и scoped review. В runbook дать точные команды Docker/Podman logs и выгрузки для реально принятой конфигурации, предупредить о потере логов при удалении контейнеров. Commit `feat(dashboard): complete operations controls`.

**Done:** оператор получает журнал и управляет только dashboard, выключенное состояние/данные сохраняются; ограничения проверены без новой системы квот.

### Task 4: Независимая безопасность и итоговая приёмка M6

**Files:** runbook/checkpoint M6, актуальные разделы roadmap/isolation и owning AGENTS. Код — только для воспроизведённых дефектов M6 с отдельным RED → GREEN; не превращать этап в общий аудит репозитория.

**Interfaces:** consumes — точный финальный артефакт Tasks 1–3, матрица M5 и существующие доказательства; produces — результат по каждому требованию, ограничения, открытые замечания и финальный SHA. По LAB-1814 применяются независимое чтение кода и конфигурации, принятые доказательства и обычные функциональные сценарии на синтетических данных. Отсутствующее доказательство указать явно.

- [x] На окончательном коде из `packages/dashboard` выполнить:

```sh
bun typecheck
bun run test
bun run check:size
bash -n deploy/containers.sh
bash -n deploy/dev-master.sh
shellcheck deploy/containers.sh deploy/dev-master.sh
```

Проверить coverage web и publisher/builder, сборку, contract/SDK и применимые обычные браузерные сценарии адресно через `node --test` с закреплёнными Node и Chromium. Выбрать безопасные сценарии до запуска имеющихся browser/release suites. После правок только в документах сохранить применимые результаты. Для изменённых owning packages выполнить обязательные package-local checks. Существующие CI jobs сохраняются.

- [x] Сверить SHA-256 установленного архива и серверный отчёт оператора по обоим движкам. Отдельно записать переносимую пересборку и применимые ранее подтверждённые обычные действия клиента, включая оболочку, закрытие пакета и Logout. Ход проверки живой таблицы учитывается в backlog.
- [x] Отдельный агент, не реализовавший изменение, делает security-review всей требуемой цепочки: профиль модели/подтверждение/Host/ACL/publisher/builder/web/sandbox. Дать ему design, diff от принятого M5, матрицу evidence и Review Focus. Замечания должны иметь конкретный риск и проверку; опциональные улучшения не блокируют.
- [x] Независимо сверить sandbox/CSP, обращение с credentials, MessagePort, binding и проверку результата builder по коду, установленной конфигурации и применимым ранее принятым результатам. Активное воспроизведение атак, adversarial fixtures и replay исключены условиями LAB-1814.
- Проверка живой таблицы и отдельная установленная приёмка strict HTTPS перенесены владельцем в [backlog M6](../specs/2026-11-16-dashboard-m6-design.md#backlog-установленной-приёмки). Эксплуатационные результаты и ранее подтверждённые проверки браузера учитываются в границах своих артефактов.
- [x] На dev master оператор подтвердил публикацию автора, чтение отдельным читателем, отказ Loginom на запись и сохранность пакета и сборки. Для release 7.4.2 учтены результаты раздельного входа, проверки видимости пакета и ранее подтверждённые в M5 права. Границы записаны в runbook.
- [x] Подтвердить безопасное событие настоящего browser CSP POST из Task 1 и обычные события переходов публикации. Проверить ограничения и проекцию полей по существующим адресным source-тестам и конфигурации. Записать применённый артефакт, наблюдённое поведение и поля журнала.
- [x] Исправить обязательные дефекты, пройти scoped re-review и затронутую приёмку. Неразрешённый остаточный риск представить владельцу отдельно; агент сам его не принимает. Не спрашивать о повторной проверке уже согласованного исправления.
- [x] Обновить канонические документы: commands/evidence/границы в runbook, checkpoint до 20 строк, roadmap M6 и точные изменившиеся утверждения isolation/AGENTS. Сохранить историю M2/M4/M5. Финальный независимый просмотр проверяет соответствие дизайну и лишние additions; commit `docs(dashboard): accept M6 operations and security` только если приёмка действительно завершена.

**Done:** все обязательные критерии roadmap M6 подтверждены; обязательных непринимаемых владельцем замечаний нет. Отсутствующий стенд/вход или незавершённая проверка остаются явным блокером, а не заменяются исходниковым PASS. Merge/release не выполнять.

## Самопроверка плана и передача

Покрытие дизайна: зависимость M5 — Task 0, web/CSP/ограничения журнала — Task 1, publisher/provenance — Task 2, stop/start/лимиты/оператор — Task 3, независимое защитное ревью, strict и ACL master/release в рамках LAB-1814 — Task 4. State/публикация не дублируются, постоянный архив и общая платформа управления не вводятся.

Самопроверка покрытия дизайна, файлов/callers, внутренних интерфейсов и команд выполнена; относительные ссылки и diff проверены. Это проверка документов по исходникам, не выполнение описанных тестов или установленная приёмка.

Выполнение последовательно: Tasks 1–3 используют общие файлы; делить их между одновременно пишущими агентами не нужно. Независимые ревью и чтение evidence можно выполнять параллельно. Предпочтительный следующий шаг после приёмки M5 — subagent-driven-development с отдельным исполнителем задачи и scoped review; допустим inline executing-plans с теми же checks. Этот план сам по себе не запускает реализацию.
