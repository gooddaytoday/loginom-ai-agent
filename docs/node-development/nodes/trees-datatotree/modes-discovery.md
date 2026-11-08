# Расширения четырёх преобразований дерева — LAB-1042, этап 0

07.11.2026, mas2. База назначения: `origin/v040@8943d291b046698d67828f19dcca88aab790cf2c`.
По действующему регламенту взята текущая голова `v040`:
`afaa1f300687501c26b2e0921b05553cd75052f5`, потомок указанной базы.
Только docs/fixtures/oracle; runtime, навыки продукта и CLI не изменены.
Это предложение критериев, не приёмка обработчиков и не разрешение этапа 1.

## Живое исследование

Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары,
собственный новый Package1. Версия 7.4.2 прочитана из
`LoginForm;Login;lblProductVersion`. Все действия — DOM/mouse по `data-tid`;
внутренний JS/обработчики Loginom не вызывались. Префикс собственного сценария
`MF;TF-1` временный. Сырые DOM и screenshot остаются вне Git.

Все четыре компонента созданы перетаскиванием из палитры
`ModelForm;colVendors_Компоненты>Дерево_данных>…;TreeText`.
Настройки открыты через `Graph;<название>;Setting`.
DataToTree и JSONToTree: табличный вход 0 → tree выход 0;
TreeToJSON и TreeToData: tree вход 0 → табличный выход 0.
Новые опции мастеров не добавляют портов. Источник с данными не подключался:
исследование подтверждает элементы UI, но не кратности и значения результата.

| Мастер, `data-tid` после `MF;TF-1;WizrdMCF;` | Наблюдение |
|---|---|
| `DataToTreeWizard;trpDataTree`, `colNodes_0>Root;TreeText` | Ручная структура Root, source grid пуст без входа |
| `DataToTreeWizard;btnAddChild`, `btnAddSibling`, `btnEdit`, `btnMoveUp`, `btnMoveDown` | Редактор структуры; Root выбран и AddChild реально открыт |
| `EditDataTreeNodeDefForm;edtName`, `edtDisplayName`, `cbxDataType`, `cbxDataKind`, `chbIsArray`, `chbIsContainer` (без префикса сценария) | Имя/метка, тип/вид, массив/контейнер. В списке типов: Логический, Дата/Время, Вещественный, Целый, Строковый, Переменный. Добавление отменено |
| `TreeToJSONWizard;pedRootExcluded;ValueControl` | Исключение корня, исходно off |
| `TreeToJSONWizard;pedPrettifyJSON;ValueControl`, `pedDisplayNameAsKey;ValueControl`, `pedMultiRowOutput;ValueControl` | Форматирование, метки как ключи, строки для массива; исходно off |
| `TreeToJSONWizard;pedDateTimeIsISO8601;ValueControl` | Исходно on; выключение реально включает поля форматов |
| `TreeToJSONWizard;pedDateFormat;ValueControl`, `pedTimeFormat;ValueControl` | До выключения ISO disabled, после доступны; затем ISO восстановлен |
| `JSONToTreeWizard;pedSourceColumn;ValueControl`, `pedDateTimeFormat;ValueControl` | Поле JSON обязательно, исходный формат `YYYY-MM-DDThh:mm:ss` |
| `JSONToTreeWizard;pedBuildTreeAuto;ValueControl`, `pedStrictMode;ValueControl`, `pedRootExcluded;ValueControl` | Автоструктура off, strict on, исключение корня off; ручные кнопки дерева доступны в маршруте |
| `JSONToTreeWizard;pedRootGeneration;ValueControl;boundlist;…` | После включения автоструктуры открыты Автоопределение, Всегда массив, Всегда не массив; до включения selector disabled |
| `JSONToTreeWizard;btnBuildTreeTemplate` | Кнопка построения шаблона существует; без json_field дала обязательность поля. Это не доказательство native file input |
| `TreeToDataWizard;trpDataTree`, `btnSelectAll`, `btnDeselectAll`, `btnReverse` | Root и выбор состава; массивов без источника нет |
| `TreeToDataWizard;pedCompositeColumnNames;ValueControl`, `pedCompositeColumnDisplayNames;ValueControl` | Составные имена off, составные метки on после загрузки |
| `TreeToDataWizard;pedRepeatParentNodeValues;ValueControl`, `pedCompositeDisplayNameSeparator;ValueControl` | Повтор родителей on, разделитель «Точка (.)» после загрузки |

Состояния чекбоксов прочитаны по `x-form-cb-checked`, не по скрытому input.
Первый DOM до окончания загрузки полей не используется как default.
Для JSONToTree на Next без поля наблюдался native отказ
`msgbox-1;cnt;cnt;MessagesView`: **«Это поле обязательно для заполнения»**;
заголовок `msgbox-1;cnt;cnt;cmp`: «Переход запрещен». Диалог закрыт OK.
Этот отказ не считается проверкой strict, файла или malformed JSON.

Дважды наблюдался разрыв связи: `msgbox;cnt;cnt;cmp` =
«Обнаружен разрыв связи.Восстановить сессию?». Выполнено одно штатное
восстановление после каждого разрыва через `msgbox;tlb;yes`; после второго
исследование остановлено по ограничению карточки, без третьего подключения.
Наличие UI не доказывает Save/cold. Мастера без входов закрывались с отменой.

## Что остаётся гипотезой

Не выполнены: группировка A/B/A; несколько массивов и scalar arrays;
native дата/Variant на tree output; пустой источник; форматированный результат;
root-array splitting; ручная схема и strict false/error; native file delivery;
индексы/их база/имена, >64 полей, составные имена/метки на данных,
произведение или zip sibling arrays, Save/reopen/cold и модельные сценарии.
Native FullType не читался. Старые discovery и PASS не переносятся на этот SHA.

Особенно: `index_base_proposal=0`, `items_code`, метка `Позиции.Код`,
Cartesian 2×3 и группировка по первому появлению — **предложения**,
не факты платформы. Перед утверждением численных критериев требуется короткая
native-проба каждого такого правила. При расхождении остановиться, не менять
oracle по ответу обработчика ради PASS.

## Объём до кода

В каждом подплане добавлен [modes.md](modes.md) с собственным комплектом.
Всего 21 адресный сценарий и отдельная граничная матрица JSONToTree:
5 / 6 / 6 / 4 сценария соответственно. Один stdlib oracle независимо
пересчитывает четыре expected; три entrypoint сохраняют привычный запуск
из acceptance соответствующего узла. Это не новый runner или matcher.
Задания не содержат инструментов, ожидаемых таблиц или данных oracle.
Текущий run-check эти новые cases не регистрирует; запуска без утверждения нет.

Предлагается прежний стандарт: полный typed main, точные типы/Int64/NULL,
границы и порядок массивов, каждый табличный CSV, Save, новый профиль,
cold Execute без настройки, cleanup; ≥2/3 PASS и независимые 2/3 на одном SHA.
Метки, не заданные заданием, проверяются через label_any.
Форматирование требует дополнительно проверить перенос вне JSON-строк:
json_ast сам по себе этого не доказывает. Точное custom-date spelling,
Variant subtype и индексы требуют согласованного typed readback.
Нового механизма проверки в этом PR нет; если прежний контракт не вместит
их без расширения, нужно отдельное решение владельца.

## Стоп и оценка этапа 1

**Общее изменение сверх аддитивной регистрации необходимо.**
В `client/lib/node-port-output.mjs:103-119` дерево отклоняет datetime/variant
и требует array ⇒ container; `:153` требует ровно одну корневую строку.
В `tree-conversion-context.mjs:21` лимит схемы 64, тогда как согласованный
общий предел — 256; увеличение локального допуска нельзя считать новой
регистрацией. `node-output-context.mjs:71` отклоняет выбранный индексный
служебный узел. Существующие ограничения надо адресно заменить/расширить
под наблюдение с production red→green, без повышения 256/16/1 MiB.

| Возможность | Адресные циклы | Основные файлы этапа 1 |
|---|---:|---|
| Таблица → дерево | 5 | `tree-conversion-{parameters,node,context}.mjs` |
| Дерево → JSON | 6 | `tree-conversion-{parameters,node,context}.mjs` |
| JSON → дерево | 6 + границы | `tree-{parameters,node}.mjs`, `node-output-context.mjs` |
| Дерево → таблица | 4 | `tree-{parameters,node}.mjs`, `node-output-context.mjs` |
| Общий typed reader, затем типы/схемы | ориентировочно 2 | `node-port-output.mjs`; возможны `node-result-schema.mjs` и `node-contracts.d.ts`, только после решения |

Оценка: 22 адресных цикла плюс 2 общих, ориентировочно 500–850 строк
production-кода и адресные тесты. Это оценка будущего объёма, не diff и не
обещание итераций. Схемы в `node-api.mjs`, semantics `node-contracts.mjs`,
конфигурационный readback `node-read-contract.mjs`, точечные допуски
`workspace-ui.mjs`/`node-procedure.mjs`, продуктовые references и штатные
приёмочные регистрации потребуют адресной синхронизации. Новых runtime-модулей,
рефакторинга, packages/agent, XSD, переменных и новых лимитов не предлагается.

Статус предложения: **blocked для перехода к реализации**, пока владелец
не утвердит критерии и объём общего reader/контракта. Этап 0 остаётся
проверяемым docs-PR; неподтверждённые значения явно отделены от наблюдений.

## Бюджеты того, что видит модель

Измерение: `acceptance/modes/measure-schema.mjs`. JSON minified UTF-8,
карточки через текущий describeNodeTypes с pinned envelope; все записанные
hash-поля заменены 64 нулями. Это консервативная оценка, не зарегистрированные
контракты. Proposed full schema объединяет поля только для оценки размера;
финальный условный контракт по типам остаётся решением этапа 1.

| Поверхность | База, Б | Предложение, Б | Лимит, Б |
|---|---:|---:|---:|
| `dock_node_apply` model_tool_bytes | 14539 | 14539 | 20000 |
| full_input_schema_bytes | 64290 | 64628 | нет |
| Карточка trees.from_table | 3591 | 3936 | 12000 |
| Карточка trees.to_json | 2905 | 3079 | 12000 |
| Карточка trees.from_json | 2722 | 4059 | 12000 |
| Карточка trees.to_table | 3166 | 3350 | 12000 |
| `SKILL.md` | 28178 | 28001 | 40000 |
| `references/nodes/trees.from_table.md` | 2655 | 2119 | 6000 |
| `references/nodes/trees.to_json.md` | 2850 | 1947 | 6000 |
| `references/nodes/trees.from_json.md` | 5325 | 2148 | 6000 |
| `references/nodes/trees.to_table.md` | 5334 | 2233 | 6000 |

Четыре строки маршрутизации: 77 / 71 / 75 / 73 Б, около 200 Б максимум.
Предлагаются замены файлов правил целиком, без дублирующего текста; реальные
файлы навыка не менялись. Сжатый apply не растёт: параметры остаются в карточке,
manual_structure уже есть в глобальном enum. Фактический базовый тест
`node --test test/model-schema-budget.test.mjs` прошёл: 51/51, exit 0.
После реализации требуется повторный фактический замер.

PR #803 на момент исследования OPEN; разделы `<!-- mode: … -->` на базе
отсутствуют. Если PR вольётся до реализации, предложения распределить по
соответствующим mode-разделам, повторно измерив каждый файл и SKILL.md.
