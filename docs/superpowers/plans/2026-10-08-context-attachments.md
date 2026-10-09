# Context Attachments Implementation Plan

> **For agentic workers:** выполнить задачи параллельно по назначенным файлам, затем провести независимый review общего diff.

**Goal:** Устранить две подтверждённые регрессии PR #32, сохранив ограниченный контекст.

**Architecture:** Независимые лимиты user text/context в compaction; восстанавливаемый content-addressed cache для обрезанных inline-вложений.

**Tech Stack:** Bun 1.3.14, TypeScript, Effect, существующие session и FSUtil сервисы.

**Spec:** docs/superpowers/specs/2026-10-08-context-attachments-design.md

## Global Constraints

- База f9bf332cc491baa784e6e04fdfda7c0f09151cb7; ветка loginom; основной evals checkout не менять.
- Original-user data URL и filename сохранять; public Protocol/HttpApi не менять.
- Тесты/typecheck запускать из packages/agent, не из корня.
- Существующие model/attachment limits и 7-дневная очистка tool-output сохраняются.

### Task 1: Команда отдельно от synthetic preview

**Files:** packages/agent/src/session/compaction.ts; packages/agent/test/session/compaction.test.ts.
**Consumes:** SessionV1.WithParts, существующий truncate(value: string).
**Produces:** [User] с общим лимитом 2000; каждый [User context] с отдельным лимитом 2000.

- [x] Добавить regression fixture: synthetic текст 5000 символов перед реальной короткой
      командой; ignored text и file-part. Capture реального входа LLM.

```ts
expect(captured).toContain("Save new-output.lgp; preserve existing.lgp")
expect(captured).not.toContain("IGNORED_INSTRUCTION")
expect(captured).not.toContain("HIDDEN_ATTACHMENT_TAIL")
```

- [x] Проверить RED: `bun test test/session/compaction.test.ts --test-name-pattern 'preserves user directives'`.
- [x] Разделить фильтрацию обычных и synthetic TextPart; truncate объединённый обычный текст
      и каждую synthetic часть независимо; выводить user text перед context и file descriptors.

```ts
const text = truncate(
  message.parts
    .filter((part) => part.type === "text" && !part.ignored && !part.synthetic)
    .map((part) => part.text)
    .join("\n"),
)
```

- [x] Проверить GREEN и existing oversized-text regression.

### Task 2: Полный inline snapshot доступен через Read

**Files:** packages/agent/src/util/attachment-preview.ts, packages/agent/src/session/prompt.ts,
packages/agent/test/util/attachment-preview.test.ts, packages/agent/test/session/prompt.test.ts.
Совместная очистка: packages/agent/src/tool/truncation-dir.ts, packages/agent/src/tool/truncate.ts,
packages/agent/test/tool/truncation.test.ts.
**Consumes:** FSUtil.Service, TRUNCATION_DIR, decodeDataUrl, существующий attachmentPreview.
**Produces:** Effect helper для materialization bounded attachment context; стабильный путь cache.

- [x] Добавить regression через prompt.prompt(noReply:true) с 2100 строками и уникальным хвостом;
      проверить model serialization, сохранённый original file-part и Read offset/limit полного хвоста.

```ts
expect(modelText).not.toContain("FINAL_REQUIRED_PARAGRAPH")
expect(await Bun.file(snapshotPath).text()).toBe(content)
expect(stored.parts.find((part) => part.type === "file")?.url).toBe(data)
```

- [x] Проверить RED выбранных тестов.
- [x] Materialize только обрезанный текст, используя SHA-256 полного текста и `tool_attachment_` prefix;
      вернуть абсолютный путь и Read/Grep hint перед bounded preview.
- [x] Новый snapshot публиковать атомарно через temporary file, существующий — touch mtime.
      Проверить parallel same-content materialization и old cache → refresh → cleanup → Read.
- [x] Согласовать materialization/touch и cleanup stat/remove общим process-local semaphore;
      проверить пересечение refresh с уже прочитанным старым mtime без задержек по таймеру.
- [x] В data:text/plain resolution использовать Effect helper; не менять исходный file-part.
- [x] Перед runLoop выбрать все user data:text/plain URL через MessageTable/PartTable join
      с session/role/type/mime predicates и тем же WHATWG URL parser, что в initial prompt.
      Восстановить snapshots, чтобы ссылки из старых summary
      работали после cleanup, не гидратируя исторические assistant/tool outputs.
- [x] Проверить small/existing-cache, exact bytes, line/byte limits, Read tail, resume recovery.

### Task 3: Общая проверка и checkpoint

- [x] `bun test test/session/compaction.test.ts test/session/prompt.test.ts test/session/message-v2.test.ts test/util/attachment-preview.test.ts test/tool/read.test.ts test/tool/truncation.test.ts test/session/loginom-truncation.test.ts --timeout 30000 --only-failures`.
- [x] `bun typecheck`; `git diff --check`.
- [x] Независимый read-only review; исправить только подтверждённые дефекты.
- [x] Записать checkpoint <=20 строк: база/SHA, выполненное, результаты, ограничения, следующий шаг.
- [x] Сохранить законченные изменения локальным conventional commit, без push/merge/release.

## Результат проверки

- Общий набор: 230 pass, 2 skip, 0 fail; 737 assertions, 7 файлов.
- Финальная типобезопасная редакция concurrency regression отдельно: 1 pass, 0 fail.
- `bun typecheck`, formatting и `git diff --check`: PASS; independent review: No findings.
- RED → GREEN подтверждён для потери команды, отсутствующего полного inline snapshot,
  восстановления после cleanup/compaction, retention и нормализации URL.
- Atomic same-content case проверяет 8 параллельных читателей полного 4 MiB snapshot;
  воспроизведение конкурентной гонки прежнего atomic publish не утверждается.
- Installed Desktop/Loginom acceptance не выполнялась.
- Локальный fix commit: `6a2720b9a9b369f507ca45f7c343cd507a982b35`.
- Checkpoint: [context-attachments-checkpoint.md](../../testing/loginom-ai-agent/context-attachments-checkpoint.md).
