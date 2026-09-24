> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-f9478f8383cf` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# N13-R1: восстановление configure после потерянного ответа

13 сентября 2026, ветка `codex/node-13-date-time`, исходный HEAD `b8363af89de9a35f6151dc6896a9a59af4aef2a8`.
Разрешение координатора: `node13:coordinator-reply-resume:1:20260913`.

## Реализация

Добавлен отдельный Date/time verifier исходной квитанции и живого черновика.
Обработчик сохраняет полные исходные и последовательно подтверждённые матрицы
каждого поля, точную ожидаемую смену одной ячейки и подготовленный внутренний ID.
Inspect проверяет тот же документ, сценарий, узел, wizard, поле и native record ID,
все 29 строк каждого поля, StringFmt и отсутствие посторонних изменений.
Нативный Count по-прежнему не служит доказательством.

Подтверждение исходного жеста записывается один раз, до новых наблюдений.
Квитанция приводится к формату существующего redactor журнала: нормализация
URL не должна приводить к ложному отказу durable acknowledgement.
Inspect не завершает configure и не сбрасывает pending. Resume повторно проверяет
квитанцию/матрицы и продолжает ту же фазу с прежними receipt ID, deadline и бюджетом.
Уже применённые флаги не переключаются; сохраняются исходный removal baseline и
принятые изменения. Обычный configure завершает остальные флаги, Next, inline output
и validation, после чего штатно восстанавливается driver-local configured.

Общие точки расширения: `node-procedure` предоставляет последний подтверждённый
prepared step; tabular driver хранит собственный прогресс; executor передаёт свой
существующий readReceipt и допускает фазовый inspect; node-apply повторно использует
исходную pending configure. Код input_mapping recovery14 не копировался.

## Живые диагностики

Все сеансы: Loginom 7.4.2, аккаунт test-3, отдельная собственная копия пакета,
видимый Chromium с viewport=null, окно 1508×949, страница 1508×862. Старый diagnostic
catalog использован только для прямой диагностики; это не final admission.

- `ff965d3b-e8d3-460b-9d84-a27585d250dd`: исходный дефект воспроизведён на runtime
  `dd0979bf175bd4164ab0d0647daecd69782b1c8ab0d10b2e690d313b9704b6d0`.
  Browser121 подтвердил клик n50; публичный результат AMBIGUOUS/configure.
  Повтор и resume не сделали новых browser calls (121→121→121), recovery отсутствовал.
- `8757d20a-b74c-4bbe-b6d5-585d72ffbd71`: первая версия восстановления безопасно
  отказала из-за нормализации URL при журналировании. Этот дефект исправлен и
  покрыт отдельной проверкой; старый сеанс не объявлен восстановленным.
- `edc0f2f5-962e-4cc1-9222-3aea5c40bf20`: на исправленном runtime
  `db331fdcde5a6f635e49801fb59d951773bb532531253b8b053fb35e5980ddcb`
  живой выбор DateA вместо исходного DateB вызвал отказ `selected field differs`.
  После возврата выбора DateB inspect сверил две матрицы 29 строк, сохранив pending.
  Resume исходного ID применил оставшийся hour и дошёл до inline output mapping.
  Полная операция не завершилась: у существующего узла с autosync=false новые
  DateB_Q_1/DateB_HRS_1 отсутствовали среди target fields (9 sources / 7 targets),
  сработал `output source bijection required`. Это отдельное ограничение добавления
  выходов при сохранённой ручной схеме, не скрыто сменой результата на SUCCEEDED.
  Диагностический черновик закрыт с отменой; сеанс завершён штатно.

## Завершённый положительный прогон

Сеанс `1de08440-613a-404d-a56d-1b3243bbde2c`, тот же исправленный runtime `db331fdc…`.
Новый узел «Восстановление R1», GUID `1f52609a-664b-48f4-a7c8-5052eeb024c0`.
Исходный ID `node13-lost-flag`; потерян ответ `node13-lost-flag:n51` на DateB/quarter,
исходная успешная квитанция сохранена в `browser-139.json`.

После реального отказа на выбранном DateA и возврата выбора DateB, inspect и resume
сверили две полные матрицы. Pending configure и его receipt/deadline сохранились.
Тот же ID завершил оставшийся hour, Next, inline/output mappings, finish, execute
и read: **SUCCEEDED, cleanup_complete=true, свежая таблица 4×8**. Все32 значения,
включая NULL, границы и високосную дату, проверены независимым Python oracle.
Ни один применённый флаг не переключался повторно. Исходная квитанция подтверждена
один раз, исходная configure подготовлена один раз. Две полные сверки — inspect/resume.

Повтор и повторный resume завершённого ID вернули SUCCEEDED без browser calls:
**1042→1042→1042**. Независимые `date_time_continuation.py` и `date_time_audit.py`:
PASS; negative auditor отверг **8/8** подмен (квитанция, матрица, ID, завершение,
повторные эффекты и отрицательный кейс).

Evidence: `unavailable:artifact-339a59e97cd14fab`:
`execution-events.jsonl`, `public-api.jsonl`, `r1-loss.json`, `r1-negative.json`,
`r1-inspect.json`, `r1-resume.json`, `r1-repeat.json`,
`date-time-continuation-audit.json`, `date-time-continuation-negative-audit.json`,
`node13-lost-flag-audit.json`. Максимальный внутренний шаг460.

Сохранён собственный `/test-3/N13-1de08440.lgp` через package.save_checkpoint:
SUCCEEDED/cleanup=true. Повторное открытие не выполнялось; persisted_content_verified=false.
Пакет закрыт; на финальном экране нет диалогов/настроек. Browser bridge завершён штатно, exit0.
Это прямой целевой тест исходного configure continuation, не Hermes-приёмка всего узла.

## Проверки и границы

Клиент: 1449 PASS, 1 SKIP. Focused recovery/DateTime/shell/procedure: 164 PASS.
Python: 533 PASS. Первоначальные ошибки socket/process проверок возникли в sandbox;
полный повтор с локальными сокетами прошёл. Исходные журналы сохранены в `.dock/`.

Отрицательные проверки покрывают чужие operation/signature/node/receipt,
незавершённый браузерный эффект, отсутствие/дублирование gesture evidence,
неполную матрицу, чужие owner/field/input inventory, StringFmt, посторонний флаг,
отсутствующий draft/receipt и истёкший deadline. Состояние pending не освобождается
по отвергнутому доказательству. Живая отрицательная проверка относится к выбранному
полю; остальные указанные подмены проверены локальными тестами.

Поддерживается потеря ответа одного доказуемо завершённого flag click. Потери Next,
output mapping, утраченное состояние процесса или перезапуск runtime не объявлены
восстанавливаемыми. Ограничение existing autosync=false выше требует отдельного
разбора. R2 не интегрирован: [минимальный план](node-13-r2-integration-plan.md).

R3 и принятое ТЗ на 10 строк не переоткрывались. Общая автономная приёмка не
запускалась; Hermes, сборка, stage, push/deploy, обновление плагина и node15 не
выполнялись. Accepted goal остаётся прежним; final runtime/archive/catalog должны
быть закреплены позднее для нового кандидата. OpenViking healthy; routing/hooks
не менялись. Чужие изменения AGENTS.md и .gitignore сохранены отдельно.
