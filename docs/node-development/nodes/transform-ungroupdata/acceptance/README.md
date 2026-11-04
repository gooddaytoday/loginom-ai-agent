# Предложение приёмки

Критерии ожидают утверждения по LAB-771 до этапа 1. В этой карточке нет
реализации и модельных прогонов. Native FullType остаётся открытым
пунктом этапа 0. Независимый oracle — стандартный Python
`csv` + `Decimal`, без Loginom, runtime, actual CSV и журналов.
Числа вычисляются из [fixtures](../fixtures/manifest.json), а не копируются
из native preview. Порядок полей и NULL заданы явно.

## Бизнес-сценарии

| Сценарий run-check (предложение) | Task / expected | Входные файлы | Полных CSV |
|---|---|---|---:|
| `ungroup-shares` | `task.md` / `expected.json` | totals.csv, shares.csv | 1 |
| `ungroup-rounding` | `rounding/task.md` / `rounding/expected.json` | balance-totals.csv, balance-shares.csv, round-totals.csv, round-shares.csv | 5 |
| `ungroup-null` | `task-null.md` / `expected-null.json` | null-totals.csv, edge-shares.csv | 1 |
| `ungroup-empty` | `task-empty.md` / `expected-empty.json` | empty-totals.csv, edge-shares.csv | 1 |

Каждая запись использует `data=fixtures/` относительно каталога узла и
явный `input_files` только из соответствующей строки. `source` задаёт каталог
expected, `prompt` — указанный task; `base=None`, новый профиль/чат/пакет.
Для rounding — `export_count=5`, остальных — 1. Это проект аддитивной
регистрации существующего runner, не новая обвязка. Ни oracle, ни expected,
ни manifest модели не передаются. SHA/байты входов проверяются вне её prompt.

В expected: `output_port:0`, `ordered:true`, `column_order:"exact"`,
только реальные имена/типы, `label_any:true` для непредписанных меток,
допуск real `{abs:1e-12,rel:1e-12}`. Имена пяти узлов rounding предписаны
task и поэтому проверяются точно. NULL и пустая строка сравниваются строго.
Пять полей каждого выхода проверяются целиком, включая повторённый итог;
нельзя проверять только сумму OutputValue.

Основной ожидаемый результат — 13 строк, в порядке групп G,H,N,Z,NEG,NULL,
пустая строка. OutputValue: **25,75,2,3,5,20,20,0,30,0,125,20,16**.
Для округления до целых на balance-данных:
**1/1/2**, **1/1/8**, **2/3/5**, **3/3/4** соответственно политикам task.
Кратное трём — **3/3/6**, Total_Rounded=**9**.
NULL-сценарий — 4 строки, пустой — 0 строк при полной схеме.

Формула пропорциональной/равномерной последовательной коррекции в oracle
предложена для ограниченного набора этих fixtures. Она не заявляет
проверенность всех вырожденных или отрицательных итогов. Реализация должна
выбирать native метод, не вычислять вместо него данные oracle.

`edge-totals.csv` — отдельный отрицательный probe: повтор ключа X должен
дать native отказ о единственной строке группы. Он не является успешным
бизнес-сценарием и не подменяется ожидаемым пустым выходом.

## Предлагаемые условия приёмки этапа 1

- Совпадение с полным expected всех четырёх сценариев, точным порядком и
  портом 0; без неявной нормализации и без изменения входных данных.
- Сохранение пакета после чтений, полный скачанный CSV, cold-check в новом
  профиле, повторное выполнение сохранённого узла и штатное закрытие/выход.
- Не менее 2 PASS из 3 на одном опубликованном SHA для каждого сценария;
  независимая проверка того же SHA по стандарту сквада, также 2 из 3.
- Адресные проверки нового/существующего узла: сохранение ролей при `{}`,
  замена источников той же схемы, чужая identity/неверный порт, отмена,
  объяснимый отказ дубликатов итогов и неподдерживаемых режимов. Параметры
  computed/seasonal/переменные отвергаются до мутации.
- Проверки затронутых путей по `required-checks.py`, полный client с
  закреплённым браузером; при регистрации сценариев — тесты оснастки.

Критерии — предложение. Их утверждение не заменяется фактом создания этого
комплекта или статусом `ready_for_development` в подплане.

## Воспроизведение oracle

Из корня репозитория:

```sh
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle.py
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle.py rounding
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle.py null
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle.py empty
```

Выводы должны побайтно совпадать с соответствующими expected, включая
шаблон `{{PACKAGE_PATH}}`. Runner подставит реальный `.lgp` до cold-check.
