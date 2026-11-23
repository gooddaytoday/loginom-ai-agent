# Предложение приёмки этапа 1

Ожидает утверждения оркестратором. Handler и сценарии run-check ещё не
зарегистрированы. Здесь нет доказательств CLI/model/cold PASS.

| Предлагаемый сценарий | Task / data | Expected | Выходы |
|---|---|---|---|
| `assnrules-basic` | `task.md`, `data/transactions.csv` | `expected.json` | 0: 4 набора; 1: 2 правила |
| `assnrules-length` | `length/task.md`, `length/data/length.csv` | `length/expected.json` | 0: 6 наборов; 1: 6 правил |

В будущей записи `run-check.py` для обоих можно использовать source этого
каталога (он содержит oracle.py), соответствующие prompt/data/expected_name,
`export_count=2` и свой input_files. Это аддитивная регистрация этапа 1.
Проверку CSV и cold выполнять штатными средствами runner. Ожидаемый маркер
NULL не навязывается: runner привязывает его к настройкам экспорта.

Модель получает только task и соответствующий CSV. Expected, oracle,
manifest, discovery и native результаты ей не передаются. Не добавлять
модельные подсказки в пользовательское задание для обхода отказа handler.

Из корня репозитория:

```sh
python3 docs/node-development/nodes/datamining-assnrules/acceptance/oracle.py --write
python3 docs/node-development/nodes/datamining-assnrules/acceptance/oracle.py --check
node docs/node-development/nodes/datamining-assnrules/fixtures/schema-size.mjs
```

`--write` воспроизводит оба expected и manifest; `--check` сверяет все
артефакты, точные Fraction-вычисления, влияние поддержки/достоверности/длины,
set-семантику дублей и идентичность байтов data/fixtures. Схема и IDs —
наблюдённая discovery-привязка для конкретных данных; численные метрики
рассчитываются независимо из CSV.

Числа и все ячейки 0/1 обоих примеров сверены с native output reader через
существующий `matchesExpectedOutput`, включая типы и NULL. Порт 2 исследован,
но исключён из предложения приёмки: на втором примере native отбирает
подмножество подходящих рекомендаций; общий алгоритм отбора не установлен.
