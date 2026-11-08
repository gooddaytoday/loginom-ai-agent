# Внешняя таблица замен: этап 0 LAB-1102

Предложение для утверждения владельцем, 08.11.2026, mas2, Loginom 7.4.2.
Исходная точка назначения — `v040@d355159858`; checkout текущей базы по
регламенту сквада — `v040@ecb11c0e2dce6972aaa00978050680145fd12b04`.
Runtime и поставляемый skill не менялись, CLI не собирался. keep→Variant
в этот срез не входит. Наблюдения получены в собственном пакете worker
назначенной пары, только https://app.loginom.ai/app/?testable=true.
Нативные методы вычисления не вызывались; действия — UI по data-tid,
чтение — DOM и материализованные локальные Ext-записи.

## Наблюдённая семантика

Обозначения: G = текущий `MF;TF-1;Graph;ExternalReplace;`,
R = текущий `MF;TF-1;WizrdMCF;ReplaceColumnsWizard;`.
TF и подпись узла не константы для обработчика: каждый раз брать текущий DOM.

| Действие / поверхность | Наблюдение |
|---|---|
| G `Input_Add` | Второй табличный вход отображается как `Input_Data-2`, его нативный FPortIndex=1. Логический input=1. Служебные порты исключаются из табличной нумерации. |
| Связь справочника | Отдельный импорт правил output 0 → этот второй вход; основной импорт остаётся на input 0. GUID узла, input 0 и output 0 сохраняются. |
| R `colReplaceSource_Code` → `grdDataList;tbl;celleditor;cbx;boundlist;Таблица_замен` | В `grdDataList` Code имеет ReplaceMode=2, ReplaceSource равен GUID второго входа. Не заменять=0, ручной ввод=1. ReplaceSource — идентичность порта, не индекс массива и не подпись таблицы. |
| R `grdInputSource` | Ext.grid.Panel, Ext.data.Store, proxy `bg.ext.CollectionProxy`, не загружается; полный локальный список Value/Replacement/Info/Ignored. Не обходить удалённые ReplaceTable/DataValue/ReplaceBy. |
| R `colInputSourceUsage_<имя>` | Редактор `grdInputSource;tbl;celleditor;cbx;boundlist;…`; Значение=3, Замена=4, Информационное=6, Не используемое=0 в UsageType. Сохранить имена, типы, ID и связь записи с DOM. |
| Фильтрация назначения | У свободного строкового поля при Boolean-результате нет «Замена», при string она возвращается. Уже назначенная «Замена» может оставаться в своём редакторе; нельзя делать вывод о типе по одному такому списку. Уже занятое «Значение» не предлагается другому полю. |
| Маппинг второго входа | G `Input_Data-2`, контекст `mn;mniConfigurePort`, затем `TuneDataSourceMappingWizard`. Все четыре string-поля связаны 1:1. Общий маппинг показывает UsageType=3/4/6 словами «Входное/Выходное/Группа»; семантика ролей читается в мастере Замены. Не сбрасывать эти значения при сохранении маппинга. |
| Повторное открытие | ReplaceMode=2, тот же ReplaceSource и роли 3/4/6/0 сохранились после Done и нового открытия; Ext record_id изменились. Ссылки на старые записи переиспользовать нельзя. |
| Отмена исследовательского draft | После ручной смены типа и снятия роли Close + подтверждение отбросили draft. Новое открытие вернуло сохранённые 3/4/6/0. Старые ручные пары остаются в ручном редакторе, но внешний режим их не применяет. |

Внешний справочник **не выбирает первый/последний дубликат**.
Исходный `rules.csv` содержит AB-12 → FIRST и AB-12 → SECOND. Next и Done
принимают конфигурацию, но выполнение оставляет узел неактивным, с красным
индикатором. G `Status` открывает `msgbox;cnt;cnt;MessagesView`:
**«Значение дублируется в таблице замен»**. Не объявлять успешный выход
по самому факту закрытия мастера. Это опровергает прежнее предположение
LAB-1003; `expected-external.json` нельзя применять к исходному rules.csv.

Для положительного случая удалён только второй AB-12: новый
`fixtures/extended/rules-unique.csv`, 99 Б, три строки. Наблюдены все 48
ячеек в `ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt;`
`<имя>_<0..7>`. Типы заголовков: Id integer, Code/CodeInfo/Status/Keep string,
Code_Replaced boolean. Непокрытые Id=2,3,4,5,7 сохранили Code, флаг false,
информационное поле **NULL**, включая пустую строку Code при Id=5.
NULL-ключ при Id=6 дал MISSING/true/null-key. Id=1 — FIRST/true/primary,
Id=8 — EXTERNAL/true/literal. Основных строк ровно восемь.

При первом добавлении информации к прежнему узлу CodeInfo оказался в конце
сохранённого выхода; при повторной настройке inline-схема разместила его
после флага. Приёмка фиксирует полный output mapping и autosync=false,
порядок из UI по умолчанию не является контрактом. Это прежняя возможность
маппинга, новый механизм проверки не требуется.

## Предложение приёмки

Положительное задание — [task-external.md](../task-external.md), только
input.csv и rules-unique.csv. Один узел сначала с ручной Code AB-12→INTERNAL,
затем внешний input 1 с явными четырьмя ролями. Те же GUID узла/input 0/
output 0, неизменные основные связи и неперечисленные поля, без второго узла
Замены и фантомных выходов. Повторное открытие, Done, повторное выполнение
сохранённых правил. Выход 0: **8×6**, порядок Id, Code, Code_Replaced,
CodeInfo, Status, Keep. Все типы, NULL, пустота, флаги и ячейки точные;
label_any, мультимножество строк. CSV с ?, Save, cold, cleanup и ≥2/3
двух аккаунтов на одном SHA — существующий стандарт, после утверждения.

`oracle.py --check` использует только csv/dict Python и fixture-байты.
Внешние ключи обязаны быть уникальны; дубликат вызывает ValueError и отдельно
проверяется на исходном rules.csv. Значения положительного expected остались
прежними: после удаления SECOND гипотетический FIRST стал однозначным
результатом. Файл expected не нужно искусственно переписывать ради диффа.
Старые Boolean/mixed/Variant expected этим срезом не меняются.
Oracle и expected никогда не передаются модели.

[task-external-duplicates.md](../task-external-duplicates.md) — отдельная
ручная диагностика нативного отказа. Это не новый формат expected, не
отдельный gate и не модельный run-check. Нельзя получить PASS дубликатного
примера, автоматически удалив конфликтующую строку. В этапе 1 нужны тесты
production-ветки обработки нативного отказа и регрессии существующих режимов.
Утверждение предложенных критериев принадлежит владельцу.

## Размер последующей правки

Два цикла одного внешнего среза/PR, ориентир 250–400 строк обработчика плюс
тесты. Между циклами — новый живой бизнес-сценарий через штатный run-check.
Первый цикл: порт 1, preflight обеих схем, роли, string-выход 8×6.
Второй: повторное открытие/пустой patch, отказ на дубликате, сохранность
незапрошенных ручных правил и Save/cold. Базовые exact/regex/mixed остаются
обязательной регрессией. Оценка не является разрешением менять runtime.

Собственные файлы `client/lib/replacement-`:

| Суффикс | Правка после утверждения |
|---|---|
| `node.mjs` | mode external, подключить имеющийся configureInputs hook для двух входов |
| `preflight.mjs` | Обе схемы и эффективные имена после input mapping; неизменность главного входа |
| `parameters.mjs` | Роли, взаимоисключение внутренних пар, типы, покрытие полей, коллизии выходных имён |
| `context.mjs` | ReplaceMode=2/ReplaceSource, материализованный grdInputSource и текущие ID |
| `procedure.mjs` | Выбор внешнего источника, назначения и readback всех незапрошенных правил |
| `output.mjs` | Информационные поля в производной схеме, полный порядок/исключения |
| `readback.mjs` | Оба входа, роли, GUID источника, наблюдённый тип результата и сохранность |

Аддитивные места вне replacement-*.mjs:

- `node-port-open.mjs`: в существующем dynamicUnion allowlist добавить только
  `bg-vendor-icon-replacecolumns`. Сейчас FPortIndex=1 сравнивается с SVG=2,
  opener возвращает NOT_APPLIED/`Port native hit identity unavailable`,
  effect_possible=false, cleanup_complete=true. Смена алгоритма не нужна.
- `workspace-ui.mjs`: привязка ячеек/редактора ролей grdInputSource к
  выбранному полю и native record; existing binding охватывает только
  grdDataList/grdReplaceItems и ReplaceMode=1. Добавить ветку для этого типа.
- `node-api.mjs`, `node-contracts.d.ts`: аддитивная external-схема и режим;
  `node-contracts.mjs`: existing type additional_tabular_inputs=false→true.
  Это изменение публичного контракта требует отдельного решения владельца.
- `node-result-schema.mjs`: отдельная декларативная external readback-ветка
  с двумя input_mappings; старые readback-ветки не менять.
- Файл узла skill и одна строка маршрутизации; регистрация сценария в
  существующем run-check. Новых readers/диспетчеров/модулей не требуется.

Для graph connect и configureInputs уже существуют логические индексы и
hook. Общей переработки не выявлено; если реализации понадобится поведение
сверх перечисленных аддитивных мест, остановка и вопрос владельцу.

## Что увидит модель

Изолированные docs-only предложения:
[external-node-type.proposal.json](external-node-type.proposal.json) и
[external-skill-node.proposal.md](external-skill-node.proposal.md).
Первое основано на реальной карточке ecb11c0e2d с session pins; все hash-поля
заменены 64 нулями. Предлагается ровно второй табличный input, `mode:external`,
rules[].external с port=1, value, replacement, information, unused.
Не обещаются дополнительные таблицы 2..14 или keep→Variant.

| UTF-8, compact JSON для карточки | База | Предложение | Лимит |
|---|---:|---:|---:|
| dock_node_apply model_tool_bytes | 8051 | 8051 | 20000 |
| full_input_schema_bytes, не отправляется модели | 71306 | 72766 | нет |
| Карточка с session pins, без guidance | 6438 | 7559 | 12000 |
| Карточка + guidance выбранного external | — | 10205 | 12000 |
| Максимум карточки + все guidance/modes | 11968 | 11730 | 12000 |
| Файл узла, включая mode-маркеры | 5587 | 4360 | 6000 |
| Строка маршрутизации с LF | 158 | 143 | ~200 |
| Весь SKILL.md | 28823 | 28808 | 40000 |

Предлагаемая строка (143 UTF-8 байта с LF):

```md
| Замена | `transform.replace_columns` / exact, regex, mixed, external | [читать](references/nodes/transform.replace_columns.md) |
```

База измерена pinned Node 24.19.0: `node --test test/model-schema-budget.test.mjs`
в client, 185 тестов PASS. Карточка — createActionRuntime с pinned catalog,
runtime.describe({node_types:[type]}), userActionInventory, затем штатный
skill loader.describeNodes для каждого mode и всех modes. Proposal прогнан
тем же loader в изолированной bundled-skill fixture с заменой только файла
узла и routing-строки, обновлением manifest. Размер —
Buffer.byteLength(JSON.stringify(card), 'utf8'), не pretty JSON на диске.
Для full-schema проекции заменён только rules.anyOf[0] предложенной схемой,
в mode.enum добавлен external; userNodeTool оставляет компактный инструмент
без изменения размера. Readback не входит в inputSchema.

У полной карточки остаётся 270 Б запаса: после реализации повторить замер
с реальными описаниями и pins, бюджет не увеличивать. Уплотнённый текст
предложения сохраняет действующие ограничения и ссылается на parameter_schema;
это не поставленная редакция навыка.
