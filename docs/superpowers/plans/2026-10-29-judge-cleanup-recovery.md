# Judge cleanup: bounded recovery после D calibration

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Цель: безопасно освободить собственную retained judge lease после `20261029-calibrate-PRIVATE_ID`, сохранив failed cleanup и все результаты; затем продолжить штатную калибровку. Это план одного инцидента, не новый recovery API.
Основание: analytics-expansion implementation/Global Constraints, разрешение владельца самостоятельно устранять блокеры существующими средствами; принятые Benchmark/judge pins неизменны.

## Факты и граница

- D calibration закончилась exit1: 18 scored rows (3 positive100,3 foreign0,12 near-miss PASS), затем один cleanup error и 10 gateblocked без вызова судьи. Это не FAIL eval и не разрешение принять незавершённую калибровку.
- Источник: `receivables-payments-credits-detailed/near-miss/credits-status/judge-processes-1/process-cleanup.json` в каталоге прогона. capture_complete=true; lifetime завершён; две verification с owned_remaining=0; saved PID[private]/39187 получили refused. Точное изменившееся поле не сохранено, поэтому exec/PID reuse остаются гипотезами.
- Root отдельно наблюдал отсутствие всех33 tracked records в двух проходах; private `analytics-expansion/judge-cleanup-d-calibration-readback.json`. Это ещё не освобождение lease и не новая ACK старого результата.
- Используются только существующие `readResourceReservation`, `reopenResourceLease`, `writeLeaseReceipt`, `release`; old receipt/journal/verdict не редактируются. Другие ресурсы, профили и guard-файлы не меняются.

## Шаги и проверки

1. Независимо review этого плана и конкретного source/evidence. Mandatory finding закрыть до mutation; остановиться, если безопасная фактическая quiescence не может быть установлена без изменения требований.
2. Прочитать exact reservation ключа judge из принятого codexHome и исходный quarantined journal; сверить runDir/commandId/retained/owner, отсутствие живого producer той же birth. Завершение: один конкретный принадлежащий кампании объект, без предположения по одному PID.
3. Под одним existing lease guard выполнить два свежих read-only `/proc` inventory actual judgeHome/runDir: неизменный boot, отсутствие owner той же birth, всех saved PID/birth и сохранённых PGID/SID; нет связанных cwd/точных argv paths. У всех доступных same-UID процессов сравнить только CODEX_HOME с exact accepted home, без вывода/сохранения окружения; проверить доступные fd/maps ссылки внутрь exact judgeHome/runDir. Совпадение, unknown related или ошибка чтения связанного процесса — STOP, никаких сигналов/release/ACK. Чужие процессы не блокируются по времени рождения и не сигналятся. Сохранить закрыто birth-bound сэмплы, границу/ошибки чтения, boolean home matches и исходный failed receipt hash. Это буквальное M1 из SDD judge-cleanup-plan-review.md; отдельный повтор review для него не требуется.
4. Под существующим lease guard повторно сверить exact reservation/owner и свежую quiescence, записать отдельный version2 proof с key/token/revision, временем, первичными свидетельствами и `reason=operator-readonly-quiescence`. Выполнить существующий CAS `lease.release(proof)` и проверить read-back released/releaseEvidence. Старый cleanup остаётся failed, quarantined command journal исторический. Это подтверждение нынешнего покоя judge ресурса, не успешности старой попытки.
5. Продолжить штатные CLI calibration с прежними pins/parallel1. Переиспользовать принятые неизменные вердикты и прежнюю полную P01 calibration только после сверки их критериев/inputs; P42 D уже имеет полный положительный/чужой/7near-miss набор. Недостающие P27 D near-miss проверить native `--calibrate --only tariff-functional-conflicts-detailed`; positive повторяется лишь как неизбежная часть существующего интерфейса. Foreign0 P27 уже получен в исходном D. B ещё не запускался. Не принимать credits-status verdict исходного interrupted cleanup через ручной scorer и не повторять измерения P01.

## Риск, размер и исключения

Первый проверяемый результат — released exact lease с полным новым доказательством отсутствия связанных процессов при сохранённом failed receipt. Если proof неполон, нужен владелец judge среды; blocked path не обходится переключением systemd/pins или удалением guard.
Изменения: 1–3 canonical/report документа, ориентир40–100 строк; private read-only evidence и один временный операторский вызов существующего lease API. Production source/tests/fixtures/config/exports не меняются, новые зависимости/runner/settlement subsystem не создаются. Временный скрипт после применения удалить; evidence сохранить.
Исключено: weakening identity/ancestry/executable guard, blind acknowledgement, сигнал по сохранённому PID, освобождение чужих leases, setup/OAuth, новые измерительные попытки, перенос private patches, commit/push/merge/release. Повторение инцидента требует нового факта и пересмотра причины, не автоматического retry.
