# P50: product recovery и восстановление Authoring

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Статус: независимое plan review APPROVE, обязательных замечаний нет; runtime fix прошёл RED→GREEN и независимое source review (312/312 PASS); installed acceptance ещё не завершена. Review: `.superpowers/sdd/2026-10-28-analytics-expansion-implementation/product-recovery-plan-review.md`. Владелец разрешил минимальный product-fix, проверку установленного артефакта и безопасную cleanup Authoring. Commit/push/merge/release, setup/OAuth, изменение Benchmark pins и перенос чужих private patches исключены. Основной план кампании допускает K принятых пар и явные deferred; его quality gates сохраняются.

## Результат и границы

Доказанно завершённый browser callback с неизвестной UI cleanup допускает штатный browser recovery. После ручной очистки runtime заново доказывает quiet graph и освобождение именно исходного native-узла; исходный failed receipt не переписывается. Ordinary release остаётся строгим. Running/unknown/unmatched receipt, transport uncertainty, чужой контекст и недоказанная новая cleanup остаются блокирующими.

Текущий Authoring-профиль восстановлен только после сохранения его данных и нового подтверждения cleanup собственных ресурсов; старый failed close остаётся failed. История, credentials, прежние server artifacts и пользовательские изменения сохраняются. Новая авторская попытка запрещена до проверки пригодности профиля и конкретного основания повтора.

Первый проверяемый основной путь: terminal configure → browser recovery start → ручная очистка собственного UI → finish → fresh native proof → continuable, затем штатный close. Unit-проверка не заменяет installed Loginom-проверку.

## Исходные доказательства

- P50 attempt-1: exit1, `import-operations`, configure timeout, terminal page receipt, `cleanup_complete=false`; package/CSV отсутствуют.
- Release и handoff смешивают остановку callback и cleanup UI. `verifyBrowserRecovery` после handoff повторно использует ordinary release и тоже отказывает на старом cleanup=false.
- Runtime close: `closed_ack=false`, SIGKILL; `.writer` сохранён, host recovery journal пуст. Management admission блокируется guard.
- Browser-stage close подтверждён, package cleanup не подтверждён. В server `/workdir/SessionBackup` при read-only проверке файлов нет; отсутствие backup не доказывает отсутствие server draft.
- Подробности: `.superpowers/sdd/2026-10-28-analytics-expansion-implementation/{p50-config-diagnosis,recovery-handoff-analysis,recovery-profile-analysis}.md`.

## 0. Безопасный путь текущего профиля — до новой разработки offline recovery

1. Сохранить private immutable copies Authoring profile/attempt, UserStorage и SessionBackup; отдельно зафиксировать исходную writer identity и server artifact inventory. Не выводить secrets и не менять исходные receipts.
2. Существующими read-only admin средствами установить текущие sessions/packages/задания и принадлежность P50 draft. Использовать только выделенный Authoring и существующие credentials, без eval-slot cleanup или reprovision. Собственный admin connection закрыть с подтверждённой cleanup.
3. Если исходный draft существует, сначала сохранить отдельный recovery artifact либо полный пригодный native backup и проверить его; затем только адресная штатная cleanup принадлежащих ему ресурсов. Если не удаётся доказать принадлежность/сохранность/очистку, guard сохраняется. Отсутствие draft подтверждается наблюдением сервера, а не отсутствием файла.
4. При доказанных серверной cleanup и отсутствии собственных процессов допускается существующий `releaseStaleWriter` с exact writer identity, затем native `loginom status/check` и их cleanup. Сам helper проверяет процессы/identity, но не заменяет server/package proof.

Проверяемый исход: либо установлен достаточный existing recovery path, либо конкретный недостающий факт. Новый offline product entry заранее не строится. Если он необходим, до его реализации уточнить механизм/стоимость и повторить scoped plan review.

## 1. Runtime RED → GREEN

Файлы: `packages/loginom-runtime/client/lib/{executor,node-pending-release,calculator-node}.mjs` и ближайшие existing tests.

1. Добавить один public recovery regression: terminal Excel configure с exact completed receipt/cleanupfalse; ordinary recover отказывает; start должен выдать browser phase. Запустить и наблюдать RED именно на stopped вместо browser.
2. Разделить parent handoff stop proof и UI cleanup: completed identity-verified page receipt подтверждает остановку callback. Сохранить busy/transport и отдельные workflow/target guards; не менять общий readReceipt или исходный receipt.
3. Использовать существующий `recoveryReleasePending` hook calculator family. Вынести общий read-only quiet/native graph proof с двумя callers. Обычный release сохраняет строгую старую cleanup проверку и свои очистительные жесты. Recovery-only verifier сам не закрывает/не отменяет/не выполняет узел: он требует уже очищенный собственный UI, unlocked native node, отсутствие wizard/dialog/mask, две равные полные graph snapshots и стабильный context.
4. Тот же public test: finish при открытом wizard остаётся unresolved; после ручного cleanup получает continuable и durable recovery receipt до release. Original outcome/configuration/execution не превращаются в подтверждённый успех. Реальный Excel driver наследует hook — отдельная короткая factory-проверка, без большого нового harness.
5. Проверить отрицательные parent receipt states/identity/transport/busy, нестабильный или чужой graph, locked node, port-read cleanup и pending launch. Existing JS/export/workflow/target guards не ослаблять. `FLocked=false` не объявлять доказательством отсутствия всех server processes.

Проверяемый исход: focused RED→GREEN и релевантный Node suite на закреплённом Node24.19.0. Общий quiet proof оправдан двумя production callers; нового режима/флага allowUnclean/subsystem нет.

## 2. Review и установленный основной путь

1. Независимое scoped review actual diff, source/tests и preservation guarantees; исправить обязательные замечания.
2. Собрать отдельный dirty development payload существующим `packages/loginom-host/script/build-cli.ts` с прежними Node/Chromium pins. Установить в private temporary HOME/prefix; штатную 0.3.4-prod и Benchmark config не изменять. Не патчить installed baseline вручную.
3. Переиспользовать `packages/loginom-host/script/browser-recovery-live.ts` и установленный private Node Host для отдельной owned recovery verification. Требуется тот же terminal configure cleanupfalse, start → manual UI cleanup → finish/continuable → новое native proof, без повторного configure/Execute и без подмены failed receipt. Тестовый пакет заранее сохраняется по собственному служебному пути, чтобы его закрытие/cleanup не зависели от отсутствующего Save.
4. Подтвердить обычный release refusal/unknown executor refusal и подтверждённый close ресурсов. Сохранить evidence отдельно от authoring/measurement. Если existing driver недостаточен, добавить только узкий режим/одноразовый private driver, без нового runner или настройки продукта.
5. После достаточного результата шага0 проверить восстановленный Authoring-профиль штатными status/check с явным профилем, затем и только затем решать authoring attempt-2. Candidate path/source snapshot и причина смены Authoring CLI фиксируются до запуска; Benchmark pins неизменны.

Проверяемый исход: установленный артефакт проходит требуемый recovery main path, профиль пригоден либо остаётся точно диагностированный blocker. Source GREEN отдельно от installed evidence.

## Объём, риски и исключения

Ориентир: 3 runtime source + 2–3 existing test files, 130–210 изменённых строк; план и краткие module decisions 1–2 документа, 70–120 строк. Native driver — только при необходимости, до 1 файла/80 строк. Нового product offline recovery в эту оценку не входит; его необходимость требует обновлённого review. Превышение двойного ориентира — пересмотр подхода до продолжения.

Риски: callback stop не равен завершению серверного вычисления; ручная attestation не заменяет native proof; старый profile guard нельзя снять по PID/возрасту; новая backend session не восстанавливает старый unsaved draft; корректный source fix не подтверждает установленный путь. Эти свойства проверяются на соответствующем реальном пути.

Не входит: исправление неизвестного внутреннего ожидания Excel без новых доказательств, массовая переработка recovery/CLI, новые queues/registries/retries, уничтожение unsaved state, broad server cleanup, Benchmark/N2/старый карантин, изменение измерительных pins, повтор измерений ради балла, release/commit/push/merge. Все данные текущей кампании сохраняются.

## Текущий проверенный результат

- Source fix: независимый actual-diff APPROVE, 312/312 pinned Node tests PASS; 7 файлов / 207 изменённых строк. Review — `recovery-runtime-code-review.md` в workspace основного плана.
- Step0: private backup профиля и server UserStorage/SessionBackup сохранён. Первый native inspect обнаружил pendingDisconnect PRIVATE_SESSION с одним пакетом; в двух последующих native наблюдениях пользовательских сеансов и пакетов уже нет, epoch прежний. Мы не вызывали Close/Stop исходного сеанса; причина исчезновения не установлена. Несохранённый P50 draft не экспортирован и не принят как reference.
- Все 33 persisted server files совпали с backup по bytes; guard снят только existing `releaseStaleWriter` с exact исходной identity после idle и свежего серверного proof. Старый failed close не изменён. Private evidence — `analytics-expansion/recovery-p50/`. Ранние candidate status/check прошли (exit0, connection/browser verified, process cleanup confirmed); последующий Help blocker снят в офисной сети 29.10, как описано ниже. Installed recovery main path полностью не принят.
- Отдельный dirty payload собран штатным build-cli, manifest verified; installed через existing installCli на bundled Node в private prefix. Channel prod нужен для существующего prod-profile, version `0.0.0-recovery-p50` отличает локальный candidate; профиль и Benchmark pins не менялись. Default dev candidate был отклонён profile channel guard до host startup. Bun-вызов installer не сохранил manifest modes при копировании; тот же existing installer на bundled Node прошёл, без product patch.

- Первая installed проба остановилась до Excel из-за пропущенного обязательного `tools` refresh. Её собственные пустые сеансы адресно закрыты existing closeUserSession под server lease/profile guard; absence read-back, admin/process cleanup и release подтверждены, actual cleanup review APPROVE. Между admin views objectId пересоздаётся; проверены стабильные Name/CreateTime/Count/PendingDisconnect в контролируемом окне, snapshot objectId не объявляется session GUID.
- Повторная native проба сохранила отдельный служебный checkpoint и доставила XLSX; результат configure и оставшийся непроверенным recovery описаны ниже. Её диагностический сеанс адресно закрыт под теми же существующими fence/guard; fresh absence, admin/process cleanup и lease/profile release подтверждены. Checkpoint сохранён, failed receipts не изменены. Последующие штатные check завершились с подтверждённой cleanup; профиль idle, writer отсутствует.

## Упрощение после installed пробы

Реальный installed runtime принял terminal matched configure cleanup=false в browser phase; первый finish при открытом мастере корректно unresolved/uncertain=false. Полный путь не принят: private probe потребовал accessibility role button, реальный owned btnClose snapshot вернул generic. Ни click, ни Execute не выполнялись; failed close сохранён. Третий вариант private driver не строится: повторяющиеся ошибки пробы не продвигают P50.

После адресной cleanup собственного диагностического пакета установленный recovery проверяется в штатной CLI Authoring attempt-2 вместе с reference P50. Это объединяет уже разрешённые действия и убирает отдельную script imitation модели; guarantees не меняются. До принятия остаются обязательны terminal handoff, actual manual cleanup, fresh same-node quiet proof, durable receipt и подтверждённый package Close/logout. Попытка учитывается в общем бюджете P50 (после запуска 2/3), модель/1800s прежние. Основание повтора — новый установленный recovery и доступный manual путь; исходный Excel wait не объявляется исправленным. Новая авторская сессия сначала сохраняет собственный checkpoint; нет blind apply replay/JS fallback. Измерительный Benchmark и его pins не меняются. Если этот путь также не даёт результата, фиксируется конкретное ограничение и deferred либо новый доказанный blocker; wrapper не расширяется.

## Актуальный blocker после attempt-2

Общий Help blocker снят 29.10.2026 в офисной сети. Оба существующих TLS-пути дают401 без credentials; штатный candidate check — LOGINOM_CONNECTION_VALID, help=ready/browser=verified/process cleanup confirmed. Отдельно принят тот же check с прямым маршрутом к PRIVATE_KNOWLEDGE_HOST через task-local NO_PROXY. Прямой маршрут закреплён в существующем private authoring.env; глобальные proxy/VPN/route настройки не менялись, Benchmark model/judge pins сохранены.

Свежий native admin inventory `recovery-p50/PRIVATE_ADMIN_SESSION-office-restored-20261029-0453.json`: все packageCount=0, PRIVATE_SESSION/PRIVATE_SESSION pendingDisconnect после readiness checks, собственный PRIVATE_SESSION; admin dispose подтверждён. Процессы checks завершены, профиль idle и writer отсутствует. Count0 сеансы не выдаются за работающий executor либо восстановленный старый draft; snapshot identity остаётся unqualified. Unknown операции не подтверждены; адресный Close этих сеансов и blanket cleanup не выполнялись.

Attempt-2 завершилась до успешного prepare/пакета/Excel; её первичная remote leaf-ошибка не сохранена. Позднейшие TLS timeouts/resets и неуспешное применение прокси-клиент exclusion не доказывали product recovery дефект; исторические evidence и reviews сохранены в SDD/private directories. Восстановление Help подтверждает пригодность общей среды, но не исходный Excel configure и не полный installed recovery.

P50 временно deferred на этапе authoring/reference: использовано2/3, reference/LGP/CSV отсутствуют. Attempt-1 — Excel configure AMBIGUOUS/cleanupfalse; attempt-2 — Help readiness failure. Исходная причина ожидания Excel не установлена; source recovery fix принят, installed terminal handoff и uncleared-wizard refusal проверены, manual cleanup→same-node quiet proof→continuable→native close ещё не приняты. Старый failed close не изменён, несохранённый draft не восстановлен. Unsupported не установлен.

Продолжение кампании — следующая независимая P27. Возврат к P50 только с конкретной проверяемой коррекцией Excel-конфигурации либо подтверждённым полным native recovery-путём в оставшейся одной авторской попытке; история не обнуляется. Требования product recovery/reference/D1/calibration сохраняются, новые критерии не вводятся. Общая среда не удерживается ради отложенной пары, новая обвязка/relay не строятся.
