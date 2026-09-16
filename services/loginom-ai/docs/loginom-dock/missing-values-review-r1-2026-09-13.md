# Node14: review 1 — требуются исправления

Команда: `node14:review:1:cecb30012ae81ea3bf5268c0a9c952f41cfc8d2a`.
Дата: 2026-09-13. Ветка: `codex/node-14-missing-values`.
Проверяемый диапазон: `0f085c5310c67820f6f6386ae16a7df768c152ca` →
`cecb30012ae81ea3bf5268c0a9c952f41cfc8d2a` (63 файла).
Это отдельное review исходников, контрактов, тестов, каталогов, независимых
проверяющих программ и сохранённых live evidence. Исправления не вносились.

## N14-R1 — P2: успешный Missing Values не соответствует публичной схеме результата

Место изменения: `client/lib/missing-values-node.mjs:8–10` подключает новый
`readback`. Пропущенная интеграция: `client/lib/node-result-schema.mjs:82–86`.
Публикация схемы: `client/lib/node-api.mjs:58–59`.

`configurationReadback.anyOf` содержит восемь прежних видов, но не
`kind: missing_values`. Поэтому успешный результат нового обработчика после
выполнения реальных действий нарушает `nodeApplyResultSchema`, а через неё и
`nodeJobResultSchema`, объявленную у `dock_node_*`. Строгий MCP-клиент получает
ошибку проверки структурированного ответа вместо корректного результата.
Это дефект нового подключения обработчика, а не ошибка данных пользователя.

Воспроизведение в review: официальный `AjvJsonSchemaValidator` установленного
MCP SDK проверил `output` фактического успешного
`.dock/node14-live-1789263912227/node14-20260913-reopen2-impute.json`
по экспортируемой `nodeApplyResultSchema`: **valid:false**. У копии того же
результата удалено только `configuration.readback`: **valid:true**.
Доказательство: `.dock/node14-review-r1/result-schema.json`.
У исходного результата `status: SUCCEEDED`, `readback.kind: missing_values`.

Область влияния: строгая схема diagnostic/full MCP-профиля.
`client/lib/bridge.mjs:137` заменяет её на `userResultSchema` для user-v1,
поэтому утверждение об обязательном падении обычного user-v1 было бы неверным.
Тест нового API проверяет начало задания со stub `running`, но не завершённый
ответ нового обработчика. Существующие schema tests не обнаружили этот пропуск.

Требуемое исправление: добавить строгую схему observed Missing Values readback
и проверить фактические завершённые Done/Execute ответы через опубликованную
обёртку задания, включая отрицательные подмены владельца, метода и порога.

## N14-R2 — P1: известная terminal failure оставляет операцию без завершения и recovery

Подключение общего lifecycle: `client/lib/missing-values-node.mjs:8`.
Причина: `client/lib/node-execution-procedure.mjs:246–248`;
`client/lib/node-apply.mjs:235–237,265–273`.
Запрет продолжения: `client/lib/node-apply.mjs:124` и
`client/lib/calculator-node.mjs:206–210`.

В реальном Loginom 7.4.2 временное отсутствие собственного входного CSV
`/test-4/node14-20260913-reordered1.csv` завершило исполнение ошибкой.
Операция `node14-20260913-execution-failure`, узел
`de695a64-b435-4bbd-ad4e-7a94852498d3`, execution
`1789262006624-u8vycmdoocm:226:19` связаны с одной native-группой:
root `226`, process `19`, record `3780`.
Она имеет `error:true`, `progress_state.verified:true`, `state:failed`,
`terminal:true`, `can_cancel:false`.

Несмотря на этот известный итог, публичный результат остаётся
`AMBIGUOUS`, `execution.status:pending`, `pending_phase:execute`,
`cleanup_complete:false`. Последующий inspect сообщает `state:pending`,
`recovery_options:[]`, `internal_resume_available:false`. Это не только
незавершённая проверка: сохранённое состояние и код подтверждают невозможность
штатного продолжения через текущий resume. Даже чтение завершённой группы
не переводит операцию в подтверждённый неуспех и не завершает очистку.

Доказательства в `.dock/node14-live-1789261946921/`:
`execution-failure-result.json`, `execution-failure-inspected.json`,
`inspect-execution-failure.json`, `restore-file.json`.
CSV был восстановлен, панель закрыта вручную; это не исправило pending receipt.
В review повторные жесты не выполнялись: сверены сохранённые native evidence,
публичный inspect и текущие ветви исполнения.

`waitCompleted` бросает исключение до штатного закрытия консоли и до возврата
подтверждённой terminal receipt. Общий node.apply принимает только completed
или verified cancelled; исключение сохраняет pending. Повтор исходного ID
останавливается на проверке pending. Новый ID не является безопасным recovery.

Это унаследованный дефект общего lifecycle, фактически воспроизведённый Node14,
а не новый регресс вычисления среднего. Тем не менее он блокирует обязательный
контракт Node14: `docs/plans/loginom-dock/next-wave.md:105–110` требует проверки
ошибки исполнения и восстановления. Записать его только как известное
ограничение и принять узел нельзя.

Требуемое исправление: по доказанной terminal failure той же группы сохранить
идентичность и причину отказа, завершить только принадлежащую операции очистку,
выдать подтверждённый FAILED без свежего выхода и определить безопасный путь
после исправления входа. Не превращать неизвестный эффект в FAILED без сверки
и не повторять Execute автоматически. Проверить общей suite и отдельной
реальной ошибкой собственного источника, включая inspect после завершения.

## Проверенные свидетельства и незакрытые условия приёмки

- Разделение Null, пустой строки и текста `null`, дробная точность, округление
  Integer, пороги 40/41/42, 0% при 1/120, all-null, пустой вход, полный выход
  120 строк и отключение неперечисленных полей представлены отдельными
  live cases и независимыми сравнениями. Неудачный первоначальный reordered1
  и не сработавшая первая инъекция lost reply не засчитываются как PASS.
- New9 связывает свежий источник с узлом по native GUID и проверяет полный
  reordered выход с одинаковыми метками. Отрицательные подмены evidence
  сохранены отдельно. Наличие таблицы ожидаемых значений само по себе не
  заменяет source/graph audit.
- Reopen2 действительно выполняет существующий узел с `parameters:{}`,
  `inputs:[]`, `mappings:[]` в новом браузере/документе после сохранения.
  Inspector читает сохранённые source/format/columns и отменяет черновик;
  он не переустанавливает исходные настройки. Сверены тот же node GUID,
  последовательность inactive→active источника, свежий target execution,
  отдельная полная таблица и graph evidence. Сохранённый reopen audit:
  `.dock/node14-live-1789263912227/node14-20260913-reopen2-reopen-audit.json`:
  PASS, все семь checks true. Новое чтение байтов CSV не проводилось:
  `source_bytes_reverified:false`, integrity scope — prior verified upload.
- Этот persistence PASS относится к диагностическому ручному Save As в
  `/test-4/Node14-20260913-final.lgp`. Он не подтверждает native
  `package.save_checkpoint`. Последнее и финальная автономная приёмка Hermes
  остаются незавершёнными до изолированного candidate для `/test-4` и отдельного
  разрешённого прогона. Каталог, сервер, shared plugin и модели не менялись.
- Настоящий lost-reply2 после `finish_wizard` доказал отсутствие повторного
  жеста (226→226), pending `input_mapping` и `execution:not_requested`.
  Это подтверждение безопасной остановки и идемпотентности; восстановление
  операции после потери ответа ещё не подтверждено и остаётся обязательным
  незакрытым условием. Не следует подменять recovery повтором в новом runtime.

## Проверки, выполненные в этом review

- 539 focused client tests: PASS, 0 fail/skip; Node 24 из установленного runtime.
  Покрыты Missing Values, result schema, node.apply/runtime, execution,
  mapping/output, port opening, procedure, table, palette, close и workspace UI.
  Лог: `.dock/node14-review-r1/focused-tests.log`.
- Три Python-теста `test_missing_values_contract.py`: PASS.
- Дополнительная проверка SDK/Ajv на реальном successful outcome воспроизвела
  N14-R1. Прохождение существующих 539 тестов не опровергает этот дефект.
- Live browser и Hermes в review не запускались. Итоги исторических live
  прогонов выше проверены по сохранённым evidence и коду аудиторов; они не
  выдаются за новые прогоны review. Полная developer suite 1420 PASS/1 SKIP
  повторно не запускалась.

Итог: **изменения требуют исправлений; Node14 не принят**. Передать N14-R1 и
N14-R2 в единственный согласованный fix round. Native save, lost-reply recovery
и автономный независимый PASS остаются условиями последующей приёмки.
Пользовательские изменения `.gitignore` и `AGENTS.md` сохранены отдельно.
