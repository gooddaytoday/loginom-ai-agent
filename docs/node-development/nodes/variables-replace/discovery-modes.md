# Дополнительные режимы Замены переменных — LAB-1031

07.11.2026, mas2, Loginom 7.4.2, Chromium 1246, Node 24.19.0.
База `8943d291b046698d67828f19dcca88aab790cf2c`.
Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары.
CLI не собирался, runtime не менялся. Это исследование UI и предложение
приёмки, не PASS модели или run-check. Калькулятор принят владельцем и не менялся.

## Хвосты и короткие сеансы

Перед продолжением выполнен вход в оба аккаунта: inventory_complete=true,
package_count=0 у каждого; logout подтверждён. Закрывать с discard нечего.
Журнал `discovery3.jsonl:1–6` приложен к итоговому комментарию; сырые доказательства
не коммитятся. Старые `discovery.jsonl`, `discovery2.jsonl` сохранены.

Создана отдельная копия источника с восемью переменными из
[modes-source.json](fixtures/modes-source.json). Источник настроен, выполнен,
Save As/reopen/Close/logout успешны (`discovery3.jsonl:12–14`). Исходный
сохранённый пакет Калькулятора не перезаписан.

В следующем сеансе создан и связан один узел Замены: variables input 0 →
variables output 0, новых табличных портов нет. Мастер
`MF;TF-1;WizrdMCF;ReplaceVariablesWizard`, затем страница
DerivedVariablesMappingEngineOutputPortWizard и Done. Префикс таба и автоподпись
меняются; в дальнейшем обработчике использовать выданную identity/GUID.

## Матрица режимов

TID ниже — суффиксы относительно ReplaceVariablesWizard, если не указан иной root.

| Режим | Статус | Наблюдение / доказательство |
|---|---|---|
| Regex | Наблюдено, Execute/Save/reopen/Close | `grdReplaceItems;tbl;GroupHeader;1;AddButton`, Code Ab-12 → matched по ^Ab-[0-9]+$; журнал:21,29,39–41 |
| Без учёта регистра | Наблюдено, тот же полный цикл | `chkCaseSensitivity;DisplayEl`, native false; RED по ключу red → blue; журнал:24,39–41 |
| precision≠0 | Наблюдено, тот же полный цикл | `edPrecision`, 0.1: исходное 1.25 по ключу 1.2 → 2.5; журнал:30,39–41 |
| other=NULL | Наблюдено, тот же полный цикл | `cbxReplaceOther;boundlist;На_пропущенное`, native 1; Other → typed NULL без пар; журнал:31–32,39–41 |
| other=значение | Наблюдено в Execute; отдельный Save not_checked | `cbxReplaceOther;boundlist;На_значение`, `edtReplaceOther`, Other → default; журнал:71; совместная typed-проба не открылась корректно |
| other=регулярное выражение | UI наблюдено, семантика not_checked | `cbxReplaceOther;boundlist;На_регулярное_выражение`; журнал:31; остановка после двух переподключений |
| Смена типа | UI/Execute наблюдены, валидный Save not_checked | `btnTypeChange;mn`: строка 007 → целое значение 7; выход объявлен Variant, не integer, поскольку keep сохраняет исходные строки; журнал:49–51,59,69,71–74 |
| Variant | UI/Execute наблюдены, Save/reopen отказал | `ReplaceEditor;fldVariant;ValueContainer;txt;trg_SetDataTypeTrigger`; 7 integer → seven string, объявленный тип 6 сохранён; журнал:52–60,71–74 |
| datetime | UI и потеря мс наблюдены; положительная замена not_checked | `ReplaceEditor;fldVariant;ValueContainer;datetimefield`; .123 при вводе стало .000; ключ не совпал с исходным .123, значение осталось исходным; журнал:60–66,71 |
| Импорт правил | Кнопка наблюдена; формат/roundtrip not_checked | `btnLoad`, журнал:19,21; лимит переподключений до этого сценария |
| Экспорт правил | Кнопка наблюдена; файл не получен, not_checked | `btnSave`, журнал:19,21; та же остановка |

Ни один из этих режимов не объявляется «нет в 7.4.2». Для datetime отсутствует
подтверждение ввода ненулевых мс этим редактором; это ограничение редактирования,
а не отсутствие datetime в компоненте. Базовый exact и его критерии не менялись.

## Точные значения и ловушки UI

Первый полный выход 0 содержит ровно восемь переменных в порядке источника.
Color=blue string, Code=matched string, Amount=2.5 real, Other=NULL string;
report_date сохраняет civil 2026-11-07T23:59:58.123, mixed — Variant с числом 7,
total=3 integer, TextNum=007 string. Это fresh Execute исходного VariablesForm,
а не округлённый текст preview. После него Save As подтвердил совпадение пути
и графа при reopen; Close/logout успешны, discard=false (`discovery3.jsonl:39–41`).

Regex-пары хранятся в отдельной CollectionID=1: RegularExpression, Replacement,
ReplacementType. У первой такой пары native Index=0, но DOM colReplaceValue_1:
позиция учитывает placeholder точной группы. Нельзя адресовать по одному Index.
Summary и обычная строка имеют одинаковые TID; исключать tr.x-grid-row-summary.
Редакторы from/to — ReplaceEditor / ReplaceEditor-1, fldVariant; после fill
нужно завершить ввод через Tab и дождаться выбранной переменной и её store.

Смена типа — split-button: меню открывается стрелкой справа, не основной кнопкой.
Root `btnTypeChange;mn` имеет TID; у отдельных пунктов типа собственных TID нет
в этом меню (пробел testability). Выбор выполнен по точному тексту внутри
наблюдённого root. Меню: boolean/datetime/real/integer/string. Для Variant
сохраняется исходный dtVariant, а типы сторон пары выбираются через
trg_SetDataTypeTrigger; его boundlist имеет пункты с TID, включая «Переменный».

Datetime field.format=m/d/Y, H:i, но текстовый ввод ISO принимает секунды.
Readback ввода 2026-11-07T23:59:58.123: raw 11/07/2026 23:59:58,
Date 2026-11-08T04:59:58.000Z в UTC−05; миллисекунды потеряны. Нельзя молча
округлять ключи запроса. Ненулевые мс в ключе/замене следует отклонять до
мутации, пока не найден проверенный штатный ввод. В probe используется
уже фактически введённый ключ .000; oracle независимо сохраняет исходное .123.

## Typed-проба и отказ повторного открытия

В следующем собственном сеансе TextNum 007 → 7 с типом замены integer,
mixed 7 → seven с разными Variant-подтипами, Other → default. Полный Execute
подтвердил значения и прежний порядок. TextNum стал объявленным Variant
(native 6) с числом 7; mixed остался Variant со строкой seven.

Save As завершил запись по нужному пути, но reopen-граф отличался:
подпись сократилась, порты стали Undefined. Причина из `msgbox-1;cnt;cnt;MessagesView`:
**«Назначение \"Активное\" недопустимо для настраиваемой переменной \"Разное\"»**.
`discovery3.jsonl:69,71–74`. Это один наблюдённый отказ native Save/reopen;
не считать его независимой репродукцией или доказательством отсутствия режима.
Допустимое назначение выхода Variant/обход этого default не исследованы.
Смена типа и Variant replacement в предлагаемую callable-карточку не входят.

## Комплект, бюджет и объём этапа 1

[Match task](acceptance/task-match-modes.md),
[typed probe task](acceptance/task-types-probe.md), fixtures modes-*.json,
[независимый oracle](acceptance/modes/oracle.py) и
[expected](acceptance/modes/expected.json) — предложение владельцу.
Oracle использует Python re для данного якорного ASCII-шаблона, casefold для
данных ASCII и Decimal для разности в данном положительном примере. Он не
различает абсолютную и относительную шкалу precision. Общая совместимость regex-движков,
Unicode/collation, граница допуска, захваты и смешение групп не утверждаются.
Typed expected описывает наблюдённые значения, помечен как не прошедший persistence.

В предложенном бизнес-задании метки сохраняются как в exact. Native по умолчанию
добавил «Замена» к меткам обработанных полей; это наблюдаемое отличие от
предлагаемого handler, который должен восстановить исходные метки существующим
узловым путём. Значения/типы/порядок oracle не получены из Loginom.
Модели передаются только task и данные, не oracle/expected.

Match-срез предлагается как mode=rules рядом с прежним exact:
[карточка](node-card-modes-proposal.json), [reference](skill-modes-proposal.md),
[строка маршрутизации](skill-mode-route-proposal.txt). Compact-карточка 6969 Б
(база 5572, предел 12000); reference 3617 Б (предел 6000); строка 131 Б вместо
124, SKILL.md после замены строки 28185 Б (база 28178, предел 40000).
Hash-поля карточки — 64 нуля. PR #803 пока открыт, предложение reference целое.
Базовый apply model_tool_bytes=14539/20000; full_input_schema_bytes=64280,
модели не отправляется. После реализации apply не измерен.

Оценка match-среза — 2 цикла + 1 резервный; файлы
`client/lib/variables-replace-{schema,parameters,context,procedure,readback,node}.mjs`,
аддитивная декларация режима в node-contracts.mjs, reference и штатный
сценарий run-check. Точная оценка typed/file-срезов пока не готова.
Нужны аддитивные общие дополнения W1 для fixture с Variant: текущий
variable-port-mapping.mjs допускает native 1…5; parseExpectedVariableInventory
в scripts/node-acceptance/expected-outputs.mjs не принимает variant. Это зависимость
до приёмки, а не сделанная правка. Потребность в неаддитивной общей правке
не установлена; если появится — стоп. Native-ошибка назначения также не исправлена.

## Новый checkpoint сеанса

Разрывы зафиксированы при load ниже числа ядер (20):

| Наблюдение, UTC | load1/load5 | Доказательство |
|---|---|---|
| 2026-11-07 19:55:49.552 | 4.67 / 6.04 | discovery3.jsonl:64, msgbox;cnt;cnt;cmp |
| 2026-11-07 20:02:30.822 | 3.10 / 4.12 | discovery3.jsonl:75, тот же TID |

Использованы два разрешённых восстановления; второе только для закрытия.
Третьего нет. Финальный Close/logout types-пробы не подтверждён:
CONNECTION_DISCONNECTED, discard=false (`discovery3.jsonl:77–79`). Браузер закрыт,
профиль и fail-logs сохранены. Импорт/экспорт, other=regex, положительный datetime
и матрица Таблицы в переменные остаются для другого стабильного сеанса/хоста.
