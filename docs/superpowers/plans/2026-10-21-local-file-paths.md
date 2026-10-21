# Локальные файлы по путям — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выполнить #74: Desktop и standalone CLI используют несколько локальных файлов из prompt без обязательных вложений; локальный `.lgp` обрабатывается по намерению пользователя.

**Architecture:** Backend проверяет пути и снимает ограниченный бинарный snapshot; host/runtime переиспользуют существующие admission, artifact store и upload. Для локального пакета backend расширяет prepare, а private runtime route загружает и открывает пакет без контрольного скачивания. Проверки переиспользуют eval harness и real-model skills-acceptance.

**Tech Stack:** TypeScript, Effect, Bun; существующий Node/Playwright runtime; Python stdlib для независимых oracle. Новые runtime dependencies не нужны.

**Spec:** [Согласованный дизайн](../specs/2026-10-21-local-file-paths-design.md). Это каноническое описание поведения; данный файл задаёт последовательность выполнения.

## Global Constraints

- Лимит новой загрузки — **16 MiB на файл**; прежний default attachment snapshot — **10 MiB**.
- Один вызов регистрации принимает один файл. Несколько путей в одном prompt обрабатываются отдельными вызовами. Одинаковые basename в разных каталогах допустимы.
- Относительный путь разрешается от каталога текущей сессии; абсолютный — нативными средствами текущей ОС. Не применять URL decode и shell expansion.
- Локальный `.lgp` для изменения — `loginom-automation`; документация — `package-docs`, без новой browser/upload операции.
- Новый маршрут локального `.lgp` не делает контрольного скачивания и не заявляет независимый SHA серверной копии.
- Automatic `.lgp` attachment exclusion, explicit deny, cancellation/recovery, обычная data-delivery verification и старые attachments сохраняются.
- Настоящие model cases и fixtures — в `evals/`; нет нового launcher, универсального judge, classifier/router или постоянного файлового registry.
- Временные файлы, attempts и profiles — `/home/kiselev/storage/tmp/`; не менять `HOME`/`CODEX_HOME` и не выводить секреты.
- Реализация — TDD по `/home/kiselev/.agents/skills/tdd/SKILL.md`: один RED → минимум GREEN → REFACTOR, затем следующий риск. Документация не требует TDD.
- Тесты и `bun typecheck` запускать из owning package; runtime — pinned Node из candidate resources. Не запускать тесты из repo root и `tsc` напрямую.
- База `loginom@72bfb4e45`; текущая planning-ветка `local-file-paths`. Не менять чужой checkout. Public Protocol/HTTP API не расширяется; generated SDK не редактируется.

## Карта изменений

| Область | Файлы и ответственность |
| --- | --- |
| Snapshot/policy | `packages/agent/src/util/file-snapshot.ts`; новый `src/tool/loginom-local-file.ts` — разрешённый локальный источник для двух backend-входов |
| Model-facing tools | `packages/agent/src/session/tools.ts` — `loginom_file_admit`, schema и interception `loginom_dock_prepare`; `src/tool/package-docs.ts` — точный отказ без обязательного attachment |
| Private transport | `packages/loginom-host/src/adapter.ts`, `host-port.ts`, `inputs.ts` — байты, отдельная admission identity, descriptor; host не читает произвольный OS path |
| Runtime | `packages/loginom-runtime/src/managed-entry.mjs`; `client/lib/bridge.mjs`, `workspace.mjs`, `storage-policy.mjs`, `artifact-delivery.mjs`, `executor.mjs` — private package prepare, binding, upload finish и open |
| Guidance | `packages/product/skills/loginom-automation/{SKILL.md,references/workflow.md}`, `skills/package-docs/SKILL.md`, `packages/agent/src/session/prompt.ts`, owning AGENTS |
| Scenario evals | `evals/src/{task,run,cli,sandbox}.ts`; tests; два каталога `evals/tasks/local-path-scenarios/` |
| Routing/e2e | `packages/loginom-host/script/skills-acceptance.ts`, `skills-acceptance/{run,desktop,turns,scenario-import}.mjs`; `evals/cases/local-file-routing/` |
| Evidence/docs | `evals/README.md`, `docs/testing/loginom-ai-agent/local-file-paths.md`; поправка контракта inputs в `docs/superpowers/specs/2026-09-18-evals-design.md` со ссылкой на новый дизайн |

## Задача 1. Проверить native upload до проектирования вокруг него

**Files:** существующие `packages/loginom-runtime/client/lib/{executor,workspace,text-export-output}.mjs` для чтения; новый `docs/testing/loginom-ai-agent/local-file-paths.md` для компактного evidence. Product code на этом шаге не менять.

**Consumes:** существующая authenticated session, regular `.lgp` fixture, выделенный Loginom, разрешённый каталог `/<username>`.
**Produces:** наблюдаемый способ подтвердить завершение upload и точную file row без download; имя/размер/owner и opened package identity, либо конкретно записанная неподтверждённая предпосылка.

- [ ] Установить точный candidate/runtime pin и отдельное окружение по runtime AGENTS и installed runbook. Выбрать существующий проверенный `.lgp`, снять локальные size/SHA. Достаточно fixture; модель для этого технического опыта не нужна.
- [ ] Через разрешённые native UI действия в одной authenticated session загрузить пакет из home без создания draft. Наблюдать sender, каталог, свежую строку файла и size; открыть именно этот файл. Не вызывать hidden RPC и не создавать второй browser/CDP context.
- [ ] Зафиксировать отсутствие download и второй отправки. Проверить конфликт с `overwrite: reject` и upload failure/задержку: неизвестный исход не должен открывать старый одноимённый пакет. Если размер в UI округлён, использовать доступное точное native observation, а не сравнивать строку вроде «16 KB» с числом байтов.
- [ ] Записать наблюдаемые predicates и ограничения в report. При отсутствии достаточного сигнала уточнить read-only observation; не превращать `UPLOAD_SERVER_VERIFICATION_REQUIRED` в успех. Сначала закрыть этот риск, затем выполнять runtime часть задачи 3.

## Задача 2. Разрешённый snapshot и регистрация одного файла

**Files:** modify `packages/agent/src/util/file-snapshot.ts`, `src/session/tools.ts`; create `src/tool/loginom-local-file.ts`, `test/tool/loginom-local-file.test.ts`; modify `test/util/file-snapshot.test.ts`, `test/session/{tools,profile-tools}.test.ts`. Host: `src/{adapter,host-port,inputs}.ts`, `test/{inputs,task-scope,host-port}.test.ts`.

**Interfaces:**

```ts
// Новый параметр сохраняет существующие callers без изменений.
fileSnapshot(path: string, maxBytes = 10 * 1024 * 1024): Promise<Buffer>

// Новый helper — Effect в стиле существующих tools, без отдельного service/layer.
snapshotLoginomFile(path: string, ctx: Tool.Context)
// Результат: { sourcePath: string, file: InputFile }
// InputFile — существующий { name: string, data: string /* base64 */ }.

// Публичный backend tool, только automation + уже подготовленный runtime.
loginom_file_admit({ path: string })
// Результат: { source_path: string, artifact: существующий runtime descriptor }.

// Существующий private adapter; admissionID — отдельная строка identity,
// а не новая пользовательская реплика и не исходная attachment-группа.
run.admit(admissionID, [source.file])
```

- [ ] **RED:** добавить один тест явного 16 MiB, оставив default 10 MiB. Полный тест использует настоящий файл и существующий `fileSnapshot`:

```ts
test("explicit 16 MiB snapshot preserves bytes without changing attachment default", async () => {
  const root = await mkdtemp("/home/kiselev/storage/tmp/loginom-snapshot-")
  try {
    const input = join(root, "данные #1%.bin")
    const bytes = Buffer.alloc(16 * 1024 * 1024, 0xa5)
    await writeFile(input, bytes)
    expect(await fileSnapshot(input, 16 * 1024 * 1024)).toEqual(bytes)
    await expect(fileSnapshot(input)).rejects.toThrow("10 MiB")
    await writeFile(input, Buffer.alloc(bytes.length + 1))
    await expect(fileSnapshot(input, bytes.length)).rejects.toThrow("16 MiB")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
```

- [ ] Запустить из `packages/agent`: `bun test test/util/file-snapshot.test.ts`. Убедиться, что новый тест падает из-за прежнего предела/сигнатуры, а не окружения. **GREEN:** параметризовать предел и сообщение, сохранить handle/fstat/O_NONBLOCK/final-stat/finally. Не заменять на неограниченный `readFile`.
- [ ] Следующим RED циклом проверить helper на реальном session/permission service из `test/tool/package-docs.test.ts`: внутренний относительный путь; внешний `данные #1%.csv`; symlink в запрещённый каталог; deny при прежнем allow-always; missing/directory/special/oversized. В каждом отказе snapshot/admission не состоялись. Реальные filesystem fixtures создаются под task temp, не через `globalThis` mock.
- [ ] **GREEN:** реализовать helper после hooks: session directory → requested/canonical → policy → bounded snapshot. До `ctx.ask` проверять `Permission.evaluate(..., mergedRules).action === "deny"` для обоих путей и permissions. Typed `DeniedError` должен попадать в тот же permissionDenied marker, что нынешний `ctx.ask`; не возвращать обычную «успешную» строку ошибки. Не менять весь permission engine.
- [ ] Следующий RED цикл в session tools/Host tests: два одинаковых basename с разными bytes в одной сессии должны возвращать два descriptor и source mappings; отказ второго не стирает первый. Registration в docs/default и до prepare отказывает до inputs/runtime. Добавить replay exact identity и конфликт изменённых bytes. Backend-схема:

```ts
const localFileParameters = Schema.Struct({ path: Schema.String })
// admission identity создаёт backend, не модель:
const admissionID = JSON.stringify(["local-file", task.taskMessageID, options.toolCallId])
// При возврате использовать source.sourcePath, никогда private snapshot sourcePath.
```

- [ ] **GREEN:** добавить tool в automation resolver, использовать существующие hook/permission/truncation/error правила. Host standalone `admit` должен возвращать cached runtime descriptor и при точном повторе: убрать ранний пустой `[]` в этой ветке и доверить caching существующему managed admission. Inline attachment admission в `call` остаётся прежним. Новая карта descriptors не нужна.
- [ ] Проверить настоящие private snapshot bytes и immutable group; сделать безопасным только имя server copy с сохранением расширения, используя существующий identity prefix. Добавить негативный `.lgp` тест для обычной регистрации. Формат generic source не проверять CSV whitelist; delivery возвращает свой конкретный unsupported-format отказ.
- [ ] **REFACTOR/verify:** переиспользовать существующие helpers, удалить лишние wrappers. Из `packages/agent` выполнить `bun test test/util/file-snapshot.test.ts test/tool/loginom-local-file.test.ts test/session/tools.test.ts test/session/profile-tools.test.ts` и `bun typecheck`. Из `packages/loginom-host` — `bun test test/inputs.test.ts test/host-port.test.ts test/task-scope.test.ts` с `LOGINOM_AI_AGENT_TEST_NODE`, затем `bun typecheck`. Коммит только owning files: `feat(agent): admit permitted local files`.

## Задача 3. Private подготовка локального `.lgp` без скачивания

**Files:** agent `src/session/tools.ts`, `test/session/tools.test.ts`; host `src/{adapter,host-port}.ts`, `test/{host-port,task-scope}.test.ts`; runtime `src/managed-entry.mjs`, `client/lib/{bridge,workspace,storage-policy,artifact-delivery,executor}.mjs`. Tests: `client/test/{user-profile-bridge,workspace,storage-policy,artifact-upload,artifact-delivery}.test.mjs`, `test/support/user-profile-bridge.mjs`.

**Consumes:** `snapshotLoginomFile`, подтверждение native completion из задачи 1, существующие artifact/grant/operation IDs.
**Produces:** `loginom_dock_prepare({intent:"open_package",local_package_path})` с подтверждённым upload/open, без public runtime OS-path API.

```ts
// Последний необязательный аргумент private adapter.call:
packageInput?: { admissionID: string; file: InputFile }

// Только private host -> managed-entry message.input:
packageArtifact?: { artifactID: string; uploadGrantID: string }

// Новый private метод результата createBridge:
prepareLocalPackage(args, { artifactID, uploadGrantID }, { signal })
// Возвращает существующий CallToolResult; MCP handler остаётся прежним.
```

- [ ] **RED:** расширить существующую Loginom fixture в `test/session/tools.test.ts`, захватывающую `loginom.call`: local path виден только в backend prepare schema; mutually exclusive с `package_path/workflow_ref`; не подходит другим intent; private `packageInput.file` равен исходным bytes. В `args`, дошедших до Host/runtime, нет local OS path/base64. Исходный attachment `.lgp` по-прежнему не попадает в admissions.
- [ ] **GREEN:** расширить только модельную schema в backend (`session/tools.ts`, где уже скрывается `host_context_token`), применить helper после hook и убрать `local_package_path` из forwarded args. Сохранить существующий server `package_path` без изменения. Runtime `prepareTool` в `skill.mjs` не получает local-path поле.
- [ ] Следующий RED в Host: docs/default, неправильный method/intent, два файла, не `.lgp`, совмещённые источники отказывают до startup/inputs. Повтор package admission возвращает тот же descriptor. **GREEN:** допустимый private package source записывается через `service.inputs`, затем существующий runtime `admit`; ровно один descriptor превращается в artifact/grant pair. Не менять ordinary `.lgp` admission deny и правило «runtime стартует только из prepare».
- [ ] Следующий RED в bridge fixture: sequence bind → verified upload → package finish → open exact receipt destination; workspaceReady остаётся false до успешного open. Отсутствуют create-draft и download. Поддельное `packageArtifact` в обычных MCP arguments не даёт полномочий.
- [ ] **GREEN:** выделить текущую prepare-ветку в общую локальную функцию для двух реальных входов — public prepare и private `prepareLocalPackage`. Managed entry dispatch вызывает private метод с прежним AbortController и возвращает прежний `{result,recoveryPending,activeWork}`. Scope/startup/cleanup не обходятся.
- [ ] Следующий RED в upload/delivery tests: прежний `AMBIGUOUS` receipt не является завершением; missing row, неверные size/name/owner, conflict, unknown gesture, journal write failure и cancellation не разрешают open или очистку pending как успешного. **GREEN:** private package finish проверяет predicates задачи 1, записывает package-specific completion и освобождает lease. `source_sha256` обозначает исходные bytes; не создавать `server_copy_verification`.
- [ ] Добавить следующий тест: upload подтверждён, open failed → разрешённое продолжение использует тот же destination и не выполняет второй `setInputFiles`. После unknown исхода действует существующий recovery, не автоматический replay. Отдельно прежний data-delivery тест должен по-прежнему требовать download/readback.
- [ ] **REFACTOR/verify:** из `packages/loginom-runtime/client` запускать pinned Node: `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/user-profile-bridge.test.mjs test/workspace.test.mjs test/storage-policy.test.mjs test/artifact-upload.test.mjs test/artifact-delivery.test.mjs`. Повторить связанные agent/host tests и package typecheck. `source-map.json` неизменяем; требуемую фиксацию локальных runtime transforms выполнить по runtime AGENTS. Коммит: `feat(runtime): open uploaded local packages`.

## Задача 4. Инструкции и границы выбора skill

**Files:** product skills из карты; agent `src/session/{prompt,tools}.ts`, `src/tool/package-docs.ts`; tests `test/session/{tools,profile-tools}.test.ts`, `test/tool/package-docs.test.ts`, `test/cli/{package-docs-pipeline,package-docs-permissions}.test.ts`; `packages/{agent,loginom-host}/AGENTS.md`.

**Consumes:** два новых backend-входа. **Produces:** natural prompt выбирает нужный skill; backend разрешает только профильные возможности.

- [ ] **RED:** проверить actual invocation registration/prepare в docs/default, custom origin с тем же ID и новый user turn после docs. В session history остаётся text-only prompt; переход profile применяется только обычным trusted skill механизмом. Не ограничиваться проверкой списка tool names.
- [ ] **GREEN:** подключить tool только к automation и сохранить HostTaskScope guards. Не создавать intent classifier. Инструкции должны прямо содержать последовательности:

```text
Изменить локальный .lgp: loginom-automation → loginom_dock_prepare
  intent=open_package, local_package_path=<путь> → изменить → сохранить.
Документация: package-docs → package_docs_run по локальному пути → документ.
Файлы данных: подготовить workspace → loginom_file_admit для каждого пути
  → доставить returned artifacts → использовать подтверждённые destinations.
Обычное чтение текста: Read; запуск Loginom не требуется.
```

- [ ] Проверить targeted regression `package_docs_run`: native path без attachment разрешается обычной политикой, explicit deny (включая прошлое allow-always) сохраняет отказ. Если существующая ветка `ctx.ask` теряет deny, применить такой же локальный precheck typed error здесь, не менять общее разрешение чтения/предел размера документации. Заменить ошибку «прикрепите/передайте --file» на причину отказа и путь; обновить только связанные assertions.
- [ ] Обновить attachment-only AGENTS формулировки: model path сам по себе не разрешение, но разрешённый backend snapshot — законный второй источник bytes. Указать relative base, 16 MiB, mapping нескольких источников, operation-specific формат и честный partial failure. Сохранить `.lgp` automatic exclusion.
- [ ] Запустить названные agent tests с pinned Node для package-docs и `bun typecheck`; host `bun test test/task-scope.test.ts test/bundled-skills.test.ts`. Коммит: `feat(skills): route local packages by user intent`.

## Задача 5. Native paths в существующем сценарном eval harness

**Files:** `evals/src/{task,run,cli,sandbox}.ts`; `evals/test/{task,cli,run,sandbox}.test.ts`; `evals/fixtures/fake-cli.ts`; `evals/README.md`, прежний eval design (только amendment inputs).

**Interfaces:**

```ts
// task.json; omission и явный attachment сохраняют старую семантику.
input_mode?: "attachment" | "paths"

// Task: inputMode?: "paths"; отсутствие поля не меняет старые hashes.
// runAgent: files=[] в paths-mode; дополнительный private inputRoot?: string.
// sandboxCommand: inputRoot?: string, только узкий read-only mount.
// Prompt содержит {{INPUT_ROOT}}; абсолютный native путь подставляет harness.
```

- [ ] **RED:** адаптировать существующий collision-test, оставив прежний запрет без input_mode. Новый paths case с `left/sales.csv`, `right/sales.csv` должен успешно загрузиться; одинаковый полный путь, absolute/traversal и symlink наружу — отказ до staging. Тест строит task-копию существующего `group-sum-qty`, не выдумывает reference:

```ts
await Bun.write(file, JSON.stringify({
  ...raw, input_mode: "paths", inputs: ["left/sales.csv", "right/sales.csv"],
}))
const [loaded] = await loadTasks(root)
expect(loaded.inputMode).toBe("paths")
expect(loaded.inputs).toEqual(["left/sales.csv", "right/sales.csv"])
```

- [ ] **GREEN:** валидировать режим; только paths-mode разрешает совпадение basename. Проверять обычные файлы внутри case directory до копирования. В `agentInputsHash` добавлять новую метку только при paths-mode; hash включает относительные имена и bytes, но не случайный абсолютный attempt root.
- [ ] Следующий RED на fake CLI: prompt содержит два настоящих разных пути и их содержимое, argv не содержит `--file`, persisted user parts только text. **GREEN:** в paths-mode staging сохраняет вложенные пути в sibling input root текущей попытки, session directory пустой; binding один `{{INPUT_ROOT}}`. В attachment-mode staging и `files` прежние.
- [ ] Следующий RED на настоящий bubblewrap: агент читает только текущие inputs и session workspace, не может читать case SPEC/oracle/reference, родительский attempt root, repo и чужую попытку, не может менять inputs. **GREEN:** добавить optional `inputRoot` через runAgent в sandboxCommand и один `--ro-bind`; проверить realpath/overlap, не монтировать весь corpus/attempt parent. Existing installation/profile/workspace guards сохраняются.
- [ ] Добавить scoped read/external_directory allow только для созданного input root в отдельный eval profile до run; не включать глобальный `--auto`. Test refusal при explicit deny. Снять input hashes до/после; сохранить snapshot inputs и prompt в evidence после confirmed cleanup, без доступа агента к expected/oracle. Existing process/archive lifecycle не переписывать.
- [ ] Экспортировать существующий `prepareProfile` из `run.ts` без изменения поведения: это позволит task-local reference adapter задачи 7 переиспользовать ту же подготовку вместе с уже экспортированными `runAttempt`/`afterAttempt`. Не добавлять новый CLI mode, отдельный launcher или ослабление `loadTasks` ради отсутствующего draft reference.
- [ ] Выполнить из `evals`: `bun test test/task.test.ts test/cli.test.ts test/run.test.ts test/sandbox.test.ts` и `bun typecheck`. Sandbox test требует штатного окружения; отсутствие bubblewrap — ограничение среды, не повод пропускать изоляцию. Коммит кода/docs, без generated cases: `feat(evals): support native path inputs`.

## Задача 6. Использовать real-model acceptance для корпуса в evals/

**Files:** `packages/loginom-host/script/skills-acceptance.ts`, `skills-acceptance/{run,desktop,turns,scenario-import}.mjs`; `test/{skills-acceptance,skills-acceptance-turns}.test.ts`; новый `test/skills-local-path-results.test.ts`. Corpus создаётся задачей 7.

**Interfaces:** `--corpus <absolute cases.json>` необязателен; default старый. Явный corpus — fixtures относительно его каталога, одна попытка без `--repeat`. Старый default остаётся 3. В `loginom-skills-routing.v1` используются input kinds `local-lgp-path`, `local-text-path`, `created-lgp-path`; они не создают attachments. Добавляется необязательное top-level `expectations: "expected.json"`: это evaluator-only ресурс рядом с corpus, отдельно от `fixtures`. Его bytes/hash входят в evidence, но файл и oracle facts не монтируются в агентский input/workspace и не входят в prompt.

- [ ] **RED:** существующий parser/fixture snapshot тест должен принять новый corpus, сохранить его bytes/hash и использовать только его fixtures. Старый запуск без `--corpus` должен сохранить прежние paths/default. **GREEN:** параметризовать только источник corpus и fixture root; default repeat вычислять `args.repeat ?? (args.corpus ? "1" : "3")`, а не менять исторический default всех запусков.
- [ ] Следующий RED на `acceptanceTurns`: сохранить явный `created-lgp-path` для второго хода, старый fallback `lgp-attachment` не меняется. Для `scenario-after-docs` разрешить expected format Markdown из setup вместо принудительного PDF. Для обоих переходов новый local package editing вариант использует проверку изменения исходного пакета, а не старый verifier, требующий CSV в prepare.

```ts
const turns = acceptanceTurns({
  id: "docs-after-build", input: "created-lgp-path", prompt: "Документируй изменённый пакет",
  setup: { input: "local-lgp-path", prompt: "Исправь расчёт в пакете" },
  expected: { profile: "package-docs", result: "md" },
})
expect(turns[1].input).toBe("created-lgp-path")
expect(turns[0].scenario).toBe(true)
```

- [ ] **GREEN:** расширить существующие CLI/Desktop adapters конкретными path kinds, bindings `{{external_text}}`/`{{created_lgp}}` и существующим `{{unicode_lgp}}`; выбрать correct originalPath для SHA. Внешний input root разрешается только целевой policy/явным Desktop allow. Отдельно assert text-only submission. Сохранить существующие parent/container bridge, session identity, cleanup и profile isolation. Не добавлять `resume` в общий eval runner.
- [ ] Следующий RED на проверяющие функции: ошибочная activation, неверный input SHA, отсутствующий emit/report, неверная формула в документе и произвольный ответ Read должны проваливаться. Использовать маленькие positive/negative evidence fixtures; они проверяют checker, не заменяют true-model run.
- [ ] **GREEN:** в общем для двух adapters модуле `scenario-import.mjs` добавить `verifyLocalPackageEdit`: проверить package source SHA/prepare receipt, preserved fixture nodes, изменённую формулу и результат. Prepare открывает upload destination; итоговый Save As обязан подтвердить отдельный `input.packagePath`, заданный binding `{{server_package}}`, который затем использует существующий bridge. Не ослаблять существующие `verifySalesScenario`/`verifyCalculatorModification` для исторических cases. Новые ожидания берутся из corpus oracle, недоступного модели.
- [ ] Добавить общий небольшой `skills-acceptance/local-path-results.mjs` для docs/Read: actual emitted Markdown, таблицы узлов/связей/формул по `expected.json`; completed Read и точное значение из TXT. Это два настоящих callers (CLI/Desktop), не новый runner. Проверить, что report — regular file в workspace до копирования evidence. Не принимать самоотчёт «создал документ» и не добавлять model judge текста; фактический документ дополнительно просмотреть при acceptance.
- [ ] Из `packages/loginom-host`: `bun test test/skills-acceptance.test.ts test/skills-acceptance-turns.test.ts test/skills-local-path-results.test.ts`, затем `bun typecheck`. Изменения launcher и checker коммитятся отдельно от генерируемых cases: `test(evals): reuse acceptance for local path cases`.

## Задача 7. Подготовить реальные eval cases по loginom-eval-case

**Skill:** `/home/kiselev/git/agent-validation/.agents/skills/loginom-eval-case/SKILL.md` и его `references/{case-contract,environment,verification}.md`. Следовать процедурам oracle → CLI reference → граф → cold rerun → calibration; ниже только согласованные адаптации.

**Files:** будущие `evals/tasks/local-path-scenarios/{csv-two-paths,local-lgp-edit}/{task.json,SPEC.md,reference.lgp,acceptance.json,oracle.py,oracle.csv,provenance.json,data/}`; `evals/tasks/local-path-scenarios/README.md`; `evals/cases/local-file-routing/{cases.json,expected.json,README.md,data/}`. Незавершённые материалы — в отдельном task draft под storage/tmp, не в принятом корпусе.

**Фиксированный небольшой набор:**

| ID | Prompt/вход | Независимый результат |
| --- | --- | --- |
| `csv-two-paths` | «Объедини продажи из `{{INPUT_ROOT}}/data/Первый #1/sales.csv` и `{{INPUT_ROOT}}/data/Второй %2/sales.csv`. Посчитай сумму amount по Category. Выгрузи CSV с разделителем запятая и колонками Category, amount, по возрастанию Category». | Первый CSV: Alpha=10, Beta=20; второй: Alpha=7, Gamma=5. Итог Alpha=17, Beta=20, Gamma=5; нужны оба источника |
| `local-lgp-edit` | «В пакете `{{INPUT_ROOT}}/data/Пакет #1/sales.lgp` исправь расчёт amount_double: умножать amount на 3 вместо 2. Сохрани остальные узлы и связи, выполни сценарий. Выгрузи CSV с разделителем запятая и колонками Category, amount, amount_double, в исходном порядке строк». | Исходный пакет с автономным источником Alpha10/Beta20/Alpha25 и calculator amount*2; итог amount_double=30/60/75, сохранены исходные IDs и связи |
| `lgp-docs` | «Создай Markdown-документацию к пакету `{{unicode_lgp}}`: назначение, таблица узлов, связи и формулы вычисляемых полей». | actual `.lgp_report.md`; точные факты source package, формула amount*2; нет upload/browser, SHA input прежний |
| `text-read` | «Прочитай `{{external_text}}` и укажи значение поля контрольная_строка». | TXT содержит `контрольная_строка=PATH-74-АБВ-37`; точный ответ, completed Read, default profile |
| `scenario-after-docs` | Ход 1: Markdown-документация `{{unicode_lgp}}`. Ход 2: «В `{{unicode_lgp}}` исправь amount_double на amount*3, сохрани остальные узлы и связи, выполни сценарий и сохрани изменённый пакет как `{{server_package}}`». | docs → automation; корректное изменение существующего пакета, та же Session |
| `docs-after-build` | Ход 1: «В `{{unicode_lgp}}` исправь amount_double на amount*3, сохрани остальные узлы и связи, выполни сценарий и сохрани изменённый пакет как `{{server_package}}`». Ход 2: Markdown-документация `{{created_lgp}}` | automation → docs; actual saved modified copy, формула amount*3 в документе, та же Session |

Первые два — обычные scenario evals с reference. Следующие два — одноходовые routing evals existing acceptance. Последние два — E2E переходы через existing acceptance. Не смешивать `task.json` и `cases.json` и не выдавать docs за diagnostic/package case. Имена skills, tool names и команды их принудительного выбора в prompts не добавлять.

- [ ] После code commits задач 2–6, до генерации cases собрать отдельный установленный CLI/Desktop candidate с pinned resources по `docs/testing/loginom-ai-agent/standalone-cli.md` и Desktop runbook. Зафиксировать clean source SHA, manifest и skills digests; далее эталоны и acceptance используют этот candidate. Generated cases по skill остаются без автоматического коммита и не требуют переобозначать уже собранный binary.
- [ ] Прочитать актуальную skill config, подтвердить существующую модель/variant и installed candidate SHA; source/set/IDs заданы этим планом. Переопределить WORK_ROOT только в task config на `/home/kiselev/storage/tmp/loginom-local-paths-reference`. Не изменять общий env и не использовать его прежний `/tmp` default.
- [ ] Для paths-mode **не запускать** прежние `prepare_attempt.ts`/`run_attempt.sh`: они flatten basename и безусловно используют `--file`. В task temp подготовить одноразовый `run-reference.ts`, который импортирует существующие функции evals из текущего checkout. Это adapter подготовки references по skill, не новый сохраняемый runner. Его smoke/dry-run проверяет два одинаковых basename, реальную подстановку путей, пустой files argv и одну попытку; отсутствие reference до запуска не должно требовать фиктивного пакета.

Порядок task-local adapter фиксирован:

1. `loadConfig(["--skip-judge"], env)` с installed candidate и моделью/variant из skill config; для smoke — `--dry-run`. Только для live сначала получить штатный harness lease и применить его profileDir. Затем выполнить `preflight`, создать `reserveRunDirectory` и `agentCommand`; только для live выполнить `prepareProfile`. Сигнал отмены — через существующий `installSigint`. Dry-run не получает live lease и не готовит реальный профиль.
2. Построить один **авторский объект Task в памяти**, указав `dir` draft, исходные `prompt/inputs`, `inputMode: "paths"`, `reference: ""`, ожидаемые поля/таймаут/oracle из конкретного draft. Это не вызов `loadTasks` и не финальный task.json; accepted loader остаётся строгим. Поле reference не используется при `skipJudge: true`; фиктивный файл не создаётся.
3. Вызвать уже существующий `runAttempt` ровно один раз с `skipJudge: true`, `judge: undefined`, `profileRecovered: false`, фактическими runId/runDir/source/task/attempt и AbortSignal. Он выполняет path staging, scoped permission, sandbox, `runAgent`, получение настоящего `.lgp`/CSV и сохранение evidence. Не копировать эту логику и не вызывать старый shell launcher skill.
4. Только для live вызвать существующий `afterAttempt`, проверить `environment_cleanup.status === "confirmed"`, архив DB/WAL и input hashes. Освобождать harness lease только после подтверждённого lifecycle; не удалять guards при отказе. Dry-run пропускает `afterAttempt`, как существующий main. Зависимые проверки останавливаются при infra failure, аналитические неуспехи учитываются в лимите skill.
5. Сопоставить paths evidence с входами `check_reference.py`/проверки результата/finalize skill: actual artifact `.lgp`, output CSV, events, сохранённые input snapshots и архив БД. Подтвердить model/variant по БД, а не argv. После graph/cold rerun принятия положить actual artifact в `reference.lgp` и записать финальный task.json с этим существующим файлом. Если конкретный helper skill жёстко требует прежний layout, адаптировать его task-local пути/evidence mapping, сохраняя все проверки; установленный skill и его defaults не менять.

- [ ] До модели создать данные, SPEC и independent oracle. Для двух CSV использовать Python stdlib; эталонные числа посчитать из входов, не копировать из результата Loginom:

```python
import csv
from collections import defaultdict
from pathlib import Path

root = Path(__file__).parent
totals = defaultdict(int)
for name in ("data/Первый #1/sales.csv", "data/Второй %2/sales.csv"):
    with (root / name).open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            totals[row["Category"]] += int(row["amount"])
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream)
    writer.writerow(["Category", "amount"])
    writer.writerows(sorted(totals.items()))
assert dict(totals) == {"Alpha": 17, "Beta": 20, "Gamma": 5}
```

- [ ] Подготовить через настоящий CLI исходный автономный `.lgp` с тремя строками, calculator amount*2 и наблюдаемым output. Не писать Unit.xml вручную. Проверить граф/результат и cold rerun, затем использовать одни проверенные source bytes в edit/docs cases. Oracle edit заранее `[30,60,75]`; source expected facts выписать независимо из проверенного графа/Unit.xml. В prompts только входные пути/задача, не reference/oracle.
- [ ] Для каждого scenario case получить `reference.lgp` через installed CLI с configured model/variant посредством описанного task-local adapter. Максимум три попытки согласно skill; фиксировать реальные analytical/infra исходы и hint третьей попытки. Reference edit обязан сохранить исходные IDs/связи и изменить формулу/результат; совпадения только выходного CSV недостаточно.
- [ ] Выполнить graph/code checks и холодное открытие/повторное выполнение reference на чистом браузере. Сравнить output с oracle, включая schema/rows. Инфраструктурную проблему устранить в окружении, не ослаблять oracle и не удалять `.writer` guard.
- [ ] Для routing cases заполнить existing corpus v1 и expected facts. Данные лежат относительно corpus; после подстановки внешние пути содержат пробелы/кириллицу/#/%. Для изменённого документа использовать actual полученную copy из bridge, не исходный fixture. `created_lgp` скачивается для дальнейшей документации, а не при проверке первого upload.
- [ ] Провести case validation по skill, обновить hashes/provenance/README и только после complete evidence перенести из draft в final collections. Для нового path-контракта старый basename-only validator не является основанием переименовать одинаковые `sales.csv`: применить изменённый task loader и эквивалентные graph/oracle checks, явно записать эту адаптацию.
- [ ] Предупредить о стоимости и выполнить обычную calibration только двух новых scenario IDs. Из `evals`:

```bash
JUDGE_MODEL=gpt-6-sol JUDGE_REASONING=xhigh bun run src/run.ts --calibrate --tasks tasks/local-path-scenarios --only csv-two-paths,local-lgp-edit
```

Оба case дают reference для foreign negative друг другу. Positive/negative должны проходить действующие thresholds; calibration не доказывает cold rerun/выгрузку. Near-miss corpus не добавлять. Нет живого `--repeat` и коммита cases в рамках этого skill. В отчёте перечислить готовые, непринятые и не созданные cases отдельно, не объявлять всё принятым по одному запуску.

## Задача 8. Проверить весь путь на candidate и завершить

**Files:** существующие build/installed acceptance runbooks; report `docs/testing/loginom-ai-agent/local-file-paths.md`, collection README, checkpoint дизайна.

- [ ] Проверить manifest SHA/skills digests candidate из задачи 7; использовать его повторно, если product code не изменился. После исправления кода нужен новый candidate и повтор только затронутых проверок. Не называть старый установленный бинарник новым candidate и не ставить dirty artifact в runner, который требует clean snapshot.
- [ ] Выполнить необходимые package tests/typechecks по предыдущим задачам. Повторять уже прошедшие проверки лишь после относящихся к ним изменений. Runtime attribution/resource verification выполнить по owning instructions, не подменять ими behavioral tests.
- [ ] Выполнить один live scenario проход новых IDs через isolated harness, без `--repeat`; effective EVAL_REPEAT должен быть 1. Сначала проверить private config `EVAL_CLI_MODE=binary`, EVAL_CLI_BIN candidate, выделенный endpoint, paths/profile/results под storage/tmp, модель/variant. Команда из `evals`:

```bash
EVAL_REPEAT=1 bun run src/run.ts --tasks tasks/local-path-scenarios --only csv-two-paths,local-lgp-edit
```

- [ ] Запустить existing skills-acceptance для нового corpus, один раз на CLI и один на Desktop, с фактическими absolute artifact/output/model/variant/installed image из проверенного candidate. Нужные аргументы — `--corpus` на `evals/cases/local-file-routing/cases.json`, `--cases lgp-docs,text-read,scenario-after-docs,docs-after-build`, `--interface run` либо `desktop`; не передавать `--repeat`. Default нового corpus — одна попытка. Использовать существующий secret/profile setup, не создавать второй runner.
- [ ] Проверить actual documents и все четыре intent/profile outcomes, оба transition Session IDs, source hashes, отсутствие attachments и исходного `.lgp` control download. При edit → docs показать факт amount*3 в выгруженной изменённой copy и документе. Две CSV используются обе; продукт не объявляет partial completion успехом.
- [ ] Выполнить нативную Windows проверку абсолютного пути с пробелом/кириллицей и нескольких разных файлов; POSIX relative/absolute уже покрываются Linux. Linux unit tests с `C:\\...` не считать Windows filesystem acceptance. Если Windows runner недоступен, сохранить честное ограничение и условие продолжения, не объявлять полное платформенное покрытие.
- [ ] Убедиться в confirmed runtime/process/storage cleanup и архивировании attempts без секретов. Обновить report: что проверено, candidate SHA, модель/variant, paths корпуса, результаты каждого case, оставшиеся ограничения. Не добавлять историческую полную матрицу, массовый benchmark или новый CI gate без требования.
- [ ] Финальная проверка простоты: удалить ненужные helpers/fixtures, fake server SHA и повторные файловые registries; `git diff --check`. Независимый reviewer проверяет итог против дизайна, особенно permissions, package finish/retry и отсутствие обхода isolation. Исправить относящиеся к задаче замечания. Сгенерированные cases не коммитить автоматически по skill; PR/merge/release не входят в эту planning-задачу.

## Критерии завершения реализации

Исходный prompt с несколькими путями работает без attachments в CLI/Desktop; bytes и mapping верны, 16 MiB и deny соблюдаются. Local `.lgp` edit открывает исходный пакет без контрольного скачивания; docs создаёт правильный документ и не запускает upload. Новые сценарные и routing evals находятся в `evals/`, имеют реальные ожидаемые результаты и сохранённое evidence; переходы проверены в одной сессии. Старые attachment/data verification пути проходят регрессию. Непроверенная платформа или live gate явно остаётся ограничением, не PASS.

## Planning checkpoint

- План подготовлен 2026-10-21 по одобренному дизайну #74.
- Это документ будущих действий: код, корпус, references, model runs и calibration пока не выполнялись.
- Ранний технический риск: доказательство native upload completion без download.
- Перед исполнением прочитать spec, owning AGENTS и TDD skill; отдельное повторное одобрение уже согласованных требований не требуется.
- Независимое plan review: Approved после исправления native-path reference запуска и Save As в переходах.
- Ссылки, code fences и отсутствие незаполненных мест проверены; runtime/tests/model evidence не заявляется.
