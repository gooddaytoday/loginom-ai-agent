# Два запроса с изменением переменных

Источник утверждён в LAB-820: существующий `https://httpbin.org/anything`.
Проверяется подстановка `limit`/`skip`, не каталог товаров. Никаких ожиданий по
DummyJSON, IP, trace ID или полному ответу нет. Модели передаётся только
`task-rest-variables.md`; fixture/manifest/oracle/expected и discovery ей не передаются.
Fixture — вход независимого oracle; сами значения уже присутствуют в задании.

## Фиксированные результаты

| Шаг | Переменные integer | Итоговые колонки string: limit / skip / url |
|---|---|---|
| initial | 3 / 2 | `3` / `2` / `https://httpbin.org/anything?limit=3&skip=2` |
| updated | 5 / 10 | `5` / `10` / `https://httpbin.org/anything?limit=5&skip=10` |

В каждом CSV ровно одна строка и три колонки в указанном порядке, UTF-8,
запятая, заголовок. Limit и skip берутся из `JSON.parse(Response).args`, url —
из того же Response. Числовые переменные не превращаются в string в собственном
источнике: переход к string для старого REST handler выполняется ниже по графу.

`expected-initial.json` — первая таблица; `expected.json` — конечная таблица и
цель штатного cold-check после сохранения. `{{PACKAGE_PATH}}` заменяется точным
путём новой собственной .lgp, а относительный `export_destination` — фактическим
абсолютным путём соответствующего экспорта, как делает существующий run-check.
Это шаблоны, их нельзя передавать native matcher до подстановки путей.

`run-check` регистрирует комплект как `rest-query-variables`. Main проверяет
initial/updated отдельно по исходным expected и обоим скачанным CSV; cold
использует только `expected.json` и **реально скачанный updated CSV**.
Приватные ожидания runner дополняют шаблоны штатным W1 variable_inventory:
оба integer и связь variables.user → variables.to_table. Журнал проверяет
сохранение source IDs, тот же REST, query bindings и отсутствие перенастройки.
Регистрация сама по себе не доказывает модельную приёмку ≥2/3 + cold.

## Воспроизводимость oracle

Из корня репозитория:

```sh
python3 docs/node-development/variables/acceptance/oracle.py --write
python3 docs/node-development/variables/acceptance/oracle.py --check
python3 docs/node-development/variables/acceptance/oracle.py --case initial --csv /path/to/downloaded-initial.csv
python3 docs/node-development/variables/acceptance/oracle.py --case updated --csv /path/to/downloaded-updated.csv
```

Oracle использует только статический fixture, стандартные `json`, `csv`,
`urllib.parse`, `hashlib`; сети, runtime, Loginom и результатов модели при генерации
ожиданий нет. Manifest фиксирует байты и SHA256 fixture. URL сравнивается целиком:
порядок параметров `limit`, затем `skip` задан fixture и подтверждён native.
Перед модельной приёмкой подготовить новый комплект/ожидание при изменении порядка,
а не нормализовать несовпадение после прогона.

## Что обязательно доказывает этап 1

Табличный oracle проверяет конечный ответ, но не происхождение параметров.
Дополнительно через утверждённый W1 нужны полные native variable readbacks:
initial — два integer 3/2, updated/cold — два integer 5/10, точные имена limit/skip;
метки не заданы пользователем, сравнение через `label_any`. Связи source →
VarToData → преобразование типов → REST проверяются по issued refs и портам.

Из имеющегося журнала/readback сравнить identity REST и подключения, method,
base URL, порядок query-параметров, их field bindings и настройки кодирования
между двумя выполнениями. Между ними разрешено изменить значения источника
переменных и явно запрошенное имя файла экспорта; переопределить запрос константами,
создать второй запрос с другим URL или переписать обработку ответа нельзя.
Сохранение последнего набора и независимый cold-open не заменяют проверку первого CSV.

Typed ожидания переменных формируются приватно из fixture по принятому W1;
исходные expected и oracle остаются неизменными. Новых ключей в табличные
шаблоны не добавлено.
Матрица приёмки: 2/3 модельных PASS на одном SHA, затем независимая приёмка на
том же SHA другой ролью пары; экспорт/Save/cold/cleanup подтверждаются отдельно.

## Что уже проверено

На базе `aa49dc7d88` вручную в Loginom наблюдались оба эхо-ответа, сохранение
переменных/связей и новое выполнение после cold-open (см. discovery и вложения
LAB-820). Задание, fixture и оба expected зафиксированы до этих выполнений.
Полная модельная цепочка со string-конверсией, разбором и двумя экспортами здесь
не запускалась; принятый runtime-handler переменных этой правкой не появляется.

Standalone W1: `variables-user` uses `task-user.md`, `expected-user-initial.json`
and `expected-user.json`. Its oracle is the `variables-user` command in
`scripts/node-acceptance/expected-outputs.mjs`: verified journal snapshots,
values-only patch, stable IDs/types and two independent rereads; no CSV.
Cold uses optional variable_inventory with the production snapshot reader.
