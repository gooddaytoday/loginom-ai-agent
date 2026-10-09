# [Eval] SERIES: сравнение с принятым baseline

Проект: de16c24b-4121-45c3-9f5a-e16ddabb90e8. Исполнитель: EvalRunner, без squad.
Режим: назначенная карточка, без расписания. Полный запуск — отдельная карточка после приёмки профиля.

- Подтверждение завершения LAB-55 и освобождения стенда: OPERATOR_GATE_RECEIPT.
- Immutable поставка: ABSOLUTE_PATH, source SHA: FULL_SHA, manifest SHA256: HASH.
- Собственный checkout: ABSOLUTE_PATH; clean harness SHA: FULL_SHA; corpus SHA: LAB55_CORPUS_SHA.
- Общий private config v3: ABSOLUTE_PATH, SHA256: HASH; eval.env: ABSOLUTE_PATH.
- CLI: installed ABSOLUTE_BIN, version VERSION, source FULL_SHA, manifest SHA256 HASH, binary SHA256 HASH.
- Продукт model: INHERIT_FROM_ACCEPTED_BASELINE или явное MODEL; reasoning: INHERIT или LEVEL.
- Объявленные изменения: cli/model/reasoning (только перечисленные категории).
- Accepted registry: ABSOLUTE_PATH; ожидаемая серия baseline ID: UUID; decision: OWNER_DECISION.
- Условия: frozen corpus/rubric/oracle/evaluator/judge/limits; operator equivalence proof: FILE/HASH при изменениях роли/путей/harness.
- Приёмка параметров: readinessIssue UUID; два smoke SERIES_DIRS, release receipts и offline replay proof FILE/HASH.
- Полная серия: новый ABSOLUTE_SERIES_DIR, 48×3; текущая карточка UUID и текущий Multica run UUID для admission.
- Доставка: curated archive в этой карточке, download/readback SHA256, после проверки → in_review.

Не выбирать latest. Не повторять измеренные FAIL/timeout/no_artifact. UNKNOWN/infra/failed cleanup
блокируют следующий dispatch. Принятие результата как нового baseline — только отдельное решение владельца.
