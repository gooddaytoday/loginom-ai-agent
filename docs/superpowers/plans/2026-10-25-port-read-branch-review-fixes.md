# Исправления полного ревью port-read-design — Implementation Plan

> **For agentic workers:** выполнять по задачам с RED→GREEN; независимое ревью плана перед кодом и исправлений перед завершением.

**Goal:** исправить блокировку освобождения до dispatch, несовместимость user-v1 аудитора и ложное подтверждение свежести/принадлежности чтения.

**Architecture:** сохранить факт очистки последнего действительно отправленного чтения до следующего dispatch. Дополнить существующую независимую проекцию публичного ответа; в существующем аудите журнала проверять чтение по предшествующим native-наблюдениям и проверенному запуску. Новых механизмов или зависимостей нет.

**Tech Stack:** закреплённый Node, node:test, Python unittest и стандартные библиотеки.

**Spec:** [утверждённый дизайн](../specs/2026-10-24-port-output-reading-design.md); три замечания полного ревью, исправление которых разрешено владельцем.

## Global Constraints

- Сохранить исходный deadline, запрет повторного Execute, неопределённость транспорта и отказ при ошибке dispose.
- Освобождение по-прежнему требует последнюю завершённую квитанцию и тот же спокойный неизменённый граф.
- Сохранить публичные схемы, 100 строк, 10 000 ячеек, 512 KiB значений, 46 000 байт MCP и отдельный native full.
- GUID сопоставляется внутри подтверждённого узла/документа/сценария; глобальная уникальность GUID не требуется.
- Не менять настройки узлов, browser reader, сохранённые сырые журналы и исторические фикстуры.
- Оценка: 10–12 файлов, около 250–400 добавленных/удалённых строк вместе с тестами и планом; сверить git diff --stat. Без push, PR, merge и выпуска.

## Review Focus

- Deadline/отмена до первого dispatch позволяют обычную проверку освобождения; начатое чтение с неизвестным исходом остаётся блокирующим.
- После успешного первого выхода отказ до dispatch второго не обнуляет его очистку; ошибка dispose второго не использует очистку первого.
- user-v1 сохраняет freshness_basis/read_limit и отклоняет их подмену, включая sample_rows=0 и неполную выборку.
- Чтение до завершения собственного свежего исполнения либо с GUID другого выхода отклоняется независимо от совпадения значений и итоговой квитанции.
- Несколько исполнений JavaScript/материализации и порядок выходов [1,0] не создают ложного отказа; старый Table-путь аудита сохраняется.

### Task 1: Освобождение до dispatch

**Files:** client/lib/node-procedure.mjs, client/lib/node-read-driver.mjs; client/test/node-procedure.test.mjs, node-port-output-release.test.mjs, node-read-release.test.mjs (относительно packages/loginom-runtime).

**Interfaces:** readOutputPort(request), releasePendingNode и существующие driver.releasePending/recoveryReleasePending; публичный контракт не меняется.

- [x] Изменить ошибочные ожидания unstarted и добавить RED: deadline до первого вызова и до второго выхода оставляет 0/1 browser-вызов, допускает проверенное освобождение без нового Execute. Проверить также отмену до dispatch и отказ до dispatch после неочищенного предыдущего чтения.
- [x] Сбрасывать portReadCleanupComplete/cleanupConfirmed непосредственно перед execute; удалить дублирующий локальный readCleanupComplete и его release-проверки из read driver. Общий releasePendingNode уже проверяет последний dispatch, транспорт, квитанцию и граф; после dispatch факт обновляется только завершением вызова.
- [x] Из client выполнить закреплённым Node: node --test test/node-procedure.test.mjs test/node-port-output-release.test.mjs test/node-read-release.test.mjs test/node-read.test.mjs test/node-pending-release.test.mjs. Ожидается PASS; transport/dispose/foreign graph остаются отказами.

### Task 2: Совместимость независимой user-v1 проекции

**Files:** tools/loginom-acceptance/user_result_evidence.py и test_user_result_evidence.py; при необходимости небольшой реальный Node→Python roundtrip в существующем тесте.

**Interfaces:** project_node(snapshot), normalize_user_evidence(evidence); независимый аудитор не вызывает runtime-компактор для расчёта ожидаемого ответа.

- [x] RED: сопоставить настоящий compactNodeResult с независимой проекцией для обычного port-source ответа с freshness_basis/read_limit. Проверить, что удаление/подмена полей и изменение выборки отклоняются.
- [x] Добавить два поля к разрешённой проекции, сохранив старую форму без них и точное сравнение.
- [x] Из acceptance выполнить PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_user_result_evidence. Ожидается PASS, исходное evidence не меняется.

### Task 3: Предшествующее подтверждение выполнения и порта

**Files:** tools/loginom-acceptance/node_procedure_evidence.py; test_node_procedure_evidence.py, test_port_output_evidence.py, test_import_output_evidence.py; import_execution_evidence.py только при необходимости переиспользования существующего verifier без цикла импортов.

**Interfaces:** verify_internal_sequence(events, operation_id, ...); verify_filter_output/verify_calculator_output/Import потребляют усиленный общий аудит без новых параметров.

- [x] RED: на существующей Filter fixture перенести чтения до подтверждения исполнения и согласованно подменить GUID в результате/reader receipt при неизменном native inventory; обе подмены должны дать FAIL.
- [x] На событии чтения использовать только уже обработанные observations/mutations: подтвердить последнее собственное завершённое исполнение существующим verify_execution_observations и соответствие execution_id; сопоставить index/GUID/active с предшествующим подтверждённым graph output того же узла. Не доверять итоговому checkpoint как источнику этих фактов.
- [x] Разрешить последнюю из нескольких штатных материализаций: ограничить проверку последним предшествующим запуском и его свежим baseline. Сохранить отказ для чужого node/root, отсутствующего/неактивного порта и незавершённого исполнения.
- [x] Обновить только искусственные положительные фикстуры, которым недостаёт реальных process/port фактов. Отрицательные случаи не ослаблять; проверить [1,0], несколько запусков и отсутствие влияния на Table-аудит.
- [x] Из acceptance выполнить PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_node_procedure_evidence test_import_output_evidence test_port_output_evidence test_import_execution_evidence test_javascript_evidence. Ожидается PASS; доступность приватных captures отражается отдельным SKIP.

## Завершение

- [x] Выполнить затронутые наборы, затем полный обычный client и Python acceptance unit suite; исторические/private live captures не превращать в обязательный живой прогон.
- [x] Проверить git diff --check, относительную ссылку, git diff --stat и независимое ревью исправлений. Исправить обязательные замечания.
- [x] Обновить checkpoint (не более 20 строк), выполнить проверку секретов и локальный conventional commit.

## Checkpoint

Независимое ревью плана: approved; Task 1 использует общий releasePendingNode без дублирующего локального состояния.
Task 1 RED→GREEN: 238 адресных Node-тестов PASS; до dispatch разрешено освобождение, transport/dispose остаются блокирующими.
Task 2 RED→GREEN: 9 Python-тестов PASS, включая настоящий Node→Python roundtrip двух полей.
Task 3 RED→GREEN: 97 Python-тестов / 6 SKIP; раннее чтение, чужой GUID и неактивный выход отвергаются.
Read-only replay 10 живых операций сохранил прежние вердикты, включая JavaScript с двумя Execute; один REST уже имеет ошибки журнала.
Историческое ограничение Python-проекции текста previewLimitations вне scope: полный ответ сравнивается целиком, partial — по port-проекции.
Полный client: 4762 PASS / 2 платформенных SKIP / 0 FAIL.
Полный Python: 1088 tests; 980 PASS / 94 SKIP / 5 FAIL / 9 ERROR. Все 14 сбоев воспроизведены на исходном HEAD без исправлений: отсутствующие legacy Hermes/DateTime resources и старое ожидание CLI read budget=600000.
Финальное независимое ревью: approved, обязательных и optional замечаний нет. Изменение укладывается в оценку; новые зависимости и временный код не добавлены.
Штатная staged-проверка секретов, относительная ссылка и git diff --check PASS.
Живые операции Loginom, установка продукта и другие ОС повторно не проверялись; push/PR/merge/выпуск не выполнялись.
