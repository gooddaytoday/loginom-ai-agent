# Набор стабильности D7 после заморозки 20 октября

Комплект для проверки, сохраняет ли агент бизнес-смысл при свободной формулировке
и переносит ли навыки на другие задачи. Срок поставки — 19.10.2026 18:00 PT;
использование — после заморозки 20.10.2026 00:00 PT, перед показом 22.10.
Назначение и приёмка: [plan.md](plan.md), [acceptance/task.md](acceptance/task.md).
Основа D1 — `343d8cdecdc07d47b8dbff6db3d530b0ac1a4aa1`, ветка поставки
`demo-stability-set`, PR в `demo-022`.

## Покрытие

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

Повторить для n2–n6. Проверить формат всех 12 используемых демо-эталонов
существующей функцией (простой запуск модуля ничего не валидирует):

```sh
bun --input-type=module - <<'JS'
import { readFileSync, readdirSync } from "node:fs";
import { parseExpectedOutputs } from "./scripts/node-acceptance/expected-outputs.mjs";
for (const base of ["demo-2026-10-22", "stability-2026-10-20"]) {
  const root = `docs/testing/loginom-ai-agent/${base}`;
  const cases = readdirSync(root).filter(name =>
    base.startsWith("demo") ? /^s[1-6]-/.test(name) : /^n[1-6]$/.test(name));
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

## Будущие прогоны после заморозки

Сейчас модель, native и cold-check не запускаются. Подготовка D7 не требует
аккаунтов, сборки приложения или сеансов Loginom. Следующие шаги выполняет
оператор будущего прогона по [инструкции D1](../demo-2026-10-22/README.md#проведение-показа).

1. Выбрать ровно один prompt (s*/prompt-vN.md или n*/prompt.md) и только указанные
   в таблице CSV. Выделить новый личный путь пакета и отдельный профиль на попытку.
   README, plan, oracle, expected и весь каталог целиком модели не передавать.
2. До запуска сформировать отдельный expected для точного личного пути пакета.
   Для n1–n6 oracle меняет только `package_path`:

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
   независимый прогон, всего 24: 18 перефразировок + 6 новых задач.
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
