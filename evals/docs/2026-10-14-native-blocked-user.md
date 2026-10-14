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
