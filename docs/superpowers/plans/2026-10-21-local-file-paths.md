# Локальные файлы по путям — Implementation Plan #74

> **For agentic workers:** выполнять задачи по очереди с TDD и независимым ревью; шаги отмечать `- [ ]`. Задача 1 может идти параллельно задаче 2, но задача 3 зависит от её результата.

**Goal:** Реализовать согласованное поведение #74.
**Spec:** [Канонический дизайн](../specs/2026-10-21-local-file-paths-design.md). Правила доступа, ошибок, identity, сохранения и размещения кейсов определены там; план их не переопределяет.
**Architecture:** существующие backend tools → private Host admission → runtime upload/open; существующие eval harness и skills-acceptance.
**Tech Stack:** TypeScript/Effect/Bun, pinned Node/Playwright, Python stdlib для oracle; новые runtime dependencies не предполагаются.

## Порядок и оценка

База проверки кода — `72bfb4e45`. Эта ревизия изменяет только дизайн и план; все команды ниже относятся к будущей реализации. Применять owning AGENTS и [TDD](/home/kiselev/.agents/skills/tdd/SKILL.md), не запрашивая заново согласованные решения. Область поведения и ограничения — в [дизайне](../specs/2026-10-21-local-file-paths-design.md#результат-и-границы).

Порядок: **1 ∥ 2 → ранний CLI smoke в конце 2 → 3 → 4 → 5/6 → 7 → 8**. Задача 3 ждёт результат пробы 1; данные не должны ждать всей инфраструктуры evals. Установленный candidate собирается после изменений runtime/guidance/harness, до подготовки эталонов; ранний source smoke использует dev bundle по standalone runbook.

Оценка — ориентир будущего implementation diff от этой редакции, не измерение выполненной работы. Включены код, тесты, corpus, текстовые fixtures и документация; бинарные `.lgp` считаются файлами, без выдуманного числа строк. «Впервые» позволяет не суммировать один файл повторно. Строки — добавления/удаления за этап, как в `git diff --stat`.

| Задача | Затронуто файлов / впервые | Добавлено строк | Удалено строк |
| --- | ---: | ---: | ---: |
| 1. Проба `.lgp`, измерения и report | 1 / 1 | 40 | 0 |
| 2. Авторизация, snapshot, registration, имена, ранний smoke | 13 / 13 | 330 | 95 |
| 3. Private package prepare, проверки и attribution | 22 / 20 | 950 | 160 |
| 4. Инструкции и профильные границы | 7 / 4 | 75 | 60 |
| 5. Paths-mode scenario harness | 7 / 7 | 85 | 30 |
| 6. Existing routing corpus и adapters | 10 / 10 | 200 | 35 |
| 7. Два reference cases и fixtures | 21 / 20, включая 4 бинарных | 360 | 5 |
| 8. Итоговая проверка, reports/checkpoints | 5 / 2 | 60 | 10 |
| **Итого, без двойного счёта файлов** | **около 77, включая 4 бинарных** | **2100** | **395** |

Это около **2495 изменённых текстовых строк**. Прежние +430/−100 для задачи 3 почти целиком уходили на production, не покрывая проверки трёх слоёв. Повторная оценка включает agent (2 файла, +180/−20), Host (4, +190/−15), runtime с tests/support (13, +540/−100), условный резерв timeout/test (2, +20/−5) и существующий attribution manifest (1, +20/−20). В сумме production — +445/−102, tests/support — +485/−38, manifest — +20/−20. Относительно +920/−150 добавлены один runtime-файл и +30/−10 на подтверждённую пробой правку `artifact-upload-conflict.mjs`; её regression входит в уже учтённый `artifact-upload.test.mjs`. Без расширения timeout задача 3 затрагивает 20 файлов / 18 впервые; с резервом — 22 / 20. Это оценка связанного изменения, а не разрешение добавлять новые механизмы.

Копии пяти scripts skill и соседних settings в task temp не входят в git diff; отдельно оценить их адаптацию примерно в **+65/−30 строк**, без изменения установленного skill. Число/размер бинарных fixtures уточнить по фактическим пакетам; повторно использовать исходный пакет там, где возможно.

После каждой задачи сравнивать фактический diff с оценкой, включая тесты/docs. Если число файлов либо сумма добавленных/удалённых строк превысили оценку задачи или общего diff **вдвое**, остановить наращивание соответствующего механизма, проверить более простой путь и представить владельцу фактический объём, причину и варианты с ценой. Для задачи 3 сигнал — более **2220 строк / 44 файлов**, для общего diff — более **4990 строк / 154 файлов**; это сигнал пересмотра, не допустимый плановый расход. Не расширять оценку задним числом, чтобы скрыть превышение.

## Задача 1. Доказать native completion и измерить маршрут `.lgp`

**Files:** читать runtime `client/lib/{executor,workspace,workspace-ui,bridge,storage-policy}.mjs` и `src/call-timeout.mjs`; evidence — [отчёт пробы](../../testing/loginom-ai-agent/local-file-paths.md). На этапе пробы product code не менять.
**Результат:** наблюдаемые predicates, длительности и решение о реализуемости [private маршрута](../specs/2026-10-21-local-file-paths-design.md#подготовка-локального-пакета).

- [x] На выделенном стенде с pinned runtime выбрать проверенный `.lgp`, зафиксировать локальные size/SHA. В одной authenticated session пройти home → upload → native completion/точная file row → open. Модель для технической пробы не нужна.
- [x] Переиспользовать уже возвращаемые `storageEntry.bytes`/`bytes_source: native_file_store` из `workspace-ui.mjs:2959–2981`. Не создавать parser UI-размера. Зафиксировать owner/path/name/type/size, отсутствие download и повторного upload.
- [x] Измерить отдельно binding/«Файлы», upload, ожидание строки, open/geometry и суммарное время. Сопоставить с текущими 105 с runtime, около 120 с Host и минимумом 180 с adapter. Upload имеет внутренний timeout 35 с, open — до 125 с; успех отдельных стадий не означает, что общий вызов дождётся их.
- [x] Повторить при уже подготовленном workspace A: следующим запросом открыть локальный B. Проверить новый `operation_id`, правильную квитанцию B, переход `workspaceReady` и отсутствие изменения чужих workflow. Отдельно проверить conflict `reject` и неудачный/задержанный upload.
- [x] **Точка решения:** если read-only observation не подтверждает completion, остановиться. Представить владельцу две альтернативы: контрольное скачивание через существующую verification либо draft + существующая delivery. Для каждой оценить файлы/строки, дополнительное время/трафик, сохранение проверок и workspace effects. Не продолжать строить новую verification систему и не подменять uncertain на success. В пробе completion подтверждён; альтернативы не понадобились.
- [x] Если completion доказан, записать достаточные predicates и измерения; при риске deadline сформулировать согласованное изменение бюджета для задачи 3. Проба не подтверждает новый API или installed acceptance.

## Задача 2. Общая авторизация, snapshot и `loginom_file_admit`

**Files:** agent `src/util/file-snapshot.ts`, новый `src/tool/loginom-local-file.ts`, `src/tool/package-docs.ts`, `src/session/tools.ts`; tests `test/util/file-snapshot.test.ts`, новый `test/tool/loginom-local-file.test.ts`, `test/tool/package-docs.test.ts`, `test/session/{tools,profile-tools}.test.ts`. Host `src/inputs.ts`, `test/inputs.test.ts`. Минимальные инструкции данных — product `skills/loginom-automation/{SKILL.md,references/workflow.md}`. `adapter.admit` и ранний `[]` Host не менять.

**Interfaces:**

```ts
fileSnapshot(path: string, maxBytes = 10 * 1024 * 1024): Promise<Buffer>
// В существующем Effect стиле, без отдельного service/layer:
authorizeLoginomFile(path: string, ctx: Tool.Context)
// -> { sourcePath: string, canonicalPath: string }
snapshotLoginomFile(path: string, ctx: Tool.Context)
// -> { sourcePath: string, file: InputFile }; использует authorizeLoginomFile.
// InputFile — прежний { name: string, data: string /* base64 */ }.
loginom_file_admit({ path: string })
// -> { source_path: string, artifact: существующий runtime descriptor }
```

- [x] **RED:** добавить только тест явного предела snapshot. `mkdtemp`, `open`, `rm`, `join` и `tmpdir` уже импортированы в существующем тестовом файле; никаких machine-specific путей. Default 10 MiB, binary fidelity, special file и directory уже покрыты, их тест не дублировать:

```ts
test("snapshot accepts the explicit 16 MiB boundary and rejects a larger file", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-file-snapshot-"))
  try {
    const input = join(root, "large.bin")
    const limit = 16 * 1024 * 1024
    const handle = await open(input, "w")
    try {
      await handle.truncate(limit)
      expect((await fileSnapshot(input, limit)).length).toBe(limit)
      await handle.truncate(limit + 1)
      await expect(fileSnapshot(input, limit)).rejects.toThrow("16 MiB")
    } finally {
      await handle.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
```

- [x] Из `packages/agent` запустить `bun test test/util/file-snapshot.test.ts`, увидеть отказ нового поведения. **GREEN:** параметризовать предел/сообщение, сохранив bounded handle/fstat/O_NONBLOCK/final-stat/finally. При локальном запуске TMPDIR можно направить в task temp; переносимый тест использует системный tmpdir.
- [x] Следующий RED цикл: перенести, а не скопировать, авторизацию original user attachments из `package-docs.ts` в общий helper. Тесты проверяют attached внешний `.lgp` без ask в неинтерактивном CLI и отказ при explicit deny; дополнительно invisible/reverted/replay part, query/fragment и несовпадающий realpath не дают разрешения. Сохранить исходные tests с `--file` hint без изменения ожиданий.
- [x] **GREEN:** реализовать [каноническую авторизацию](../specs/2026-10-21-local-file-paths-design.md#общая-авторизация-локального-пути), подключить `package_docs_run` к ней; snapshot читать по `canonicalPath`. Precheck deny должен предшествовать attachment/allow-always и сохранять typed marker. Общее `Permission.ask` и обычный Read не переписывать.
- [x] Следующий RED цикл проверяет ветки [канонического правила ошибок](../specs/2026-10-21-local-file-paths-design.md#ошибки): причина/полный путь во всех случаях; hint присутствует при отклонённом ask и автоотказе неинтерактивного CLI, отсутствует для missing path, directory, OS EACCES и configured deny. Проверить отказ разрешения самого инструмента до вызова helper, а также запросы доступа к пути. Отдельный случай: requested path запрещён настройками и недоступен ОС — сохраняется policy deny. Проверить также отсутствие admission. Дополнить существующие сообщения причиной/путём, сохранить `--file` assertions для permission rejection и не ослаблять exit/permissionDenied assertions.
- [x] Следующий RED цикл: один binary source, два разных файла с одним basename, ошибка второго, новый вызов после изменения файла. Отдельно одинаковый `callID` в **двух сообщениях ассистента** не конфликтует. **GREEN:** backend source identity и вызов существующего adapter:

```ts
const admissionID = JSON.stringify(["local-file", ctx.messageID, ctx.callID])
const source = yield* snapshotLoginomFile(args.path, ctx)
// В async boundary существующего resolver:
const descriptors = await loginom.admit(admissionID, [source.file])
```

Tool внедряется только в automation с уже подготовленным runtime, применяет обычные hooks/permissions/error serialization. Не тестировать двойное исполнение одного tool call и не менять Host caching. Обычный `.lgp` admission остаётся запрещён.

- [x] Следующий RED в `inputs.test.ts`: имена `Скидка 10%.csv`, `План #2.lgp`, `a:b?.xlsx` сохраняют расширение/bytes и дают допустимые copy names; покрыть controls/конечную точку или пробел. **GREEN:** нормализовать в единственной точке `inputs.ts` по [дизайну](../specs/2026-10-21-local-file-paths-design.md#регистрация-identity-и-имя-копии); согласовать ранний controls check в этом же файле. Не добавлять sanitizers в runtime/import/open.
- [x] Внести только необходимые инструкции для файлов данных: prepare → регистрация каждого пути → доставка descriptors → импорт подтверждённых destinations; повторная подготовка требует новой регистрации. Завершить TDD циклы, выполнить связанные agent/host tests и package typecheck. Host tests используют pinned `LOGINOM_AI_AGENT_TEST_NODE`; не трогать ранний `[]` ради ответа descriptor.
- [x] **Сразу ранний главный путь:** по [standalone runbook](../../testing/loginom-ai-agent/standalone-cli.md) выполнить один CLI сценарий с `run --auto` и двумя внешними CSV в каталогах с пробелами/кириллицей. Без автоодобрения неинтерактивный run отклонит запрос разрешения (`run.ts:871–890`); вместо `--auto` допустимо заранее разрешить только каталог этих CSV. Проверить обе регистрации, upload/import и независимый результат; отдельно missing path и текст ошибки по дизайну. Сохранить точный argv или применённое правило доступа вместе с evidence. Dev bundle допустим. Сохранить source SHA, bytes/results/ошибку/cleanup в report, явно обозначить **source smoke**, а не installed acceptance. Не откладывать до задач 5–8.

## Задача 3. Private local package prepare

**Files:** agent `src/session/tools.ts`, `test/session/profile-tools.test.ts` (реальные Session/permissions; `tools.test.ts` остаётся regression); host `src/{adapter,host-port}.ts`, `test/{host-port,task-scope,managed-work-entry}.test.ts`; runtime `src/managed-entry.mjs`, `client/lib/{bridge,workspace,workspace-ui,artifact-discovery,artifact-delivery,executor,artifact-upload-conflict}.mjs`; связанные tests в `client/test/` и support fixture; существующий `docs/migration/source-transforms.json` для hashes/reasons изменённых runtime файлов. `storage-policy` проверяется без изменений; общие call timeouts сохранены.
**Depends:** successful probe 1 и helper 2. **Produces:** backend local path → private package bytes → artifact/grant → confirmed upload/open.

```ts
// Последний optional аргумент private adapter.call:
packageInput?: { admissionID: string; file: InputFile }
// Private host -> managed-entry, вне публичных MCP arguments:
packageArtifact?: { artifactID: string; uploadGrantID: string }
// Private метод результата createBridge, общая prepare-ветка с публичным вызовом:
prepareLocalPackage(args, { artifactID, uploadGrantID }, { signal })
```

- [x] **RED → GREEN:** backend prepare schema/validation согласно дизайну. После hook вызвать общий snapshot helper, убрать local OS path из forwarded args, передать `packageInput`. Тесты attached external package/no ask/explicit deny идут через этот реальный вход, а не только helper. Runtime MCP schema local path не получает.
- [x] Следующий цикл: Host отказывает wrong scope/method/intent/format/двум источникам до startup/inputs; допустимый package source проходит существующие `service.inputs` и runtime admission, private call получает ровно один artifact/grant pair. Ordinary `.lgp` attachment deny не ослабляется. Повтор по той же identity не добавлять как требование.
- [x] Следующий цикл: bridge reuse prepare-function и реальный binding до workspace; upload finish использует predicates пробы 1 и existing FileStore size. Тесты missing/wrong row, owner/conflict/unknown/cancel и обязательного journal/cleanup не разрешают success/open. Не смешивать вспомогательный report failure с утратой уже проверенного результата.
- [x] По наблюдениям пробы: существующее open требует home/graph, а после upload активны Files; обеспечить проверенный переход к допустимой поверхности до open. В общей границе `executor`/`artifact-upload-conflict` выбирать точный наблюдённый `msgbox[-N]`, сохраняя guards; покрыть regression в existing artifact-upload tests. Нового navigation/conflict framework не делать.
- [x] Отдельный тест: workspace A уже готов, следующий запрос открывает B с новым `operation_id`; старое READY/receipt не подходит, foreign-workflow checks сохраняются. Новый READY появляется только после фактического B. Private source нельзя подделать публичным MCP input.
- [x] Отдельный тест: upload succeeded, open failed → error + `next_step` на существующий `dock_prepare` с `package_path` из receipt и исходным `operation_id`. Проверить через настоящий `prepareWorkspaceSession`: server-path продолжение сверяет исходную квитанцию без upload; повтор открытия разрешён только при доказанном отсутствии эффекта, неизвестный исход остаётся reconciliation; новый **local-path** вызов заново читает/загружает. Не заводить retry state. Unknown upload не возвращает подсказку открыть неподтверждённый путь.
- [x] По измерениям задачи 1 проверить весь маршрут в едином deadline. Если текущего бюджета недостаточно, согласованно расширить runtime/MCP call timeout, Host IPC и adapter/outer ожидания; покрыть границы и cancel/cleanup тестом. Только увеличение adapter недопустимо. Проверить absence `LOGINOM_CALL_UNCERTAIN` из-за рассогласования тайм-аутов.
- [x] Выполнить названные runtime tests pinned Node из `packages/loginom-runtime/client`, связанные agent/host tests и package typechecks. Обычная data delivery должна по-прежнему требовать server-copy verification. Проверить необходимые runtime attribution transforms по owning AGENTS, не менять immutable source-map.

## Задача 4. Skill instructions и профильные границы

**Files:** product `skills/loginom-automation/{SKILL.md,references/workflow.md}`, `skills/package-docs/SKILL.md`; agent `src/session/prompt.ts`, `test/session/profile-tools.test.ts`; owning `packages/{agent,loginom-host}/AGENTS.md`.
**Результат:** инструкции отражают [выбор и сохранение](../specs/2026-10-21-local-file-paths-design.md#skill-выбор-задачи-и-сохранение), без нового алгоритма маршрутизации.

- [x] Дополнить automation-инструкции выбором local package, сохранением собственной загруженной copy по умолчанию, ограниченным `replace` и сообщением server path/local unchanged; явный output path следует прежним правилам. Сохранить действующее отсутствие автоматического скачивания для docs. Код сохранения не добавлять.
- [x] Объяснить, что прежние artifact IDs после повторной подготовки runtime не действуют и файлы надо регистрировать заново. Для docs использовать общий authorization helper из задачи 2; не возвращать attachment-only ограничение для разрешённых путей.
- [x] В instructions/errors **дополнить** отказ причиной/путём по [правилу ошибок дизайна](../specs/2026-10-21-local-file-paths-design.md#ошибки). Existing unit/CLI assertions с `--file` для permission rejection и corpus expectation не менять. Исправить только устаревшие attachment-only формулировки owning AGENTS.
- [x] TDD для меняемого bootstrap/profile поведения: actual invocation registration/prepare запрещена в docs/default, custom origin не подменяет builtin, новый настоящий user turn начинает default. Наличие tool в catalog само по себе не доказательство исполнения. Выполнить связанный profile/package-docs regression, включая текущий CLI permission test.

## Задача 5. Paths-mode внутри attempt workspace

**Files:** `evals/src/{task,run}.ts`, `evals/test/{task,run}.test.ts`; existing `evals/src/rejudge.ts` и `evals/test/rejudge.test.ts` сохраняют детерминированный отказ при judge-only. `evals/{README,AGENTS}.md`, amendment inputs в `docs/superpowers/specs/2026-09-18-evals-design.md` со ссылкой на канонический дизайн #74. `cli.ts`, `profile.ts`, `sandbox.ts` для этой функции не менять.
**Interface:** `task.json: input_mode?: "attachment" | "paths"`; runtime Task хранит paths marker только для нового режима. Полный контракт — [раздел evals](../specs/2026-10-21-local-file-paths-design.md#только-два-сценарных-eval-в-evals).

- [x] **RED:** copy existing task fixture с `left/sales.csv`/`right/sales.csv`: paths-mode принимает оба, прежний attachment case отклоняет collision. Одинаковый полный путь и выход за case/attempt directory отклоняются. Затем реализовать loader branch, не меняя старый default/hash.
- [x] Следующий цикл: staging помещает inputs по relative paths внутри workdir попытки, `{{INPUT_ROOT}}` указывает туда; `runAgent` получает `files: []`. Assert prompt содержит оба разных пути, argv/user parts не содержат attachments. Existing CLI уже не добавляет `--file` для пустого массива — новая API option не нужна.
- [x] Следующий цикл: hash режима/relative names/bytes стабилен между случайными attempt roots, изменение любого input между началом и концом попытки даёт явный failed check. Реализовать before/after hashes и сохранить evidence; existing rejudge сохраняет failed inputs-unchanged вместо повторного судейства (риск подтверждён независимым ревью). Не обещать read-only inputs и не монтировать corpus/parent attempts.
- [x] Уточнить правило basename в `evals/AGENTS.md` и контракте: запрет остаётся у attachment mode. Не добавлять per-attempt scoped permissions или новый bubblewrap test: внешний путь здесь не проверяется.
- [x] Из `evals` выполнить `bun test test/task.test.ts test/run.test.ts test/cli.test.ts test/rejudge.test.ts` и `bun typecheck`. Existing sandbox guards остаются прежними. Не экспортировать `prepareProfile` и не создавать reference API.

## Задача 6. Existing routing corpus и Desktop/CLI пути

**Files:** `packages/agent/test/cli/package-docs-routing/{cases.json,fixtures/}`; `packages/loginom-host/script/skills-acceptance.ts`, `skills-acceptance/{run,desktop,turns,scenario,scenario-import,receipts}.mjs`, небольшой общий `skills-acceptance/corpus.ts` для actual schema decode в runner/tests (обоснован независимым ревью); существующие `test/{skills-acceptance,skills-acceptance-turns}.test.ts`. Если несколько проверок помещаются в уже используемый общий модуль, новый файл не создавать.

| Case ID | Подготовленный prompt и вход | Проверяемый результат |
| --- | --- | --- |
| `docs-local-path` (existing) | Прежний workspace `.lgp` prompt | Прежний PDF/docs результат |
| `docs-external-unicode-path` (existing) | Прежний `external-text-path` `.lgp` | Desktop разрешает доступ; CLI сохраняет refusal-with-file-hint |
| `scenario-create-path` (new) | «Построй сценарий: используй CSV `{{external_csv}}`, сгруппируй по Category и просуммируй amount. Сохрани пакет в `{{server_package}}`» | На Desktop и CLI: registration → delivery → import; Alpha=35/Beta=20 из существующего CSV |
| `text-read` (new) | «Прочитай `{{external_text}}` и ответь только значением поля контрольная_строка» | completed Read, default profile, ответ ровно `PATH-74-АБВ-37` |
| `edit-after-docs` (new) | `external-text-path`, case `fixture: "edit_lgp"` из задачи 7. Ход 1: Markdown-документация `{{unicode_lgp}}`. Ход 2: исправить amount_double на amount*3 в том же local package; сохранить остальные узлы/связи, выполнить, сохранить как `{{server_package}}` | docs → automation, та же Session, исходный SHA edit-фикстуры задачи 7, изменение amount*2 → amount*3 |
| `docs-after-edit` (new) | Case `fixture: "edit_lgp"` из задачи 7. Ход 1: `external-text-path`, такое же исправление `{{unicode_lgp}}` и Save As `{{server_package}}`. Ход 2: `created-lgp-path`, документация изменённой копии `{{created_lgp}}` внутри каталога сессии | automation → docs, исходный SHA edit-фикстуры задачи 7, actual изменённая local copy, факт `amount*3` |

- [x] **RED → GREEN:** добавить новые ID/ветки `acceptanceTurns`; старые `scenario-after-docs`, `docs-after-build`/`scenario-then-docs` и их input defaults оставить буквально прежними. Новый CSV case пометить scenario, переиспользовать существующие sales expectations. `lgp-docs` не добавлять: существующие cases уже покрывают маршрут.
- [x] Для `external-text-path` добавить optional case field `fixture` в schema `skills-acceptance.ts`, сохранить ключ при построении setup/turns и в обоих adapters выбирать `input.fixtures[testcase.fixture ?? "lgp"]`. Сейчас `run.mjs:102–103` и `desktop.mjs:54–55` копируют фиксированный `fixtures.lgp`. RED-проверки: оба новых перехода выбирают `edit_lgp`, отсутствие ключа сохраняет прежние bytes `lgp`; выбранный ключ не теряется при schema decode и разворачивании setup/turns. `nested.lgp` и старые cases не менять. Добавить только необходимые `csv-path` и `created-lgp-path`; TXT требует текстового fixture и собственного binding/выбора originalPath. Если нужен `text-path`, его причина — старые handlers копируют именно `.lgp`; не делать общий новый input framework.
- [x] В adapters/allowlist поддержать text-only submission, правильный source hash для CSV/TXT/выбранного `.lgp`. Сценарные CLI turns уже получают `--auto` по `turn.scenario` (`run.mjs:120,147`), отдельные permission rules для них не добавлять. Scoped-разрешение в acceptance profile нужно только `text-read` и docs-ходу `edit-after-docs`; разрешить только их input path/catalog. Проверить argv/правила каждого хода, включая сценарный edit после docs. Для `docs-after-edit` bridge выдаёт изменённую copy внутрь session workspace по `{{created_lgp}}`, без нового разрешения внешнего каталога. Desktop использует существующее одобрение запроса. Старый `docs-external-unicode-path` CLI отказ не менять; docs-first ходу не давать global auto-allow.
- [x] Проверить новую CSV ветку на фактических `loginom_file_admit` и `dock_artifact_deliver`, link delivered destination → import и результате. Existing verifier, ожидающий CSV только в prepare attachment artifacts, адаптировать отдельной веткой для path case; старую attachment проверку не ослаблять. Verifier покрыт unit tests; живой Desktop/CLI gate — в задаче 8.
- [x] Для local edit проверять исходный package SHA/prepare, сохранённые source node IDs/links и изменённый результат. Не хешировать CSV для всех scenario cases. Итоговый Save в переходах проверяется по заданному `server_package`, поэтому прежний bridge получения modified package подходит; не менять его на произвольный guessed path.
- [x] Для docs-after-edit проверить actual emitted Markdown и 1–3 заранее известных факта из fixture, например нормализованное `amount*3`; не строить parser таблиц/`expected.json`/model judge. Для Read сверить точный ответ. Маленькие positive/negative evidence fixtures должны ловить wrong profile, source, формулу и отсутствие output. Оставить проверки в существующем общем модуле, используемом обоими adapters.
- [x] Выполнить host acceptance/turns и scenario verifier unit tests, `bun typecheck`; existing corpus root/default repeat сохранены, нового `--corpus` нет.
- [x] Подтверждённый автономный source `edit_lgp` зарегистрирован в existing fixture map: SHA4313b47f…/9873bytes, provenance CLI/cold20,40,50; реальный map/hash и staging обоих переходов проверены RED→GREEN18/81, typecheck PASS. Live transitions остаются задачей8.

## Задача 7. Два scenario references по loginom-eval-case

**Skill:** [loginom-eval-case](/home/kiselev/git/agent-validation/.agents/skills/loginom-eval-case/SKILL.md), его case-contract/environment/verification. **Files:** `evals/tasks/local-path-scenarios/{csv-two-paths,local-lgp-edit}/`, README набора; fixtures/README существующего routing corpus. Незавершённые cases держать в task draft вне принятой коллекции.

| ID | Prompt | Независимый oracle |
| --- | --- | --- |
| `csv-two-paths` | «Объедини продажи из `{{INPUT_ROOT}}/data/Первый #1/sales.csv` и `{{INPUT_ROOT}}/data/Второй %2/sales.csv`. Посчитай сумму amount по Category. Выгрузи CSV с запятой, колонками Category, amount, по возрастанию Category» | Первый CSV: Alpha10/Beta20; второй: Alpha7/Gamma5. Результат Alpha17/Beta20/Gamma5 |
| `local-lgp-edit` | «В `{{INPUT_ROOT}}/data/Пакет #1/sales.lgp` исправь amount_double: amount*3 вместо amount*2. Сохрани остальные узлы/связи, выполни сценарий. Выгрузи CSV с запятой, колонками Category, amount, amount_double, в исходном порядке строк» | Автономный source package: Alpha10/Beta20/Alpha25 и calculator amount*2. После изменения: 30/60/75, исходные node IDs/links сохранены |

Existing scenario prompt tail задаёт output paths; prompts не принуждают выбор skill/tool. References настоящие, docs reference-пакетом не подменяется.

- [x] После code changes собрать clean installed CLI/Desktop candidate с pinned resources по runbooks, зафиксировать source/manifest/skills digests. Candidate должен существовать до CLI-построения references. Не подменять его текущим произвольным бинарником; generated cases не требуют автоматического коммита skill.
- [x] Прочитать актуальную skill config. В private task-local env указать текущий AGENT_REPO, проверенный CLI, WORK_ROOT/PROFILE под `/home/kiselev/storage/tmp/`, модель/variant из config и выделенный стенд; использовать `LOGINOM_EVAL_CASE_ENV`. Общий env/установленный skill не менять, секреты не выводить.
- [x] Скопировать в task temp `run_attempt.sh`, `prepare_attempt.ts` и нужные соседние `settings.py/settings.ts`; сохранить их relative dependencies и layout evidence. В копии prepare сохранять relative paths внутри attempt workdir, подставлять root, писать пустой `files.txt`. Shell уже использует пустой files array без `--file` (`:62–65`), поэтому новый launcher не нужен.
- [x] Task-local `collect_artifacts.py`: заменить basename-only matching уникальным relative source → admitted descriptor/destination → SHA соответствием; copies evidence различать по relative path/identity, не `storage-input-sales.csv` для обоих. Для `.lgp` как входного пакета проверять prepare/admission source SHA и snapshot, а не искать его как импортируемый `FileName` в результирующем Unit.xml. Это сохраняет смысл проверки исходных bytes, не вводит product control download.
- [x] Task-local `validate_collection.ts`: duplicate basename допускается только в paths-mode; остальные checks остаются. Дополнительно поправить task-local `finalize_case.py:43`: нынешний `data.glob("*")` с basename keys не работает с вложенными каталогами. Hash manifest строить по файлам `task.inputs` с relative keys, не пропуская второе `sales.csv`. Раскладка events/exit/artifacts/DB остаётся прежней для остальных scripts. Не добавлять adapter вокруг `runAttempt`, экспорт `prepareProfile` или фиктивный Task/reference.
- [x] Подготовлены входы, ожидаемые результаты и Python-stdlib oracle: CSV17/20/5, local edit30/60/75. Для бинарного input oracle сначала проверяет SHA подтверждённого source, затем независимо вычисляет *3 для известных исходных строк; JS parser не нужен. Явные CSV columns/order/separator сохранены в task.json/checklist. Local edit остаётся draft вне принятой коллекции до reference/cold evidence.
- [x] Подготовить автономный source по [решению дизайна](../specs/2026-10-21-local-file-paths-design.md#только-два-сценарных-eval-в-evals): UI declared-schema seed, настоящий candidate CLI amount*2, physical graph/code/GUID/link checks, oracle20/40/50 и независимый cold rerun PASS. Подтверждённые bytes зарегистрированы как `fixtures.edit_lgp` и подготовлены в draft input `local-lgp-edit`; SHA совпадает. Проверка фактических копий в живых CLI/Desktop transitions остаётся задачей8.
- [x] По skill выполнить smoke/model confirmation, построение reference каждого case (максимум три попытки, правила hint/infra failure прежние), graph/result checks и cold rerun. Подтвердить model/variant по БД, не только argv. Провести описанные task-local adaptations с минимальными проверками прежде, чем доверять собранному provenance; basename collision не обходить переименованием данных.
- [x] Только после complete evidence/validation перенести accepted cases в `evals/tasks/local-path-scenarios`, записать actual reference/provenance/hashes/README. Подготовить новые routing fixtures/prompts без второго corpus.
- [x] После предупреждения о стоимости выполнить обычную calibration только двух согласованных scenario IDs:

```bash
JUDGE_MODEL=gpt-6-sol JUDGE_REASONING=xhigh bun --no-env-file run src/run.ts --calibrate --tasks tasks/local-path-scenarios --only csv-two-paths,local-lgp-edit
```

Запуск из `evals`; для этой машины заранее заданы private `EVAL_SLOTS_FILE` и исправленный VPN `EVAL_JUDGE_COMMAND` по [runbook](../../testing/loginom-ai-agent/parallel-evals.md), чтобы штатный offline judge использовал lease/private home/named systemd. References дают foreign negative друг другу. Калибровка26.10:100/0 и100/0, оба positive oracle true, пороги90/40, warnings0/exit0/released lease; задача7 завершена. Первые version/auth отказы сохранены отдельно, без вердиктов модели. Не добавлять near-miss corpus, живой benchmark repeat или автоматический commit cases в workflow skill. Reference authoring scripts не являются доказательством sandbox benchmark; эту проверку выполняет задача 8.

## Задача 8. Проверка candidate и завершение

**Files:** existing runbooks и reports; `docs/testing/loginom-ai-agent/local-file-paths.md`, README коллекции/corpus, checkpoints этих дизайна и плана.
**Критерии:** результаты раздела [проверок дизайна](../specs/2026-10-21-local-file-paths-design.md#проверки-и-размещение-кейсов), без новых acceptance требований.

- [x] Переиспользовать candidate задачи 7, если relevant code не менялся; иначе собрать новый и повторить только затронутые проверки. Выполнить mandatory package tests/typechecks, resource/attribution checks. В отчёте отделить source smoke задачи 2, reference authoring и installed acceptance.
- [x] Один live scenario проход двух IDs через штатный isolated harness. Проверить installed EVAL_CLI_BIN, dedicated endpoint, модель/variant, private profiles/results; из `evals`:

```bash
env -u EVAL_SLOTS_FILE EVAL_REPEAT=1 bun --no-env-file run src/run.ts --tasks tasks/local-path-scenarios --only csv-two-paths,local-lgp-edit --repeat 1 --skip-judge
bun --no-env-file run src/run.ts --judge-only "$LOCAL_PATHS_RUN_ID"
```

Перед обеими командами задать private `EVAL_SLOTS_FILE` и VPN `EVAL_JUDGE_COMMAND` по runbook задачи7; первая команда исключает slots только из своего env. Для второй `LOCAL_PATHS_RUN_ID` — ID того же завершённого прогона, `EVAL_RESULTS_DIR` прежний. Штатный `--judge-only` оценивает сохранённые артефакты через offline judge lease/private home/named systemd без повторного агента; исходный execution status сохраняется. Проверять actual score/oracle и cleanup, а не один exit0 судьи. Новые parallel users/config API не нужны.

- [ ] Existing `skills-acceptance` запустить на **CLI и Desktop** с явными `--repeat 1` и `--cases docs-local-path,docs-external-unicode-path,scenario-create-path,text-read,edit-after-docs,docs-after-edit`. Остальные аргументы artifact/output/model/variant/installed CLI image брать из проверенного candidate/runbook. Никакого `--corpus` или специального default. CSV-path case обязан пройти в обоих интерфейсах, а не только в scenario benchmark.
- [ ] Проверить actual outputs, activations, source hashes, absence attachments, две transition Session IDs, факт изменения и документ после изменения. Сохранить различающиеся outcomes существующего external docs case. Harness выдаёт modified copy во второй user prompt; продукт не начинает автоматически скачивать серверные пакеты ради docs.
- [x] Отдельным целевым CLI prompt на candidate проверить сохранение local `.lgp` **без output path**: Save в собственную upload copy с допустимым replace, полный server path в ответе, явное «локальный файл не изменён» и прежний local SHA. Это проверка skill-поведения, не новый runner/механизм Save; explicit output path уже покрыт переходами. Использовать сохранённое валидное evidence этой проверки, если оно уже получено.
- [x] Доступность Windows проверена: только Linux, native filesystem acceptance **NOT_RUN**. Условие продолжения и запланированные абсолютные пути с пробелом/кириллицей и несколько источников записаны в отчёте; Linux string tests не подменяют native приёмку.
- [ ] Подтвердить runtime/process/storage cleanup; сохранить evidence без секретов. Неполадку вспомогательного отчёта указывать отдельно от проверенного результата; обязательные ownership/journal/cleanup отказы не игнорировать. Обновить checkpoint каждого документа в пределах 20 строк.
- [x] Лишние добавления удалены; текущий diff сравнен с исходной оценкой, `git diff --check` прошёл. Итоговое независимое ревью новым агентом без истории: Approved, обязательных замечаний нет. Это проверка выполненной части, полный task8 остаётся открыт. Слияние и release требуют отдельного поручения.

## Planning checkpoint

- 2026-10-26: задачи1–7/B1–B4 закрыты; historical benchmark9f723 score100/100/oracle2/2/execution1/2, cleanup PASS. Clean93f52 DesktopCSV PASS, CLI2 transitions FAIL/SAVE_RECEIPT_MISSING/noACK/guards. B5 sourceRED Approved: лишнийExportCSV; minimal nativeworkflow breadcrumb fix3files/+65/−13 independently Approved, executor55+siblings80/attribution2 PASS. ONE sourceGREEN32803 Save2933ms/continuation доСценарий/ordinary nativeClose+logout/ACK0/sourceSHA прежний; physical10038/SHA2065d4…/graph+JS+CSV30/60/75 PASS, ownstand архивирован/остановлен. Новый clean candidate, четыре routing transitions и два затронутых official benchmark впереди; старые результаты не объявляются current-source coverage. Task8 открыт; поведение каноническое в дизайне.
- Оценки/сигналы не повышены. Task3:25files/+1219/−150 против сигнала44/2220; native IPC A→B6867/6338мс, SHA/graph/ACK/exit0 подтверждены.
- Source checks: task4 agent179pass/1existing skip/969assertions, Host17/110; task5 93/503 плюс final27/234; task6 51/207. Typecheck/reviews Approved.
- Task6 сигнал470 строк сработал на472: пересмотр Approved minimal wiring; итог20files/+449/−107, baseline сохранён. Старые20cases/fixtures/turn branches/default repeat неизменны.
- Task7 candidate bbd2e1af7d: dev CLI private install/manifest/archive и Desktop DEB/AppImage static PASS. Pins Bun1.3.14/Node24.19.0/Chromium1246; digests в task7/candidate-digests.json.
- Штатный models --refresh; configured openai/gpt-6.1-sol/xhigh подтверждён DB. Task-local paths/provenance/hash scripts проверены RED→GREEN/review; installed skill не менялся.
- Оба reference приняты: CSV attempt1/nohint570с/sourcebbd2e1af7d и local edit attempt1/nohint300,6с/source9f723, actual DB6.1-sol/xhigh. Для edit: source9873/SHA4313…/JS/GUID/links прежние, formula*3, CLI/cold CSV30/60/75, MCP4inactive→green/CloseNoSave/logout, nativeACK0/no writer. CLI1/handledbinaryRead честно сохранён, артефакты валидны. Fresh case review Approved, validator2cases/hash PASS, runtime архивирован/prune0; pair calibration100/0+100/0/оба oracle/warnings0/exit0, judge6-sol/xhigh/0.157.0, lease51 released; Task7 завершена.
- До B1: Task7 partial15files/около+295/−6, ниже42files/730 строк; итог B1 отдельно в отчёте. Автономная source/edit fixture принята (B1 закрыт); local-lgp-edit reference теперь принят; оба live edit transitions впереди; pair calibration PASS; B2 восстановлен offline с архивированием исходного guard.
- 2026-10-26: B1 закрыт после поручения продолжать без подтверждений и прежнего source-лимита. UI declared-schema+оба Calc mapping прошли cold до Execute; prod9cb57e9cd9, DB6.1-sol/xhigh, assisted attempt4/583с, amount*2/CSV20,40,50/independent cold PASS. Source SHA4313b47f…/9873bytes сохранён в edit_lgp и draft input; исходные GUID/link/code прежние. ACK/exit0/no writer, UI CloseNoSave; own stand остановлен с данными. Evidence: /home/kiselev/storage/tmp/local-paths-74-ptufs123/b1-close-20261026; старые guards/B3/B4 сохранены.
- B2 закрыт offline-восстановлением exact task7/profile: полный backup, подтверждённый idle и atomic archive guard, STRICT_RECOVERY=1, public status/check exit0/no writer,8 validation/knowledge ACK/exit0, DB/auth сохранены. Исторический failed ACK прежний; own stand остановлен, replay/model/product changes отсутствуют. Evidence b2-recovery-20261026; детали в blockers.
- Task8 verifier/env ошибки исправлены RED→GREEN, review Approved; Host43tests/192assertions и typecheck PASS. Текущий diff8files/+75/−29 ниже исходного сигнала10files/140 строк. Исходные FAIL сохранены; dev WebSocket PDF/API400 не переносится на prod, skill/provider не менялись.
- Clean prod CLI9cb57e9cd9 и native Desktopbbd2e1af7d: selected4/4+4/4 PASS, repeat1, frozen6.1-sol/xhigh; все PDF страницы/факты, GUI permissions, CSV35/20/physical graph, точный TXT, source SHA/process cleanup проверены. Это не весь task8.
- B4 закрыт26.10: UTF8 image+exact native overflow guard3files/+102/−11; TDD395+222/2 attribution/3 typecheck/reviews PASS. Clean CLI/Desktop9f723 build/manifest/archive/static/crash logging PASS. Installed CLI/DB6.1-sol/xhigh220,81с: prepare14653мс, natural Save ownD/replace, physical Unit.xml only*2→*3, final fullpath/localunchanged, nativeClose/logout/ACK0/no guard/processes0; fresh independent review Approved. Own stand32794 использован Task7/newprofile и остановлен со snapshots. [Evidence](../../testing/loginom-ai-agent/local-file-paths-blockers.md#b4-приватная-загрузка-перед-default-save-диагностика).
- B3 закрыт: exact alias во всех сетях, API/slot/остальные guards прежние; real-Docker RED→GREEN/disconnect, isolated-storage9/35/typecheck PASS. Own Studio NetworkID/DNS/IP/proxy/wsproxy и installed prod9cb browser check подтверждены; полный source preflight/bubblewrap PASS без model/judge.5 ACK/exit0/no guard, own stand остановлен с данными,68 прежних контейнеров неизменны. Evidence b3-private-network-20261026; [история](../../testing/loginom-ai-agent/local-file-paths-blockers.md#b3-isolated-harness-требует-имя-общей-docker-сети).
- Windows native NOT_RUN: среды нет, условие продолжения в отчёте. Общий attribution verifier имеет прежний README hash mismatch;13 затронутых entries подтверждены, release gate не объявлялся PASS.
- Own failed-source и routing server/Studio остановлены с сохранением state/storage; B2 profile восстановлен offline; stopped default-save и другие failed B1 profiles/guards остаются в карантине. Общие приложения/профили/сервисы не менялись.
- Archive hook: core.bare восстановлен false; task7/clean-git-hooks очищает local Git vars и вызывает исходный Husky/scanner без skip, review Approved. Проверять commit tree/bare=false, tracked hook/scanner не менять.
- Final independent review выполненной части без истории: Approved, обязательных замечаний нет; raw receipts/physical LGP/PDF/candidate hashes проверены. Private evidence: /home/kiselev/storage/tmp/local-paths-74-ptufs123/; отчёт docs/testing/loginom-ai-agent/local-file-paths.md. CLI CSV-path PASS, edit-after-docs PASS с Save recovery; исходный docs-after-edit semantic-incomplete сохранён. CLI93f52 edit transitions FAIL, DesktopCSV PASS; B5 minimal fix/TDD/sourceGREEN перед newcandidate/затронутыми повторами и финальным review; Task7/benchmark завершены; merge/release не разрешены.
