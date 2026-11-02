# P21 attempt1 — подтверждение отсутствия server session и exact writer release

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Статус: exact reviewed caller выполнен один раз exit0; fresh2native inventory userrowsabsent/shared+pool0, admin/process/lease proof и exact CAS/readback подтверждены. Независимый actual result review APPROVE; старый failed не менялся. Temporary callers удалены, exact reviewcopy сохранена.

Цель: освободить stale Authoring writer после provider failure, сохранив все свидетельства. Новая attempt2 разрешается только отдельно по конкретной исправленной причине и оставшемуся бюджету. Основание — уже разрешённая владельцем подтверждённая cleanup Authoring; нет обхода product guard или нового recovery API.

Факты: attempt1 CLIexit1, provider400/model_not_found — первичная причина; CONFIRMED_SAVE_REQUIRED отказал до native Close, Save/LGP/CSV нет. Runtime bridge/browser/server transports fulfilled, executor больше не жив; isolated profile idle=true, exact writer сохранён. Read-only actual admin inventory того же epoch (PRIVATE_RESOURCE успешно disposed) показал только общие пакеты и пул с count0, пользовательских rows нет. Это подтверждение server absence, не успешный старый Close. SDD p21-attempt1-diagnosis.md; private analytics-expansion/recovery-p21-attempt1/inventory-before.json и inspect-release.json.

1. Сохранить private0700 backup полного профиля и server user storage; проверить оба gzip/tar, exact writer и исходные failed receipts. Незакоммиченные Git изменения не затрагивать. Partial native checkpoints/J сохранены в профиле; подтверждённого LGP нет и он не выдумывается.
2. Независимое review этого плана и exact временного caller до writer mutation. Caller использует только прежние lease/admin/profile primitives из принятого private harness; source/private patches не переносятся.
3. После review взять existing server resource lease того же epoch; profile idle и writer должны точно совпасть. Два fresh native inventory при живом собственном admin должны совпасть с предыдущими stable non-admin rows (только shared/pool count0), без user rows и packages. Если появились unknown rows/операции/epoch/другойwriter — STOP с сохранением барьера.
4. Ни одной user Close не вызывать: в inventory целевой пользователь уже отсутствует. Native dispose собственного admin обязан подтвердить disconnect/exit/process cleanup. Затем проверить server epoch, idle/exact writer и сохранность failed Close bytes. Existing server lease release proof фиксирует наблюдённую absence и admin completion; только после release вызвать existing releaseStaleWriter(profile,expected) с CAS/readback writer=null/idle=true.
5. Независимо review actual before/after/admin/process/lease/CAS proof и отсутствие переоценки старых receipts. После PASS — выбрать доступный authoring pin и следующую обычную попытку P21; текущая1/3 остаётся использованной. Старыйfailed не становитсяconfirmed.

Объём: этот план и owningcard/checkpoint, около35–70строк; временный privatecaller45–60строк на existing primitives, после применения удаляется с сохранением exact review diff. Production source/dependencies0. Не менять Loginom users/policy/storage, runtimeguard, чужие ресурсы или judge lease; actualmodel/CLI попыток этот cleanup не запускает. Commit/push/merge/release нет.

Остановка: отсутствие полной native absence/admin/process/CAS proof сохраняет writer и конкретный блокер. Успешный исход — отдельный cleanup receipt, не имитация старого Save/Close.
