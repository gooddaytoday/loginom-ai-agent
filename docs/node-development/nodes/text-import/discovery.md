# LAB-15: одиночный табличный TXT

Дата: 2026-10-06. Наблюдение runtime: `2acc44bae02663132b5ec3e26a7257a1bc1a9cdc`.
Linux x64, standalone CLI, Node 24.19.0, Bun 1.3.14; живой Loginom 7.4.2,
`http://logi-test-plan.bg.local/app/?testable=true`. Матрица назначена отдельно
от остального этапа 1; её модельная и независимая приёмка — `NOT_RUN`.

## Проверенная диагностика

`loginom setup` и отдельный `loginom status` подтвердили `state=ready`.
Новая диагностика `lab15-discovery-4` после сверки внешнего состояния успешно
доставила синтетический исходный TXT, выполнила импорт двух строковых полей,
прочитала живой мастер и отменила чтение настроек без применения.
Подтверждены `package_closed=true`, `logged_out=true`. Это discovery,
не модельная CLI-приёмка матрицы и не независимый oracle.

Сохраняются все предыдущие FAIL. В `lab15-discovery-3` создание узла было
подтверждено, а открытие мастера вернуло `AMBIGUOUS` (navigation).
Исходные cleanup-флаги этой попытки остаются false. До нового прогона
Диспетчер подтвердил собственный worker, точный путь пакета из журнала
и `Executing=false`; установленный `release-sessions.mjs` закрыл шесть
сессий только этого worker и проверил их отсутствие. Выход оператора
подтверждён отдельно. Новый пустой документ не используется как доказательство
отсутствия прежнего пакета; старые client document/workflow/GUID не восстановлены.
Неизвестный жест не повторяли, исходные deadlines не продлевали.

## Живые поля и блокер границ

Во второй странице `ImportTextFileParamsWizard` наблюдены:

| Native control | Назначение | Доступность в текущем format readback |
| --- | --- | --- |
| `edtDelimiterChar` | Разделитель столбцов | Да |
| `edtTextQualifier` | Ограничитель строк | Да |
| `edtValueNull` | NULL-маркер | Да |
| `edtDecimalSeparator` | Десятичный разделитель | Да |
| `edtMultipleDelimiters` | Считать последовательные разделители одним | Нет |
| `edtDateFormat` | Формат даты; наблюдено «Не задано (dd/mm/yyyy)» | Нет |
| `edtDateSeparator` | Разделитель даты | Нет |

`workspace-ui.mjs:275` перечисляет четыре прежних import-format controls,
`workspace-ui.mjs:1602` проецирует только эти четыре поля и регистрирует их
для владельчески связанных действий. `text-import-procedure.mjs:51` и
`validateTextImportPatch` также допускают только четыре прежних параметра.
Добавление только новых ключей в контракт не обеспечит модельную доступность
и наблюдаемое применение/сохранение обязательных настроек.

Предложение владельцу: разрешить адресное изменение **только import-format**
секций `workspace-ui.mjs`: добавить три controls в bounded wizard selectors,
наблюдать boolean `multiple_delimiters`, строки `date_format`, `date_separator`,
связать checkbox и editable combo с теми же root/owner/stage guards.
Общую структуру оболочки, лимиты, другие мастера и публичные инструменты
не изменять. После решения реализовать согласованные параметры в существующем
imports.text, validators/schema/types/readback и node-specific acceptance.
Старые запросы и частичные patches сохранить; отсутствие новых параметров
в существующем узле сохраняет наблюдённые настройки, defaults новых узлов
согласовать и явно документировать до прогонов. Отказы и owner/deadline
регрессии обязательны. В LAB-15 владелец разрешил указанную адресную правку. Реализованы optional
`multiple_delimiters`, `date_format`, `date_separator` через прежние действия;
новые запросы матрицы задают все три явно. Старые запросы без них сохраняют
нативные defaults нового узла, patches не меняют неуказанные настройки.
Новая версия требует отдельной CLI-проверки; прежний диагностический PASS
не переносится на изменённый SHA.

## Источники и ограничения

- [Текстовый импорт](https://help.loginom.ru/userguide/integration/import/txt/index.html):
  форматы, объединение разделителей, кодовые страницы и явные настройки даты.
- [Многострочные значения](https://help.loginom.ru/userguide/integration/import/txt/txt-multiline.html):
  предел 2^22 = 4194304 символа; превышение и незакрытый ограничитель могут
  давать предупреждения, поэтому статус исполнения не доказывает точную таблицу.
- [Текстовый экспорт](https://help.loginom.ru/userguide/integration/export/txt-csv.html):
  экспорт многострочных ячеек не заменяет точный readback малых fixtures.
- [Диспетчер](https://help.loginom.ru/userguide/admin/dispatcher.html):
  отключённая сессия сохраняется на сервере; восстановление требует исходного
  открытого окна браузера. Перезапущенный профиль не воспроизводит старый документ.

Полная матрица, негативные исходы, cold persistence, регрессии transactions/CSV/TSV,
модельная доступность новых controls и независимый Review остаются `NOT_RUN`.
Desktop — `not_checked`. Готовность всего узла/этапа 1 не повышается.

## LAB-15: maxlength отказ и отдельная сверка

На `97499df591b34f9f4290b30610965c8ee0b7a76f` модельный `comma_utf8`
доставил 200 байт с правильным SHA и создал узел, но configure стал
`AMBIGUOUS`: `edtDateSeparator` имеет maxlength=1, ввод метки `Дефис (-)`
длиной 9 был отказан. `date_format=yyyy/mm/dd` прочитан обратно, импорт
не выполнялся. Исходные FAIL и cleanup=false остаются в старой попытке.

По разрешённой сверке Диспетчер показал единственный несохранённый `Package1`
под worker-сессией 5452, что совпало с account/name/path=null в журнале
`lab15-comma-1`. GUID не представлен в Диспетчере: document/workflow/node
из исходной квитанции не выдаются за заново наблюдённые. Все пять worker-сессий
и пакет имели Executing=false. Штатный release-sessions закрыл эти пять
сессий только заданного аккаунта и проверил отсутствие; второе независимое
чтение Диспетчера подтвердило ноль worker-сессий. Выход оператора подтверждён
отдельно. Профиль, журнал, marker сохранены; неизвестных жестов/recover/replay
не было, плановый путь не принимали за сохранение пакета.

Разрешённое адресное исправление: выбирать только уникальную наблюдённую
опцию date_separator через существующий select_wizard_option, с тем же
field input/owner/root/stage и exact readback. maxlength=1 не меняется.
Прежний путь NULL-маркера сохранён; отдельные отказы покрывают чужие refs,
неверную stage, неоднозначность и неверную метку. Живая матрица нового SHA
требует новых попыток; статические проверки не объявляются её PASS.

## LAB-15: подтверждённое строковое CRLF/LF отображение

На `27b11bf2307cb94dd1ca73708f64659270f02e93` исходный
`lab15-pipe_multiline-1` остаётся FAIL/AMBIGUOUS/read; marker и журнал сохранены.
Диспетчер сопоставил единственный несохранённый Package1 в worker-сессии 5495
с account/name/path=null журнала; все пять сессий и пакет Executing=false.
GUID доступен только в исходной квитанции, не в Диспетчере. Штатный release
закрыл пять сессий только worker; отдельное повторное чтение подтвердило ноль.
Выход оператора подтверждён отдельно. Неизвестная операция не повторялась.

После разрешения владельца отдельная приватная диагностика на том же SHA
создала собственный новый пакет/узел и выполнила только schema read (sample=0).
В `lab15-multiline-diagnostic-2` два bounded чтения исходного reader с
добавлением приватной пары в отказ показали идентичный результат: string Note,
row=2, cached `first\r\nsecond| "quoted"`, DOM `first\nsecond| "quoted"`.
Document/workflow/node/Table/port/record/header binding подтверждены до и после
чтения; все прежние guards выполнены, verified=false сохраняется. Dataset/RPC
не использовались. Закрытие собственного диагностического пакета и выход
подтверждены. Первая диагностическая попытка отказалась до настройки из-за
неполного source path; её package_closed/logged_out также подтверждены.

Разрешённая правка общего reader допускает только CRLF→LF соответствие для
string, сохраняя исходный ValueText без нормализации. Bare CR, обратное LF→CRLF,
изменённые символы, numeric/variant, NULL mismatch, foreign node/row/column,
скрытая ячейка и прежний размерный лимит по-прежнему отказываются. Новое
соответствие требует наличия CRLF: пустая строка и одиночный пробел сохраняют
прежнее требование native NBSP-placeholder, совпадение с raw пустотой/пробелом
по-прежнему отказывается. Адресные 62 Table теста PASS.
Матрица и регрессии нового чистого SHA требуют
новых CLI/cold попыток; пять PASS старого SHA не переносятся.


### LAB-15: initial field-count refusal

`wrong_delimiter` exposed a complete native definition with one field while
the request contained two. The old shared reader raised a generic count error
before the import handler could perform its existing owned draft discard.
Initial `imports.text` now reads the whole bounded owner-bound schema and
raises `ImportColumnCountError` (a binding refusal) before column edits. Other
reader errors and transport uncertainty retain their existing behavior.
Existing-node partial patches still reconcile the complete retained schema.
Seven addressed tests cover short/wide mismatches, complete traversal, no
column edits, incomplete/changing pages, foreign owner and transport loss.
Live acceptance requires fresh attempts on the published candidate; historical
AMBIGUOUS/false-cleanup receipts are preserved.

## Independent review correction (LAB-15)

The d17a0fc ambiguous_headers evidence used missing OtherName against native
Name/Name_1 and therefore demonstrated only a missing-field refusal. It is kept
separately, and does not pass ambiguous_headers. The reproducible replacement
under acceptance/negative requests source_name=Name twice with unique output
names. Its expected boundary is the existing preflight Duplicate source column
names validator before node creation or Execute; live CLI and independent cold
zero-import graph/source/cleanup evidence remain mandatory on the final SHA.
No general runtime guard or handler is changed by this correction.
