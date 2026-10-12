# Public output compatibility repair

**Goal:** связывать raw checkpoint с public user-v1 по точному представлению API.
**Architecture:** локальная чистая проекция плюс неизменённые typed/ownership gates.
**Tech Stack:** Python stdlib, Bun public integration tests.
**Spec:** ../specs/2026-10-12-text-import-public-output-design.md.

- [ ] RED: validateNodeAttempt принимает compacted public/native pair и отвергает существенные мутации.
- [ ] Минимальная реализация точной output проекции и raw complete/flag guards.
- [ ] GREEN, импортная/runner/cold regression группа и bun typecheck из evals/.
- [ ] Real checkpoint binding/typed replay с hashes; полного warm/cold ACCEPT не заявлять.
- [ ] Commit/publish immutable code SHA и evidence, сохранить checkpoint до 20 строк.
- [ ] Передать один handoff Evaler; без новых Rich/native retries, model smoke или расширения budgets.
