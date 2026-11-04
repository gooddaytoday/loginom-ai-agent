# P27: cleanup Authoring и включение существующего browser recovery

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Статус: cleanup/config scope выполнен и независимо APPROVE. Новый verified CLI с browserRecovery=true прошёл native check; P27 attempt2 действительно получила managed browser quiet-release proof. Финальный CSV и runtime close не приняты из-за нового connect/viewport отказа; текущие действия — по [следующему плану](2026-10-29-p27-connect-viewport.md). Основание — поручение самостоятельно устранять product recovery/cleanup blockers, существующий [основной план](2026-10-28-analytics-expansion-implementation.md) и [runtime fix](2026-10-28-p50-product-recovery-fix.md). Новый product API/runner не разрабатывается. Commit/push/merge/release не разрешены.

## Результат и первый основной путь

Пригодный Authoring после подтверждённой cleanup своей failed попытки и verified отдельная CLI-сборка с существующим сборочным browser-recovery флагом. Затем одна исправляющая P27 CLI-попытка в оставшемся бюджете, с реальным native/package/CSV и прежними проверками. Включение capability не считается успешной native recovery или принятым eval.

## Подтверждённое исходное состояние

- P27 attempt-1 CLI exit1, model6.1sol/xhigh подтверждён. Import и save-import SUCCEEDED. Duplicates target создан; input_mapping остановился до разрешённого Done/настройки ролей, execution not_requested. Полного CSV нет, использовано1/3.
- Source/runtime журнал показывают отсутствие finish_wizard/confirm_wizard_close в allowed_actions при unobserved UI input-port ownership. Native prepared context не заменяет UI ownership. Дважды выполненный recover не освобождает pending; старые квитанции не переписываются. Подробности — SDD p27-release-diagnosis.md.
- Локальный candidate собран с browserRecovery=false. Existing build flag LOGINOM_AI_AGENT_BROWSER_RECOVERY=1 плюс verified bundle включает capability; runtime env/manifest edit этого не делают. Новый build не переносит pending старого runtime.
- PRIVATE_PROCESS завершён: cleanupfailed/closed_ackfalse/exit1, PID отсутствует; изолированный waitProfileIdle=true, исходный writer удерживается. Предыдущее false idle было вызвано командой инспекции с profile/path в argv; новых живых процессов из этого не выводим.
- Private recovery-p27 содержит profile/server backups, exact writer identity и saved checkpoint6596bytes/ZIP CRC PASS. Его XML содержит ImportTextFile, не содержит Duplicates: последняя успешно настроенная работа сохранена до failed target.
- Native inventory recovery-p50/PRIVATE_ADMIN_SESSION-p27-blocked-20261029.json: прежние PRIVATE_RESOURCE/21 Count0, единственная новая PRIVATE_RESOURCE Count1 pendingDisconnect, собственная PRIVATE_RESOURCE; admin dispose подтверждён. Identity unqualified: objectId не GUID, raw createdAt не объявляется wallclock UTC.

## 1. Подтверждённая адресная cleanup

1. До Close независимо проверить достаточность принадлежности PRIVATE_RESOURCE по controlled Authoring window, стабильной новой native row, уникальному собственному package path/save и phase receipts. Если принадлежность либо полнота checkpoint не доказаны — не закрывать, сохранить конкретный missing fact.
2. Существующими operator средствами взять server lease; исходный exact stale writer оставить барьером, проверить identity неизменной и процессы отсутствующими. Новый CLI поверх writer не запускать.
3. Получить свежий native inventory того же epoch. Адресно закрыть только PRIVATE_RESOURCE через existing admin.closeUserSession, если её стабильные поля/Count1/pendingDisconnect совпали. PRIVATE_RESOURCE/21 и чужие строки не закрывать. Свежая precondition-наблюдение подтвердило исчезновение прежних Count0 PRIVATE_RESOURCE/21 без нашего Close; их присутствие не требуется. Использовать этот свежий baseline при неизменной собственной PRIVATE_RESOURCE и shared/pool, не добавляя допуск неизвестных строк. Retained lease первой остановки переоткрыть existing exact reopenResourceLease после доказанного выхода её owner; новый lease поверх него не создавать. Это отменяет только собственный неподтверждённый новый wizard/target; последний успешный import checkpoint, inputs, профиль и failed receipts уже сохранены. Не выдавать эту cleanup за old operation recovery success.
4. Подтвердить отсутствие PRIVATE_RESOURCE/его пакета, неизменность оставшихся строк и сохранённого checkpoint, admin/process cleanup; записать существующий native lease-release proof. После этого только existing releaseStaleWriter с exact owner/device/inode и idle read-back. Старый failed close остаётся failed.

Проверяемый результат: собственной pending server state больше нет, ресурсы/lease освобождены, профиль idle без writer; либо конкретное ограничение без guard removal. Blueprint — ранее проверенные private addressed-close helpers; временный caller не становится общей обвязкой.

## 2. Verified Authoring candidate с существующей capability

1. Штатный build-cli --no-archive: прежние pinned Bun/Node/browser inputs, channel prod, новое private version/output/prefix, LOGINOM_AI_AGENT_BROWSER_RECOVERY=1. Старый installed candidate и Benchmark binary/config не менять. Исходный runtime код не менять, прежние312/312 source tests переиспользовать.
2. Verify manifest/modes/source snapshot и browserRecovery=true. Установить existing installCli на bundled Node в новый private prefix (Bun cp уже давал неверные modes). Runtime bundle override не использовать: он делает bundle unverified.
3. После шага1 cleanup принять native check/cleanup нового candidate; записать private pin и только Authoring CLI path до следующей попытки. Модель/1800s/≤3total прежние; попытка1 не обнуляется.

Проверяемый результат: verified установленный candidate, readiness/cleanup и вшитая capability подтверждены. Полный browser recovery при реальном отказе ещё требует exact stopped receipt, manual cleanup, fresh same-node quiet proof, durable ACK и native close.

## Объём, риски и исключения

Общий код/dependencies0. Ориентир: этот план + текущие статусы в2 owning docs,40–90 изменённых строк; один private operator caller до70строк при необходимости, private build/install artifacts и pin. Обоснование caller — существующему addressed-close нужен exact current row/writer, постоянный механизм не добавляется.
Риски: неполное сохранение своего состояния, чужой server row, перенос старого pending, ложный native proof либо readiness вместо полного recovery. Проверки выше различают эти случаи; отсутствие UI ownership не лечится ослаблением allowed_actions. Не входит исправление неизвестной причины input-port ownership без доказательств, новый offline entry, fallback/relay, слепой ack, broad cleanup, чужие patches, изменение Benchmark pins, setup/OAuth, N2 и карантин. При отсутствии безопасного пути остановка с конкретным условием продолжения.
