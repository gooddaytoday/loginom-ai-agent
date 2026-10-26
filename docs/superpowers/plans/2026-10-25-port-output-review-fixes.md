# Исправления ревью чтения выходного порта — Implementation Plan

> **For agentic workers:** выполнять по задачам с TDD; независимое ревью плана перед кодом и всего исправления перед завершением.

**Goal:** устранить три воспроизведённых дефекта: порчу числового текста в JSON-строках, лишнее сокращение preview с −0 и ложный PASS пустой выборки.

**Architecture:** исправить существующий общий redactor штатными JSON.parse reviver context / JSON.rawJSON закреплённого Node; адаптировать существующий preview-компактор к потере знака value при JSON. Проверку допустимого префикса сосредоточить в существующем Python verify_port_output и передавать туда sample_rows из всех consumers; ожидаемые данные остаются независимыми от ответа reader-а.

**Tech Stack:** закреплённый Node, node:test, Python unittest и стандартные библиотеки; без новых зависимостей.

**Spec:** [утверждённый дизайн](../specs/2026-10-24-port-output-reading-design.md) и три замечания ревью, исправление которых разрешено владельцем.

## Global Constraints

- Сохранить редакцию секретов, fail-closed, durable ACK, точность и происхождение данных.
- Сохранить 100 строк, 10 000 ячеек, 512 KiB UTF-8 JSON значений строк, 46 000 байт MCP и отдельную политику full.
- Работать в существующем port-read-design worktree; не менять reader/RPC, узловую настройку, Execute, native full или публичные схемы.
- Проверки выполняются из пакетов. Без push, PR, merge и выпуска.
- Оценка: 10–12 файлов, около 240–320 добавленных/удалённых строк с тестами и этим планом; сверить git diff --stat.

## Review Focus

- JSON-строки с >2^53, 1e400, −0 и вложенными строками сохраняют исходные числовые токены; секреты удаляются.
- Новая обработка JSON не позволяет обойти редактирование через rawJSON со строковым значением.
- JSON-roundtrip preview с −0 сохраняет decimal и возвращает не меньше строк воспроизведённого старого случая.
- Пустая/короткая выборка маленькой фикстуры отклоняется даже с заявленным read_limit; sample_rows=0 остаётся допустимым.
- Настоящие cell/byte stops принимаются лишь на правильной границе; UTF-8, JSON escaping и числовое оформление учитываются независимо.

### Task 1: Сохранить числовой текст при редактировании JSON

**Files:** client/lib/redact.mjs, client/test/node-output-json-journal.test.mjs (относительно packages/loginom-runtime).

**Interfaces:** createRedactor().redact(value) и nodeOutputForJournal(value,redactor) не меняются; journal ACK должен совпадать с опубликованным значением.

- [x] Добавить один тест реального redactor/journal: JSON-строка с 9007199254740993, 1e400 и −0 плюс password; проверить числовые токены, удаление секрета и повторный ACK. Запустить и увидеть RED.
- [x] Сохранять числовые source-токены reviver-а через JSON.rawJSON; clean допускает этот внутренний JSON number, но не обходит редакцию строк/объектов. Без собственного парсера. Увидеть GREEN.
- [x] Для существующих проверок element/name и usageCounters распаковывать raw number, сохраняя source-токен при сериализации. Проверить name:123, input_tokens:7, вложенный JSON-текст, обычные значения, неверный JSON, rawJSON string и существующие проверки секретов: node --test test/node-output-json-journal.test.mjs test/execution-journal.test.mjs и остальные существующие redaction-наборы.

### Task 2: Сохранить ёмкость preview после JSON-потери знака нуля

**Files:** client/lib/user-preview-budget.mjs, client/test/user-preview-budget.test.mjs.

**Interfaces:** budgetUserPreview и nodeResultReply не меняются; decimal остаётся источником знака −0 после JSON.

- [x] Добавить воспроизведение через JSON-roundtrip и настоящий MCP envelope: 100×10 real −0, сравнить возвращённые строки с legacy +0; проверить Object.is(Number(decimal),-0), исходную квитанцию и 46 000 байт. Увидеть RED.
- [x] Разрешить удаление дубликата value для decimal −0 / value +0, не сокращать decimal до +0. Увидеть GREEN.
- [x] Запустить node --test test/user-preview-budget.test.mjs test/user-results.test.mjs test/node-output-json-journal.test.mjs; сохранить отдельные full-отказы.

### Task 3: Независимо проверить причину уменьшения выборки

**Files:** tools/loginom-acceptance/{import_output_evidence,calculator_output_evidence,row_filter_output_evidence,javascript_output_evidence}.py и существующие test_import_output_evidence.py / test_port_output_evidence.py.

**Interfaces:** verify_port_output получает keyword sample_rows; все четыре consumer передают запрошенное значение. Общая проверка заменяет повторяющиеся проверки wanted/count.

- [x] Добавить RED/GREEN для ложного budget-stop на маленькой Import fixture; тем же общим исправлением закрыть Filter/Calculator и закрепить их регрессиями. Проверить допустимый sample_rows=0 и настоящие 10 000-cell / 512-KiB stops.
- [x] Вычислять число целых строк по независимым expected rows/columns, min(sample_rows,100), пределу ячеек и UTF-8 длине JSON массива простых значений. Не брать read_limit, sample или row_count ответа как доказательство границы. Нормализовать expected scalar теми же внешними правилами типов, но не вызывать runtime reader/decoder.
- [x] Для подсчёта длины real использовать стандартное кратчайшее Python repr и правила JSON оформления чисел (−0→0, fixed для [1e-6,1e21), нормализованный exponent), не писать общий JS-сериализатор; проверить пороговые числа и смешанную byte-границу против заранее заданных JSON-строк.
- [x] Отклонять неверное число строк и ложный/пропущенный read_limit. Обновить прежние тесты, разрешавшие произвольную короткую выборку.
- [x] Из acceptance запустить PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_import_output_evidence test_full_read_evidence test_port_output_evidence test_javascript_evidence test_node_procedure_evidence. Ожидается PASS; приватные captures могут дать SKIP.

## Завершение

- [x] Полный client node --test test/*.test.mjs закреплённым Node/Chromium; проверить diff, относительные ссылки и отсутствие чужих изменений.
- [x] Независимое ревью всего исправления относительно начала работы; устранить обязательные дефекты, повторять только затронутые проверки.
- [x] Отметить результаты здесь; один локальный conventional commit. Итог: что исправлено, чем проверено и что не проверялось.

## Checkpoint

Независимое ревью плана пройдено; уточнение rawJSON/name/usageCounters включено.
Task 1: RED→GREEN на порче JSON-чисел; редакция секретов и повторный journal ACK PASS.
Task 2: RED 16<23 → GREEN: JSON-roundtrip сохраняет −0 и ёмкость MCP preview.
Task 3: RED пустого Import → GREEN; четыре consumer используют независимый бюджет; настоящие byte/cell границы PASS.
Python: 80 PASS / 6 SKIP (приватные captures); native acceptance: 2196 PASS.
Независимое ревью исправлений: Approved, обязательных замечаний нет. Полный Node: 4759 PASS / 2 Windows SKIP, 0 FAIL.
Сверка Python byte-size с закреплённым Node на 99 947 конечных binary64 без расхождений; diff и относительная ссылка PASS.

Живой Loginom, установленный продукт и другие платформы повторно не проверялись. Изменение локальное; push/PR/merge/выпуск не выполнялись.
