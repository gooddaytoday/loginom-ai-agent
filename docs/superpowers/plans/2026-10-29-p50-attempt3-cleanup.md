# P50 attempt3: адресная cleanup Authoring

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Статус: exact reviewed caller выполнен один раз exit0; PRIVATE_SESSION отсутствует, checkpoint сохранён, admin/native/process и lease proof записаны, exact writer снят после proof. Независимое review фактических receipts APPROVE (SDD p50-attempt3-cleanup-review.md); old failed Close сохранён. Временный caller удалён, точный review diff сохранён.

Цель: после failed P50 безопасно освободить собственную pending server session и exact stale writer, сохранив все результаты. P50 остаётся deferred3/3; нового authoring допуска этот план не даёт. Разрешение — Global Constraints основного analytics-expansion плана и поручение владельца устранять подтверждённую cleanup Authoring.

## Факты и граница

- CLI завершена exit1/modelConfirmed, native browser/bridge закрылись, terminal close rejected; isolated waitProfileIdle=true, exact writer сохранён private. Новых live jobs нет.
- Fresh existing admin inventory того же Authoring epoch: единственная user row `PRIVATE_SESSION`, Count1/pendingDisconnect; shared/pool Count0. PRIVATE_RESOURCE dispose подтверждён. Это контролируемое окно единственной P50 CLI: prepare создал новый draft, active title/save path совпадают с уникальным собственным attempt3, прочие Authoring попытки закрыты. Identity unqualified: objectId не GUID, createdAt не wallclock proof.
- Полные private profile/server backups и saved checkpoint5096bytes/ZIP CRC/7XML сохранены в `analytics-expansion/recovery-p50-attempt3`; ImportExcel в сохранённом начальном checkpoint отсутствует. Неудачный незавершённый Excel остаётся только в памяти own session; это не принятый reference.
- Server reservation released; используется existing acquireResourceLease. Если состояние изменилось/принадлежность не подтверждается, STOP без автоматического reopen/Close/guard release. Judge reservation не затрагивается.

## Действия и проверяемый результат

1. Независимо review фактов, этого плана и точного private caller до mutation. Один native addressed Close только `PRIVATE_SESSION`; на mandatory finding сначала исправить caller/план.
2. Перед Close проверить idle/exact writer, epoch и побайтное сохранение server checkpoint; взять существующую server lease. Fresh inventory обязан совпасть по всем стабильным non-admin полям с сохранённым baseline, собственная `PRIVATE_SESSION` по-прежнему единственная Count1/pendingDisconnect.
3. Выполнить existing `closeUserSession('user','PRIVATE_SESSION')`. Fresh inventory обязан отличаться только отсутствием этой row; shared/pool и все оставшиеся rows сохраняются, package counts0. Никаких иных Close, configure/reset/Stop, deletion storage или смены runtime guard.
4. Успешно dispose admin (native disconnect/exit/process proof); проверить checkpoint bytes, idle и прежнюю exact writer identity. Записать новый existing lease release proof и освободить только собственную server lease. Затем existing `releaseStaleWriter(profile, expected)` с readback writer=null/idle=true. Любая ошибка сохраняет барьер и evidence; old failed close не переписывается.
5. Независимо проверить фактические before/after, admin/process/lease proof и сохранность old failed receipts/backup checkpoint. После PASS продолжить независимую P46 в прежнем каталоге/бюджете.

Ожидаемый объём: этот план и две owning status docs, около45–85 строк; один временный private caller около60 строк на прежних primitives, после review/execution удаляется с сохранением review diff. Production source/dependencies0. Нового recovery API/runner/состояния нет: меняются только target и текущие факты уже проверенного адресного cleanup пути P27. Исключены judge cleanup, fourth P50 attempt, setup/OAuth, commit/push/merge/release и любые чужие ресурсы.

Риск: ошибочная принадлежность row, утрата own unsaved work, ложное повышение old failed. Fresh exact baseline, byte backups, адресный Close и порядок native/admin/lease/writer proof ограничивают эти риски. Условие STOP — неизвестная row/epoch/process/guard identity или отсутствие native proof.
