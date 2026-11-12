# W1: наблюдения канала переменных — LAB-1445

12.11.2026, mas3, Loginom 7.4.2, Chromium 1246, Node 24.19.0.
База `9073de63faca1f755f1daf670767a5b2959f5c05` (`v040`).
Это частичное выполнение [native-проб плана](variables-output.md),
не реализация W1 и не приёмочный PASS. Runtime, схемы, skill, oracle и
критерии не менялись. Публичный Variant-выход по-прежнему недоступен.

Этот раздел описывает первый checkpoint. Продолжение после решения
`v040-variant-w1-rpc` и подтверждённый канал — в конце документа.

## Пакет и воспроизведение

Назначенная worker-пара, только `https://app.loginom.ai/app/?testable=true`.
Штатная доставка `variables-column-union.mjs prepare` создала собственную
копию `variables-datatovar/fixtures/aggregate-source.lgp` под именем
`lab1445-variant-native.lgp`. Источник JavaScript сохранён без изменения
данных. Через UI добавлены DataToVar по V с девятью функциями и отдельный
диагностический мост «Переменные в таблицу», режим «В строки».
Мост не предлагается как путь продукта и не входит в пользовательскую задачу.

Сырые доказательства вне Git, приложены к карточке: `discovery.jsonl` и
`execution-events.jsonl`. Ниже ссылки вида журнал:строка относятся к ним.
Базовая CLI подготовлена через `run-check start --prepare-only`, затем
`wait`; `sourceCommit` равен базе, `sourceDirty=false`.

## P1: passive store не сохраняет числовой подтип

`discovery.jsonl:23`: полный загруженный store preview содержит 9 записей.
Поля модели: ID, Index, Name, DisplayName, Value, Description, DataType,
ValueVariant, $self. `Value` и `$self` не вызывались и не раскрывались.

| Имя | DataType | ValueVariant | JS typeof / constructor |
|---|---:|---|---|
| V_Count | 4 | 5 | number / Number |
| V_Min | 6 | false | boolean / Boolean |
| V_Max | 6 | x | string / String |
| V_Mode | 6 | 2 | number / Number |
| V_Uniq | 4 | 3 | number / Number |
| V_Null | 4 | 1 | number / Number |
| V_First | 6 | 2 | number / Number |
| V_Last | 6 | 2 | number / Number |
| V_Only | 6 | null | object / отсутствует |

`undefined` не получен. Класс Number не различает native integer/real;
`null` сам по себе не различает NULL/Empty. Пассивный канал P1 недостаточен.

## P2 и P3: точный reader и диагностический мост

P2: источник выполнен существующим execution driver, подтверждён
`execution_id=fae86dff-a969-487e-9595-3640dcdad5a9:358:3`, process `3.1`.
`readOutputPort({typedVariants:true,requireExactNumbers:true})` отказал:
`unsupported native tag; no inferred subtype` (`discovery.jsonl:29`).
Конкретный tag ошибки не опубликован: числовой подтип V остаётся
неподтверждённым. Из этого сообщения нельзя выбрать integer или real.
Fallback P2 через источник Свёртки ещё не выполнен.

После Save → Close/logout → нового профиля и открытия мост выполнен
без перенастройки. Подтверждён
`execution_id=30a0c1e3-4142-4e56-aa07-bb0fbe770b7c:313:1`, process `1.3`
(`discovery.jsonl:45`). Каждая строка читалась тем же production reader
с `rowOffset` и `sampleRows:1`, без ослабления guards или decoder.

| Переменная | Наблюдение reader после cold Execute | Журнал |
|---|---|---|
| V_Count | integer, tag 20, decimal 5 | discovery.jsonl:46 |
| V_Min | boolean, tag 11, false | discovery.jsonl:47 |
| V_Max | string, tag 8, x | discovery.jsonl:48 |
| V_Mode | отказ unsupported native tag | discovery.jsonl:49 |
| V_Uniq | integer, tag 20, decimal 3 | discovery.jsonl:50 |
| V_Null | integer, tag 20, decimal 1 | discovery.jsonl:51 |
| V_First | отказ unsupported native tag | discovery.jsonl:52 |
| V_Last | отказ unsupported native tag | discovery.jsonl:53 |
| V_Only | null, tag 1 | discovery.jsonl:54 |

Это частичная native-проба: полный subtype oracle P2/P3 не установлен.
`V_Only` в этой пробе — NULL, не Empty. Не переносить это наблюдение на
все пустые входы или на все виды NULL.

## P5: повтор после сохранения и текущий отказ W1

Пакет заново открыт в новом браузерном профиле, новый document_id
`30a0c1e3-4142-4e56-aa07-bb0fbe770b7c` (`discovery.jsonl:42`).
Повторное чтение preview после собственного Execute DataToVar дало
те же 9 имён, типов, JS-классов и значений (`discovery.jsonl:58`).

Production `channel.readVariablePort` на подтверждённом выполнении
DataToVar `30a0c1e3-4142-4e56-aa07-bb0fbe770b7c:313:2`, process `2.1`,
отказал `Variable inventory: record metadata/type`
(`execution-events.jsonl:360`, `discovery.jsonl:56`). Причина — карта
DataType 1–5 в `client/lib/node-output-context.mjs:13`.
Это red текущей production-ветки; green не заявлен.

Промежуточные диагностические отказы не считаются PASS: первая попытка
execution driver требовала предварительно выбрать именно native body;
первая попытка мостового Execute не нашла новую группу; после нового
открытия требовалось сначала связать workflow через штатный graph adapter.
Они записаны в исходные журналы. Дедлайны и guards не менялись.

## P6 и P7: граница канала

`discovery.jsonl:24`: native variable output port имеет FType 1,
FSubType 3 и identity `$I=1081`. Собственные ключи port.data:
`$S`, `$FRefCount`, `$`, `__ObjectId`, `__$cachedProps`.
Пассивный список bg содержит, в частности, `IBGVariable`, `IBGVariables`,
`IBGOutputVariablesVendor`, `IBGVariableItems`, `IBGVariableInfos`.
`get_Output` и QueryInterface переменного порта не вызывались.
Существующий exact reader привязан к interface116/method321 таблицы;
эти пробы не доказывают его применимость к интерфейсу переменных.

`discovery.jsonl:25`: preview имеет колонки №, Имя, Метка, Значение,
Описание, а также безымянную служебную колонку. Отдельной колонки типа
или подтипа в этой пробе нет. Data-tid колонок и ячеек имеются; после
закрытия первого preview graph adapter однажды отказал из-за временно
отсутствующего data-tid variable-порта. Guards не обходились.

## Решение до цикла 2

Условие входа в цикл 2 плана не выполнено: полного точного канала
подтипов переменных нет. Для продолжения требуется решение владельца
по исследованию и введению нового pinned RPC-канала переменных из P6.
Он должен сохранять owner/execution/session/release/deadline/byte guards;
угаданный подтип, ослабление точности и мост в графе пользователя неприемлемы.
Числовые отказы P2/P3 также требуют установить фактические wire tags до
изменения существующего decoder/adaptCell. Одобрение W1 само по себе
не принимается за подтверждение неизвестного subtype или метода.

P4 (empty/all-NULL), fallback P2, полное сравнение P2/P3 и полный cold
subtype oracle остаются not_checked. Приёмочный `datatovar-variant` и
регрессии модели не запускались: runtime-кандидат не создан. ≥2/3 и
независимая приёмка не заявляются.

Обе сессии завершены Save → Close/logout, без discard
(`discovery.jsonl:41` и `:60`); оба Chromium закрыты.
Следующий шаг после решения — завершить native-пробы, затем минимальный
W1 reader по плану с red→green и обязательной живой приёмкой.

## Подтверждённый W1 RPC после решения владельца

Решение `v040-variant-w1-rpc` разрешило исследовать и ввести pinned канал.
Тот же собственный пакет, новая сессия; исходный JavaScript не менялся.
Для дат и real в диагностический DataToVar добавлены агрегаты исходных D/N.
Журнал продолжения — `rpc-probes/discovery.jsonl`, вне Git.

Native-цепочка подтверждена вызовами и загруженными реализациями:

| Объект | Interface | Метод | Результат |
|---|---:|---:|---|
| Выходной переменный порт | 1081 | 2826, get_Output | generic interface0 |
| output.QueryInterface(IBGVariables) | 0 → 541 | штатный QueryInterface | коллекция текущего выхода |
| Коллекция | 541 | 778 / 779 | Count / элемент interface511 |
| Переменная | 511 | 1510, get_Value | value interface427 |
| Значение | 427 | 1141, get_AsVariant | scalar native frame, без аргументов |

Метод 1141 использует request static size 20, response static size 12.
В этой пробе frame size 60. Байты декодированы существующим
`decodeVariantFrame`; методы и критические реализации сверяются по SHA-256.
Имена, ID, индексы и DataType всех 13 переменных совпали с полным preview.

| Переменные | Объявленный тип | Native tag / значение |
|---|---|---|
| V_Mode, V_First, V_Last | Variant | **3, signed int32, 2** |
| V_Min | Variant | 11, false |
| V_Max | Variant | 8, x |
| V_Only | Variant | 1, NULL |
| V_Count, V_Uniq, V_Null | integer | 20, 5 / 3 / 1 |
| D (first) | datetime | 7, OADate 46024.12783707176 |
| N_Avg | real | 5, binary64 4.5 |

Tag3 объясняет прежний отказ P2/P3: decoder узнавал int32, но публичный
`adaptCell` допускал только tag20. W1 допускает tag3 исключительно через
закрытый `variableValue` путь; табличный schema/reader сохраняет прежний
набор допусков. Tag4 и Empty не объявляются поддержанными.
Дата здесь получена из переменной с объявленным datetime, не Variant;
самостоятельная Variant-date и empty/all-NULL остаются отдельными пробами.

Reader читает только Variant-переменные через этот RPC. Остальные ячейки
сохраняют прежний scalar decoder и envelope. Перед каждым обращением и
после ответа сверяются документ, workflow, native node/port, собственный
завершённый процесс, preview/grid/store, записи и metadata. RPC-элементы
сверяются с preview по ID/index/name/label/DataType, коллекция — по Count,
прокси — по сессии и owner/object/interface. Методы цепочки pinned.
Ограничения: 128 переменных, 512 KiB native frames, 1 MiB полного ответа,
исходный deadline и максимум 30 секунд на native frame.
Request/response и прокси освобождаются; pending/uncertain request сохраняет
прокси до закрытия браузера и не позволяет заявить cleanup или частичный успех.

Прямой прогон production-кода дал полный SUCCEEDED с точными шестью
Variant-ячейками и прежними scalar-ячейками. После закрытия native preview
выход указателя завершает наблюдённый redraw hover-порта перед graph read;
клик не повторяется, существующие owner/process guards сохраняются.
Приёмочный сценарий — `datatovar-variant`: исходный source-only пакет,
девять V-агрегатов, native tags по этой пробе, метки `label_any`, полный
порядок и выход 0. Модель получает задачу и путь пакета; expected и oracle
остаются вне её входов. Математические значения вычисляет существующий
независимый oracle (`--w1-check`), native subtype ожидания заданы отдельно.

Подготовленный JavaScript-источник имеет защищённые UI refs выхода:
обычный preflight отказал `Upstream port is not interactable` до создания
узла. Для DataToVar при явном `finish:"execute"` добавлен отдельный путь
через существующие owned selection и execution driver. Он выполняет
связанный сохранённый источник, получает подтверждённый process binding
и читает только схему (`sampleRows:0`) через completed-port reader.
Редактор, F3 и настройки JavaScript не открываются; публичные JS refs
сохраняют прежние запреты. Done/Close, чужой владелец и не-нулевой порт
отказывают до жестов. Для остальных обработчиков новый hook не задан.
Полный `runNodeApply` нового DataToVar от такого источника дал SUCCEEDED
и все девять V-переменных; исходный JavaScript и данные сохранились.
