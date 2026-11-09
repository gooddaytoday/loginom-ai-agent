# Цикл 3 привязок: `sort_result` Группировки и локаль Сортировки

Комплект этапа 0 для цикла 3 из [implementation](../../implementation.md#циклы-после-полного-этапа-0):
boolean-регистрация двух полей на общем механизме циклов 1 (#839) и 2 (#864)
по утверждённому [контракту](../../contract-proposal.md). **Не зарегистрировано
в run-check, модельных PASS нет.** Expected — независимый расчёт желаемой
семантики; native-основание указано ниже.

| Предлагаемый сценарий | Задание | Данные | Две фазы + cold |
|---|---|---|---|
| `bindings-grouping-sort` (основной, ≥2/3) | [task-grouping.md](task-grouping.md) | `nodes/grouping/fixtures/modes.csv` | Flag false → true; `/sort_result`; Region, Metric |
| `bindings-sorting-locale` (×1) | [task-sorting.md](task-sorting.md) | `nodes/sorting/fixtures/modes.csv` | Flag false → true; `/compare_with_locale`; RowID, Word, Amount |

Fixtures не копируются: oracle читает CSV узлов и сверяет их sha256.
Модели передаются только task и `modes.csv`. Оба задания содержат
постороннюю Sentinel="keep"; источник — `variables.user` (выход 4, control
input 0 узла, subtype 4 по [discovery](../../discovery.md)), метка = имени.

## Oracle и expected

```sh
python3 docs/node-development/variables/bindings/acceptance/cycle3/oracle.py --check
python3 docs/node-development/variables/bindings/acceptance/cycle3/oracle.py --node sorting --phase final --csv <скачанный.csv>
```

`--check` побайтно сверяет четыре expected (`grouping/`, `sorting/`:
`expected-initial.json` — Flag=false, `expected.json` — Flag=true и cold) и
жёсткие опорные значения. Только stdlib, без runtime, Loginom и системной локали.

- Группировка: сумма Amount по Region, NULL пропускается, all-NULL D → NULL.
  Flag=false — мультимножество (`ordered:false`): порядок без сортировки как
  контракт не заявлялся, в discovery Группировки он B,A,C,D,E. Flag=true —
  строгий порядок A,B,C,D,E (native: `nodes/grouping/modes-discovery.md:59`).
- Сортировка: Word ASC без учёта регистра, затем RowID. Flag=false даёт
  9,10,7,8,6,2,4,3,5,1, Flag=true — 9,10,3,6,2,5,1,4,7,8; обе таблицы совпадают
  с native-наблюдениями literal-режима (`nodes/sorting/modes-discovery.md:49–53`).
  Веса — узкий алфавит fixture; идентификатор локали пары не прочитан
  (`locale_verified=false`), его фиксирует приёмка.

Native-основание переключения: привязка обоих полей к Flag, Done и cold
readback наблюдались (discovery, журнал 70–71), а смена значения только в
источнике с повторным Execute — у Фильтра и Импорта. Для этих двух узлов
source-only update — желаемая семантика контракта, а не наблюдение.

## Проверки приёмки

Как у `filter-bindings`: начальное выполнение, patch только `Flag` в том же
`variables.user`, новое Execute того же node GUID без apply настроек узла,
Save, cold Execute без настройки, cleanup. Отдельный аудит событий по образцу
`scripts/node-acceptance/filter-bindings.mjs`: в `configuration.bindings`
ровно одна связь `parameter=/sort_result` (или `/compare_with_locale`),
`mode=variable`, `variable.name=Flag`, `type=boolean`, источник
`variables.user`/4, `verified=true`; patch источника — только
`[{name:Flag,type:boolean,value:true}]`; Sentinel не изменился. Порядок CSV:
начальный, обновлённый, cold (`export_count=3`).

## Что сейчас отвергает runtime (база `v040-batch-12@f20bac7f`)

Пути от `packages/loginom-runtime/client/lib`.

1. `variable-binding-parameters.mjs:19` — любой parameter вне
   `transform.filter_data` (`/groups/i/j/value`) → `BINDING_PARAMETER_UNSUPPORTED`;
   #864 добавляет только `imports.text` в ту же строку (конфликт при слиянии).
2. `node-apply.mjs:34` — bindings требуют `binding_schema` типа; у
   `grouping-node.mjs:11` и `sorting-node.mjs:10` его нет (у Фильтра —
   `filter-node.mjs:33`). `sort_result`/`compare_with_locale` уже есть как
   literal boolean (`grouping-parameters.mjs:14`, `sorting-parameters.mjs:8`).
3. `node-apply.mjs:527` — `configuration.bindings` в ответ попадает только при
   `readback.kind==='row_filter'`.
4. `grouping-procedure.mjs:14` — при нажатом SwitchButton `pedSortResult`
   отказ «Grouping option requires a literal boolean».
5. `sorting-procedure.mjs:66` — при нажатом SwitchButton `chkLocaleAware`
   безусловный отказ «Variable-driven sorting locale unsupported»; он сработает
   и на cold/existing-пути, если процедура вызывается.
6. `grouping-context.mjs:46–50`, `sorting-context.mjs:42–48` читают только
   literal value и `switch_pressed`, без выбранной переменной — нужен
   variable-mode inventory (discovery, абзац про hidden literal).
7. Справки: `transform.group_data.md` — 5899/6000 Б (запас 101 Б, байты как в
   `node-guidance.test.mjs:117`); `transform.sorting.md` — 3778 Б. Строку про
   binding Группировки придётся уместить за счёт сжатия.

## На утверждение

- Имена `bindings-grouping-sort` / `bindings-sorting-locale` и разбиение
  «Группировка основной ≥2/3, Сортировка ×1».
- Source-only update для этих двух узлов как ожидаемая семантика (см. выше).
- Сортировка требует зафиксировать локаль пары, как в цикле locale Сортировки.
