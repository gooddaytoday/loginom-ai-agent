# Предложение приёмки: Конечные классы

Критерии ожидают утверждения оркестратором перед этапом 1. Обработчика ещё нет.
В native discovery все ячейки трёх портов совпали с oracle; это не модельный PASS.
Модель видит только task и data/, без oracle, expected, схемы и справочных proposals.

| Предлагаемый case | Task | Входы модели | Expected |
|---|---|---|---|
| coarse-classes-train | task.md | train.csv | expected.json |
| coarse-classes-apply | task-apply.md | train.csv, holdout.csv | expected-apply.json |

Оба case начинаются с нового чата, профиля и пакета; apply сам создаёт модель на
train, затем заменяет источник того же импорта и применяет тот же узел.
Не зависеть от пакета предыдущего прогона. У исполнителя и независимого проверяющего
для каждого case требуется ≥2 PASS из 3 на одном опубликованном SHA, с Save,
CSV, cold и штатными cleanup; это будущая приёмка, здесь она не запущена.

Генерация из корня:

```sh
python3 docs/node-development/nodes/preprocessing-coarseclasses/acceptance/oracle.py
python3 docs/node-development/nodes/preprocessing-coarseclasses/acceptance/oracle.py --case apply
node docs/node-development/nodes/preprocessing-coarseclasses/acceptance/schema-size.mjs
```

Oracle использует только authored fixtures и Python stdlib csv/Decimal, 50 знаков.
WoE = ln((non-events_i / all_non-events) / (events_i / all_events)); IV_i —
разность этих нормированных долей, умноженная на WoE; общий IV — сумма.
Классы упорядочены по WoE; для этого нет tie. A: 2/8; B: 8/2, итог 10/10.
Независимый аналитический cross-check: общий IV = 1.2 * ln(4).

Ожидания: B=0, A=1; WoE ±ln(4), class IV=0.6*ln(4), total IV=1.2*ln(4).
Holdout имеет все NULL в Target: обучение на нём не должно давать успешную
модель; прежние 10/10 и IV на портах 1/2 отличают apply от скрытого refit.
Ожидаемые метки классов `[B]`, `[A]`, значимость «Высокая»; универсальная
классификация низких IV не входит в этот пример.

В каждом expected три output_port 0/1/2, ordered=true и column_order=exact:
train — 20×7, 2×17, 1×9; apply — 3×7, 2×17, 1×9.
Real abs=rel=1e-12; остальные типы, NULL и строки точно. Сравнение точных типов
не заменяется совпадением CSV: Variant NULL и nullable Boolean проверяет cold.
Метки колонок не заданы пользователем — label_any:true. Native имена, ClassMark
и Significance не свободные. NULL маркер ? отличается от пустой строки.

Для регистрации своих сценариев в существующем run-check достаточно source,
prompt, expected_name, input_files, base=None, export_count=3. Task явно называет
rows.csv/classes.csv/significance.csv в порядке портов 0/1/2: раннер извлекает
имена из текста и не добавляет свой fallback-текст для трёх выходов выбросов.
Новая обвязка и изменение общей CSV-проверки не нужны. expected_name позволяет
использовать замороженные ожидания; oracle.py не является CSV-скриптом раннера.
После start выполнить wait одной foreground-командой; параметры модели и 1800 с
не менять. Во время этапа 0 эти сценарии не регистрировать и не запускать.

Отказы до мутации: неизвестные/одинаковые имена input/target, не string/discrete,
не бинарная/NULL цель обучения, отсутствующее событие, пустой/NULL predictor,
нулевые частоты в training-category, неверные проценты/количество, режимы вне
среза, apply без сохранённых классов или с правками/новыми связями.
Неизвестная категория holdout тоже вне среза, требуется объясняющий отказ.
UI max_classes=0 наблюдён с причиной из btnError; остальные формулировки ошибок
пока не приняты. Нет oracle для сглаживания нулей, continuous-разбиения,
manual/external/frozen или новой категории: их нельзя объявить PASS по этой матрице.

Данные/числа/допуски зафиксированы до будущих модельных прогонов. Изменять task
для обхода ошибок модели запрещено; исправления — в обработчике/семантике/навыке.
Размеры — воспроизводимая оценка input-схем/карточки с пустыми pins;
окончательный readback и реальные model-visible bytes измеряются на этапе 1.
