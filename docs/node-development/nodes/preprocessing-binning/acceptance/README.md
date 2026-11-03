# Предложение приёмки Binning

Все критерии ожидают утверждения владельца; модельных прогонов ещё нет.
Шаблон {{PACKAGE_PATH}} заменяет run-check, только входы data/ передаются модели.
Oracle/expected не входят в её workspace.

| Case oracle | Task | Expected | Входы |
|---|---|---|---|
| count | task.md | expected.json | values.csv |
| width | task-width.md | expected-width.json | real.csv |
| real | task-real.md | expected-real.json | real.csv |
| integer | task-integer.md | expected-integer.json | values.csv |
| frequency | task-frequency.md | expected-frequency.json | frequency.csv |
| frequency-ties | task-frequency-ties.md | expected-frequency-ties.json | frequency-ties.csv |
| apply | task-apply.md | expected-apply.json | frequency.csv, update.csv |
| retrain | task-retrain.md | expected-retrain.json | frequency.csv, update.csv |
| holdout | task-holdout.md | expected-holdout.json | values.csv, holdout.csv |

Из корня checkout:

```sh
python3 docs/node-development/nodes/preprocessing-binning/acceptance/oracle.py --case count
python3 docs/node-development/nodes/preprocessing-binning/acceptance/oracle.py --case frequency
python3 docs/node-development/nodes/preprocessing-binning/acceptance/oracle.py --case apply
```

Иные cases берутся из таблицы. Генератор использует только authored CSV и Decimal.
Принятые математические конвенции: count/width — верхние границы включительно,
первая нижняя тоже; frequency next — нижние включительно, последняя верхняя тоже.
В frequency-фикстурах 6 наблюдений без NULL/3 интервала; rank cuts 0,2,4.
Дубли на разрезе целиком попадают в следующий интервал. Схлопнувшиеся/точечные
интервалы и неделимые размеры не считаются установленными этой матрицей.
Count/width количественные ожидания и ranks frequency заданы до модельной приёмки;
discovery устанавливает формат/конвенции, а не подставляет численные ответы в генератор.
В apply модель от frequency.csv, строки от update.csv; oracle не строит её заново.
В retrain модель и строки от update.csv. Их ожидаемые выходы заведомо различаются.

Все 9 expected фиксируют ordered, exact column order, output_port 0/1, все поля.
Real abs=1e-12, rel=1e-12. X_BinsID/BinsID — строка X; никакой свободы случайного GUID.
Integer, строки, Boolean и NULL сравниваются точно. label_any относится только
к меткам колонок, не к значениям Label. Десятичный разделитель импорта — явная точка, а не «Не задано» локали.
Пределы количества/размера и допустимые
комбинации валидируются в обработчике до мутации; JSON proposal не его реализация.

Адресные отказы этапа 1: count=0 с наблюдённой причиной из btnError; неизвестное
поле/нечисловое поле, нецелое количество, width<=0, lower>=upper, неподдержанный
режим/переменные — отказ до мутации; apply без материализованных интервалов —
отказ с указанием явного обучения. Реальные сообщения, кроме count=0, ещё не приняты.
empty.csv и dates.csv — подготовка следующих наблюдений, не принятые сценарии;
expected для них намеренно нет. Точность и все строки проверяет production reader
с последующим cold-check; native preview discovery не считается PASS.

Этап 1 добавляет собственные сценарии в существующий run-check. Для каждого case
задаются prompt, expected_name, input_files, base=None, export_count=2. После старта
wait одной foreground-командой; параметры модели/лимиты и общая оснастка неизменны.
До реализации/утверждения эти команды не запускать. На одном опубликованном SHA
требуются ≥2 PASS из 3 и затем независимые ≥2/3 с другой парой.

Предлагаемая очередность: сначала count/real и width, затем frequency/ties,
затем сохранённая модель apply/retrain; Integer и holdout — адресная матрица.
Объём можно назначать по этим циклам, не обещая все модельные прогоны в одной
карточке с бюджетом 90 минут. Порог 2/3 не уменьшается из-за размера матрицы.
