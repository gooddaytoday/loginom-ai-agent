# Блокеры parallel evals

## Native ledger fixture: EACCES global proc scan, точный источник не атрибутирован

2026-10-15, отдельный unit related run: clean-stop fixture отказал на profile
owner PID457454, поздний agent inventory primitive — на EACCES
`/proc/457454/exe` во входном baseline до spawn. PID уже исчез при readback;
UID/starttime/принадлежность не сохранены, сигналы не подавались. Самостоятельный
cold primitive1/10 PASS2.40s; clean-stop позднее PASS24.75s. Это не объясняет
native incidents ниже и не подтверждает полного regression PASS. Private log
`management-registry-20261015/agent-process-inventory-isolated.log` содержит
62 PASS/5 FAIL/1error411.75s, включая два отдельных30s timeout и unattributed
JUDGE_VERSION_UNCONFIRMED. Primitive root
`/home/kiselev/storage/tmp/evals-agent-inventory-aeGGa8` retained с planned entry;
по одному отсутствующему PID release/cleanup authority не синтезируется.

2026-10-15: `/tmp/evals-cli-sessions-00q2hZ`, parent admin-J0anbT завершил
disconnect/dispose ACK, но process proof quarantined: EACCES на
`/proc/2551505/exe`, PID отсутствует среди own/origin/admission entries;
unknown=[] и final00 не отменяют error. Ledger native assertions31 прошли,
teardown отказал ADMIN_DISPOSE_UNKNOWN, pair/root сохранены. Одновременно шёл
profile unit negative с prctl(PR_SET_DUMPABLE,0); точная атрибуция PID по сохранённым данным не доказана.
Механизм воспроизведён отдельным proc-denial control, но это не доказательство
его участия в данном incident. Не переписывать failed proof и не выпускать владение
вручную. Нужен квалифицируемый reconciliation contract, если source attribution
не позволяет текущему API завершить incident. Native browser проверки впредь
не совмещаются также с unit suite, содержащей nondumpable/proc-denial controls.

2026-10-15 08:11 UTC read-back: temporary incident root
`/tmp/evals-cli-sessions-00q2hZ` теперь отсутствует, как и прежние `/tmp` logs
и audit helper. Причина удаления не установлена. Сохранённый private source
`native-cli-sessions-e585d09b-db03-49bf-a80d-a574adc9183e/cli.json` связывает
исходную identity; exact Docker read-back всё ещё видит running
`3ecb5dd074e5ae6aed47d0b53cab27720ca89dd33f7e0172a88e5b86acc4d4c5`
(`/evals-cli-a9502f4d-server`) и
`19f5810b91735893c1d3952277da90078e5e5a7598fd8f759ac259b15385f69a`
(`/evals-cli-a9502f4d-studio`). Incident не считается завершённым; отсутствующие
canonical journals/proofs не синтезировать, контейнеры вручную не удалять.
Новые проверочные логи сохраняются в private research evidence вне `/tmp`.

2026-10-15 reconnect fixture: `/home/kiselev/storage/tmp/evals-cli-sessions-MKHklA`
сохранён после `ADMIN_DISPOSE_UNKNOWN`. Primary admin-nldUb7 получил confirmed
dispose/transport ACK, но continuous proof failed на EACCES
`/proc/4086419/exe`; unknown=[]/final00 не устраняют observation gap.
Peer admin-EKfKGR disposed/continuous closure confirmed. Целевой reconnect collector
ещё не вызывался. Private600 `native-cli-sessions-f0c6bd9e-b63c-4a69-a291-5189645ebf27/failed-dispose-sources.json`
SHA256 `d01144198e5d314353a82fbc4021f0246f44af278e81c3ec6dea6774d4b9383a`
сохраняет original pair/journal/management snapshots/results/process proofs и оба
admin receipts. Nonce `930bbeb6-91a2-4648-8988-46ce11e81eb4`, server
`6c165db687399ab27d81bdbadb82f8dd68233c898a2840490cbb5d684fd5792d`, Studio
`d2f64573b00a4781eab8cd14e1a0937496853d0519241d69c136307bde783846`.
Failed proof не изменён, writer-release exception для EACCES не применим;
normal qualification/release/delete из этого результата не следуют.
Read-only signal audit: PID4086419 отсутствует в own/peer/unknown/admission/
origin/browser-binding всех двух admin и четырёх CLI proofs; UID/starttime не
сохранены, сейчас PID отсутствует. Exec/exit/zombie/владелец не атрибутированы.

## Архив после фактически прерванного check: текущий native gate закрыт, старые источники сохранены

2026-10-15: retained47d... fixture jothVh убран после qualified original setup/
interrupted check/admin closures,178 audit checks, точного same-lstat socket
read-back, свободных custom guards и committed profile archive. Штатный
destroyPair подтвердил nonce edbff046-09e6-484f-960b-f8a5f87b52ef и exact IDs.
Последующий read-back на том же Docker daemon подтвердил отсутствие обоих
контейнеров, сети и root; private retained-fixture-audit/removal/postcheck.json
SHA6e73a3de81f3a628820cdb9acd696650211efeca053a191edd3518c54ec1f038 /
343265542c43b4571281379e6f04f06b077df36ac2fb610eaf77ab9bcad48d8c /
e9b5d7493107d467476ab5788d15bf06e9f17c3eb5e27af9078c3f905cf689e7.
Это disposal собственной research fixture; normal slot/user release не выдавался,
signals0/fixed global lock unlink0. Прежние topology/process sources сохранены
в private evidence; MKHklA/LQKvkl/aEnKx5/старые unrelated incidents не затронуты.

2026-10-15 свежий `native-cli-sessions-8196b708-d490-415e-b559-75f4e69547bf`
после0961fe343d прошёл1/35 (116.68s): actual exit130/interrupted=true, sealed
registry→committed archive→two targeted closes→fresh absence→admin closure.
Private audit124/12/read-back SHA102495e2bb65a35411af0cb8cc9049206794bd73c9e3aecfd1f77ec613a3788f;
terminal SHA968101397334a031aeb12097a4db9662082e5e0e323d9fbe6d726286210e3a25;
собственная pair/root отсутствуют. Typecheck/diff PASS. Текущий gate реального
interrupted archive/close квалифицирован. Storage deletion/release/admission
по-прежнему запрещены; 47d... pair/root впоследствии убраны по scoped audit выше.

2026-10-15 strict control `native-cli-sessions-47d5228b-5be6-4590-95ec-5804d054ca9f`
подтвердил exit130/interrupted=true/timedOut=false и continuous cleanup confirmed.
Same-lstat cause: `/home/kiselev/storage/tmp/evals-cli-sessions-jothVh/profile-a/cache/tmp/org.chromium.Chromium.55uJMQ/SingletonSocket`,
AF_UNIX socket type0140000, UID/GID1001, nlink1, dev2050/inode209997114.
При отказе root jothVh и exact pair были сохранены; subsequent disposal записан выше, normal release не выдан. Минимальный
archive fix поддерживает rename socket object с сохранением identity и fsync
каталога; real stopped-child socket RED→GREEN, archive12/78 PASS17.29s и
typecheck/diff PASS. Свежий native archive/finalizer и полный source audit
ещё требуются. Это не устанавливает причину старого f5bf... инцидента.

Диагностика дополнена: ARCHIVE_TOPOLOGY теперь сохраняет path/kind/POSIX type,
mode/nlink/UID/GID/device/inode из того же lstat в Error.cause; native fixture
пишет эти metadata в private native-primary-failure.json. Actual hardlink
RED missing cause→GREEN archive11/69 PASS18.02s, typecheck/diff PASS. Исторический
bad path не восстанавливается из этой проверки; требуется новая фактическая
interruption и read-back её источников. Refusal/move/release policy не ослаблены.

Native evidence `native-cli-sessions-f5bf5146-1c6a-4f01-8fc5-ef5b733f8cae`
сохраняет exit130/interrupted=true/timedOut=false и confirmed continuous CLI proof,
затем ARCHIVE_TOPOLOGY до publication первого archive manifest (35 assertions,
177.44s). Тогдашний teardown удалил root dPGRg7 до metadata capture: конкретные
path/type/UID/nlink не установлены. Symlink разрешён архиватором и сам по себе
не объясняет отказ. Hardlink producer connectionStore.stage обнаружен в runtime,
но check его не вызывает; причинная связь не доказана. Новая fixture сохраняет
root при ARCHIVE_TOPOLOGY для lstat без следования symlink.

Повтор 2026-10-15 `native-cli-sessions-70a965d2-d5ad-4a7e-a08c-867e05d4e394`
прошёл1/53 (174.94s), archive→three closes→fresh absence→admin closure подтверждены
private audit154/11/read-back. Но check выиграл abort race: exit0/interrupted=false.
Это положительный completed-check control, не воспроизведение interruption.
Предыдущий повтор cdf7dba0... остановился на strict reading живого manifest;
test-only hint исправлен после real-fs rename/nlink0 control, frozen readers не
ослаблены. До сохранения failing metadata причина ARCHIVE_TOPOLOGY остаётся
неразрешённой; admission/release из этих результатов не следуют.

## Mixed recovery: quarantine после пересечения собственных browser-проверок

2026-10-15: `/tmp/evals-recover-mixed-dyI2ST`, собственная disposable pair
`evals-mixed-9d88eeeb-server` / `evals-mixed-9d88eeeb-studio` (точные container
identity читать из private pair.json). Original controller завершён SIGKILL137 после release A и отказа
на B canary. Первый recovery подтвердил native disconnect/dispose ACK и две
final00 для своих процессов, но supervisor сохранил failed process proof:
`Unexplained browser/helper PID 2146151` и ещё7 unknown identities. Connection
`controller/admin-mRkj6y/connection.json` quarantined; resources остаются fenced.
Одновременно ошибочно запущена другая собственная native recovery проверка
izBc4f. Она штатно завершена/удалена, её источники сохранены в private
`research/evidence/native-mixed-red-resume-20261015/qualified-mixed.json`.
Read-only сопоставление подтверждено: все8 unknown tuples PID/starttime/UID/
executable/device/inode точно совпали с owned+allowed identities чужого для
этого supervisor собственного admin-OQw8sM из saved source[2]. Producer PID
2141109 и2143590 различны, lifetime overlap1.325s. Peer registry process-local,
поэтому отдельный controller не был признан peer. Старый quarantined proof не
переписывается, ручной release/delete не выполняется.
Последующие native browser проверки выполняются последовательно.
Текущего API additive peer-source qualification нет: qualifier требует
confirmed/capture-complete proof без unknown; writer-settlement exception также
запрещает unknown. Для dyI2ST нужен отдельный проверяемый контракт reconciliation
с immutable foreign sources; диагностическое совпадение не заменяет release proof.

## Положительная SessionBackup policy остаётся неквалифицированной

Дополнительный primary boundary2026-10-15: public pinned server image содержит
`SessionBackup.cfg`/`SessionBackupConfiguration`, User/Name/Session map/list,
backup status/finalize enums и package-autosave event flags. Binary SHA256
`1fea749d88b89cdf810e7c23496e5ad146728a032abfcd235367c5f1969cdd0a`
совпал в трёх независимых чтениях никогда не запускавшихся inspection containers.
Эти имена не задают документированный create/enable/disable API или schema
файла; наличие metadata map не доказывает сам trigger. Полный JS RPC formal
`SavePackageAs(APackage,AFileName)` не содержит дополнительного backup-флага.
На собственной permanent research pair fresh no-follow check подтвердил
отсутствие `/workdir/SessionBackup.cfg` при неизменном StartedAt; это не disabled
policy. Symbol-name/UTF16 lookup не нашёл дополнительного метода или debug section.
Неподтверждённый config файл не создавался, старые crash recipes не повторялись.
Private `management-registry-20261015/backup-binary-primary-audit.json`
SHA7219026dd85f79d4aebf24816ffb6fa5465c83d86c0c489849bd5aae268cdc4c
связывает5 primary sources/metadata receipts, свежую absence трёх собственных
inspection CID и неизменный image/daemon. Raw binary copies/tmp roots удалены;
permanent pair только читалась, новых browser/model/judge calls0. По-прежнему
нужен подтверждённый server-side trigger/контракт от платформы либо supported
enforced-disabled policy с положительным control. Gate не снимается.

2026-10-15 research: native PackageAutoSavePeriod=5000 read-back + named package
с реальным изменением создали ненулевой `UserStorage/eval-a/backup-probe.lgp.autosave`.
SessionBackupManager.GetSessionsList остался пуст, физический SessionBackup пуст
до и после штатного stop собственной disposable pair. Другие проверенные recipes:
несохранённый module, own pagehide fault, short SessionKeepAlive/read-back и новый
user context. Они также не дали положительного session backup; это не доказывает
отсутствие поддержки платформой. Native roots: UserStorage/SessionBackup, relative
к рабочему каталогу. Drafts не autosave по официальной документации.

Дополнительная граница исследования (2026-10-15): опубликованный RPC manager
(interface674) содержит GetSessionsList, DeleteSessionBackup, DeletePackageBackups,
RestoreSessionBackup и RestorePackageBackups; подтверждённого create/enable trigger
не найдено. Settings публикует SessionBackupDirectory, а PackageAutoSavePeriod
относится к package autosave. Это не является доказательством disabled policy.
Private600 `research/evidence/management-registry-20261015/backup-policy-primary-boundary.json`
фиксирует SHA256 обоих pinned primary JS, methods и ссылки на официальную документацию.
Gate остаётся `SESSION_BACKUP_POLICY_UNPROVEN`; повтор старых recipes не снимает его.

Startup race подтверждён fixed BACKUP_DRIFT telemetry: MainForm поздно применяет
сохранённый user autosave period. Published end-of-initialization callback wait
сохранил исходный deadline и убрал этот drift. Named autosave теперь имеет
private bytes/SHA + current identity/user/session/period evidence; safe A/B cleanup
и SessionBackup mapping/delete/enforced-disabled всё ещё не квалифицированы.

Следующая нужная информация — фактический server-side trigger создания session
backup для закреплённого 7.4.2, либо положительно квалифицируемый enforced-disabled
режим. Нужны ненулевой control и user/session attribution; empty root не снимает
admission gate. Production ledger не принимает experimental backup phase,
main/live/model admission остаются закрыты. Независимые задачи продолжаются.

Источники: https://help.loginom.ru/userguide/interface/packages.html и
https://help.loginom.ru/adminguide/linux/server/config.html; первичный
MainForm.js:1133–1140/PackagesAutoSavePanel.js:50–58 закреплённого Studio.

## Draft admission fixture: retained unused slot reservation

2026-10-14: /tmp/evals-admin-user-e3H9B4, own research nonce
eddb11f2-bde0-4659-aba7-d6ff61201875, server full ID
1790125f8e1408aca0312cc2db75c1214708d1cf198f70d98f3c8c44d4ed9ef0,
Studio2d467bf07fddc87fff4a7418dee81f15681c0b67fe0b3118ff40a3c8e779776f.
Первый draft упал до отсутствующего createBlockedUser; finally close оставил
reservation, destroyPair отказал PAIR_RETAINED_INCIDENT. Pair/root/secret/journals
сохранены; отсутствие нынешнего PID не разрешает remove reservation или destroy.
Нужны recovery-only CAS и доказанное unused/clean release (account absence,
native process proof, committed archive) через lifecycle API. Native wire CRUD
продолжен на других disposable pairs без slot admission; они штатно уничтожены.
Обновление 2026-10-15: recovery-only slot CAS/lineage реализован и проверен
реальными exited Bun controllers; native parent admission guards также PASS.
Этот конкретный incident ещё не принят/освобождён: адресные process/archive/unused
proofs и terminal cleanup producer остаются необходимыми.
Normal staged-only/account-absent finalization primitive теперь реализован и
проверен на новой disposable pair; для этого старого incident всё ещё необходимы
recovery-only ownership и совместимая исходная provenance. Его reservations/данные
не изменялись.

## Незавершённый live admin dispose — причина пока не воспроизведена

Research admin-fYV8vv: probe unknown/dispose confirmed, затем test timeout90s;
финальный connection receipt остался ready. Подтверждённого cleanup этого
incident нет. Пять локальных channel/supervisor tests×3 и два actual Node/pipe
order probes прошли (15 PASS/63 assertions, оба final00). Последующие live
read-only/design-refusal проверки завершились; перестановка await как fix не
подтверждена. Journals/profiles сохраняются, targeted closure/admission остаются
gates. Диагноз: evals/docs/2026-10-14-admin-design-capability-diagnosis.md.
Продолжение: проверить lifecycle на квалификации design user, сохраняя incident;
отсутствие нынешнего PID не разрешает освобождение его fence или удаление данных.

## Bootstrap administrator — внешний вход получен, live qualification открыта

Обновление 2026-10-14 16:23 UTC: оба **фактически настроенных** файла
`parallel/secrets/loginom-admin.json` и `research/secrets/loginom-admin.json`
присутствуют. `loadSlots` + private receipt reader + schema validation PASS:
regular current-UID0600, два непустых string-поля username/password без NUL.
Содержимое не выводилось и не копировалось. Выбранные container names свободны,
постоянный pair journal отсутствует; следующим шагом создаётся research pair.
Public create research 2026-10-14 завершился infrastructure-ready, persisted
pair.json и resource/identity read-back PASS. Evidence:
`/home/kiselev/.local/state/loginom-evals/research/evidence/pair-bootstrap-20261014`.
Pinned-candidate native admin login/role read-back + browser/native dispose теперь
PASS: target1/7 (6.22s), combined48/123 (36.33s), typecheck/diff PASS. Timeout
root cause — Studio password readonly до focus — исправлен штатным focus;
диагноз evals/docs/2026-10-14-admin-password-focus-diagnosis.md. Unknown старых
probes сохранён; server sessions/ACL/backup/licence counts ещё не квалифицированы.
Acceptance pair ещё не создана.
Отсутствие admin file больше не блокирует factory; admin login и роль
подтверждены на research. Лицензия, qualified session RPC/ownership и остальные
readiness gates ещё требуют проверки.

Историческое состояние на 2026-10-13:

Постоянные конфиги созданы в `/home/kiselev/.local/state/loginom-evals/parallel/slots.json`
и `/home/kiselev/.local/state/loginom-evals/research/slots.json` (private regular 0600).
Файлы администратора по указанным в них путям отсутствуют:

- `/home/kiselev/.local/state/loginom-evals/parallel/secrets/loginom-admin.json`
- `/home/kiselev/.local/state/loginom-evals/research/secrets/loginom-admin.json`

`loadSlots` реально отказал с `SLOT_PATH_PRIVATE` до Docker mutations. Требование
плана: bootstrap credential предоставляет владелец в private regular file 0600;
исходные права/лицензия не выдумываются программно. Пароли работающих dev/legacy
пользователей не заимствуются, файлы с фиктивными credentials не создаются.

Нужны исходные административные credentials, пригодные для новых pinned-image
пар; driver закрепил JSON-схему: ровно два непустых string-поля `username` и
`password`, без NUL, private regular file 0600 текущего UID, nlink=1, без symlink.
Секреты нельзя
передавать через Git, results, argv или сообщения. После появления файлов:
проверить owner/mode/schema, создать постоянные пары и квалифицировать admin login.

Ограничение затрагивает постоянный bootstrap задачи 1а и живые проверки задач
2–5/10. Disposable Docker infrastructure integration не входит в Loginom под
пользователем и не доказывает admin readiness. Unit-реализация и немодельные
Docker проверки могут продолжаться.

Driver rejection integration отдельно квалифицировала malformed/missing private
credential и несовпадение runtime hash до browser launch. Format-only canary
временный fixture не использовался для Loginom auth и удалён; постоянные
bootstrap credentials не создавались. Browser/readonly RPC пути ещё не проверены.

Bun→Node→supervisor bridge прошёл отрицательную интеграцию на собственной
disposable pair: 3 tests/17 assertions, init not_applied, dispose confirmed и
continuous process absence proof. Это позволяет продолжать независимый код,
но не снимает bootstrap blocker и не доказывает browser/admin readiness.

## Model и judge OAuth — файлы появились, live qualification открыта

2026-10-15: фактический model store принят штатным `assertAuth`; два pinned-candidate
CLI в разных bubblewrap profiles одновременно прочли public provider status
(ready, same generation/principal, refresh_required=false, overlap5802ms). Общий
lock inode стабилен, оба process proofs confirmed/capture complete. Private
evidence: research/evidence/actual-shared-status-0WIqV1/receipt.json600, SHA
b00e0ba6103b7706317a0d606f3ea74df3ee817f1cc4d2cc95e1a05e05d77fd8. Это
снимает неизвестность schema/локального чтения реального store; remote token
validity, forced refresh и model/judge live acceptance остаются открытыми.

Обновление 2026-10-14 16:23 UTC: configured model-oauth/auth.json и
judge-codex/auth.json присутствуют как regular current-UID0600. Проверены только
metadata, auth bytes не читались; действующий вход, сроки/refresh и реальные
model/judge calls ещё не квалифицированы. Отсутствие файлов больше не считается
актуальным blocker; прежние наблюдения и onboarding инструкции сохранены ниже.

Историческое состояние:

После успешной установки shared-oauth candidate metadata-only проверка обнаружила отсутствие `parallel/model-oauth/auth.json`, `parallel/judge-codex/auth.json` и `parallel/onboarding/profile`. Путь установленного candidate и hashes закреплены в private `/home/kiselev/.local/state/loginom-evals/parallel/candidate-receipt.json`. Source/manifest/capability qualification PASS; это не действующая авторизация.

Подготовка directories завершена 2026-10-14: model-oauth, judge-codex, onboarding и onboarding/profile — canonical owner1001/mode0700 (read-back). Отсутствие onboarding/profile устранено; оба auth.json по metadata-only проверке всё ещё отсутствуют. Installed candidate eb85403ce4 квалифицирован только для synthetic-schema public status и bwrap status consumers; live OAuth/forced refresh не квалифицированы.

План задачи 7 требует свежий вход владельца с внешним подтверждением аккаунта: shared модельный вход в private onboarding profile с `LOGINOM_AI_AGENT_SHARED_AUTH_DIR` и HTTP-only false, затем отдельный `CODEX_HOME=.../parallel/judge-codex codex login --device-auth` для судьи. Desktop/prod auth не копируются и существующие OAuth stores других задач не заимствуются. Harness может подготовить directories и проверить статус, но согласие аккаунта выполняет владелец.

Этот blocker относится к model/refresh и judge live gates. `--skip-judge` не требует judge auth; немодельные и fake CLI/judge проверки могут продолжаться. Команды входа и неизменяемые пути остаются в задаче 7 плана; токены в этот файл не записывать. Вопрос пользователю отложен до завершения независимых задач.

Static Studio inspection 2026-10-14 независимо от credentials закрепила RPC interface inventory (private admin-source-4905babb/rpc-inventory.json): Session.Guid и managed object ID доступны в surface, UI CloseSession использует proxy row. Это не живая квалификация: GUID↔managed-ID/CLI correlation, reconnect stability и close/read-back остаются неподтверждёнными. Дополнительный blocker несовместимости API не заявлен по одним descriptors; нужен owner-backed Loginom run из уже указанного bootstrap prerequisite. Stopped inspection container удалён, endpoints/рабочие сессии не трогались.

## Retained parent-preparation RED fixture

2026-10-15: `/tmp/evals-parent-prepare-XnBhbF`, nonce
`910f1d39-4eb8-48d7-ab98-aff3c25897cc`, server
`722e3d356803392959624c9bab58d40e3e66b560660f8b6c957e095459321b83`, Studio
`dcee92dd8842f85da5853b30557a1743180f50692882b8783bf4e6b7781232a7`.
Actual parent blocked create/configure/ACL confirmed; root publication failed
USER_STORAGE_OWNERSHIP because a root appeared during native preparation.
Admin transport/process disposal confirmed, account never activated, storage
journal planned. The ordering defect is fixed by pre-reserving the absent
inode and has passed fresh native composition; this old root is not adopted.
Server/user/profile reservations, sources and secret remain retained. Removal
requires actual recovery-only lineage plus an unactivated-account finalization
producer, still absent; empty root alone does not authorize release/destroy.
Diagnosis: `evals/docs/2026-10-15-user-root-reservation.md`.

## Installed judge launcher does not preserve the dedicated home

2026-10-15: a supervised `codex login status` with requested
`CODEX_HOME=/home/kiselev/.local/state/loginom-evals/parallel/judge-codex`
returned exit0, but this is **not evidence for that home**. The actual executable
`/home/kiselev/.local/bin/codex` is a bash VPN/systemd-run wrapper which sets
`CODEX_HOME=/home/kiselev/.codex` in its env-i child. Its reported logged-in state
therefore must not qualify the dedicated judge account. No judge/model request
was made, no auth files were copied or changed, and the global wrapper was not
modified or bypassed.

The same invocation failed strict process qualification: `CLI executable identity
differs PID 150092`, observed executable `/usr/bin/bash`, birth136642524,
continuous capture complete, process status failed. Dedicated judge reservation
remains retained at the fixed global lock root, journal
`/home/kiselev/.local/state/loginom-evals/research/controller/judge-status-A00yuH/journal.json`,
command585940be-5c1b-4bff-a7c6-00459a4f7fa3. Initial observation, failed process
proof and superseding diagnosis are preserved in that directory. Diagnosis
receipt600 SHA46713e3d02201e572d4596f80b7dba03e0bbc0119fbabe71cd0097ce0b706004,
read-back confirmed; initial reported login is explicitly unqualified.

Required resolution: an approved judge launcher that preserves the dedicated
CODEX_HOME and existing VPN/network restrictions, plus actual launcher/process
ownership qualification. Simply allowing arbitrary bash/systemd processes or
running codex-real outside the network policy is not an acceptable fix. The
retained status incident also needs a qualified cleanup/recovery producer before
release. Other non-model work continues; user action is deferred until only
external blockers remain.

## Retained admin-inventory test incident

2026-10-15: `/tmp/evals-parent-prepare-jkdzDM`, pair nonce
`add08c97-e003-4fa9-997c-80e14739cc07`, server
`a4f9d2e0ade391b5caad83fe584b3c3a259ba7a55a879e9bbe671b83a3fd0490`, Studio
`31ce622a1ea4da1890f971ad1c4188af497ec02ccc1de861a146a7c8b0302ca6`.
A new inventory basename `admin-processes.json` collided with a test-only
admin-directory prefix search; ENOTDIR before account creation. The basename
is corrected to `processes-admin.json`. This incident remains preserved: no
account ownership or activation marker, admin-QJYDop dispose/disconnect and
continuous process cleanup confirmed (producer PID1037271), original slot
`slot-a-38f77afe-a38e-4005-a575-7737133e0670.lease.json` and server reservations
retained. Inventory bytes SHA256
`04ded8ad15f9a4482eb6710e4f095892db02ed3dec8794694d7041721890f3fc`.
No ad hoc release/destroy: recovery-only lineage plus native unactivated
observation, archived profile and complete command process inventory are needed
from the pending production finalizer. Missing account/PID alone is insufficient.

## Management setup writer-release proof — 2026-10-15

Native accounting GREEN attempt stopped before collectManagementSessions:
setup exit0 but continuous process proof failed `Writer owner unavailable`.
Unknown processes0; all18 admissions allowed,13 peers exactly match the admin
proof. Own/admin exact PID/starttime identities are now absent; admin disposal,
transport and continuous closure are confirmed. Historical error cause remains
unproven; absence now does not repair the original failed proof.

Own retained root `/home/kiselev/storage/tmp/evals-cli-sessions-aEnKx5`, pair nonce
`cc6c3b5b-2593-4e04-87d5-d3593c784c76`, server
`8e1d435a0c87955199ebe8239d01feba6f68ec4a9997790d2a29e052a630073a`,
studio `18625dd4d2b3c30e00e7730bbd8494cab0c80192fdff9e13780c30aba9f1ff4e`.
Original proof SHA256
`033b9eabef82fe608c14c4d9007d59be29bf823aae4f6fcadaf4a51174b56d14`.
Private source copy: `management-registry-20261015/accounting-writer-source.json`;
log `accounting-green-final.log` (0 PASS/1 FAIL,2 assertions,90.23s).

Public observeWriterReleaseSettlement admitted the original proof shape but
refused `Writer-release processes busy or foreign`; no destroy/delete/release
was performed. Do not stop foreign processes or rewrite the normal failed
inventory. One-shot helper remains in
`/home/kiselev/storage/tmp/evals-accounting-writer-cleanup.ts`; its nonce/source
guards run before any archive or factory teardown. A separate cold accounting
qualification does not resolve this observer/recovery gate.

Следующий reconnect GREEN также остановился до collector: `setup` exit0,
continuous proof failed `Writer owner unavailable`, unknown=[]/final00;
`/home/kiselev/storage/tmp/evals-cli-sessions-LQKvkl` сохранён. Оба admin
завершены подтверждённо; management inventory остаётся unconfirmed, after snapshot
не опубликован. Private600
`native-cli-sessions-b8a7aba3-a281-44e3-bac6-6172c0b19cee/setup-writer-sources.json`
SHA256 `2aecee03849c6b14b7a516202856dd216a095997c6d073a7720bd53a7dc24638`
сохраняет original sources, без дополнения отсутствующего after. Original proof
SHA256 `29c9b80bf826634f0f08b5932a41b5e0c16782cb83e0c6620d2222fa9ec8aedb`.
Nonce `eaf68d07-28ba-40e6-a226-f5c9eac601a2`, server
`2a3fb5698f038f86478b3a5d5c9e406c597b38f78ce487d0de1e7e4238a1e612`, Studio
`07169c9dd729f15a434fb296065cde626d6d58ac8952efaa0882d2d6c00b6bd1`.
Normal proof не исправлен, closure/release/delete не квалифицированы.
