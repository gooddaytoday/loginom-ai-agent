# Context attachments checkpoint — 2026-10-08

- База: `f9bf332cc491baa784e6e04fdfda7c0f09151cb7` (PR #32).
- Проверенный код: `6a2720b9a9b369f507ca45f7c343cd507a982b35`.
- Ветка: `loginom`; worktree: `/home/kiselev/.codex/worktrees/context-attachments/loginom-ai-agent`.
- Compaction сохраняет команду отдельно от каждого synthetic preview и ссылки на полные snapshots.
- Обрезанный inline-текст доступен через Read/Grep; original data URL/filename сохранены.
- Cache публикуется атомарно, обновляется под общим lock с cleanup и восстанавливается перед resume из original user file-parts, включая compacted history.
- Recovery использует тот же WHATWG URL parser, что initial prompt; срок хранения остаётся семь дней.
- Из `packages/agent`: семь затронутых suites — 230 pass, 2 existing skip, 0 fail; 737 assertions.
- Финальная типобезопасная редакция concurrency regression отдельно — 1 pass, 0 fail.
- `bun typecheck`, Prettier и `git diff --check`: PASS; independent review: No findings.
- Ограничения: installed Desktop/Loginom и другие ОС не проверены; lock действует внутри процесса.
- Основной checkout `evals` и его незавершённые файлы сохранены; push/merge/release не выполнялись.
- Следующий шаг: review локального коммита владельцем; интеграция и выпуск по отдельной команде.
