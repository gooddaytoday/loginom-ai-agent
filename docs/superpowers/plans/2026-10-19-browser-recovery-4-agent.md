# Browser recovery, план 4: host, агентский цикл и навык

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Тот же агент в той же сессии проходит временный режим: конец run останавливает попытку, модель без изображений не видит скриншот, при завершении хода текстом во время попытки приходит ровно одно напоминание, а навык ведёт в режим вместо просьбы к пользователю.

**Architecture:** Host при `release` run уведомляет существующий runtime приватным `run-released`: runtime чата переживает конец run (`retireRuntime` снимает только устаревший runtime, `host.ts:235-236`). `session/tools.ts` скрывает `browser_take_screenshot` по `model.capabilities.input.image` и копирует состояние попытки из `_meta` в metadata части — и при успехе, и при ошибке. Новый модуль `session/browser-recovery.ts` решает, нужно ли напоминание; `session/prompt.ts` вставляет его синтетическим сообщением пользователя в точке выхода из цикла. Навык меняет два тупика на переход в режим.

**Tech Stack:** TypeScript, Bun, Effect, MCP SDK 1.29.0.

**Spec:** [дизайн, разделы 5, 6, 7, 10](../specs/2026-10-19-browser-recovery-design.md); [общий контракт](2026-10-19-browser-recovery.md#общий-контракт).

## Global Constraints

- «Модель не меняется автоматически. Для модели с поддержкой изображений используются DOM и скриншоты; для текстовой модели — DOM.»
- «Новые инструменты проходят тот же permission-путь, что `loginom_*`»: правило агента по умолчанию `"*": "allow"` (`packages/agent/src/agent/agent.ts:120`) их покрывает, новых запросов разрешения режим не добавляет. Существующий doom-loop детектор (`agent.ts:121`, `processor.ts:356-380`: три одинаковых вызова в одном ответе модели) действует как для остальных инструментов: CLI `run` такой вызов отклоняет (`cli/cmd/run.ts:867-887`), интерактивный клиент спрашивает пользователя. Правила разрешений не меняются.
- «Агентский цикл добавляет одно напоминание на попытку. Повторное завершение хода считается отсутствием продвижения и ведёт к `stopped`»: после повторного завершения run заканчивается, и host шлёт `run-released`. Напоминание не начинает новую задачу и не меняет профиль.
- Агент не знает capability сборки; поведение определяется только каталогом и `_meta`.
- «Исправление UI не перекладывается на пользователя»; запрос недостающего файла, доступа или смыслового решения допустим.

## Результат, объём, исключения

- Готово, когда Tasks 1–4 закрыты; `bun test` и `bun typecheck` в `packages/loginom-host` и `packages/agent`, `bun test` в `packages/product` — зелёные.
- Первый проверяемый результат — Task 1: настоящий Node host шлёт `run-released` существующему runtime и блокирует новый чат после падения runtime.
- Объём: ~11 файлов, ~+420 / −20 строк, включая короткие ACK нового IPC в затронутых тестовых фикстурах.
- Исключения: runtime (его сторона `run-released` — план 3, Task 4), evals, release, правила разрешений.

## Review Focus

1. Напоминание после ответа с ошибкой провайдера или прерванного ответа (у сообщения ассистента есть `error`) не вставляется (Task 3).
2. Попытка из прошлой задачи с состоянием `browser` не вызывает напоминание в новой задаче (Task 3).
3. Ответ с ошибкой (`isError`, автоматическая остановка) тоже переносит состояние попытки в metadata части (Task 2).
4. Run без runtime при `release` не запускает runtime; отказ runtime на `run-released` не делает `release` ошибкой (Task 1).

---

### Task 1: Host уведомляет runtime о конце run; падение runtime блокирует профиль

**Files:**
- Modify: `packages/loginom-host/src/host-port.ts:86-91`
- Create: `packages/loginom-host/test/browser-recovery-release.test.ts`
- Modify: `packages/loginom-host/test/host-port.test.ts:118-136` (BR-S7)
- Modify: `packages/loginom-host/test/task-scope.test.ts`, `packages/loginom-host/test/saved-package-shutdown.test.ts` — ACK `run-released` в существующих фикстурах, которые освобождают run с runtime.
- Docs: `packages/loginom-host/AGENTS.md` (один пункт)

**Interfaces:**
- Consumes: runtime IPC `run-released` из плана 3, Task 4.
- Produces: `release(id, run)` до `abandon` и `lease.release()` при `run.lease` и `service.hasRuntime(run.lease.generation, run.chat)` отправляет `request("run-released", undefined, 5000)`; ошибки игнорируются. Без runtime запрос не отправляется и runtime не создаётся.
- Между `hasRuntime` и получением уже существующего runtime нет промежуточного `await`. Фикстуры затронутых release/close путей отвечают `{released: true}` на новый IPC; другие фикстуры меняются только при подтверждённом аналогичном пути или сбое suite. Глобальный test timeout не повышается, общий framework фикстур не вводится.
- BR-S7, строгий режим восстановления (`strictRecovery: true`, в CLI — `LOGINOM_AI_AGENT_STRICT_RECOVERY=1`): падение runtime во время вызова, в том числе `dock_browser_recovery`, оставляет записи журнала pending, и `acquire` любого чата профиля отклоняется `LOGINOM_RECOVERY_REQUIRED` (`host-port.ts:133-134` проверяет `journal.pending()` для всего профиля). В режиме по умолчанию журнал мягкий (`packages/loginom-host/AGENTS.md`): runtime закрывается вместе с браузером, попытка не возобновляется, новые чаты не блокируются. Автоматического возобновления нет ни в одном режиме.

- [x] **Step 1: Write the failing tests**

Структура — как в `saved-package-shutdown.test.ts:115-219`: настоящий Node host и фиктивный `managed-entry.mjs`, который пишет каждую `m.operation` в файл и отвечает `{released: true}` на `run-released`.

```ts
test("releasing a run notifies its existing runtime once and never starts one", async () => {
  // run "one": acquire, scope bind loginom-automation, call dock_prepare, release
  expect(operations.filter((value) => value === "run-released")).toHaveLength(1)
  expect(operations.indexOf("run-released")).toBeGreaterThan(operations.indexOf("call"))
  // starts — число "start" до run "two"; run "two" в другом чате: acquire и release без вызовов
  expect(operations.filter((value) => value === "start")).toHaveLength(starts)
  expect(operations.filter((value) => value === "run-released")).toHaveLength(1)
})
test("a refused run-released never fails the release", async () => {
  // фиктивный runtime отвечает на run-released ошибкой
  expect(await host.request("release", { run: "three" })).toBe(true)
})
```

В `host-port.test.ts`, случай `kill`, после `LOGINOM_CALL_UNCERTAIN`:

```ts
await expect(client.request("acquire", { run: "other", session: "another-chat" })).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/browser-recovery-release.test.ts test/host-port.test.ts test/task-scope.test.ts test/saved-package-shutdown.test.ts`
Expected: FAIL — `run-released` не отправляется. Проверка BR-S7 проходит уже сейчас: она фиксирует существующее поведение, на которое опирается дизайн (§6).

- [x] **Step 3: Implement** по Interfaces.

- [x] **Step 4: Run tests to verify they pass** (команда Step 2 и `bun typecheck`; Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/loginom-host
git commit -m "feat(host): tell the runtime when an agent run ends"
```

### Task 2: Скриншот по capability модели и состояние попытки

**Files:**
- Create: `packages/agent/src/session/browser-recovery.ts` (функция `state`; `reminder` добавит Task 3)
- Modify: `packages/agent/src/session/tools.ts:600-690`
- Test: `packages/agent/test/session/tools.test.ts`

**Interfaces:**
- Produces:
  - `BrowserRecovery.state(value: unknown) → {attempt_id: string; state: "dock" | "handoff" | "browser" | "verifying" | "stopped"} | undefined`; `attempt_id` — непустая строка до 160 символов. Модуль экспортирует себя как `BrowserRecovery` (`export * as BrowserRecovery from "./browser-recovery"`).
  - В `tools.ts` `browser_take_screenshot` пропускается, если `!input.model.capabilities.input.image`.
  - `loginomBrowserRecovery = BrowserRecovery.state(result._meta?.["loginom/browser_recovery"])` попадает в metadata части `loginom_*`, если значение определено: при успехе — в `output.metadata`, в ветке ошибки — в `ctx.metadata` перед `throw` (`tools.ts:652-658`).

- [x] **Step 1: Write the failing tests**

Использовать поддельный `loginom` из `tools.test.ts` (`tools()`/`call()`); результат вызова проходит настоящий `CallToolResultSchema.parse`. `resolveWith({catalog, image, result})` — помощник теста вокруг `SessionTools.resolve` с моделью `capabilities.input.image = image`; `run(tools, name)` выполняет инструмент и возвращает его вывод или ошибку. Процессор фикстуры записывает `updateToolCall` в массив `metadataWrites` вместо `Effect.die` (`tools.test.ts:329`).

```ts
it.effect("hides the recovery screenshot from a model without image input", () =>
  Effect.gen(function* () {
    for (const image of [false, true]) {
      const tools = yield* resolveWith({ catalog: ["browser_click", "browser_take_screenshot"], image })
      expect(Object.keys(tools).filter((key) => key.startsWith("loginom_browser_")).sort())
        .toEqual(image ? ["loginom_browser_click", "loginom_browser_take_screenshot"] : ["loginom_browser_click"])
    }
  }))
it.effect("delivers a recovery screenshot to an image model as an image attachment", () =>
  Effect.gen(function* () {
    const tools = yield* resolveWith({ catalog: ["browser_take_screenshot"], image: true,
      result: { content: [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }] } })
    expect((yield* run(tools, "loginom_browser_take_screenshot")).attachments[0].url).toBe("data:image/png;base64,iVBORw0KGgo=")
  }))
it.effect("copies browser recovery state only from a valid _meta record", () =>
  Effect.gen(function* () {
    const meta = (value: unknown) => ({ content: [], _meta: { "loginom/browser_recovery": value } })
    const valid = { attempt_id: "br-1", state: "browser", calls_remaining: 29, ms_remaining: 1000 }
    const output = yield* run(yield* resolveWith({ catalog: ["browser_click"], image: false, result: meta(valid) }), "loginom_browser_click")
    expect(output.metadata.loginomBrowserRecovery).toEqual({ attempt_id: "br-1", state: "browser" })
    for (const invalid of [{ ...valid, state: "paused" }, { ...valid, attempt_id: "" }]) {
      const rejected = yield* run(yield* resolveWith({ catalog: ["browser_click"], image: false, result: meta(invalid) }), "loginom_browser_click")
      expect("loginomBrowserRecovery" in rejected.metadata).toBe(false)
    }
  }))
it.effect("keeps browser recovery state of a failed recovery reply", () =>
  Effect.gen(function* () {
    const failed = { content: [{ type: "text", text: "{\"error\":{\"code\":\"BROWSER_RECOVERY_PAGE_CHANGED\"}}" }], isError: true,
      _meta: { "loginom/browser_recovery": { attempt_id: "br-1", state: "stopped", calls_remaining: 20, ms_remaining: 1000 } } }
    yield* run(yield* resolveWith({ catalog: ["browser_click"], image: false, result: failed }), "loginom_browser_click")
    expect(metadataWrites.at(-1)?.metadata.loginomBrowserRecovery).toEqual({ attempt_id: "br-1", state: "stopped" })
  }))
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent && bun test test/session/tools.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement** по Interfaces.

- [x] **Step 4: Run tests to verify they pass** (команда Step 2 и `bun typecheck`; Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat(agent): publish recovery screenshots only to image models"
```

### Task 3: Одно напоминание на попытку

**Files:**
- Modify: `packages/agent/src/session/browser-recovery.ts`
- Modify: `packages/agent/src/session/prompt.ts:1329-1347`
- Create: `packages/agent/test/session/browser-recovery.test.ts`
- Test: `packages/agent/test/session/prompt.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `BrowserRecovery.reminder({sessionID, messages, revert}) → {attemptID: string; text: string} | undefined`; `messages` — полная persisted `history`, `revert` — текущая граница Session. Окно `msgs` после `filterCompacted` не используется для этого решения.
  - Текущая задача и видимые сообщения/части определяются существующими `TaskScope.visible`, `TaskScope.derive` и `TaskScope.replayOf`. Compaction-only и replay не создают новую задачу; скрытые revert части и поздние assistant-ответы с родителем из другой задачи не участвуют. Второй алгоритм идентичности задачи, registry или persisted state не добавляется.
  - Берётся последняя часть `loginom_*` в состоянии `completed` или `error` с `metadata.loginomBrowserRecovery`. Напоминание нужно, если её `state === "browser"`, у последнего ответа ассистента нет `error`, а в текущей задаче нет синтетической части пользователя с `metadata.browser_recovery_reminder === attempt_id`.
  - В `prompt.ts`, в блоке выхода (1329–1347) до `break`: helper получает `{sessionID, messages: history, revert: session.revert}`; при напоминании создаётся сообщение пользователя с одной синтетической текстовой частью (по образцу 448–464) и `metadata: {browser_recovery_reminder: attemptID}`, затем `continue`. `TaskScope.derive` не начинает по нему новую задачу (синтетический текст, `task-scope.ts:49-52`).
- Текст напоминания (точно):

```text
Browser recovery attempt {attempt_id} is still active. Continue the failed step with the allowed loginom_browser_* tools and call loginom_dock_browser_recovery with action "finish" when its result is reached. If no justified action remains, call it with action "stop", follow its next_step and report what was done in the browser, what the runtime verified, what only you attested and what remains unknown. Do not ask the user to fix the Loginom UI. Ending the turn again stops this attempt.
```

- [x] **Step 1: Write the failing tests**

В `browser-recovery.test.ts` — истории сообщений из фикстур `SessionV1`; `input(patch)` содержит sessionID, полную messages и при необходимости revert:

```ts
test("an active attempt in the current task needs one reminder", () => {
  expect(BrowserRecovery.reminder(input({ state: "browser" }))).toEqual({ attemptID: "br-1", text: expect.stringContaining("loginom_dock_browser_recovery") })
})
test("a reminder already sent for the attempt is not repeated", () => {
  expect(BrowserRecovery.reminder(input({ state: "browser", reminded: "br-1" }))).toBeUndefined()
})
test("dock, stopped, a failed reply that stopped the attempt, provider errors and earlier tasks need no reminder", () => {
  for (const patch of [{ state: "dock" }, { state: "stopped" }, { state: "browser", lastError: { state: "stopped" } },
    { state: "browser", assistantError: true }, { state: "browser", newTask: true }])
    expect(BrowserRecovery.reminder(input(patch))).toBeUndefined()
})
```

Focused регрессии сохраняют попытку и ранее отправленный marker через compaction-only/replay, исключают скрытые revert message/part и поздний receipt старой задачи. Они проверяют существующий контракт TaskScope, не вводят новых условий завершения продукта.

В `prompt.test.ts` — заглушка host по образцу 1096–1110; модель скриптована тремя шагами:

```ts
it.instance("a text-only turn during an active attempt gets exactly one reminder", () =>
  Effect.gen(function* () {
    // шаг 1: вызов loginom_dock_browser_recovery {action: "start", operation_id: "apply"}; host отвечает _meta со state "browser"
    // шаги 2 и 3: только текст
    const reminders = history.filter((message) => message.parts.some((part) =>
      part.type === "text" && part.synthetic && part.metadata?.browser_recovery_reminder === "br-1"))
    expect(reminders).toHaveLength(1)
    expect(providerCalls).toBe(3)
    expect(TaskScope.derive({ sessionID, messages: history })?.profile).toBe("loginom-automation")
    expect(requests.at(-1)?.method).toBe("release")
  }))
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent && bun test test/session/browser-recovery.test.ts test/session/prompt.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement** по Interfaces.

- [x] **Step 4: Run tests to verify they pass** (команда Step 2 и `bun typecheck`; Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat(agent): remind once during an active browser recovery"
```

### Task 4: Навык ведёт в режим вместо просьбы к пользователю

**Files:**
- Modify: `packages/product/skills/loginom-automation/references/browser.md:36-42`
- Modify: `packages/product/skills/loginom-automation/SKILL.md:62-66`
- Docs: `packages/agent/AGENTS.md` (пункт о `loginomBrowserRecovery` и напоминании)

**Interfaces:**
- Consumes: инструменты и поля ответов из общего контракта.

- [ ] **Step 1: Заменить тупики в `browser.md`**

Абзац «Не проси пользователя закрывать мастер…» и фразу «Если `recovery_options` пуст и `user_action` нет, сообщи… и остановись» заменить: не просить пользователя закрывать мастер, диалог или исправлять сценарий; при пустых `recovery_options` следовать `next_step` ответа. Добавить раздел «Временный режим восстановления»:

```text
Если ответ Dock содержит next_step с tool dock_browser_recovery, штатное
восстановление этого шага исчерпано. Вызови loginom_dock_browser_recovery с
action "start" и operation_id из next_step. После state "browser" текущая вкладка
временно твоя: доступны только loginom_browser_* из каталога. Читай поддеревья
через target/depth и loginom_browser_find; скриншот есть только у модели с
изображениями. Посимвольный ввод — loginom_browser_type с slowly: true, чекбоксы —
loginom_browser_fill_form. Не уходи со страницы, не открывай вкладки и не обновляй
её. Если основание — потеря подтверждения (trigger T4), сначала вызови finish без
новых действий: повторять действие можно, только если ответ проверки это разрешил.
Иначе доведи шаг до recovery_input.goal: если цель включает выполнение, выполни
узел и дождись закрытия его мастера. Затем вызови finish с отчётом: действия,
ожидаемый результат и настройки, сделанные в браузере. completed — продолжай через
Dock со свежими наблюдениями; continuable — выполни next_step; unresolved —
устрани названную причину и снова вызови finish в остатке бюджета. Если
обоснованного действия нет, вызови stop с причиной и выполни next_step его ответа
(безопасное завершение операции). В итоговом ответе раздели: что сделано в
браузере, что подтвердил runtime, что подтверждено только тобой
(attested_by_model), сохранён ли пакет и что осталось неизвестным.
```

Навык общий для всех сборок, поэтому сохранить одну фразу для сборки без режима: если Dock вернул `user_action` и нет `next_step` на `dock_browser_recovery`, действовать по `user_action`; если нет ни того ни другого — сообщить `operation_id`, фазу и причину.

- [ ] **Step 2: Уточнить запрет обхода в `SKILL.md`**

К запрету Playwright и raw UI (строки 62–66) добавить: исключение — временный режим, который runtime открывает через `next_step` (ссылка на `references/browser.md`); внутри него `loginom_browser_*` из каталога — штатная работа.

- [ ] **Step 3: Run checks**

Run: `cd packages/product && bun test`; `cd packages/agent && bun test test/cli/bundled-skills.test.ts`; `rg -n "dock_browser_recovery" packages/product/skills/loginom-automation`
Expected: PASS; `rg` находит `references/browser.md` и `SKILL.md`.

- [ ] **Step 4: Commit and checkpoint**

```bash
git add packages/product/skills packages/agent/AGENTS.md
git commit -m "feat(skill): enter browser recovery instead of asking the user"
```

Checkpoint до 20 строк. PR `feat: browser recovery in the agent turn` в `demo-022`.
