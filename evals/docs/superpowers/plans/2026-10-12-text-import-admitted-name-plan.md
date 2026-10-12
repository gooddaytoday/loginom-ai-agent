# Исправление admitted input name

**Goal:** восстановить совместимость warm admission с exact CLI inputStore.

**Architecture:** распознавать две штатные формы имени в существующем
source_bindings, сохранив все data/ownership/lineage gates. Изменения только evals/.

**Tech Stack:** Python stdlib checker, Bun публичные integration tests.

**Spec:** ../specs/2026-10-12-text-import-admitted-name-design.md.

Исполнение в текущем worktree по действующему tdd; дополнительная реализация
продукта и новые модельные попытки не входят в исправление.

## Один проверяемый task

- [x] Добавить regression test validateNodeAttempt: штатное prefixed имя PASS,
  неверные prefix/index/basename/data и duplicate admission FAIL.
- [x] Выполнить RED из evals/: bun test test/text-import-evidence.test.ts --test-name-pattern inputStore.
- [x] Добавить минимальный full-match штатного имени в script/check-text-import.py.
- [x] Повторить тест GREEN и всю text-import/native/cold/corpus/node routing группу.
- [x] Выполнить bun typecheck из evals/; не вызывать live Loginom/модель.
- [x] Проверить реальные доставленные events source admission и оформить offline receipt.
- [x] Сохранить patch commit и checkpoint до 20 строк, исходные бюджеты/ERROR сохраняются.
- [x] Передать reviewable SHA/evidence только после разрешения на сообщение Evaler.
