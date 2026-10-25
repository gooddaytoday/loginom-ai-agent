# Port reading review fixes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development. Track verifiable results with checkboxes.

**Goal:** Проверить замечания к PR #440, исправить подтверждённые регрессии и получить успешный CI окончательного коммита.

**Architecture:** Существующий сериализованный reader и два независимых аудитора; без новых слоёв или видов журнала. Между последовательными metadata RPC повторяются существующие `live()`/`stable()`. Исключение из Table-проверки фильтра связывается с действующим маркером портового чтения.

**Tech Stack:** Закреплённый Node, Python unittest, GitHub Actions.

**Spec:** [Дизайн чтения порта](../specs/2026-10-24-port-output-reading-design.md), [ревью и дополнение](https://github.com/gooddaytoday/loginom-ai-agent/pull/440#issuecomment-6401884199), поручение владельца проверить и исправить необходимые замечания.

## Constraints and review focus

- Сохранить исходный deadline, binding, отказы и `finally`/dispose; не отправлять следующий RPC после выявленной смены сессии или истечения срока.
- Legacy Table требует строгое `filter_enabled:false`; ветка `freshness_basis:'completed_execution_port_source'` сохраняет прежнюю семантику отсутствующего поля. Явный `true` по-прежнему запрещён.
- Проверять реальный сериализованный callback и реальные аудиторы. Не менять публичный формат, данные, настройки узлов, зависимости или CI ради прохождения тестов.
- Не выполнять интеграцию #439/demo-022, merge, release, установку или новые живые прогоны Loginom.
- Оценка: девять файлов, около 100–170 изменённых строк, включая документ и тесты. Новые механизмы не нужны.

### Task 1: Останавливать цепочку metadata RPC

**Files:** `packages/loginom-runtime/client/lib/node-port-output.mjs`, `packages/loginom-runtime/client/test/node-port-output.test.mjs`.

**Interface:** `makeNodePortOutputCode`/`readNodePortOutput` сохраняют запрос и результат; проверка добавляется после каждого ответа `get_Name`, `get_DisplayName`, `get_DataType`.

- [x] Пройти независимое ревью плана до изменения кода.
- [x] Добавить replay с управляемым временем и сменой session после metadata RPC. Проверять, что после `name` не вызываются `label/type`, после `label` не вызывается `type`; значения не публикуются, собственные proxy освобождаются.
- [x] Получить RED на неизменённом reader, затем разнести существующие вызовы `live();stable();` между RPC и получить GREEN.
- [x] Запустить `node --test test/node-port-output*.test.mjs test/node-procedure.test.mjs` из `packages/loginom-runtime/client` закреплённым Node с `LOGINOM_DOCK_TEST_BROWSER` для дат. Результат: новая регрессия и связанные freshness/cleanup/caller тесты проходят.

### Task 2: Сохранить строгий legacy Table-контракт

**Files:** `packages/loginom-runtime/tools/loginom-acceptance/{full_read_evidence.py,javascript-native-input-contract.mjs,test_full_read_evidence.py,javascript-native-input.test.mjs,test_port_output_evidence.py,javascript-native-datetime.test.mjs}`.

**Interface:** `verify_full_read` и `verifyNativeInputUi` сохраняют остальные требования; marker портового чтения определяет только допустимость отсутствующего `filter_enabled`.

- [x] Добавить отрицательную legacy-матрицу: отсутствует/null/0/строка/true; строгое false принимается. Для port-marker отсутствие принимается, true отвергается. Получить RED на настоящих функциях.
- [x] Ограничить исключение действующим marker и добавить его в три существующие port-фикстуры, ошибочно не имевшие marker. Получить GREEN.
- [x] Из acceptance-каталога выполнить `python3 -m unittest test_full_read_evidence test_port_output_evidence` и `node --test javascript-native-input.test.mjs javascript-native-datetime.test.mjs`; затем ближайшие typed/integer и evidence-тесты потребителей. Результат: legacy-ослабление устранено, портовые чтения сохранены.

### Task 3: Закрыть ревью и проверить публикацию

- [x] Зафиксировать обоснованные ответы по всем замечаниям: bound console уже ограничен исходным сроком и owner/mask; отдельная запись отказа — опциональная диагностика; неизвестное имя clustering уже отвергается `alignClusteringOutput` до обращения к aligned. Проверить это существующими тестами и независимым чтением.
- [x] Независимое итоговое ревью исправлений; `git diff --check`, относительные ссылки документа и secret scan. Результат: обязательных замечаний нет, проверки исправлений проходят.
- [ ] Обновить этот checkpoint, закоммитить и выполнить обычный push в `port-read-design`; ответить в PR через Autopilot с доказательствами исправлений и отклонений.
- [ ] Дождаться автоматических checks и штатного `release.yml` candidate/prod на последнем SHA, исправляя реальные отказы. Итог сохранить в описании PR без нового source-коммита; PR оставить открытым, merge не выполнять.

## Checkpoint

- Независимое ревью плана одобрено. Обе регрессии подтверждены RED→GREEN; локально клиент 185 PASS, acceptance Node 7840 PASS, Python 106 PASS.
- Независимая проверка трёх остальных P3 не нашла дефектов; 28 Node и 26 Python PASS. Новых механизмов нет.
- Итоговое независимое ревью одобрено: повторно клиент 185 PASS, native 2250 PASS, Python 20 PASS. Secret scan и ссылки документа прошли.
- Следующий шаг: commit/push; результаты CI последнего коммита и ответы ревьюеру сохраняются в PR, без повторного коммита ради статуса.
