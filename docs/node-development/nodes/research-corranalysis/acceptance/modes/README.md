# Предложение режимов v0.4.0, LAB-1022

Статус: **не утверждено**; expected.json — численная основа предложения,
не готовая инструкция stock runner и не результат native. Только task и CSV
передаются модели, oracle/expected остаются в приёмочной оснастке.

Checkpoint после двух восстановлений: ненулевой лаг и пустой вход не были
исследованы в UI. Их task/expected — заготовки с открытыми соглашениями.
CSV/cold и модельных прогонов нет; живые X/Y были Integer continuous,
будущие задания требуют отдельной проверки Real. См. новый раздел plan.md.

| Задание | Вход | Проверка |
|---|---|---|
| task-ranks.md | fixtures/ranks.csv | совпадающие X; average ranks Spearman и tau-b Kendall |
| task-discrete.md | fixtures/ranks.csv | числовой discrete и string; никакого придуманного кодирования |
| task-cross.md | fixtures/lag.csv | Y[t+1]=X[t] на семи совместных строках; направление native надо подтвердить |
| task-empty.md | fixtures/lag.csv, fixtures/empty.csv | непустой → пустой на том же узле; свежесть, отсутствие старых чисел |

Формат: UTF-8, запятая, десятичная точка, заголовок; RowID Integer,
X/Y Real continuous, Z Integer discrete, Tag String discrete в ranks.csv.
Служебные Z=0 и Tag в lag.csv не выбираются; empty.csv сохраняет ту же схему.
`python3 -B …/acceptance/modes/oracle.py --write` обновляет expected;
`--check` проверяет tied ranks, точную обратную монотонность и лаговый сдвиг.
Oracle — только Python stdlib, Fraction для рангов/сумм; tau-b считает
согласованные/несогласованные пары и односторонние ties отдельно.
У X,Y получены Spearman 0,753702346348183 и tau-b 0,5520524474738834.
Числа вычислены до native/model-run; в пользовательском задании их нет.

Для взаимной корреляции пока явно задан математический кандидат:
при +k сопоставляются X[t],Y[t+k], средние и дисперсии по пересечению.
Это не установленная формула Loginom. Не утверждены диапазон лагов,
знак native, signed/absolute extremum, нормировка и минимальное пересечение.
На ASCII fixture native кодирует Tag лексикографически: high < low < medium,
равноотстоящие ordinal-коды. Это отличается от first-seen low/medium/high;
все три коэффициента совпали с независимым sorted-categories oracle.
Порядок не придумывается моделью. Unicode/case/locale пока вне предложения.
Полные typed `cases.discrete_spearman/discrete_kendall` проверяют X/Z и X/Tag.
Пустой вход должен иметь установленный свежий результат или
понятный отказ; таблица предыдущего входа не считается результатом.

После утверждения — полное произведение наборов, фактические native имена
коэффициентов и типы, точный порядок строк/колонок, abs=1e-8/rel=1e-10,
CSV/Save/cold/cleanup и ≥2/3 + независимые 2/3 на одном SHA. Метки без явного
требования — label_any. Для negative-case не придумывать ошибку заранее.
Сочетание всех четырёх коэффициентов и удаление лишних колонок при переходе
к одному Kendall наблюдены; отдельный cross-only ещё не исследован.
