# Подробные аналитические постановки

Парная форма — [analytic-business](../analytic-business/README.md). Процедура приёмки и статусы пар находятся в [плане кампании](../../../docs/superpowers/plans/2026-10-28-analytics-expansion-implementation.md) и [карточках](../../../docs/superpowers/specs/2026-10-28-analytics-expansion-pairs.md).

Команды выполняются из `evals/`. Для live-прогонов заранее экспортируйте pins принятого controller/handoff: CLI, модели, slots/budget, профили и judge home. Используйте существующую подготовленную среду; общий [harness](../../README.md) описывает интерфейс.

Проверка корпуса без модели:

```bash
python3 script/check-calibration-corpus.py --tasks tasks/analytic-detailed
```

Калибровка выбранных разных задач одной коллекции (`TASK_IDS` — ID через запятую, не менее двух для foreign negative):

```bash
bun --no-env-file run src/run.ts --calibrate --tasks tasks/analytic-detailed --only "${TASK_IDS:?Укажите выбранные ID}" --parallel 1
```

Одна измерительная попытка выбранных новых форм:

```bash
bun --no-env-file run src/run.ts --tasks tasks/analytic-detailed --only "${TASK_IDS:?Укажите выбранные ID}" --parallel 1 --repeat 1
```

Перед live-командой учитывайте уже выполненные попытки и незакрытые reservations по каноническому checkpoint. Сохранённые измерения не повторяются ради улучшения оценки. Detailed и business используют одинаковые измерительные и judge pins.
