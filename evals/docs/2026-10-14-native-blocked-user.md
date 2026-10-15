# Native blocked-user creation

`reconcile-user` поддерживает ограниченную wire phase `blocked`: private credential
schema/SHA до browser dispatch, enumeration всех account kinds, отказ при занятом
имени без supplied owner observation, Add(имя, dukUser), Blocked=true и getter
read-back. Повтор для exact name/kind/objectId/nonce допускает только уже blocked
account; password/AuthMode/rights/ACL/unblock эта phase не меняет. Другие phases
сохраняют ADMIN_CAPABILITY_UNSUPPORTED. Parent durable ownership/admission пока
не подключены; wire owner observation не заменяет protected ownership manifest.

TDD на отдельной disposable pinned pair: missing phase → not_applied; первая
реализация зависла в Add. Fixed stderr stages установили ENUMERATE→ADD без BLOCK.
Primary Studio bg.mscorlib.js:873–886/rpc.js:4689–4690 показывает deferred disposal
при обычном ReleaseObject. Перед mutation нужен awaited immediate
ReleaseObject(enumerator, true). Тот же тест после исправления: 1 PASS/20
assertions (23.03s); второй create сохраняет account, unowned retry refused,
enumeration даёт ровно одного blocked user. Native supervisor confirmed/capture
complete/final00; fixture pair уничтожена штатной factory по собственным IDs/nonce.

Combined admin integration/unit/preflight/user-environment: 58 PASS/197 assertions
(55.69s), bun typecheck и git diff --check PASS. Full harness suite не запускалась.
Это native CRUD capability; full prepare, ACL, user sessions и live admission не
квалифицированы. Нет вызовов модели/судьи.

Private successful evidence: research/evidence/native-user-19b63750-83e5-466c-a803-5b74a8194628
(command hashes, fixed stages, process cleanup). Timeout evidence сохраняется
в native-user-5d7d52cd-edf7-4312-95d2-2a05ee5ea496; abort130, confirmed final00,
outcome unknown не объявлен success. Test teardown теперь завершает supervisor
до factory destroy и сохраняет исходный refusal после подтверждённого cleanup.

Первый draft admission fixture /tmp/evals-admin-user-e3H9B4 сохранил slot
reservations после close; factory отказала PAIR_RETAINED_INCIDENT. Этот fixture
не обходится и не удаляется вручную. Его recovery/доказанное unused release
записаны в blockers. Текущий native capability test проверяет публичный wire
protocol без slot admission и не доказывает общий standalone lifecycle.

Следующая TDD phase configure: неподдержанная phase дала not_applied RED;
реализация после readonly inspect зависла в CONFIGURE (unknown/ADMIN_DEADLINE).
Immediate disposal требуется также всем readonly enumerators inspect: иначе
следующая mutation того же context может ждать оставшийся read lock.

Configure принимает только supplied owner для already blocked account,
переключает AuthMode на uamLocal=1 при необходимости, устанавливает пароль при
смене режима/credential SHA, выставляет минимальные design flags и проверяет
их getters. Blocked остаётся true. Повтор unchanged local account не вызывает
AuthMode/password setters. Native call-site telemetry фиксирует ровно один
AUTHMODE и один PASSWORD write на два configure вызова; никакие секретные
байты в telemetry не входят. Target1 PASS/26 (23.42s), combined58 PASS/203
(60.93s), typecheck/diff PASS. Evidence native-user-68d8f04b-e65e-4165-a553-6f5af422a8d8
confirmed/capture true/final00. Unknown prior configure в native-user-03387245...
сохранён и не объявлен успехом. Protected parent manifest и подтверждение idle
для повторной подготовки ранее activated account ещё не реализованы;
blocked flag сам по себе не является доказательством отсутствия старых sessions.

Следующий vertical slice acl: shortened expectedPolicy=[] RED вернул unsupported;
после реализации отказал ADMIN_ACL_POLICY_CHANGED до Delete. Штатные
Permissions.Delete([base-user proxies]) по SharedDirectoryForm.js:73–77/rpc
method1972 сняли2 actual Everyone grants на двух dirs. Read-back сравнивается
с полной исходной policy за вычетом targets; repeat removed0. Target1 PASS/35
(22.67s), typecheck PASS. Own target требует name/kind/objectId; stale same-name
principal сохраняется с отказом. Непустые Everyone grants проверены реально;
own explicit grant/stale principal race/foreign grant preservation ветки пока
не имеют отдельного live fixture. Effective storage isolation и global parent
guard этой проверкой не подтверждены.
Combined after principal identity guard: 58 PASS/212 assertions (52.63s),
typecheck/diff PASS. Private evidence native-user-a2cd4df6-1049-49bd-a6a8-f199251d1f22;
supervisor confirmed/capture true/final00, own disposable pair destroyed.

AllowPublish добавлен к configure policy по штатному getter/setter pinned
Studio (UserForm.js:95). На native disposable account read-back false, repeat
проверяет тот же account и не ротирует password/AuthMode. RED: отсутствовал
allowPublish в observed user; GREEN:60 admin/native/codec/preflight PASS/229
assertions (60.90s), typecheck/diff PASS. Activation и effective access этим
не подтверждены.

Wire activate реализован после configure/ACL. RED ADMIN_CAPABILITY_UNSUPPORTED
→ GREEN actual Blocked=false и repeated activated=false. До setter требуется
полное совпадение shared policy без grants и safe account flags/auth/SHA; после
setter — exact native identity и повторная policy проверка. Everyone policy и
missing configured SHA отказали до активации. Target1 PASS/43 assertions
(21.69s), typecheck/diff PASS. Пара после confirmed native dispose/process proof
удалена. Admission/effective ACL/session close этим не квалифицированы.

Causal design-session probe прошёл на disposable pair. Fixed reconcile-user
phase session-probe проверяет exact active account/credential/policy, создаёт
отдельный browser context внутри supervised native browser и выполняет штатный
login/CreatePackage/ClosePackage(new Ref(...),5000). Bootstrap admin flags
не меняются. Native user identity в design context совпала с созданным account;
единственная новая managed row (eval-a:2) сохраняла objectId/Name/CreateTime
на переходе package Count 0→1→0. Probe context подтверждённо закрыт до ответа.

Target1 PASS/53 assertions (29.28s); admin/user codecs30 PASS/98 (1.187s),
typecheck/diff PASS. Private whitelist evidence:
`research/evidence/native-user-8a546f36-7fdc-4c82-baea-479e671f2e03/session-probe.json`.
Сама disposable pair и profiles удалены после confirmed native process disposal.
Это causal observation текущей сборки: sessionIdentityQualified=false.
Reconnect stability, negative close races, durable ownership ledger, target
CloseSession и SessionBackup ещё не подтверждены; имя само по себе authority
не получает. Модель/судья не запускались.

Bound close read-back: первоначальный close test стабильно отказал3/3
SESSION_IDENTITY_CHANGED (26.553/27.246/24.836s). Native process cleanup и
удаление own disposable pairs подтверждены. Private signal report:
`/tmp/evals-native-session-close-signal-9svh_v_6.json`. Probe до disconnect
имел согласованные binding/Name/CreateTime/Count; этого не хватало для вывода
о состоянии после закрытия context.

Добавленный afterDisconnect snapshot показал отсутствие исходной row и по ID,
и по Name/CreateTime (native-user-52ff023d...). Primary Application.js:599–601
вызывает DoDisconnect на pagehide, ServerConnection.js:304–310 — Finalize.
Source path сам по себе не доказывал server closure; fresh manager read-back
подтвердил именно отсутствие ранее causally bound session на этой сборке.

Driver хранит binding только текущего fixed probe в памяти. close-session
требует его proofId/exact tuple/user key/current epoch, повторно проверяет
account native ID и полный fresh manager inventory. После подтверждённого
закрытия probe writer context отсутствие и по ID, и по Name/CreateTime даёт
closed=true/disposition=observed_absent. Foreign proof/name/time refused;
repeat read-back идемпотентен. Retained/changed/ambiguous row не получает
разрешения на mutation; реальный manager.CloseSession RPC ещё не квалифицирован.
Общий parent close без probe proof по-прежнему unsupported.

Current native/admin/codec/preflight60 PASS/260 assertions (73.81s),
typecheck/diff PASS. Whitelist successful evidence:
`research/evidence/native-user-172fece6-5dc0-464e-aaa3-94a60211241a/session-probe.json`.
Durable session ledger, reconnect/retained session/backup и production admission
остаются открыты. Context exit без server read-back authority не получает.

Проверка следующего slice выявила ещё один реальный исход обычного disconnect:
row осталась pendingDisconnect=true/Count0 (native-user-0b6a57d2...). Поэтому
немедленное исчезновение не является invariant; прежняя успешная серия
подтверждала только observed_absent path. Тест теперь требует итогового
подтверждённого закрытия и сохраняет disposition, без фиксированного sleep.

Для retained row fresh proxy выбирается по causal binding + exact
Name/CreateTime/current epoch/account ID; неоднозначность/подмена отказали.
Только после подтверждённого закрытия writer context и при Count0 и
PendingDisconnect=true выполняется штатный manager.CloseSession(proxy,5000).
После ack fresh manager перечитывается до отсутствия ID и Name/CreateTime в
прежнем request deadline. Post-write uncertainty остаётся unknown.

Fixed session-crash-probe прерывает только onpagehide logout callback своего
renderer перед закрытием context; backend, login, package и RPC настоящие.
Это client-finalization fault injection, не SIGKILL CLI/process-tree crash.
Он воспроизводимо сохранил native pending/Count0 row; CloseSession дал
rpc_closed. Foreign name/time на retained row отказали, следующая валидная
команда действительно выполнила RPC, repeat подтвердил observed_absent.

Target1 PASS/71 assertions (30.17s); final native/admin/codec/preflight60
PASS/271 (77.49s), typecheck/diff PASS. Actual RPC evidence:
`research/evidence/native-user-d3ec9d6a-33fa-483d-85e1-f1356d1f9364/session-crash-close.json`,
paired session-crash-probe.json и command/process proofs. Own disposable pair
удалена после confirmed native disposal. Qualification остаётся false для
общего режима: active/nonempty packages, real CLI crash, reconnect, durable
ledger/recovery и SessionBackup требуют следующих проверок. Bootstrap rights
не менялись; generic parent close без probe proof по-прежнему unsupported.

Controlled retained-package research (2026-10-15): fixed
`session-package-crash-probe` не вызывает ClosePackage для одного только что
созданного пустого пакета; own writer context закрывается с прежним onpagehide
fault. Native row Count0→1→1 остаётся pending. Volatile binding хранит Count1
attestation только для этой phase; ordinary probes не получают этот допуск.
Fresh native account/epoch/Name/CreateTime guard и pending проверка предшествуют
CloseSession; confirmed RPC и bounded fresh absence завершили именно этот row.
Changed name/time rejected; повтор подтвердил absence. Нет file deletion и model calls.

RED1 unsupported phase → controlled probe GREEN; RED2 SESSION_NOT_IDLE → scoped
Count1 close GREEN. Target1 PASS/84 (32.90s), combined106 PASS/454 (86.55s),
bun typecheck/diff PASS. Final private evidence:
`research/evidence/native-user-4f487b81-7f03-4bc8-8ae1-2d5600fb52c4`
с session-package-crash-{probe,close}.json и process proofs; own fixture pair
удалена после confirmed native disposal. Qualification=false: production ledger
не принимает новый phase, CLI SIGKILL/произвольные операции/B survival/backup
и reconnect/recovery ещё не проверены.

Следующий backup research имеет опубликованные первичные интерфейсы:
IBGBaseDeductorServerSession.PackageAutoSavePeriod и SessionBackupManager;
IBGDeductorServerSessionBackupManager.GetSessionsList (remote1819) возвращает
list Count/getItem(index), backup row содержит PackageCount/StartTime/BackupTime.
Pinned bg.model.js:5085/6013 и соответствующие interface metadata подтверждают
API shape; actual calls ещё не проверены. MainForm.js:1133–1135 и
PackagesAutoSavePanel.js:50–58 переводят минуты в milliseconds и используют -1
для disabled. Период должен быть прочитан обратно; источник сам по себе не
доказывает ненулевой backup, его user isolation, GUID mapping или safe deletion.

2026-10-15 autosave/SessionBackup distinction: named package + material change
and read-back PackageAutoSavePeriod5000 produced a nonzero `.lgp.autosave` in
its actual eval-a user directory. An unnamed empty module was not a positive
backup control. Official documentation states drafts are excluded from autosave:
https://help.loginom.ru/userguide/interface/packages.html .

First experiment timed out; fixed telemetry + per-sample period read-back then
caught BACKUP_DRIFT. MainForm.DoServerPrepare applies browser storage period
late, after publishing Session. Waiting for its published
Markdown.OnLoadAllowedLinkURLs assignment (MainForm.js:1133–1140) before setting
period retained the original deadline and removed this race in the controlled
probe. Cadence is period/4 and observation spans2 read-back periods. No tight
RPC poll to fill a timer window.

SessionBackupManager list and actual SessionBackup stayed empty through named
and unnamed recipes, suppressed pagehide, short keepalive/new context and a
controlled graceful stop of only the disposable Server. These are negative
controls of those recipes; no unsupported-platform conclusion or disabled-policy
proof follows. Native storage roots are relative UserStorage/SessionBackup;
configuration resolves them from the working directory per official server docs:
https://help.loginom.ru/adminguide/linux/server/config.html .

Separate native backup research test copies actual autosave bytes/SHA, preserves
native reply/process/source/physical directory observations, and records
sessionBackupQualified:false. Its successful autosave/control assertions do not
replace the still missing positive SessionBackup/enforced-disabled gate. See
root eval_parallel_blockers.md. Own pair is destroyed after local process proof;
no shared/development server stop, files or credentials are involved.

Final current native/admin/slots/lease/user/preflight107 PASS/504 (135.67s),
typecheck/diff PASS. Latest successful autosave/empty-backup evidence:
`research/evidence/native-user-4e84ecb4-b1ee-4197-85d6-d2fdae1d7512` (actual bytes/SHA,
current identity/user/session/period, shutdown backup copy, process proof).

Native reconnect close 2026-10-15: второй independently supervised Node/browser
admin context без volatile binding сначала получает SESSION_OWNERSHIP_UNCONFIRMED.
Private persisted probe claim + canonical command source/SHA восстанавливают
только bound Count0/pending target. Fresh native account ID и managed tuple
сохранились между contexts; native CloseSession→fresh absence и повтор
observed_absent прошли. Changed claim SHA/binding, public0644 claim и изменённый
command source refused до RPC; последующий rpc_closed подтверждает сохранение
цели при отрицательных controls. Первый admin продолжил package probe после
завершения второго; оба process owners подтвердили cleanup. Full parent
composition пока не квалифицирована этим wire test; codec отдельно проверяет
cross-context closure journal/mandatory adopt SHA. Recovery-only и active Count1
adoption остаются закрытыми.

Следующий отдельный gate — finalization собственных administrator sessions.
Pinned bg/ts/CustomClient.js:39–43 вызывает connector Disconnect() из Finalize.
Этот connector — bg.DeductorServer: bg/js/bg.server.rpc.js:289–301 вызывает
RPC session.dispose() без ожидания и сам возвращает void. Awaitable нижний
rpc.TBGSession.Disconnect() находится в bg/js/rpc.js:6234–6299;
Task.js:49–50 адаптирует Task к Promise. Поэтому await void-wrapper не решает
эту границу. Причина прежнего retained incident этим ещё не установлена.

Driver dispose для initialized context теперь ожидает собственный
FServerConnector.$FSession.Disconnect() Task, затем закрывает browser context;
pagehide отключается после завершённого Task, чтобы не запускать второй
неожидаемый dispose. Ответ различает transportDisconnect=confirmed и простое
local context disposal. Parent сохраняет поле; после successful initialization
отсутствие подтверждения quarantines connection. Unknown исход не выдаёт
server cleanup/release authority.

Native positive control: admin A до входа B сохраняет полный managed baseline;
после входа B появляется ровно один новый admin Count0 row. После awaited B
disconnect независимый A выполняет bounded read-back и подтверждает отсутствие
этой tuple, затем продолжает package probe. Это квалификация controlled Count0
admin disposal; runtime serverSessions/grants и full prepare ещё требуют
отдельного inventory/closure evidence. Browser/process exit не подменяет его.

Последний reconnect evidence: research/evidence/native-user-104a011e-bbee-422f-bd5d-a28f5abd36aa
(reconnected-session-close.json, reconnected/native-driver-result.json,
original/reconnected command hashes и оба local process proofs). Native target
1 PASS/108 (41.63s),103 unit/codec/preflight/lease PASS/342 (10.67s), typecheck/diff PASS.

Awaited-admin-disconnect evidence:
research/evidence/native-user-33bdcaed-e911-4a6b-afb8-ef2f151c32e4/
admin-disconnect-observation.json содержит baseline/opened/causal peer/after и
actual dispose reply; оба local process proofs сохранены рядом. Native controlled
case1 PASS/118 (45.36s), полный связанный suite110 PASS/573 (139.76s), typecheck/diff PASS.
Контроль не завершает общую SessionBackup policy либо полный slot cleanup.
