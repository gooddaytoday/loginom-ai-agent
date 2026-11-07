# Наблюдения и открытые проверки

База и ограничение доступа — [README](README.md). Ни один нижеследующий
положительный UI-результат не получен в LAB-989. Метки: **предыдущее UI** —
цитирование исследования; **код** — чтение текущей базы; **не проверено** —
обязательная оставшаяся работа. Отказ доступа не является продуктовым FAIL.

## Шесть полей разных семейств

TID ниже — суффикс внутри наблюдённого владельца `…;WizrdMCF;`;
`TF-1` из старого сеанса нельзя переносить как identity нового документа.
Для каждой строки надо подтвердить совпадение владельца узла/мастера,
порт и mapping. Строки и выбранный режим — часть адреса динамического поля.

| Узел / поле / ожидаемый тип | TID переключателя | Что уже известно | Что осталось |
|---|---|---|---|
| Фильтр строк / scalar порог / integer | `FilterDataWizard;FilterDataPanel;VariantPropEdit;SwitchButton` | Предыдущее UI: picker `VariableControl;trg_picker`; `Amount > Limit`, 5→9 меняет результат без настройки | Привязка к ID конкретного условия, неверный тип/NULL, новый Save/reopen |
| Импорт текста / имя файла / string | `ImportTextFilePreviewWizard;edtFileName;SwitchButton` | Предыдущее UI: FileCsv выбран, Done/Execute; subtype 3 для управляющей роли файловых узлов | Два собственных файла без перенастройки; повторный readback после Save; неверный тип/NULL |
| Кластеризация / число кластеров / integer | `ClusterizationWizard;pedClusters;SwitchButton` | Предыдущее UI: наличие переключателя; код читает `pedAutoClusters` и `pedClusters` отдельно | Отключить автоопределение, выбрать K, Done/Save/reopen; строка/NULL/вне диапазона |
| Линейная регрессия / seed / integer | `LearnPartitionWizard;RandSeedEdit;edtRandSeed;SwitchButton` | Предыдущее UI: переключатель на странице разбиения; обучение не проверялось | Выбор Seed и readback до/после Done/Save; string/NULL; сохранить остальные параметры |
| Группировка / сортировать результат / boolean | `GroupDataWizard;pedSortResult;SwitchButton` | Предыдущее UI: поле доступно; код читает `ValueControl` и pressed отдельно | Bool-переменная, оба значения, Done/Save/reopen; integer/string/NULL |
| Сортировка / сравнение по локали / boolean | `SortingWizard;SortingColumnCollection;chkLocaleAware;SwitchButton` | Предыдущее UI: опция есть; код читает `chkLocaleAware` и pressed | Подтвердить полный TID мастера в новом DOM, bool, Done/Save/reopen; integer/NULL |

Источники: [LAB-828 evidence](../capabilities-evidence.md), разделы
`transform-filter_data`, `imports-text`, `datamining-clustering`,
`datamining-lin_regression`, `transform-group_data`, `transform-sorting`.
У Фильтра — прежний `ui.jsonl:17–20,219–221,204`; у импорта — `235–239`;
кластеризация — `100`; seed — `106`; Группировка — `27–30`;
Сортировка — `22–24`. Это ссылки на выдержки прежнего исследования,
не на доступный читателю сырой журнал текущего запуска.

Предыдущее сохранение/новое открытие и сериализованные
`PropBinder/PropertyBindSavers` для Фильтра/имён файлов описаны там же
в разделе «Сохранение и чтение в новом документе». Там доказано сохранение
`PropertyPath` → `VariableName`, но не все шесть строк этой таблицы.
Переменная выбирается по техническому имени, подпись со значением не identity.

## Единый жест: гипотеза с ограниченными доказательствами

Предыдущее UI показывает общий образец: подключить source → input,
открыть страницу → SwitchButton → VariableControl/picker → точная переменная
→ commit → Done. `VariantPropEdit` у Фильтра — класс редактора параметра;
это **не** доказательство приёма табличного поля типа Variant.

На базе есть частные реализации: `client/lib/filter-procedure.mjs:205–225`
и `crosstable-variables.mjs:222–257` (пути от `packages/loginom-runtime`).
Они подтверждают сходство UI-процедуры в коде, но не универсальную writer
функцию для всех мастеров. Фильтр уже принимает variable operand;
LGD Import/Export уже имеют собственные bindings. Их нельзя объявлять
отсутствующими или менять молча при добавлении общего API.

Отдельная ловушка текущего кода: `grouping-context.mjs:46–50` и
`sorting-context.mjs:42–48` читают значение **ValueControl**, сохраняя pressed
отдельно. После привязки скрытая константа не подтверждает выбранную переменную
или фактическое значение. Нужен независимый readback variable mode/picker.

План живой проверки каждой строки: записать schema переменных и source IDs;
выбрать подходящую; Done → reopen; Save → закрытие → новый документ → активация
источника → reopen без редактирования. Сверить binding, mapping, порт и ID узла;
изменить только значение источника и выполнить. Затем в отдельной собственной
копии проверить неверный тип, типизированный NULL и недопустимое значение.
Записать, что именно делает UI: скрывает вариант, отказывает при выборе/Next
или выдаёт execution error. Не исправлять тип и не снимать binding автоматически.

До этого вывода нельзя утверждать ни общую native конверсию типов, ни смысл NULL.
Контракт ниже **предлагает** консервативный отказ; он не описывает измеренное
поведение Loginom. Наблюдение разных реакций на тип ещё не означает принципиально
разный механизм привязки: это может быть разная политика самого поля.

## Variant на табличном входе

Все три живые строки **не проверены из-за входа**. Подготовлен минимальный
[typed fixture](fixtures/variant-input.json) для native источника; JSON не
импортируется как обычный CSV, который потерял бы subtype. Предлагаемый путь —
собственные переменные r01…r08 → VarToData rows, уже описанный в W2:
Name переименовать в RowID (string), Value в V (variant), DisplayName исключить
штатным выходным mapping. У r06 исходный тип integer и значение NULL;
остальные source types/values заданы ячейками JSON. Альтернатива — собственный
LGD с доказанной Variant-схемой. Реальная схема и subtype проверяются до мастера.

| Узел | Что известно по коду базы | Обязательное UI/execute наблюдение |
|---|---|---|
| Калькулятор | `calculator-context.mjs:47,77+` распознаёт native DataType=6; expression schema результата ограничена scalar | Пропустить V без выражения над ним, затем отдельное явно типизированное выражение; принятие/ошибка Next, выходная схема, все значения и NULL |
| Группировка | `grouping-context.mjs:28+` знает variant; `grouping-parameters.mjs` допускает sum/avg только integer/real и unique_count только integer/string | V как ключ; V как count/min/max; отдельно sum и отказ/приведение; native schema каждого результата |
| Сортировка | `sorting-context.mjs:23–35` знает variant; `sortingKeySchema` требует case_sensitive для string/variant | V ASC, locale=false, вторичный RowID для равных значений; actual порядок subtype/NULL, сохранение Variant и значений |

Тот факт, что reader узнаёт тип 6, не доказывает принятие мастером, порядок
сравнения mixed scalar или точность чтения. Ключ Variant в Группировке также
не считается принятым только потому, что локальный валидатор его не запретил.
Не обещать приведение 7 и "7" к одному ключу и не закреплять порядок NULL до UI.

W2: [VarToData discovery](../../nodes/variables-vartodata/discovery.md),
[контракт](../../nodes/variables-vartodata/contract.md),
[план, этап 2](../../nodes/variables-vartodata/plan.md#этап-2--отдельное-назначение-r02-r03).
Старый план не отражает весь новый код: на данной базе `node-procedure.mjs:263`
включает `typedVariants:true` для `variables.to_table` и `imports.lgd`.
`node-port-output.mjs:328–342` уже использует native typed reader с civil time.
Для трёх исследуемых типов этот opt-in отсутствует; перенос его без проверки
owner/полноты/cleanup и действующего W2 решения не предлагается как готовая правка.

Читателю нужны отдельные column type=variant и cell subtype, exact integer,
boolean/string/real, NULL без подмены, temporal civil time/точность до ms;
0, false, пустая строка и NULL различимы. Схема, число строк, новые execution/read
IDs и completeness обязательны. Показанный текст ячейки или AsVariant без subtype
не доказывает exact result. Общий writer bindings этого вопроса не решает.
