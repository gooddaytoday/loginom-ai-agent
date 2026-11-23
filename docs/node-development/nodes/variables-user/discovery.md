## Наблюдения LAB-898: real и datetime

05.11.2026, mas, Loginom 7.4.2, Chromium 1243, только
`https://app.loginom.ai/app/?testable=true`, worker пары из назначения.
Новый собственный пакет `lab898-real-date-20261105.lgp` сохранён в разрешённом
каталоге worker. Чужие пакеты не открывались. Жесты по `data-tid`, чтение
только локальных Ext controls/store своего мастера; JS Loginom не подменялся.
База `v040-int7@353f4df461156f639e25109773034b0b12864904`.
Сырые доказательства/скриншоты приложены к комментарию карточки, не к Git.
Ссылки `ui:N` ниже — строки исходного `research-evidence.jsonl`;
приложенный компактный JSON сохраняет исходные номера.

## Как открыть и какие controls

На своём root-графе: правый клик по наблюдённому
`<prefix>;Graph;Переменные_сценария;Output_Var-4`, затем
`mn;mniConfigurePort`. Двойной клик порта открывает preview, не редактор.
Мастер `<prefix>;WizrdMCF;VariablesEditValuesWizard;` (далее V):
`grdTargetColumns`, `btnAddMappingColumn`, `btnEditMappingColumn`.
Строку можно выбрать `V;colName_<имя>`; identity всё равно берётся из store ID,
а не из русской подписи. В мастере поля, не табличные порты; у builtin
по-прежнему 0 табличных входов/выходов и пять variable outputs, writable — 4.
Никакой новой выходной таблицы смена типа не создаёт. Таблица появляется
только у отдельного потребителя, например существующего variables.to_table.

Диалог `EditVariableForm` (E): `edtName`, `edtDisplayName`, `cbxDataType`,
`cbxDataType;trg_picker`, `cbxNullValue;DisplayEl`, `btnApply`, `btnCancel`.
Типы имеют собственные tids в `E;cbxDataType;boundlist;`:
`Вещественный` → DataType=3, `Дата/Время` → 2 (ui:39).
Новые типы не меняют поля Name/Label и набор портов.

| Тип | Поле под E | Наблюдение |
|---|---|---|
| real | `pgcValue;num` | Ext.form.field.Number, decimalSeparator `.`; 0.15 сохраняется Number (ui:44/47/50) |
| datetime | `pgcValue;datetimefield` | Ext.ux.DateTimeField; format m/d/Y H:i, altFormats включают секунды и ISO `c` (ui:58) |
| NULL | `cbxNullValue;DisplayEl` | Чекбокс true отключает поле; ValueIsNull=true и DisplayValue=null (ui:94/148) |

Конфиг number содержит decimalPrecision=2, но наблюдение важнее этого
признака: 0.155 сохранилось без округления; 0.12345678901234567 стало
binary64 0.12345678901234566, пережило Apply и повторное открытие редактора
(ui:79/85/88/92). Это нормальная binary64-конверсия ввода, не decimal exact.
Переносить ограничение «два знака» из другого мастера нельзя. Холодная проверка
этого многозначного числа не выполнялась; cold проверен для 0.15.
`0,15` после Tab стало 0 без ошибки (ui:76). В этапе 1 вводить число через
наблюдённый separator, проверять native Number и повторный snapshot.
Экспоненты, отрицательный ноль и предельные величины ещё требуют адресной
проверки; отсутствие результата для них не доказывает полный диапазон writer.

## Дата, миллисекунды, часовой пояс

Ввод `2026-10-31` стал 2026-10-31 00:00, без ошибок (ui:61).
API-предложение всё равно требует полную civil дату с секундами, чтобы
модель явно выбрала начало дня и не зависела от локальной записи даты.
`2026-10-31T23:59:59.123` после Tab стало Date с ms=0 и raw
`10/31/2026 23:59:59`; Apply сохранил именно это (ui:64/67).
Целые секунды и ISO с .000 работают. Для произвольных .sss точный ввод
через этот control **не доказан**, наблюдён тихий сброс; предлагается ранний отказ.
В UI нет отдельного наблюдённого поля часового пояса или миллисекунд.
Никаких внутренних setters Date/сервера для обхода этого не вызывалось.

Пустой real при unchecked NULL: getValue=null, ошибка «Пустое значение
не допускается» (ui:82). Пустая дата при unchecked NULL: getValue=null,
ошибок нет, но Apply записал текущее время с .459 (ui:106/131).
В отдельной native_clock тот же жест записал 2026-11-05 05:47:52.160
(ui:148). Поэтому пустая строка и NULL у этих типов не эквивалентны.
Явные missing_threshold:real и missing_date:datetime с checkbox NULL
сохранились как два независимых typed NULL.

Редактор существующей переменной не блокирует type selector
(typeDisabled=false, ui:76). Это возможность UI, не разрешение API:
проверка всего patch на смену типа должна по-прежнему предшествовать жестам.

## Что сохранено и cold

Done → отдельный Save в свой пакет → Close → logout → новый browser context
Europe/Moscow → login → открыть тот же путь → Configure output 4 (ui:148–181).
В исходном UTC и холодном Moscow совпали IDs 0..4, имена, финальные метки,
DataType 3/2/3/2/2, real 0.15, оба NULL и все civil-компоненты даты:
report_date = 2026-10-31 00:00:00.000,
native_clock = 2026-11-05 05:47:52.160.
JS Date ISO у report_date в Moscow — предыдущий день 21:00Z, но civil-поля
остались 31 октября: toISOString не является oracle пользовательской даты.
Это доказательство сохранённых typed-значений после cold. Бинарная/XML-схема
файла не исследована: браузерная попытка скачивания не дала download event,
поэтому native OADate/bytes из самого .lgp не утверждаются.

Во втором независимом открытии UTC применён **неизменённый** decodePortCell
из базы к реальным DisplayValue/ValueIsNull этого store (ui:222):
real → binary64/17_significant_digits 0.15;
две даты → local_datetime/millisecond, timezone unspecified, включая .160;
два NULL → exact_null; limitations везде пусты.
Это адресная проверка W2-декодера, не PASS всей новой runtime-цепочки:
readVariableRecords на базе до него ещё запрещает real/date в values.
В конце этого открытия мастер отменён и пакет закрыт. После неудачного
жеста logout выполнен отдельный штатный cleanup в новом context: открыть
свой пакет, Close, дождаться исчезновения графа, logout, дождаться LoginForm,
закрыть браузер. Итог final_cleanup в приложенных доказательствах:
package_closed=true, logged_out=true, browser_closed=true.

## Вывод для W2 и бизнеса

Envelope cell уже умеет real/civil datetime; нужен добавочный enum datetime
у variable.type и maps типов в typed inventory. DisplayValue — Number/Date,
не строка, показанная гридом. Общий native Variant transport interface116
не подключается к builtin: источник values — локальный wizard store,
execution_id=null. Native proof/bytes и semantic civil precision различать.
Shape envelope/legacy decoder менять не требуется; DST/старые даты
сохраняют уже существующие отказы декодера и требуют регрессионных проверок.

В filter-parameters.mjs variable operands ограничены integer/string.
Калькулятор уже читает input_variables всех пяти scalar типов и принимает
Var.name. Предлагается вычислить признаки с переменными там, отфильтровать
их обычным Фильтром строк; без изменения Filter API и без конвертации
переменных в строки. Живой бизнес-прогон этой связки — этап 1, не выполнен.

## Байты модели и проверка этапа 0

UTF-8, карточка — compact JSON ровно объекта node_types[0], как в budget test.
Все хеш-поля proposal — 64 нуля; значения не являются рабочими pins.

| Поверхность | База | Предложение | Лимит |
|---|---:|---:|---:|
| variables.user card | 3106 | 3554 | 12000 |
| SKILL.md | 38892 | 38903 | 40000 |
| Строка маршрута, с LF | 97 | 108 | около 200 |
| references/nodes/variables.user.md | 2488 | 3273 | 6000 |
| dock_node_apply model_tool_bytes | 14512 | 14512, проекция | 20000 |
| full_input_schema_bytes | 59276 | 59680, проекция | нет, модели не отправляется |

Размер SKILL после **замены** существующего маршрута, не добавления второй
строки; reference proposal заменяет текущий файл. Карточка — предложение,
не измерение реализованного нового handler. Установленный skill не менялся.
Проекция apply получена заменой только parameters.variables в копии schema
на proposal и вызовом существующего userNodeTool в памяти. Compact-поверхность
не изменилась: подробности параметров модель получает из карточки типа.
На этапе 1 повторить штатный budget test на реально зарегистрированном коде.

`nice -n 19 node --test test/model-schema-budget.test.mjs` из client,
Node 24.19.0: exit 0, 50 PASS (журнал model-budget.log). model_tool_bytes
получен штатным тестом через userNodeTool; полная input schema отдельно.
`python3 docs/node-development/nodes/variables-user/acceptance/oracle.py`:
exit 0, обе фазы/оба результата совпали с expected.json.
JSON fixtures/proposal разобраны, git diff --check — exit 0.
Сборки CLI, изменения runtime и модельные приёмочные прогоны не выполнялись.
