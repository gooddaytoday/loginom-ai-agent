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

## Native A/B setup: сохранённый неквалифицированный UID-change incident

2026-10-15: новый per-slot seal native case остановился до самого seal, во время
параллельных начальных setup. Оба CLI вернули exit0; A proof failed с
`Cannot inspect process identity PID 1452885: Process UID changed`, B continuous
proof qualified. Числовой PID есть среди B browser processes с birth142588744,
но failing frame не сохранил birth/state/UID value. Поэтому peer attribution,
причина UID observation и closure A не доказаны; две fresh zero-remaining passes
и исчезнувший PID не исправляют исходный proof. Простой собственный zombie
control с dumpable0/1 дал UID1001 в обоих случаях и не воспроизвёл UID mismatch.
Ослабления process guards и повторного native dispatch не было.

Test1 FAIL/2 assertions93.16s; unit producer-seal/related71 PASS412 assertions,
typecheck PASS не заменяют native qualification. Research pair и temporary
controller `/home/kiselev/storage/tmp/evals-two-users-eR7Snq` сохранены;
nonce `6648414e-dd88-47b4-9910-3072697d5103` подтверждён private fixture receipt.
Server CID `f36e216c34e29c6934f35e9ae3283564a969f05a4650619fee3c242835513d10`,
Studio CID `f87fb14926b6dd891de72d1d82765a361f7875de6e139ff4c08ff1597e1e881a`,
network ID `b18f48a07f2cf2012db09e69500674b2a9814dfd308aaedb549ec96ec7b4fdfd`.
Disposable provisioning использовал global guards, а environment ownership —
отдельный fixture-local lock root; local reservations retained/OS guards closed.
Global fixed guard files не удалялись и released provisioning proof не принимался
за environment cleanup authority.

Private `native-two-users-eeba0d80-30f4-4e22-b284-4c04e9012b7a/preservation.json`
SHAb0ee250a05bd91126c45fcc27c66e1a2c2b17cde989cb1a591a22a68118fbfe7
связывает88 raw/canonical source hashes, original proofs, server reservation и
fresh unchanged pair identity. Known active secrets проверены до копирования;
оригиналы не менялись. Sidecars отсутствуют; неисполненный собственный audit
helper удалён с hash, положительного source-audit.json нет. Нужен полный источник
UID-change frame либо квалифицированный recovery producer; retained reservations
и данные не удаляются по гипотезе. Delete/admission=false, model/judge calls0.

Следующий UID refusal теперь сохраняет sampled proc-directory UID, starttime и
state; failed stat-read даёт unknown, исходный отказ не снимается. TDD actual
read-only PID1 negative с ложной historical claim: RED старое сообщение без
полей → GREEN1/5 (0.779s). Supervisor/writer suites34 PASS/2 nativeBusy SKIP/
182 assertions148.47s, typecheck PASS. Это диагностические bookends, не атомарная
identity и не объяснение старого frame; прежний failed source не изменён.

Новый exact-source native run32685e3e66 прошёл1/19 (168.88s): A seal/archive/
accounting/close при active B, fresh B check и общий finalizer. Private case
`native-two-users-4a143678-dfcf-4a51-ae93-33db172b9b72` audit
SHAdd7acfd3197a7164153e1acdf2ff884ddc41726794123191d861c1e20fb7684a:
649 checks/192 sources, exact own pair/network/root absent. UID mismatch не
повторился; это не устанавливает причину старого eR7Snq и не разрешает его
release/удаление. Старые sources и reservations сохраняются.


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

2026-10-15, дополнительный restart control: после реального named/modified
package и ненулевого native autosave старый admin подтвердил transport disconnect
и continuous process closure; остановлен и запущен только собственный disposable
server CID. StartedAt/serverEpoch изменились, IDs server/Studio сохранились.
Новый independently supervised admin успешно выполнил init/inspect на новой
эпохе и подтвердил disconnect/closure. SessionBackup пуст после stop и после
готового native входа; `/workdir/SessionBackup.cfg` отсутствует. Это проверяет
новый путь graceful stop→startup, но не даёт положительного backup control или
disabled policy. Hard-crash/startup этим опытом не проверен.
Native test1 PASS/70 assertions65.18s, typecheck/diff PASS. Private
`native-user-72d4968d-8965-4308-8c3d-a13b6c979513/source-audit.json`
SHA6e1029b0f0d616178a5b3e0cec23047984b3e1fd2b26cd820bb3ec1aae63b655:
17 independent checks,30 source hashes, both continuous closures and exact
pair/network/root absence. Production grants неизменны; model/judge calls0.

2026-10-15: отдельный hard-crash/startup control тоже не создал SessionBackup.
Перед остановкой подтверждены pending Count1 backend row того же user/session,
изменённый named package, native period5000/keepAlive1800000 и autosave5062 bytes
SHA7fb44c3ed3a552016984fcbb9b54eec3d6a30f9467deeb1d5ca55a64c7132dd2.
Старый admin подтвердил disconnect/continuous closure до `docker kill --signal
KILL <exact own CID>`; actual state exit137/OOMKilled=false. После restart тех же
CIDs новый admin init/inspect/dispose подтвердил новую StartedAt/epoch и closure.
Manager list до crash пуст; physical copies после kill и после native-ready
restart пусты, SessionBackup.cfg после restart absent. Это подтверждает лишь отрицательный исход данного recipe; create trigger
и supported enforced-disabled policy по-прежнему не квалифицированы.

TDD oracle RED на graceful0 вместо expected137 (1FAIL/68 assertions68.85s),
после смены только termination command оба native controls GREEN2 PASS/146
assertions147.83s; typecheck/diff PASS. Hard case
`native-user-831bf8d0-e994-4722-8d64-0963f15ffd35/source-audit.json`
SHA7678658c18976971879db5dc3c56d1f906a0b2dc1ed0f2b736a6985adcf03f4e:
24 checks/32 sources. Graceful control62678829...22/30 и RED678fa71a...21/34
сохранены; общий verification SHAfa28c0dd58ccb104a9271cfbfcdbaf29724d3d4d6aa081f284d28642e1160453
перечитал96 source hashes и обе copied empty directories каждого case. Все3
собственные пары/сети/temporary roots точно отсутствуют. Production grants не
менялись; model/live judge calls0. Старые retained incidents не затрагивались.

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

## Лицензионная ёмкость: поддержанный read-back пока не квалифицирован

2026-10-15: дополнительно хэшированы1817 JS-файлов локальной client copy
admin-source-4905babb;6 прежних primary hashes совпали. Identifier search после
comment stripping выделил30 файлов. `bg/app/Licenses.js` читает
`licenses/index.json` и тексты соглашений/third-party notices;
`MAX_SESSION_TIMEOUT_SEC` относится к MaxDisconnectedSessionKeepAlive, а quota
в analytics-модулях — к аналитическим настройкам. Числовой либо явно unlimited
лимит и его counting scope из этих наблюдений не получены. Поиск идентификаторов
не является AST-анализом либо полной server API coverage и не доказывает
отсутствия другого licensing API.

Private600 `management-registry-20261015/licence-client-surface-58d2bf88-b108-4ca5-ac62-bcba1212421a.json`
SHA256 c0f3fe431efaa3781921552a5602e49cd2f57f7699c6c004b8b4ea4d8f7ca3df
содержит перечень/хэши, candidate identifiers и границы вывода; runtime calls,
serial/key reads0. Новый genuine A/B management native1/16 и audit584/177
подтвердили два пользователя и независимое адресное закрытие сессии A, но не
заменяют фактическую выдачу/тип лицензии, max/unlimited и учёт admin/retained
сессий. Нужен поддержанный производителем read-back либо достоверные issuance
данные с явным лимитом и scope; числовой порог не выводится из отсутствия отказа.
Production admission и полная приёмка остаются закрытыми.

Дополнение 2026-10-15: поддержанный веб-монитор Guardant найден и доступен.
[Loginom Admin Guide](https://help.loginom.ru/adminguide/linux/licenses/license-server.html)
связывает `IP_NAME` в `gnclient.ini` с сервером ключей и описывает монитор на
порту3185. Read-only проверка permanent research Server6ae20e683182… дала
настроенный host `grdsrv-lin`; GET корня и `monitor.htm` успешны. Наблюдаются две
группы модулей Loginom/Desktop/Server Team/Server Standart/Server Enterprise/Adapter;
показанная пара ресурса Enterprise37/50 в одной группе не является доказанным
лимитом браузерных сессий Loginom. Все13 прочитанных client records сообщают режим
«По копиям» (10 `loginomd.exe`,3 `loginomd`); точного совпадения hostname собственного
контейнера нет. Отсутствие совпадения не доказывает отсутствие выдачи: правило
привязки Guardant host/process к нашему ServerIdentity ещё не квалифицировано.

[Guardant Net](https://dev.guardant.ru/pages/viewpage.action?pageId=1277979)
документирует отдельно ресурсы модуля и режим лицензирования клиента.
[Loginom Help](https://help.loginom.ru/userguide/compare-editions.html) связывает
браузерные сессии с приобретёнными пользовательскими лицензиями и отдельно
описывает административные/пакетные исключения. Поэтому50 сетевых ресурсов нельзя
подставлять в `max_sessions` либо выводить unlimited из названия Enterprise.
Открыты точная выдача нашему daemon, число пользовательских лицензий и applicable
session counting scope; network-monitor availability больше не является неизвестным.

Private600 `licence-monitor-96ee8d5e-987d-43b9-85f3-579effdc789e/observation.json`
SHA256 `478a91af8c188a614986a9672c25f0215fec27f30686f5ce32a5093843f33a56`:
15 HTTP observations с hashes/timestamps и нормализованными полями, совпавшие
container identity bookends, read-back сохранённого JSON. Raw HTML и query values,
включающие key identifiers, отброшены; страницы серийных номеров не запрашивались.
Нет settings/rescan/restart/key changes, Loginom login/model calls0. Evidence
не является квалифицированным licence producer и не открывает admission.

## Native agent replay: ранние fixtures retained до квалифицированного cleanup

2026-10-15: первый новый local provider fixture не обрабатывал debugger discovery
`GET /json/version`; его request.json() дал unhandled error, Bun завершился до
публикации finally/settlement. Native admin connection остаётся ready с
dispose=not_started/processes=null; inventory агента пуст. Original producer
1812785/birth143189040 больше не наблюдается, что не даёт cleanup authority.
Root `/home/kiselev/storage/tmp/evals-native-agent-bKNVO2`, nonce
`2d5819e0-6cb6-4399-bb32-c7a1b7a228d7`, Server
`747465344a21c622499841d4bc9750d0f719e34570fbd238380243fb08cf265c`, Studio
`2763f8af2df2caf5c35bd75c1a5550e49d4e0f3f74294511599259580dd82cb3`, network
`63fb39bf189abc8723424f1ca3b92d2b91f4bbe71ae3052833bc646788386134`
сохранены. Private native-agent-replay-bd6e06b2-971c-488a-95f4-0ba4ffe64a5a/
incident.json SHA256 `94ca9f37c64903d3f6a3facd062b54f210c6b750cd9264263fc787a091e3193d`
и copied controller sources сохраняют исходное состояние. Секретный preparation
файл не копировался. Нет сигналов guessed PID либо ручного release/unlink.

После GET404 RED→GREEN второй fixture дошёл до runAgent, но outDir ещё не был
создан. Generic sandbox refusal, planned agent inventory без опубликованного
process proof; native admin dispose/continuous closure подтверждены, CLI
settlement=false. Root `/home/kiselev/storage/tmp/evals-native-agent-YRV2I1`,
Server `48e14d5f710d1a15441c248085ea61719a8bae74d33f883469ac8f0845fc2ea2`, Studio
`e896b1acaac3c45db36bf65969bc34c2a9dbccbc2b684fc599c040591ef3d67f`, network
`72494dd707b5ba41c6cf819b2afacf5090c099c3a6ea4b17bcd1ec1abd53ba36` retained.
Private native-agent-replay-44875d4e-ec67-43c2-9319-ce83c5f61939/settlement.json
SHA256 `a1fec20d41a9a4bdacfe45a2c41c45925ecccd0aaedb9c4a20ae23270b72104a`.
Source order открывает capture files до launcher spawn; отсутствие каталога и
пустой registration marker согласуются с pre-spawn отказом. Исторический hidden
cause не сохранён, поэтому это не заменяет qualified cleanup/recovery evidence.
Резервации этих двух environments находятся в собственных root/locks; fixed
global provisioning guard и normal environment release — разные scopes.

Fixture теперь создаёт outDir до runAgent, durably отмечает cli_admitted и
обрабатывает CDP GET; local-provider TDD1/13 PASS. Skill-only control eaced503…
завершился exit0 и подтвердил local closure, но не создал browser/session; его
own pair/root удалены. Полный skill→prepare replay6b26e673… затем PASS1/14,
audit87/45 подтвердил новую active Count1 row и все closures/own pair absence.
Это квалифицирует новый recipe, но не исправляет предыдущие два incidents.
Нужен recovery producer для incomplete local actor/pre-spawn registrations;
production run и normal release этими исследованиями не разрешены.


### 2026-10-16 — Late admin and retained nonempty session

В native package control после disconnect named/modified designer session
исходный PendingDisconnect=true, Count1. Позднее открытый второй parent admin
успешно читает package receipt, но raw close видит PendingDisconnect=false,
Count1/expected1 и отказывает SESSION_NOT_IDLE. Условия close не ослаблены.
Private native-user-5037b495… и3173ba84… сохраняют full replies/journals и before
snapshots; вариант с освобождением query handles тоже отказал. Отдельный probe
со стандартным inspect был confounded и не доказывает источник изменения.
Причина изменения пока не установлена, связь по времени не объявляется причиной.

Контроль с parent admin, открытым до создания designer session, проходит:
native-user-9bcdf36b…1/67 PASS67.56s, audit SHA256
`0e6fc145fa8c5fadafe0e8eac129a42aa14310894e16764bfbeb5268947af7b0`.
Это квалифицирует durable package reader в режиме заранее открытого соединения;
replacement-admin finalization retained Count1 остаётся отдельным gate. Native
read-only API не выдаёт cleanup/operations permission. Следующий независимый
шаг — positive running/shared/pool controls и quiescence mapping.

Все5 RED/diagnostic fixtures86482995…,3cf852eb…,5037b495…,bd7e9cf6…,3173ba84…
имеют actual continuous closure обоих admins, transport ACK, original LGP/autosave
и verified absence собственных exact pair/network/root (boundary-audit.json,
22/22/25/22/25 checks). Старые incidents и permanent research/dev не удалялись.

## Selected Pool ClosePackage: native refusal (2026-10-16)

On a newly owned research pair, the completed and deleted once-only Scheduler
job leaves `/eval-pool-probe/progress-probe.lgp` in Pool type3. A fresh exact
path/unique-object/Progress=false lookup followed by one native
`IBGDeductorSessionsManager.ClosePackage(packageInfo, 5000)` throws
«Не найдена сессия в которой находился пакет progress_probe. Возможно она уже закрыта».
The same Pool object remains after fresh read-back. This RPC is not a qualified
scoped Pool cleanup path. The installed SessionsManagerForm.IsClosable also
excludes Pool/shared collections; its ClearPackagePool operation has no selector.
No global clear or server restart was used.

Native failed positive expectation is retained in private
`native-user-5de62e6a-b0bf-4c13-a89f-d995ecdc382f`; its exact sources/input,
original reply/journal, both continuous admin closures, transport ACKs and
absence of the exact own pair/network/root passed boundary audit
SHA256 `53a38350a18c5fee8ac7f1704eaed549a308becefa5a418dce45a2097ad494b7`.
The unsupported-phase RED `38f64f35…` is settled separately.

The neighbor comparison initially used another admin observer's proxy ID.
Observed native SessionInfo proxy IDs differ between admin observers even for
the same named session. The control now finds B's unique name in one observer
and compares that observer's full package row and proxy ID across bookends.
This does not weaken the separate session ownership/close guards. The original
failed oracle `34704c2b…` and fixture-counter failure `a8193505…` retain their
executed sources and diagnostics; they are not full passing test runs.

Next candidate: qualify native PackagePoolSize=0 on a fresh disposable pair
before user work, with getter/read-back and an actual completed job. Installed
ServerSettingsForm exposes this unsigned setting with minimum0; this is only
a verified setter surface, not yet evidence that zero disables retention.
Static source manifest `native-pool-settings-schema-2683f213-b58b-4d45-8019-803e6d6bb314/source.json`
SHA256 `f9292a8b396eeefa4206935eb65828d66acfccabf7c7d19b2a7a45bcf3cace2a`.
Production cleanup/delete/unpause/admission remain ungranted.

Final refusal/preservation control: native1/70 PASS68.76s, related49/160
PASS21.98s, typecheck/syntax/diff PASS. Private63e4e2dc… source-audit
SHA256 `17f23462c0b57a6f77072a64780ae85453e5cb3c149c89a668e2bd4848782e12`
checks93/43 sources+8 pins, both admin closures/transport ACKs and own pair/root
absence verified. This closes the research control, not the cleanup blocker.

### Pool follow-up: preventive native policy qualified (2026-10-16)

The research obstacle has a verified preventive path: on a fresh empty owned
pair, PackagePoolSize10→0 with immediate and post-job native getters0. The own
Scheduler job completes3, exact GUID deletion has fresh empty read-back, and
the package is absent across every collection before and after creator closure.
Native1/54 PASS63.23s; private2df05c6e… audit
`ca4df30304e01a5ec3af779da2138c4b08024cc225f89f0fba674d2d963c22a9`
checks70/23 sources+8 pins, both admin closures/ACKs and own pair/network/root
absence. Missing-phase REDe83d02ea…41/51.90s is settled with original sources.
Do not repeat the unsupported selected Pool ClosePackage recipe. Remaining
work is runtime admission with a frozen policy/fingerprint and drift guards;
public prepare/verify wiring is now qualified below. Package/lock quiescence, backup and storage cleanup remain
separate gates; this control grants neither delete nor next admission.

Same-source default-retention control62335c26…:1/54 PASS66.51s,
audit7e614cb9…74/25 verifies the same package retained after creator close.
Both cases freeze the identical8 code/binary/input pins. Related49/160
PASS21.15s; typecheck/syntax/diff PASS.

Pool preparation wiring follow-up (2026-10-16): public prepare configures0 before
user staging/configuration; verify only reads live0 and both receipts persist
the policy source. Native1/16 PASS99.68s, related62/232 PASS46.09s,
typecheck/syntax/diff PASS. Private51f765be… audit9c6e5d40…83/45+9pins confirms
three closed admin actors/transport ACKs, two released pre-CLI finalizers and
exact own pair/network/root absence. This resolves prepare/verify wiring;
runtime frozen-policy admission/drift and evaluated-attempt cleanup remain open.

Active backend follow-up (2026-10-16): one actual JavaScript CPU node is now
qualified after creator-context loss. Existing bound CloseSession removes the
active session/package before normal completion: browser/controller start→fresh
absence3051ms versus same-source/image control21456ms. Close1/53 PASS61.68s,
control1/54 PASS79.82s, related50/162 PASS22.75s, typecheck/syntax/diff PASS.
Private05c609b2… audit48d6b749…64/25 and0ff79e61…192a52d3…184/73 preserve
full replies, both admin closures/ACKs, exact own pair/network/root absence and
input. No ownership/pending guard or deadline changed. Actual CLI crash, B-active
continuation, FD/locks, backup/storage/no-regrowth and durable cleanup consumption
remain open; this component evidence keeps operation/cleanup authority false.

Concurrent active-user follow-up (2026-10-16): native A/B JS operations now have
a positive independence control. A20s is stopped while both packages show
Progress; B's same package remains active, completes successfully8108ms after
A closure, and preserves its canary hash. Native1/75 PASS83.41s, related50/162
PASS21.52s, typecheck/syntax/diff PASS. Privateb36aa5a7… auditf175c946…69/33+11pins
verifies full sources, three admin closures/ACKs and exact own pair/root absence.
Failed011628b4… was safely settled from actual closure/transport proofs after
fixing the fixture's object-vs-boolean check; original failure remains.
Actual CLI crash, FD/locks/no-regrowth, backup/storage and full cleanup/runtime
admission still require qualification.


Actual CLI interruption probe (2026-10-16; research fixture now decommissioned): private
`native-agent-replay-f5473183-f4fe-4df9-9b2d-d10ac61244e9` used real sandboxed
CLI and local deterministic provider. New Calculator correctly refused an
inactive upstream output before mutation. The research provider kept waiting on
that terminal refusal until the unchanged60s invocation deadline; measured run
is timedOut=true/interrupted=false, not an active-operation interruption proof.
Local CLI/admin settlement is confirmed, but a134-byte recovery `.tmp` keeps
`assertProfileSettled` closed. `finalizeSlotAttempt` refused archive-before-close;
no backend close, storage cleanup, next admission or normal release was granted.
Root `/home/kiselev/storage/tmp/evals-native-agent-ZjdFIE`, history
`/home/kiselev/storage/tmp/evals-native-history-V0RmVF`, server3167e2b4…,
studio7a62a607…, network84ae04a9… are retained with original evidence and pending
reservations. Do not unlink the marker or infer recovery from a dead PID. Needed:
source-qualified handling of pending stopped-writer history before native close;
current archive API intentionally requires a settled profile. Independently fix
the provider terminal wait and exercise an already linked Calculator so its
existing-node path can activate the bounded source without the new-node preflight.

Pending archive follow-up (2026-10-16): the primitive now archives pending history
after writer-marker absence and two fresh idle checks, preserving bytes/inodes
in its durable manifest. Unit RED→GREEN14/88 PASS24.77s; strict admission and native
closure authority remain separate. This resolves the archive-vs-admission
conflation, pending native finalizer rerun. Original f547 attempt has no normal release; its research namespace was later decommissioned as recorded below.
Additional original retained probes:2f0726d8-7274-4980-9007-e64ce2f25b9a, root
`/home/kiselev/storage/tmp/evals-native-agent-5FqIMa`, historyUURaKz, server56d46800…/
studio3d3d88d1…/network0447fd87… timed out at60s before execution; and
dc751ee6-eb90-4fda-9338-e4d4b7d73a38, root
`/home/kiselev/storage/tmp/evals-native-agent-fHXu1g`, actually interrupted on
Progress at77.681s (new scenario budget120s), backend active after local closure.
Both failed at the old archive barrier; their original records and histories are retained. Research resources were later decommissioned as recorded below.
They require source-qualified recovery; no PID-only or reservation unlink cleanup.

Native pending-history archive follow-up (2026-10-16): fixed path verified with
actual CLI interruption, not timeout. Private d9c44aac-e380-4d91-9194-5bd260e311b3
passed1/14 (180.97s), auditd10a7521…2191/168 with all source pins, continuous local
closure, backend still active afterward, preserved recovery bytes, committed
archive-before-close, exact agent/setup close and fresh absence. Own disposable
pair/network/root gone; history retained. This resolves normal-owner controlled
interruption/archive composition. It does not release f547/2f/dc old reservations
or qualify hard SIGKILL, FD/locks, no-regrowth, storage cleanup or admission.


Hard CLI crash follow-up (2026-10-16): the native replay case selected by
`--test-name-pattern 'is killed during server execution'` now sends SIGKILL only
to the unique admitted candidate executable in the exact slot scope, using
signalProcess with a fresh full-identity check. Private intent records identity,
owner/launcher and immutable native Progress trigger. Actual exit137 has neither
timeout nor controlled-interruption flags. Continuous local closure is followed
by fresh backend activity, committed pending-history archive, exact agent/setup
closes and fresh absence; both cleanup/admission grants remain false.
Native1/16 PASS184.30s; private5e699014… auditf8cbd6b2…2239 checks/183 sources,
29 causal frames and18 source/binary pins, SQLite-copy integrity, original archive
objects, admin transport/closure and exact own disposable pair/root absence.
The wrong-abort RED966365c1… failed safely; auditfdcf3641…2223/179 and all own
resources/root absent. Related22/160 PASS30.09s, signal identity/refusal3/6
PASS0.217s. This resolves the controlled hard-CLI-crash component; FD/locks,
no-regrowth, backup, full N2/live runtime and normal admission remain open.


Resolved research archive incidents (2026-10-16): own f5473183…/ZjdFIE,
2f0726d8…/5FqIMa and dc751ee6…/fHXu1g have been decommissioned. Read-only
preflight verified original actor inventories, continuous CLI/management/admin
closures, admin transport ACK and unchanged exact pair epochs. Public CAS acquired
recovery-only server and composite profile/user claims; durable archive preserved
pending history before public factory teardown. Fresh checks prove all9 original
container/network IDs and3 scratch roots absent. Original failed tests, old/new
lineage, factory commands/releases and SDK histories remain in private evidence.
Independent read-back: f547 auditfe65226a…1685/34,2f audit3de7c127…1864/36,
dc audita1f808b2…1875/34 (5424 checks/104 sources total), including original
archive inode/bytes, SQLite private-copy integrity, exact CAS lineage, persistent
global factory release proofs and current absence. Support scripts and9 public
controller source pins are bound to589f32a7ca. This disposal covers dedicated
research namespaces; normalRelease, storageDeletionAllowed and nextAdmissionAllowed
remain false. Production recovery, FD/locks/no-regrowth and live admission keep
their existing gates. Older unrelated incidents were preserved. Four duplicate
temporary logs were removed only after matching retained SHA256 copies.


Native package FD/flock follow-up (2026-10-16): a bounded read-only kernel
observer on the ordinary unprivileged research pair enumerates container
processes, brackets their births, and records scoped FD targets/stat/fdinfo,
raw maps and `/proc/locks`. The collector excludes its own PID. The native
package retains a PID1 sidecar `.progress-probe.lgp.lck`; fdinfo and both kernel
lock snapshots positively identify FLOCK ADVISORY WRITE on its exact inode.
After active bound CloseSession and fresh package absence, both post-close kernel
lock snapshots lack that tuple and no own-root descriptors remain; daemon birth
is unchanged. A directory FD appeared only in the earlier diagnostic sample.
Native1/65 PASS71.90s; private7b3fb852… audit77f25169…82 checks/28 sources+11
source/binary/input pins, both admin closures/transport ACKs and exact own
pair/network/root absence. Source start→native absence3640ms is a controller
observation interval. Related50/162 PASS25.04s, typecheck/shell syntax/diff PASS.
First diagnostic7d37a6a8… preserved its callback-shadowing failure and complete
metadata; audit18791214…82/28 checked teardown and recovered the minimal close
reply only through an exact immutable journal replyHash match. Its resources/root
are absent too. This establishes a positive package FD/FLOCK control. Durable
finalizer/cleanup consumption of fenced observations, B-active filesystem
controls, no-regrowth and
general workload coverage remain open; operationsQualified and cleanupAllowed
stay false. Final collector repeat7841a66a…1/65 PASS84.80s, auditf6eff982…
82/28+11 pins confirms the same native control with the newline fix (controller
source start→absence5567ms). A separate real child control3193c23f… RED→
4210e0e9… GREEN1/9 PASS30.52s qualifies exact trailing-LF FD targets and a
positive executable mmap; sentinel-preserving readlink fixes shell trimming.
Its independent audit9c9c3af9…61/16 preserves both verdicts/source snapshots
and proves all own resources/roots absent. This is collector visibility, not
a qualification of workload-wide quiescence. One never-started configuration
fixture was removed after retaining its manifest and confirming empty journals.


Fenced kernel evidence producer/reader is now implemented (2026-10-16) in
`src/server-files.ts`. Actual held-lease/raw-stream control c8719560… passes12
assertions; audit6a282b8a…78/22 binds both original boundary RED and GREEN,
8 tested sources each and full own resource/root absence. Source SHA, foreign
slot and closed guard controls refuse; malformed protocol tags/boundaries refuse
even with a recomputed hash. This resolves the durable point-observation gap.
Finalizer binding, operation/package accounting, no-regrowth/B-active filesystem
controls and actual cleanup consumption still remain; no grants were enabled.
