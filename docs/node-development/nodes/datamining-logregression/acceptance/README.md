# Приёмочный комплект этапа 1 — предложение

Критерии требуют утверждения владельца перед реализацией. Runtime отсутствует;
результатов модельного run-check/cold-check на этапе 0 нет.
Модели передаются **только task.md и data/train.csv**. Вход — синтетический,
его копия совпадает с каноническим `../fixtures/train.csv`.
Oracle, expected, schema, discovery и остальные fixtures модели не передаются.

Предлагаемый сценарий: импорт → бинарный Enter → CSV / Save → cold Execute.
Тип `datamining.log_regression`, режим `enter`, событие yes, порог 0.8,
100% обучения, константа, epsilon=1e-10, X без нормализации, без весов,
регуляризации, валидации и поправки на долю событий.
32 строки / 8 колонок; p=0.1,0.25,0.5,0.75,0.9;
10 прогнозов yes, 22 no; 11 NULL Note. Оба класса представлены при каждом X.
Коэффициенты и сводка переменных исключены из среза; W4 не требуется.

Ожидания `expected.json` используют действующий `expected-outputs.mjs`:
`output_port=0`, `ordered=true`, `column_order=exact`, допуск только вероятности
`abs=1e-8, rel=1e-10`. Имена/типы/IDs/Boolean/NULL точны;
служебные метки, не заданные задачей, проверяются через `label_any`.
Холодная схема: PredictionEvent, PredictionProbability, ActualEvent,
Target_predicted, X, Target, RowID, Note.
Порядок CSV-колонок свободен, имена уникальны; строки в исходном порядке.
CSV-проверка сравнивает каждую ячейку; native типы независимо проверяет cold.

`oracle.py` — Python stdlib: Newton/IRLS плюс рациональная проверка MLE.
Не импортирует Loginom/runtime и не читает actual при вычислении ожиданий.
При передаче actual CSV выполняется только его сравнение с ожиданиями,
которые заново вычисляются из исходных fixtures.

```sh
python3 oracle.py                         # JSON train
python3 oracle.py --holdout               # JSON только для исследования apply
python3 oracle.py --threshold 0.5         # адресная проба равенства порогу
python3 oracle.py --check                 # ожидания и копия модельного входа
python3 oracle.py /path/to/actual.csv     # интерфейс CSV oracle для run-check
node schema-size.mjs                      # измерение, без регистрации runtime
```

`holdout-expected.json` и `threshold-half-expected.json` — отдельные операторские
предложения, не добавленные в главный сценарий. Равенство p=0.5 и порога 0.5
в живой пробе дало событие: правило **p >= threshold**. `../fixtures/null-x.csv` и
`single-class.csv` — небольшие входы для будущих адресных отказов.
Формат всех входов: UTF-8, заголовок, запятая, точка, NULL `?`.
Пустые значения Target в holdout допустимы при Apply, запрещены при Teach;
прогноз не должен молча переобучать модель.

Этап 1 добавляет штатный сценарий run-check с этим комплектом. Существующий
runner уже принимает task.md/expected.json/oracle.py/data через `--cases`;
до регистрации handler запуск заведомо не является приёмкой узла.
Каждый модельный запуск: новая основа / чат / профиль / пакет своей пары,
`openai/gpt-6.1-sol` medium, 1800 с, `start`, затем foreground `wait`.
Для итогового SHA: cold PASS, ≥2/3 у исполнителя и ≥2/3 у независимого
проверяющего на том же SHA; обязательные проверки по путям — по регламенту.

Схема параметров — `parameter-schema.json`, вложение `parameters.logistic`:
все поля обязательны и имеют description. Режим — строковый enum `enter`;
событие — метка категории, а не числовой индекс. Публичные индексы native enum,
W4, новые общие валидаторы и механизмы проверки не предлагаются.
`schema-size.mjs`: production full inputSchema 45 891 → 46 677 Б,
приращение 786 Б; лимит на тип ≤1 050 Б соблюдён, запас общего лимита даёт F2.
