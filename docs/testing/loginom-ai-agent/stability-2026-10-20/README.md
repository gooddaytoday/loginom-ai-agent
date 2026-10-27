# Набор стабильности D7 после заморозки 20 октября

Комплект для проверки, сохраняет ли агент бизнес-смысл при свободной формулировке
и переносит ли навыки на другие задачи. Срок поставки — 19.10.2026 18:00 PT;
использование — после заморозки 20.10.2026 00:00 PT, перед показом 22.10.
Назначение и приёмка: [plan.md](plan.md), [acceptance/task.md](acceptance/task.md).
Основа D1 — `343d8cdecdc07d47b8dbff6db3d530b0ac1a4aa1`, ветка поставки
`demo-stability-set`, PR в `demo-022`.

## Запуск регрессии

[`run-check`](../../../../scripts/node-acceptance/run-check.md) принимает n1–n20,
p1–p25, q1–q10, r1–r6, s1–s8 и перефразировки v1s1–v3s6.
Перефразировки используют данные и oracle исходного демо; продолжения запускают
документированную базу в том же чате и пакете. Для n14–n17 добавлены отдельные
cold JSON-эталоны по независимым `expected/reference.csv`; CSV-oracle остаются
обязательными. p14 получает XLSX. Запускайте с `--cold`, затем соберите результат
командой `wait` до завершения задачи.

## Покрытие

Дополнение LAB-118: [n13–n20 и условия приёмки](n13-n20-plan.md),
[операторское назначение](acceptance/n13-n20/task.md).
Восемь коротких просьб: Кросс-таблица, Join по двум ключам, Union с разными
колонками, даты и строки, сортировка по двум полям, JavaScript, одна
кластеризация и одна линейная регрессия; REST отсутствует.
В каждой папке — `prompt.md`, `data/`, `oracle.py`, `expected/`, README.
Эти oracle принимают **путь к фактическому CSV экспорта**, в отличие от n1–n12,
где oracle генерирует JSON-ожидания. Эталоны pandas и отрицательные контроли:
`acceptance/n13-n20/reference.py`; генератор: `acceptance/n13-n20/generate.py`.
Ветка `stability-n13`, PR в `demo-022`. Поставка статическая,
модельные/native/cold-check прогоны не входят в неё.

Дополнение D7b (LAB-98): [подплан n7–n12](v2-plan.md),
[операторское назначение](acceptance/v2/task.md). Задачи n7–n12, синтетические CSV,
генераторы с seed, независимые oracle и эталоны входят в статическую поставку.
Ветка `tmp/stability-v2`, PR #138 в `demo-022`; срок — 19.10.2026 06:00 PT.
Модельные прогоны, native и cold-check этой поставкой не подтверждены.

Дополнение D7d (LAB-100): [подплан p1–p8](short-plan.md),
[операторское назначение](acceptance/short/task.md). Восемь коротких просьб,
CSV с генераторами и seed, независимые oracle и expected готовы;
[покрытие и воспроизведение p1–p8](#d7d-короткие-просьбы-p1-p8).
Ветка `tmp/stability-short`, [PR #140](https://github.com/gooddaytoday/loginom-ai-agent/pull/140)
в `demo-022`, срок — 19.10.2026 08:00 PT. Поставка только статическая,
без модельных/native/cold-check прогонов; независимая приёмка — Ловец.

Дополнение D7f (LAB-115): [подплан p9–p16](short-plan.md#d7f-p9-p16-lab-115),
[назначение](acceptance/short/task.md#d7f-lab-115),
[checkpoint](p9-p16-checkpoint.md). Две кластеризации, две регрессии, HTTP,
Excel и две смешанные короткие просьбы; [покрытие и команды](#d7f-короткие-просьбы-p9-p16).
Ветка `audience-wave2` от `04da034ea1cd4ad7843ca9c7cf50b1ef146806ed`,
один docs PR в `demo-022`, срок — 19.10.2026 10:00 PT.
Генератор готовит сам, независимая статическая приёмка — Ловец-3;
модельные/native/cold-check прогоны не входят в поставку.

В строках s1–s6 каждый из трёх вариантов использует одни и те же исходные CSV и
демо-ожидания D1. Копий данных, oracle и эталонов D1 здесь нет. В n1–n6 — новые
бизнес-вопросы, входы и самостоятельные расчёты. Все девять узлов показа покрыты;
сочетания n1–n6 отличаются и от D1, и друг от друга. Импорт и экспорт подразумеваются
в каждой строке. Это ожидаемые сочетания, а не подсказки для модели.

| Сценарий | Узлы | Вариант | Входы | Эталон |
|---|---|---|---|---|
| [s1-revenue](s1-revenue/) | Калькулятор → Группировка → Сортировка | [v1](s1-revenue/prompt-v1.md), [v2](s1-revenue/prompt-v2.md), [v3](s1-revenue/prompt-v3.md) | [data](../demo-2026-10-22/s1-revenue/data/) | [expected](../demo-2026-10-22/s1-revenue/expected-demo.json) |
| [s2-customers](s2-customers/) | Замена → Параметры полей → Фильтр | [v1](s2-customers/prompt-v1.md), [v2](s2-customers/prompt-v2.md), [v3](s2-customers/prompt-v3.md) | [data](../demo-2026-10-22/s2-customers/data/) | [expected](../demo-2026-10-22/s2-customers/expected-demo.json) |
| [s3-reconcile](s3-reconcile/) | Слияние → Калькулятор → Фильтр | [v1](s3-reconcile/prompt-v1.md), [v2](s3-reconcile/prompt-v2.md), [v3](s3-reconcile/prompt-v3.md) | [data](../demo-2026-10-22/s3-reconcile/data/) | [expected](../demo-2026-10-22/s3-reconcile/expected-demo.json) |
| [s4-branches](s4-branches/) | Объединение → Группировка → Сортировка | [v1](s4-branches/prompt-v1.md), [v2](s4-branches/prompt-v2.md), [v3](s4-branches/prompt-v3.md) | [data](../demo-2026-10-22/s4-branches/data/) | [expected](../demo-2026-10-22/s4-branches/expected-demo.json) |
| [s5-pivot](s5-pivot/) | Кросс-таблица → Параметры полей | [v1](s5-pivot/prompt-v1.md), [v2](s5-pivot/prompt-v2.md), [v3](s5-pivot/prompt-v3.md) | [data](../demo-2026-10-22/s5-pivot/data/) | [expected](../demo-2026-10-22/s5-pivot/expected-demo.json) |
| [s6-abc](s6-abc/) | Сортировка → Калькулятор → Группировка | [v1](s6-abc/prompt-v1.md), [v2](s6-abc/prompt-v2.md), [v3](s6-abc/prompt-v3.md) | [data](../demo-2026-10-22/s6-abc/data/) | [expected](../demo-2026-10-22/s6-abc/expected-demo.json) |
| [n1: дефицит запасов](n1/) | Группировка → Слияние → Калькулятор → Фильтр → Сортировка | [prompt](n1/prompt.md) | [requests](n1/data/requests.csv), [stock](n1/data/stock.csv) | [expected](n1/expected-demo.json) |
| [n2: выплаты курьерам](n2/) | Объединение → Фильтр → Калькулятор → Группировка → Сортировка | [prompt](n2/prompt.md) | [morning](n2/data/morning.csv), [evening](n2/data/evening.csv) | [expected](n2/expected-demo.json) |
| [n3: тарифы доставки](n3/) | Замена → Параметры полей → Калькулятор → Сортировка | [prompt](n3/prompt.md) | [tariffs](n3/data/tariffs.csv) | [expected](n3/expected-demo.json) |
| [n4: коммунальные расходы](n4/) | Слияние → Калькулятор → Кросс-таблица → Параметры полей | [prompt](n4/prompt.md) | [readings](n4/data/readings.csv), [rates](n4/data/rates.csv) | [expected](n4/expected-demo.json) |
| [n5: простои](n5/) | Фильтр → Группировка → Сортировка → Параметры полей | [prompt](n5/prompt.md) | [incidents](n5/data/incidents.csv) | [expected](n5/expected-demo.json) |
| [n6: обучение](n6/) | Замена → Фильтр → Калькулятор → Кросс-таблица → Параметры полей | [prompt](n6/prompt.md) | [enrollments](n6/data/enrollments.csv) | [expected](n6/expected-demo.json) |
| [n7: пункты выдачи](n7/) | Кластеризация (2 группы, 2 признака) → Группировка | [prompt](n7/prompt.md) | [pickup](n7/data/pickup.csv) | [expected](n7/expected-demo.json) |
| [n8: режимы стенда](n8/) | Кластеризация (3 группы, 3 признака) → Группировка | [prompt](n8/prompt.md) | [bench](n8/data/bench.csv) | [expected](n8/expected-demo.json) |
| [n9: упаковка](n9/) | Линейная регрессия (1 признак) | [prompt](n9/prompt.md) | [packing](n9/data/packing.csv) | [expected](n9/expected-demo.json) |
| [n10: энергия](n10/) | Линейная регрессия (2 признака) | [prompt](n10/prompt.md) | [energy](n10/data/energy.csv) | [expected](n10/expected-demo.json) |
| [n11: HTTP-отражение](n11/) | REST-запрос → извлечение стабильных полей | [prompt](n11/prompt.md) | [requests](n11/data/requests.csv) | [expected](n11/expected-demo.json) |
| [n12: чистый расход](n12/) | Фильтр → Калькулятор → Линейная регрессия → Экспорт | [prompt](n12/prompt.md) | [batches](n12/data/batches.csv) | [expected](n12/expected-demo.json) |
| [p25: импорт без метки → Кросс-таблица](p25/README.md) | Импорт → Кросс-таблица → Экспорт; регрессия D83 | [prompt](p25/prompt.md) | [sales](p25/data/sales.csv) | [expected](p25/expected-demo.json) |

## Смысл перефразировок

Все 18 просьб вручную сопоставлены с исходными `prompt-demo.md` из D1. Меняются
длина, порядок требований и тон: от короткого заказа результата до разговорной
просьбы с пояснениями. Названия файлов, порядок колонок и бизнес-условия сохранены.
Названий узлов, инструментов и указаний о способе построения в просьбах нет.

| Семейство | Сохраняемые условия всех трёх вариантов |
|---|---|
| s1 | Октябрь; количество × цена; отрицательное количество — возврат; регион × категория; убывание выручки; Region, Category, Revenue; revenue.csv; сохранение |
| s2 | Только активные; все девять точных замен кодов; числовой CreditLimit; исходный порядок клиентов; Code, Name, CreditLimit, Status; customers-clean.csv; сохранение |
| s3 | Сопоставление по OrderID; нет оплаты → 0; долг = заказ − оплата; только долг > 0; исходный порядок заказов; OrderID, Customer, OrderAmount, PaidAmount, Debt; debts.csv; сохранение |
| s4 | Все строки north/south/central; сумма по филиалу × категории; убывание выручки; Branch, Category, Revenue; branches.csv; сохранение |
| s5 | Регионы по строкам; суммы Amount для Офис/Склад/Техника; Region, Office, Warehouse, Tech; pivot.csv; сохранение; порядок строк свободный |
| s6 | ABC по выручке; A — 80%, B — следующие 15%, C — остаток; пересекающий границу товар уже в следующем классе; число товаров и выручка классов; ABCClass, Products, Revenue; abc.csv; сохранение; порядок классов свободный |

## Воспроизведение без модели

Требуются Python 3 (только стандартная библиотека) и Bun либо Node.js с поддержкой
ES-модулей. Команды ниже выполняются из корня репозитория; примеры временных JSON
не добавлять в Git. Новые oracle читают только свои CSV относительно `__file__`,
не читают expected, пакеты Loginom или результаты модели. Денежная арифметика —
`Decimal`, без промежуточного округления. Все дробные входы и результаты n1–n6
точно представимы в binary64; допуски не нужны.

Проверить один oracle, в том числе из другого текущего каталога:

```sh
D7_CASE=docs/testing/loginom-ai-agent/stability-2026-10-20/n1
python3 -B "$D7_CASE/oracle.py" > ./d7-rebuilt.json
cmp "$D7_CASE/expected-demo.json" ./d7-rebuilt.json
D7_ABS=$(realpath "$D7_CASE")
(cd / && python3 -B "$D7_ABS/oracle.py") > ./d7-other-cwd.json
cmp "$D7_CASE/expected-demo.json" ./d7-other-cwd.json
```

Повторить для n2–n12. В n7–n12 также есть генератор; из корня репозитория
проверить, что повторная генерация не меняет зафиксированные CSV:

```sh
for i in 7 8 9 10 11 12; do
  D7_CASE=docs/testing/loginom-ai-agent/stability-2026-10-20/n$i
  python3 -B "$D7_CASE/generate.py"
  git diff --exit-code -- "$D7_CASE/data" || exit 1
done
```

Проверить формат всех 18 используемых демо-эталонов (6 D1 и 12 новых D7/D7b)
существующей функцией (простой запуск модуля ничего не валидирует):

```sh
bun --input-type=module - <<'JS'
import { readFileSync, readdirSync } from "node:fs";
import { parseExpectedOutputs } from "./scripts/node-acceptance/expected-outputs.mjs";
for (const base of ["demo-2026-10-22", "stability-2026-10-20"]) {
  const root = `docs/testing/loginom-ai-agent/${base}`;
  const cases = readdirSync(root).filter(name =>
    base.startsWith("demo") ? /^s[1-6]-/.test(name) : /^n([1-9]|1[0-2])$/.test(name));
  for (const name of cases) {
    parseExpectedOutputs(JSON.parse(readFileSync(`${root}/${name}/expected-demo.json`, "utf8")));
    console.log(`${name}: PASS`);
  }
}
JS
```

Bun можно заменить на `node --input-type=module -`. Для n1–n6 `output_node_type`
равен `export_input`; `column_order: exact` фиксирует порядок колонок.
`ordered: true` у n1/n2/n3/n5; у n4/n6 — `false`, по бизнес-просьбе.
`nodes` проверяет наличие основных типов, не топологию и не число повторений.
Имена и подписи итоговых полей совпадают. Эталоны покрывают все итоговые строки.
CSV: UTF-8 без BOM, заголовок, запятая, точка в числах, 6–20 строк данных,
синтетические идентификаторы без персональных данных.

Для n7–n12 все CSV имеют 10–40 строк (фактически 12–24), генераторы с seed
используют стандартную библиотеку Python. Допуски real: abs=1e-8, rel=1e-10.
Кластеры n7/n8 сравниваются как неупорядоченный набор размеров и средних,
без номеров групп. Регрессии n9/n10/n12 проверяют и прогнозы, и коэффициенты
на выходе 1; oracle решает МНК в `Fraction` и проверяет полный ранг.
REST n11 содержит только отражённые коды, метод и HTTP-статус; подписи,
не заданные просьбой, имеют `label_any: true`. Его oracle не использует сеть.
Все детали схем, единиц, порядка, допусков и условий — в README каждой задачи.

## Будущие прогоны после заморозки

Сейчас модель, native и cold-check не запускаются. Подготовка D7 не требует
аккаунтов, сборки приложения или сеансов Loginom. Следующие шаги выполняет
оператор будущего прогона по [инструкции D1](../demo-2026-10-22/README.md#проведение-показа).

1. Выбрать ровно один prompt (s*/prompt-vN.md или n*/prompt.md) и только указанные
   в таблице CSV. Выделить новый личный путь пакета и отдельный профиль на попытку.
   README, plan, oracle, expected и весь каталог целиком модели не передавать.
2. До запуска сформировать отдельный expected для точного личного пути пакета.
   Для n1–n12 oracle меняет только `package_path`:

   ```sh
   D7_CASE=docs/testing/loginom-ai-agent/stability-2026-10-20/n1
   python3 -B "$D7_CASE/oracle.py" '/<username>/d7-n1-<run-id>.lgp' > ./d7-run-expected.json
   ```

   Для s1–s6 взять исходный `expected-demo.json` из таблицы, изменив только
   `package_path` в отдельном файле. Исходный D1 oracle выдаёт проверочный вариант
   expected с другими `nodes` и селектором выхода, поэтому его stdout не подменяет
   демо-эталон напрямую:

   ```sh
   python3 -B - 'docs/testing/loginom-ai-agent/demo-2026-10-22/s1-revenue/expected-demo.json' '/<username>/d7-s1-v1-<run-id>.lgp' > ./d7-run-expected.json <<'PY'
   import json, sys
   from pathlib import Path
   expected = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
   expected['package_path'] = sys.argv[2]
   print(json.dumps(expected, ensure_ascii=False, indent=2))
   PY
   ```

   `/stability-2026-10-20/n*.lgp` и пути D1 в сохранённых эталонах — только примеры.
   Экспортированный CSV и сохранение пакета запрашиваются бизнес-просьбой;
   конкретный личный путь пакета задаётся оператором в окружении прогона.
3. Передать в Desktop/CLI выбранную просьбу и CSV; построить, выполнить и сохранить
   сценарий. Режим показа: `openai/gpt-6.1-sol/medium`, предел 1800 с. Не передавать
   ожидаемые ответы или техническую цепочку модели. Каждый вариант — отдельный
   независимый прогон, всего 30: 18 перефразировок + 12 новых задач.
4. Запустить существующий `scripts/node-acceptance/cold-check.mjs` с `--expected`
   этого прогона и своими `--config`, `--resources`, `--saved`, `--output` по D1.
   Проверить имена, типы и порядок колонок; у исходных D1 эталонов нет
   `column_order: exact`, поэтому порядок колонок дополнительно просмотреть в
   итоговом отчёте. `export_input` проверяет данные перед экспортом; байты CSV
   cold-check сам не сравнивает. Выгрузку и факт сохранения проверять в прогоне.
5. Отмечать результат отдельно для каждого варианта: сценарий/вариант, SHA
   кандидата, путь пакета, успех/отказ и cold-check. Неудачную или UNKNOWN попытку
   повторять в новом пакете и профиле по правилам сквада. D7 не задаёт новых
   критериев качества продукта и не объявляет статическую проверку PASS исполнения.

## Результат подготовки 18.10.2026

18/18 перефразировок сопоставлены с исходными условиями. Шесть новых полных задач,
9 новых CSV (6–12 строк данных каждый), 6/6 oracle воспроизводят сохранённые
ожидания побайтно; проверены другой текущий каталог и смена только `package_path`.
Проверены типы значений, точность дробей, контрольные суммы и порядок строк,
описанные в README каждой задачи. 12/12 демо-эталонов приняты вызовом
`parseExpectedOutputs`; относительные ссылки и границы diff проверены.
Это статическая проверка документов, входов и расчётов. Модельные прогоны,
построение графов, экспорт, сохранение и cold-check в Loginom не выполнялись.

## Дополнение D7b 18.10.2026

n7–n12: шесть полных задач, 6 CSV (14/21/16/20/12/24 строки), 6 генераторов с
фиксированными seed и 6 независимых oracle. Повторная генерация воспроизводит CSV;
6/6 oracle воспроизводят expected побайтно, в том числе из другого текущего
каталога; личный путь меняет только `package_path`. 6/6 новых эталонов приняты
реальным вызовом `parseExpectedOutputs` (весь набор: 18/18). Относительные ссылки
и границы diff проверены, готовые s1–s6 и n1–n6 сохранены.
Это только статическая поставка: доступность httpbin, успешное обучение в Loginom,
модельные прогоны, экспорт, сохранение и cold-check не проверялись.

## D7d: короткие просьбы p1-p8

Каждая просьба — две разговорные фразы, без названий узлов и инструкций об
инструментах. Области отличаются от s1–s6/n1–n12. В каждой папке находятся
`prompt.md`, `data/*.csv`, `generate.py`, `oracle.py`, `expected-demo.json`
и README со схемой, единицами и допустимыми вариантами. Всего 9 CSV,
12–18 строк данных в каждом; seed 2201–2208. В p4, p6, p8 предполагаются
два последовательных шага обработки, без учёта импорта и экспорта.

Таблица отражает статический расчёт, не результат исполнения в Loginom.
Сочетания узлов — описание покрытия для оператора; expected не навязывает
конкретный граф, проверяет только импорт/экспорт и итог на входе экспорта.

| Задача | Бизнес-смысл / обработка | Проверенный результат oracle | Допустимая свобода |
|---|---|---|---|
| [p1](p1/): библиотека | Просрочка > 7 дней / Фильтр | 7 книг; 7 исключено, 8 включено | Метки, колонки, строки |
| [p2](p2/): астрофотография | Ранжирование по Blur / Сортировка | 16 кадров; Blur от 0.25 до 4.00 по возрастанию | Метки, колонки; строки упорядочены |
| [p3](p3/): музей | Посещения залов / Группировка | Ancient 102, Modern 122, Nature 83 | Метки, колонки, строки; Hall/Visits заданы просьбой |
| [p4](p4/): виноградник | Зрелые пробы / Фильтр → Сортировка | 10 проб; Sugar ≥ 22, Acidity по возрастанию | Метки, колонки; строки упорядочены |
| [p5](p5/): приют | Расшифровка статусов / Замена | 16 животных; по 4 каждого состояния, Hold сохранён | Метки, колонки, строки |
| [p6](p6/): театр | Свободные места / Калькулятор → Фильтр | 10 спектаклей, всего 104 места; 6 полных исключены | Метки, колонки, строки; FreeSeats задано просьбой |
| [p7](p7/): археология | Материалы находок / Слияние | 18 находок, 12 материалов, без потерь/размножения | Метки, колонки, строки; inner/left эквивалентны на этих данных |
| [p8](p8/): орнитология | Наблюдения в штиль / Фильтр → Группировка | Gull 20, Heron 20, Tern 22; только calm | Метки, колонки, строки; Species/Count заданы просьбой |

Имена исходных полей сохраняются по просьбам; новые итоговые имена заданы
явно короткими фразами. Во всех expected `column_order: any` и у всех полей
`label_any: true`; это свобода подписи, а не имени. Только p2/p4 имеют
`ordered: true`, поскольку порядок прямо запрошен; равных ключей у них нет.
Все остальные строки сравниваются как мультимножество. Исходные целые
счётчики и разность FreeSeats в p6 — `integer`, дробные измерения — `real`,
текст — `string`. Итоговые суммы Visits в p3 и Count в p8 — `real`, тип
суммы Группировки Loginom по умолчанию, подтверждённый P1 (LAB-93,
кандидат `7a3a3da7`): значения верны, а прежний `integer` дал два FAIL
только по типу. Просьбы p3/p8 тип не задают; приведение итоговой суммы
к `integer` модель должна задавать только по явной просьбе пользователя.
В остальных p-задачах сумм Группировки нет; их типы сохранены.
Все числа точно представимы в binary64, приближений нет.

Текущий `scripts/node-acceptance/expected-outputs.mjs` не поддерживает
свободу числового типа: `matchesExpectedOutput` требует совпадения типа
схемы, `matchesCell` — типа ячейки; `variant` также фиксирует подтип.
`label_any`, `column_order` и числовой `tolerance` этого не меняют.
Свобода `integer`/`real` не заявляется проверенной. Эквивалентное число
другого типа требует операторского разбора; новых механизмов сравнения нет.

В просьбах заданы имена файлов экспорта. `/stability-2026-10-20/` в
`export_destination` — папка окружения будущего прогона: оператор задаёт её
до передачи просьбы, отдельно от бизнес-содержания. В другой личной папке
оператор адаптирует окружение и служебный каталог в копии expected, сохраняя
имя файла и бизнес-результат. Путь пакета также задаёт оператор. Аргумент
oracle меняет **только** `package_path`, не `export_destination`.

Из корня репозитория проверить все генераторы и oracle, включая независимость
от текущего каталога и смену только пути пакета (без временных JSON на диске):

```sh
python3 -B - <<'PY'
from pathlib import Path
import json
import subprocess
import sys
root = Path('docs/testing/loginom-ai-agent/stability-2026-10-20').resolve()
for number in range(1, 9):
    case = root / f'p{number}'
    before = {p: p.read_bytes() for p in (case / 'data').glob('*.csv')}
    subprocess.run([sys.executable, '-B', str(case / 'generate.py')], cwd=root.parent, check=True)
    after = {p: p.read_bytes() for p in (case / 'data').glob('*.csv')}
    assert before == after
    expected = (case / 'expected-demo.json').read_bytes()
    for cwd in (case, root.parent):
        actual = subprocess.check_output([sys.executable, '-B', str(case / 'oracle.py')], cwd=cwd)
        assert actual == expected
    changed = json.loads(subprocess.check_output([
        sys.executable, '-B', str(case / 'oracle.py'), '/operator/short-run.lgp'
    ], cwd=root.parent))
    original = json.loads(expected)
    assert changed.pop('package_path') == '/operator/short-run.lgp'
    original.pop('package_path')
    assert changed == original
    print(f'{case.name}: generator, oracle bytes (2 cwd), package-only change PASS')
PY
```

Проверить реальным вызовом существующего парсера все восемь expected
(Bun можно использовать вместо Node.js):

```sh
node --input-type=module - <<'JS'
import { readFileSync } from 'node:fs';
import { parseExpectedOutputs } from './scripts/node-acceptance/expected-outputs.mjs';
const root = 'docs/testing/loginom-ai-agent/stability-2026-10-20';
for (let i = 1; i <= 8; i++) {
  parseExpectedOutputs(JSON.parse(readFileSync(`${root}/p${i}/expected-demo.json`, 'utf8')));
  console.log(`p${i}: parseExpectedOutputs PASS`);
}
JS
```

Будущей модели передаются только `pN/prompt.md` и его CSV, не README,
expected, oracle, генератор или подплан. Сценарий, выгрузка, сохранение и
cold-check требуют отдельного живого прогона; успешный разбор JSON их
не подтверждает. `export_input` проверяет таблицу перед экспортом, а не
байты выгруженного файла. Статическая приёмка Ловца проводится на точном
опубликованном SHA PR #140; она не является PASS исполнения модели.

Статически проверено: генераторы 8/8 побайтно, oracle 8/8 побайтно из двух
текущих каталогов, смена только `package_path` 8/8, реальные вызовы
`parseExpectedOutputs` 8/8. Результаты всех восьми расчётов дополнительно
сопоставлены с независимыми SQL-запросами в SQLite по тем же CSV;
144 локальные ссылки и якоря комплекта, формат CSV и `git diff --check` — PASS.

## D7f: короткие просьбы p9-p16

Каждой будущей модели передаются только две фразы `prompt.md` и входные данные.
Для p14 — XLSX, без операторской CSV-копии. README, генераторы, oracle,
expected и подплан остаются у оператора. Ожидаемые сочетания ниже — покрытие,
не обязательная топология графа; подготовку и итог можно выполнить эквивалентно.

| Задача | Покрытие | Данные → результат | Допустимая свобода |
|---|---|---|---|
| [p9](p9/): клиенты | Кластеризация → сводка | 14 клиентов → две группы по 5/9, средние Visits/Spend | Метки, порядок строк/колонок, номера групп |
| [p10](p10/): магазины | Кластеризация → сводка | 18 магазинов → три группы по 5/7/6, средние Footfall/Basket | Метки, порядок строк/колонок, номера групп |
| [p11](p11/): рассада | Линейная регрессия | 16 наблюдений → Height от Light, 16 прогнозов | Метки, порядок строк/колонок; схема коэффициентов не задана |
| [p12](p12/): панели | Линейная регрессия | 18 измерений → Loss от Thickness, 18 прогнозов | Метки, порядок строк/колонок; схема коэффициентов не задана |
| [p13](p13/): маршруты | REST-запрос → стабильные поля | 12 пар → отражённые Code/Route, Method=GET, HTTP 200 | Метки, порядок строк/колонок; без IP/времени/заголовков |
| [p14](p14/): экспонаты | Импорт Excel | 15 строк первого листа → Id integer, Gallery string, Weight real | Метки, порядок строк/колонок; имена/типы заданы просьбой |
| [p15](p15/): ульи | Фильтр → Кластеризация → Группировка | 18 строк → 14 summer → две группы 6/8, среднее и сумма | Метки, порядок строк/колонок, номера групп; TotalPollen real |
| [p16](p16/): датчики | Фильтр → Калькулятор → Линейная регрессия | 20 строк → 16 work → Net и прогноз PredictedNet | Метки, порядок строк/колонок; промежуточные имена свободны |

Seed 2209–2216; все CSV — 10–40 строк, UTF-8 без BOM, запятая, LF.
Генератор p14 воспроизводит и CSV-копию, и XLSX, включая timestamps ZIP.
Oracle p14 читает именно XLSX, остальные — свои CSV, без сети/expected/модели.
Кластеры проверяются без номеров по размерам и средним/сумме, с устойчивостью
к исходному масштабу, нормированию диапазоном и z-score. Прогнозы вычисляются
МНК со свободным членом по всем указанным строкам; ненулевые остатки исключают
подстановку точной генерирующей прямой. Прогнозы на разных X определяют зависимость,
поэтому отдельная неоговорённая таблица коэффициентов не фиксируется.
HTTP-эталон — контракт успешного ответа [httpbin](https://httpbin.org/),
не свидетельство доступности сервиса или выполнения запросов.

Все новые expected имеют `label_any: true`, `column_order: any`, `ordered: false`.
Имена полей взяты из просьб и входных заголовков; `label_any` освобождает только
подписи. Real сравниваются с допуском `max(1e-8, 1e-10 × |expected|)`;
счётчики — integer, сумма Группировки TotalPollen — real. Matcher не выражает
свободу числового типа: численно равный иной тип требует операторского разбора.
Имена узлов, промежуточные поля и метки кластеров не зажаты эталоном.

Во всех просьбах задано имя экспорта. `/stability-2026-10-20/` в expected —
заранее объявленная оператором папка окружения будущего запуска; в другом
окружении её меняют в копии expected, сохраняя имя файла. Аргумент oracle
меняет только `package_path`, не `export_destination`.

Для генератора p14 установить `python3 -m pip install -r docs/testing/loginom-ai-agent/stability-2026-10-20/p14/requirements.txt`.
Oracle по-прежнему использует только стандартную библиотеку.

Проверить из корня репозитория все входы и oracle из двух cwd:

```sh
python3 -B - <<'PY'
from pathlib import Path
import csv
import json
import subprocess
import sys
repo = Path.cwd()
root = repo / 'docs/testing/loginom-ai-agent/stability-2026-10-20'
for number in range(9, 17):
    case = root / f'p{number}'
    before = {p.name: p.read_bytes() for p in (case / 'data').iterdir()}
    for cwd in (case, repo):
        subprocess.run([sys.executable, '-B', str(case / 'generate.py')], cwd=cwd, check=True)
        assert before == {p.name: p.read_bytes() for p in (case / 'data').iterdir()}
        actual = subprocess.check_output([sys.executable, '-B', str(case / 'oracle.py')], cwd=cwd)
        assert actual == (case / 'expected-demo.json').read_bytes()
    for path in (case / 'data').glob('*.csv'):
        content = path.read_bytes()
        assert not content.startswith(b'\xef\xbb\xbf') and b'\r' not in content
        with path.open(encoding='utf-8', newline='') as stream:
            assert 10 <= len(list(csv.DictReader(stream))) <= 40
    changed = json.loads(subprocess.check_output([
        sys.executable, '-B', str(case / 'oracle.py'), '/operator/d7f-run.lgp'
    ], cwd=repo))
    original = json.loads((case / 'expected-demo.json').read_text(encoding='utf-8'))
    assert changed.pop('package_path') == '/operator/d7f-run.lgp'
    original.pop('package_path')
    assert changed == original
    print(f'{case.name}: inputs, oracle bytes (2 cwd), package-only change PASS')
PY
```

Реальный вызов существующего парсера (Node.js или Bun):

```sh
node --input-type=module - <<'JS'
import { readFileSync } from 'node:fs';
import { parseExpectedOutputs } from './scripts/node-acceptance/expected-outputs.mjs';
const root = 'docs/testing/loginom-ai-agent/stability-2026-10-20';
for (let i = 9; i <= 16; i++) {
  parseExpectedOutputs(JSON.parse(readFileSync(`${root}/p${i}/expected-demo.json`, 'utf8')));
  console.log(`p${i}: parseExpectedOutputs PASS`);
}
JS
```

Проверено: генераторы/входы 8/8 побайтно, oracle 8/8 побайтно из двух cwd,
смена только `package_path` 8/8, реальный `parseExpectedOutputs` 8/8.
Сводки p9/p10/p15 совпали с независимым перебором разбиений с минимальной
суммой квадратов расстояний; прогнозы p11/p12/p16 — с решением нормальных
уравнений по исходным суммам SQLite. Книга p14 прочитана независимым
SheetJS 0.18.5: первый лист Exhibits, все 15 строк и типы ячеек совпали.
Две фразы каждого prompt, 188 локальных ссылок/якорей и `git diff --check` — PASS.
Эти проверки не доказывают выполнение модели, доставку XLSX, происхождение HTTP,
сохранение, экспорт или cold-check; их PASS здесь не заявляется.

## LAB-119: короткие варианты p17-p24

Восемь просьб для тех же s1–s8 на базе `demo-022` @
`9f2d305e32e841d206bf8d04d25ebd039156cd29`. В каждом каталоге — короткий
`prompt.md`, объяснение одной опечатки, побайтные копии исходных данных,
`oracle.py`, `expected.json` и, где есть в источнике, `expected-demo.json`.
Новых правил расчёта, данных, генераторов и кода продукта нет.
Просьбы содержат 16–19 слов по пробельным границам; максимум 20 соблюдён
и при раздельном подсчёте трёх категорий через `/` в p21.

| Задача / исходный сценарий | Единственная неточность | Проверяемый бизнес-результат |
|---|---|---|
| [p17](p17/README.md) / s1-revenue | Quanity → Quantity | 6 групп, сумма 216781.00, выручка по убыванию |
| [p18](p18/README.md) / s2-customers | clent_code → client_code | 8 активных, коды C-NNN, числовой лимит, исходный порядок |
| [p19](p19/README.md) / s3-reconcile | OderID → OrderID | 8 долгов на 40502.50, отсутствие оплаты = 0 |
| [p20](p20/README.md) / s4-branches | Catgory → Category | 6 групп на 203009.00, повторы учтены |
| [p21](p21/README.md) / s5-pivot | Amout → Amount | 3 региона, суммы Office/Warehouse/Tech, 180847.50 |
| [p22](p22/README.md) / s6-abc | Reveneu → Revenue | A: 3/80000; B: 2/15000; C: 7/5000 |
| [p23](p23/README.md) / s7-refine | Regoin → Region | Север: 54400 и 6182, прежние поля и порядок |
| [p24](p24/README.md) / s8-rename | Catgory → Category | 6 строк s1 с русскими названиями, прежние значения/типы/порядок |

p17–p22 заменяют исходную просьбу соответствующего сценария; модели передаются
только просьба и CSV. p23 и p24 начинаются **каждый с исходного s1** в том же
чате/пакете, без повторной передачи CSV. Цепочка p23 → p24 не эквивалентна s8.
Oracle, expected, README и технические схемы модели не передаются.
Исходные схемы/селекторы проверки сохранены; краткая просьба однозначно задаёт
бизнес-таблицу, но сама по себе не задаёт все технические имена и типы эталона.
Несовпадение только технического оформления требует операторской оценки.

У s8 исходный oracle выдаёт русские **имена**, тогда как оба исходных expected
содержат английские имена и русские **подписи**, а также другой селектор выхода
и сокращённый список обязательных узлов. Эти файлы не исправлены в LAB-119.
p24 проверяется на эталонной бизнес-таблице по уникальным подписям, типам и всем
значениям в исходном порядке. Нельзя объявлять его stdout побайтно равным expected
или использовать вместо `expected-demo.json` для cold-check.

Воспроизведение из корня репозитория (Python 3, стандартная библиотека):

```sh
python3 -B - <<'PY'
from pathlib import Path
import json, subprocess, sys

root = Path('docs/testing/loginom-ai-agent').resolve()
for i, source in enumerate(sorted((root / 'demo-2026-10-22').glob('s[1-8]-*')), 17):
    case = root / 'stability-2026-10-20' / f'p{i}'
    assert len((case / 'prompt.md').read_text().split()) <= 20
    for file in [*source.glob('data/*.csv'), source / 'oracle.py', *source.glob('expected*.json')]:
        assert file.read_bytes() == (case / file.relative_to(source)).read_bytes()
    run = [sys.executable, '-B', str(case / 'oracle.py')]
    actual = subprocess.check_output(run, cwd=root)
    assert actual == subprocess.check_output(run, cwd=case)
    changed = json.loads(subprocess.check_output(run + ['/personal/personal.lgp']))
    assert changed.pop('package_path') == '/personal/personal.lgp'
    original = json.loads(actual)
    original.pop('package_path')
    assert changed == original
    reference = (case / 'expected.json').read_bytes()
    if i != 24:
        assert actual == reference
        print(f'p{i}: oracle/reference PASS (byte-for-byte)')
        continue
    def table(document):
        output = document['outputs'][0]
        columns = output['columns']
        labels = [c.get('label', c['name']) for c in columns]
        assert len(set(labels)) == len(labels)
        return (output['ordered'], [(label, c['type']) for label, c in zip(labels, columns)],
                [[row[c['name']] for c in columns] for row in output['rows']])
    for file in case.glob('expected*.json'):
        assert table(json.loads(actual)) == table(json.loads(file.read_bytes()))
    print('p24: oracle/reference PASS (labels, types, ordered values; not byte-for-byte)')
PY
```

Реальный разбор всех 15 исходных файлов ожиданий:

```sh
bun --input-type=module - <<'JS'
import { readFileSync, readdirSync } from 'node:fs';
import { parseExpectedOutputs } from './scripts/node-acceptance/expected-outputs.mjs';
for (let i = 17; i <= 24; i++) {
  const directory = `docs/testing/loginom-ai-agent/stability-2026-10-20/p${i}`;
  for (const name of readdirSync(directory).filter(name => /^expected.*\.json$/.test(name))) {
    parseExpectedOutputs(JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')));
    console.log(`p${i}/${name}: PASS`);
  }
}
JS
```

Это офлайн-проверка расчётов на эталонах, не PASS выполнения агента или Loginom.
Аккаунты, сборки, живые сеансы, модельные/native/cold-check прогоны не требуются.
Ветка `stability-p17`, один docs PR в `demo-022`; merge и Done остаются владельцу.
