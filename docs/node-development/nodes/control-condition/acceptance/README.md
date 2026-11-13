# Приёмочный комплект Условия: этап 1, готов

Native-проба LAB-1557 ([discovery](../discovery.md)) подтвердила индексы портов в нумерации
runtime: Detailed — выход 0, «Иначе» — выход 1 (native `Output_Data-0`/`Output_Data-2`).
Изменения после пробы: сняты пометки «предл.» с портов, зарегистрирован сценарий run-check;
строки, типы и порты expected не менялись. Статус «готов».
Модели передаются `task.md` и `../fixtures/orders.csv`; oracle, expected и этот файл
остаются вне её контекста. Сценарий run-check — `condition-variable`.

## Срез

Одна пользовательская ветвь Detailed (`Mode = 1`) и встроенная «Иначе». Входы: таблица
`orders.csv` и «Переменные сценария» (целая `Mode`, label = имени). Таблица передаётся
на выход каждой ветви. Агрегаций, «ИЛИ», регистра, отладки, деревьев нет.

1. `Mode = 1` → Execute → полный выход ветви Detailed (порт 0) = 4 строки входа.
   CSV `detailed.csv`. Ожидание — `expected-initial.json`.
2. Только `Mode := 0` (Условие и связи не перенастраиваются) → Execute → полный выход
   «Иначе» (порт 1) = те же 4 строки. CSV `other.csv`. Ожидание — `expected.json`.
3. Блокировка: в п. 1 порт «Иначе», в п. 2 порт Detailed не выполнялись. В expected это
   не выражается — проверяется состояние портов в основном прогоне и в cold. Основной:
   чекер `scripts/node-acceptance/control-condition.mjs` по журналу — в п. 1 прочитан только
   порт 0 и `branch_activity` = `[true,false]`, в п. 2 тот же узел без перенастройки, только
   порт 1 и `[false,true]`. Cold: после Execute сохранённого узла активен ровно порт 1
   (фаза `cold_condition_branch_activity`).
   Данные выбранного порта блокировку не доказывают.
4. Save после последнего чтения; cold — новое открытие и Execute без восстановления
   настроек, итог совпадает с `expected.json`.
5. Отрицательные адресные проверки: агрегация, «ИЛИ», вторая ветвь, дерево, отладка,
   чужой workflow/узел — отказ до мутации; native причина из `btnError`.
6. Исполнитель ≥2/3 PASS на одном SHA; независимая приёмка 2/3 на том же SHA.

## Числа и типы

| Случай | Mode | Активная ветвь | Порт | Строк | OrderID по порядку |
|---|---|---|---|---|---|
| initial | 1 | Detailed | 0 | 4 | 101, 102, 103, 104 |
| final | 0 | Иначе | 1 | 4 | 101, 102, 103, 104 |

Поля: OrderID integer, Region string, Amount real, Paid boolean, Note string.
NULL — только `?`; пустой Note в строке 102 — пустая строка, не NULL. Amount tolerance 0:
значения двоичные дроби, вычислений нет. `ordered:true`, `column_order:exact`,
`label_any:true` для полей. Oracle — stdlib, без runtime и стенда.

```sh
python3 -I docs/node-development/nodes/control-condition/acceptance/oracle.py --check
```

Сценарий run-check `condition-variable` (initial + final в одном прогоне): `detailed.csv` —
`expected-initial.json`, `other.csv` и cold — `expected.json`. Модель `openai/gpt-6.1-sol`, medium, 1800 с.
