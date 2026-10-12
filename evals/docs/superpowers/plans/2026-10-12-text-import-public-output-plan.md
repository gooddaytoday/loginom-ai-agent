# Public output compatibility repair

**Goal:** связывать raw checkpoint с public user-v1 по точному представлению API.
**Architecture:** локальная чистая проекция плюс неизменённые typed/ownership gates.
**Tech Stack:** Python stdlib, Bun public integration tests.
**Spec:** ../specs/2026-10-12-text-import-public-output-design.md.

- [x] RED: validateNodeAttempt принимает compacted public/native pair и отвергает существенные мутации.
- [x] Минимальная реализация точной output проекции и raw complete/flag guards.
- [x] GREEN: 24 tests / 0 fail, 273 assertions, семь файлов; bun typecheck PASS из evals/.
- [x] Real checkpoint binding/typed replay с hashes: old FAIL, patched PASS, обе таблицы DATA_MATCH; полного warm/cold ACCEPT не заявлять.
- [ ] Commit/publish immutable code SHA и evidence, сохранить checkpoint до 20 строк.
- [ ] Передать один handoff Evaler; без новых Rich/native retries, model smoke или расширения budgets.

Spec review: ACCEPT после уточнения display_text, counts/completeness и preview budget.
Диагностическая Unicode fixture приведена к реальной public schema без поля used.
Исправлены только checker и tests; исходная reference #1 и её FAIL не переписаны.
