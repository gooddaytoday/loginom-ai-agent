# Узел12: пересмотр identity mapping — PASS122/122

По решению координатора выполнена узкая коррекция независимого аудитора.
Полный пересмотр **неизменных живых доказательств** run `20260913-072904-3cc4ad0e`
прошёл **122/122**. Это отдельный результат verifier `identity-import-v1`;
исходный frozen audit остаётся **FAIL112/118** и не перезаписывался.
Нового запуска Hermes, браузера и изменения сохранённого пакета не было.

## Причина и граница изменения

Natural goal требует сохранить исходные имена, метки и поля, но не запрещает
полное identity output mapping. Hermes задал именно такое отображение трём
первичным импортам. Старый верхний контракт требовал mappings:[], а persisted
composite останавливался до нативных проверок. Нижний existing_import_evidence
уже поддерживал сохранённый seed mapping и остался неизменным.

Добавлен допуск только точного output port0, autosync:false и полного перечня
configured_field в исходном порядке CSV. Проверяются уникальные headers,
source_name/name/label, used:true, excluded:false, отсутствие inputs и посторонних
ключей/переопределений. Пропуск, дубли, перестановка, чужой source/порт, rename,
label/type/data_kind/excluded и другие операции отклоняются. Нативный источник,
тип/вид данных и привязки наблюдений проверяет существующий полный аудитор.
Autosync в нативных наблюдениях обязан иметь настоящий Boolean-тип и итог false.

После reopen по-прежнему требуются settings:{}, inputs:[], mappings:[] — без
перенастройки. Допустимый исходный mapping проходит все старые проверки;
ни source bytes, ни schema/settings, fresh execution, полный output или
save/close/open не исключены.

## Реально выполненные прежде пропущенные проверки

До изменения кода на исходном evidence выполнены **9/9**: для main10, null8 и
empty — независимая сохранённая схема, полное чтение и `_verify_existing_import_output`.
Последний подтвердил исходный импорт, сохранённые source/format/columns,
нативное открытие мастера, неизменность настроек, сохранённый mapping и новое
выполнение с полным результатом. Прежнее успешное save/reopen является отдельной
необходимой предпосылкой, а не заменой параметрической проверки.

Финальный composite каждого импорта прошёл **7/7**: save_chain, reopen_binding,
seed_identity_mapping, schema, full_read, native_output, identity_autosync.
Полный сценарный пересмотр также прошёл остальные проверки разметки/связей/
ролей/источников/результатов. [Все результаты и hashes](summary.json).

## Две отдельные цепочки происхождения

Execution: source `0e11a3fb24ca40a9f855008d2b0d1856d6f771ad`, run HEAD `b4853c97`,
runtime `1459a3d10e84a0f4742933f68333cb5843f27347b0062656d090a306446e4248`,
старый harness `b8d5b9ced1725cbbb64da0d92d93a74cd2f90bf9b8f8ff0efbf1a4a2f434b9d3`.
Goal и кандидат12.2 не изменены. Все153 runtime и243 execution harness inputs
сверены с Git source snapshot. Их исходные maps взяты из неизменного request,
чей SHA закреплён отчётом в commit59062bff вместе с SHA evidence/scenario/audit/attempt.

Verifier был закоммичен в `fbc83762b3de0fe805fa0b9e8bac3d12fbb009c2`.
Новые246 verifier inputs и их отдельный digest:
`b165204ae1c7403f25e648425bb13c2f2ecec003fd64148dcf6a5d80094013ae`.
[Точная карта](verifier-pins.json). Разрешены изменения ровно двух старых
verifier-файлов и три новых файла; остальные прежние execution inputs обязаны
совпасть с текущим деревом. Runtime проверяется целиком и не изменялся.
Штатный frozen entrypoint сохраняет проверку текущего harness; специальный
reassessment entrypoint явно проверяет исторический execution snapshot и
отдельный текущий verifier. Исторический harness новым не заменён.

Новый полный результат: `.dock/node12-identity-auditor-followup-1/reassessment-final.json`,
SHA `a6b30d50d951e8033b24c43e814737ea1c59d27051953c9e2ddf06eeac5e53e6`.
Неизменный frozen audit SHA `1270695cd955d80d4e9505220a6136167cbbab150e1c236b58752af029327fc7`;
неизменный evidence SHA `c9a358b46a8db72067b87a754efb8f8db8e7057a65e7a3f38314df14bc69ca28`.

## Проверки и ограничения

529 Python tests PASS, в том числе5 целевых tests с20 отрицательными вариантами
запроса и строгой проверкой Boolean autosync. Все19 подмен живого evidence
отклонены: перенастройка после reopen, чужие source/node, native context/type/kind/
source/autosync, усечение, stale execution, неверные count/schema/bytes и
отсутствие save/reopen. Дополнительно3/3 подмен provenance отклонены: старый
артефакт, Git execution blob, непредусмотренное изменение текущего verifier.
Тестовый вывод с all-a runtime — mock теста, не pin этой проверки.

Scope integer/string и NULL в Value не расширен. Нет boolean/real/datetime inputs,
NULL keys или отдельной live lost-reply приёмки. Новое полное review не проводилось.
Production handler, natural goal, общий клиент, сервер и маршрутизация памяти не
менялись. Merge/cherry-pick/push/deploy/activation не выполнялись. Решение о
принятии этого отдельно версионированного пересмотра остаётся у координатора.

Воспроизведение (новый, ещё не существующий output):

```sh
python3 tools/loginom-acceptance/reassess_duplicates_identity.py \
 --run-dir .dock/node12-autonomous/runs/20260913-072904-3cc4ad0e \
 --baseline-commit 59062bff9520a90c1e616bd72a680ce393fd3ded \
 --baseline-report docs/plans/loginom-dock/node12-acceptance-preparation-2/attempt-20260913-072904.json \
 --output /tmp/node12-identity-reassessment-new.json
```
