# Analytic10 на CLI ветки evals-parallel, 2026-10-20

Техническая приёмка пока **не пройдена**. Первая серия остановлена на двух
попытках, вторая — на пяти, третья — на четырёх. Данные сохранены; результаты не объединяются.
Критерии и фиксированная десятка — в [плане](../../../superpowers/plans/2026-10-20-analytic10-branch-cli.md),
правила — в [контракте](../../../../evals/docs/parallel-users-contract.md).

## Подготовка

Focus password исправлен по TDD в `6548e04d2c`:44 связанных теста и Host
typecheck прошли. Два дополнительных native cancellation tests с ожиданием2с
падают также на исходном коде; это не подтверждение новой регрессии.
Management Loginom явно выбирает headless, сохраняя routing models/providers
(`3a7491b579`, `8f1808e980`). Связанные проверки:104pass/2skip/0fail, typecheck,
независимое ревью. Proc-denial tests пропущены из-за других работающих агентов.

Старая пара acceptance-20261016 после verify1065633c с unknown Chromium
сохранена без изменения броней/receipts. Владелец разрешил новый выделенный стенд.
На новой паре3463cae565ca/d84925713c74 прошли prepare, verify2b8641b9,
строгий cold browser обоих слотов и все4 живых A/B. Перед dispatch:
20.54GiB MemAvailable,2663GiB disk,241M inode; OAuth запас102ч,
две разные local copies, исходный auth-store неизменён. Judge login без модели
проверен через VPN launcher. CPU host maximum100, остальные границы прежние.

## Серия1: Sp38yS

Run: `20261020-072725-a1986c18fd-dirty-Sp38yS`,07:27:25–07:30:54UTC.
Harness `a1986c18fdda1f7fbe858237597fad4f2f8a12f4`;
CLI `8f1808e9804e98136f83eb9495cf0505f0ad9e3d`,
version `0.0.0-evals-parallel-20261020-8f1808e9804e`,prod,
tree `15b69fc3d02ea266ebe734869c4b993af0cb8a4391b077e837b38b4a69b5e861`.
Bun1.3.14/revision0d9b296,Node24.19.0,Chromium1246; payload установлен
в отдельный HOME и проверен verify-cli-candidate. SourceDirty=true:
существующие незакоммиченные документы сохранены, их baseline закреплён private.

Агент `openai/gpt-6.1-sol/medium`, судья `gpt-6-sol/xhigh`;
seed `1eae361e4a4d60271a861c641b3a7151`.
Inputs hash `bae1f3d5e9888d4ffc1d516230f2628ed0e0191f9452fd857605e0a1be30fed2`,
rubric hash `16e3b0a385b9881fd94d2c152fd66f6c8c99da18e65c3fe5925bf351b60c3d7b`.
Восемь часов отсчитываются от первого dispatch07:28:25UTC до15:28:25UTC,
включая следующие серии.

- A:abc-pareto-groups,CLI-chain07:28:27.993–07:30:47.337UTC,interrupted.
- B:articles-by-author,CLI-chain07:28:28.420–07:30:47.337UTC,interrupted.

Перекрытие CLI-цепочек138.917с, максимум2. Оба агента подтвердили
authenticated/READY и свои eval-a/eval-b. У каждого8 step_finish и11 tool calls,
tool errors0. Суммарные заявленные CLI tokens:145526 input,2223 output,32 reasoning.
Reported OAuth cost0 не доказывает бесплатность. Оценок и oracle нет.

В07:30:41.951UTC B сообщил session.status.retry,attempt1:
socket connection was closed unexpectedly. Признаков429/quota в этом событии нет.
Существующий watcher намеренно считает любой retry инфраструктурным инцидентом
и вызвал общий abort. Код summary PROVIDER_LIMIT_OBSERVED не доказывает rate/quota.
У B provider coverage complete, у A unavailable; весь provider/judge gate failed.
Остальные8 задач не получили attempt. Пакетов/verdict/oracle/judge calls нет.

Supervisor подтвердил завершение обеих цепочек, capture_complete=true,unknown=[].
Native saved-package-cleanup у обоих BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED,
save_operation_id/package_path=null. По этим данным нельзя свести отказ только
к отсутствию Save: остановка могла произойти на проверке незавершённой операции.
Recovery JSON запрещают archive/admission; cleanupSlotStorage не дошёл до
закрытия серверных сессий. Server и profile a/b retained,judge home released.
Повторное использование, полная изоляция результатов и готовность следующего run
не подтверждены. Неизвестный список storage leftovers не считается пустым.

Ресурсные проверки прошли для измеренного интервала:147проб,0пропусков,
max gap1006.68мс; CPU host peak81.69%,MemAvailable min16.19GiB;
Server peak0.664core/72.72MiB,Studio3.026cores/255.71MiB.
OOM/ENOSPC/license incidents не наблюдались. Collector штатно завершён.
Это не ресурсная приёмка полной десятки.

Post verify вернул exit2/LEASE_FILE_PRIVATE:production cleanup receipts имеют
mode0664,а startup reader требует0600. Дефект исправлен в `4593a1396b`:
management/attempt/prepared writers используют существующий writeLeaseReceipt.
Два теста реального writer→startup reader прошли RED→GREEN;
связанные проверки138pass/2proc-denialskip/0fail,593assertions,typecheck и
независимое ревью прошли. Старые файлы не chmod/не переписаны. Исправление
будущих writers не устраняет recovery этой пары.

Private evidence:
`/home/kiselev/storage/tmp/analytic10-branch-20261020-w6kidhm4/`:
manifest,series1-audit.json,results,build/tests logs и eval_parallel_blockers.md.
Дубли установочных payload удалены после проверки; installed candidates и
данные инцидентов сохранены. Чужой staged root eval_parallel_blockers.md не менялся.

## Продолжение

Новая полная та же десятка выполняется на другом чистом своём стенде после
пересборки CLI с writer fix; результаты серий не объединяются.
Удержанные пары и их recovery/receipts сохраняются до отдельного решения.
Окно остаётся07:28:25–15:28:25UTC; новые pins/gates обязательны.

## Серия2: готовность

CLI4593a1396bc780aafafebb56ce6d1a43ec31d320,treeb448862b4f7fcc049c0a68ac5f264c84e491a34d5a13094b413ff637c4f6a53e,
prod, установлен отдельно и candidate verified. Новый Serverae288d3753ad,
Studioebe9872b15e0,порт52067. Private root:
`/home/kiselev/storage/tmp/analytic10-branch-r2-20261020-3zm1mmp9/`.
Preparec29d7423,verify750de3b8,cold browser/model medium a/b,judge login и4liveA/B прошли.
Перед dispatch:16.62GiB MemAvailable,2661GiB disk,241M inode,OAuth102ч,
2чистых профиля/4освобождённых брони. Новые cleanup receipts имеют mode0600.
Первичный PAIR_PORT_BUSY обнаружен до создания ресурсов; пустой журнал сохранён,
создание повторено со свободным портом и отдельным controller-ready.
Результат новой серии пока не получен; исходный восьмичасовой deadline15:28:25UTC сохранён.


## Серия2: u6JJ0p

Run `20261020-075057-46ad62c91a-dirty-u6JJ0p`,07:50:57–08:38:29UTC,
exit1. Начато5задач,5остались без попытки. Все5cleanup подтверждены.

- A:abc-pareto-groups —100,oracle=true; затем budget-variance-by-category —0,
  oracle=false,пакет не получен,CLI exit1/LOGINOM_HOST_CLEANUP_FAILED.
- B:articles-by-author —100,oracle=true; затем basket-category-width —oracle=true,
  без оценки из-за отказа judge; затем category-promo-demand —interrupted.

Оба слота повторно использовались независимо: B начал basket, пока A выполнял abc;
A начал budget, пока B выполнял basket. Это подтверждает реальную общую очередь,
но неполная серия не выполняет критерий десяти итоговых попыток.

В08:25:11UTC глобальный Codex config изменил service_tier с default на priority;
private judge config сохранил default. Других значимых отличий нет.
VPN launcher правильно отклонил два вызова basket с exit64 и сообщением
CODEX_HOME must contain the same lockdown config. Модель судьи в них не запускалась.
Watcher не распознал этот общий отказ и допустил следующую задачу; контроллер получил
один SIGINT в08:36:59UTC. После завершения Aclosed/Bquarantined,judge released.
Исходные конфиги и точный diff сохранены private; глобальный config и launcher не ослабляются.
Причина budget пока не сведена к SIGINT: явного CLI_CANCELLED нет, а незавершённые
операции наблюдались до остановки. Этот нулевой результат не исключается из следующей серии.

Resource acceptance **incomplete**:2723пробы,2пропущенных интервала в08:29UTC,
max gap2127.52мс. Сбор самих соседних проб занял104–117мс; причина задержки старта
не установлена. Отсутствующие наблюдения не считаются PASS.
Измеренные границы соблюдены: CPU host max97.82% допустим,MemAvailable min10.75GiB,
Server max0.535core/21.56MiB,Studio2.627cores/187.27MiB.
OOM,ENOSPC,отказы лицензии,provider retry/rate/quota не наблюдались.
CPU/RAM отдельных агентов штатно не измеряются; OAuth cost0 не доказывает бесплатность.
Collector завершён. Сырьё, результаты и ручной SIGINT сохранены в private root второй серии.


Продолжение проверено без ручного ремонта: штатный post verify1eca1c6b ready/code0,
оба профиля clean и все4reservations released. Пара второй серии пригодна к reuse.
Watcher исправлен в becff0a541 по RED→GREEN;77тестов/374assertions,typecheck и
независимое review прошли. Private judge config синхронизирован только по service_tier
под бронью; version/login без модели прошли,units завершены,home освобождён.
Полная следующая серия сохранит ту же десятку и исходное модельное окно.


## Серия3: готовность

Private root `/home/kiselev/storage/tmp/analytic10-branch-r3-20261020-k9rcj844`.
CLI `0.0.0-evals-parallel-20261020-b5ad7c602ea1`,source b5ad7c602ea19d2645a018d48fb2b1a7d03ceeac,
tree5bb3938896a11926391cabfe64fce62b06a9face2da314c5d4c6e803a95e9722,
sourceDirty=true. Установлен отдельно,candidate verified;исходники между build/verify не менялись.
Manifest закрепляет binary/resource/CLI/task/config hashes и зависимости.
Пара второй серии переиспользуется после штатного post verify;новые результаты отдельно.
На новом CLI прошли verify5d07638b,cold browser обоих слотов,modelmedium,
judge version/login без модели и4живых A/B. Final gate:2profilesclean/4leasesreleased.
Local OAuth запас101ч,исходныйauth-store неизменён. Лишние свои неустановленные payload удалены;
установленные кандидаты,логи,старые результаты и инциденты сохранены.


## Серия3: gMHr5j

Run20261020-085726-0b749879a1-dirty-gMHr5j,08:57:26–09:17:42UTC,exit1.
4attempts/6unassigned. A:abc-pareto-groups0/noartifact,затемbasketinterrupted;
B:articles-by-author100/oraclePASS,затемbudgetinterrupted.
Оба первых authenticated/READY под своими users,provider coveragecomplete.
У abc мастер/диалог блокировал node.apply и operation.recover;CLIexit1/
LOGINOM_HOST_CLEANUP_FAILED без timeout/interrupt,но harness cleanupconfirmed и reuse.
Articles:agentexit0,29turns/31tools/0errors,judge1,oracletrue,score100,cleanupconfirmed.
Judge unit0a227c1e-efd8-49c2-b73d-b21121cabbd7 после вызова inactive/MainPID0,
home released. Оба слота независимо получили следующие задачи после своего cleanup.

В09:16:00–02UTC три пробы MemAvailable7.97/7.69/7.65GiB нарушили minimum8GiB.
CPUpeak99.92% разрешён и не стал причиной остановки. Контроллеру отправлен один
SIGINT;новых admissions не было. Budget cleanupconfirmed,basket cleanupfailed:
processproofconfirmed/unknown=[],но незавершённыйnativeprofile запрещаетarchive/admission.
Штатный post verifyexit2 с тем же запретом;стенд/receipts/recovery сохранены.
Все4slotstatesquarantined;serverиprofilea retained,judge released.

1121resourceprobes,0missed,maxgap1391.35ms. Resourceacceptancefailed поRAM;
aggregateprovider/judge evidenceincomplete из-за прерванных задач.
Новых OOM/ENOSPC/licence/providerlimit нет. Источник краткого memoryburst не установлен.
Контрольный observer на полном файле16.73MiB:0.23с,maxRSS163MiB;этого недостаточно
для объяснения падения на несколькоGiB. Нет основания менять codecollector.

Независимое review разрешённого продолжения:No findings. Полная следующая серия
использует новый свой стенд,тот же установленный CLI и прежний deadline15:28:25UTC;
измеряемый код не менялся,пересборка не требуется. RAM≥8GiB проверяется перед dispatch;
остальные gates,границы и критерии сохраняются. Старые результаты не склеиваются.


## Серия4: готовность

Private root `/home/kiselev/storage/tmp/analytic10-branch-r4-20261020-bgrox9gn`.
Новые Server551c2efca21b/Studio5fcac22c5ef4,порт52889;identity/epoch/config pinned.
Preparee04729d6/verifye811dfc2 ready/code0,coldbrowser/modelmedium a/b,
judge version/login без модели и4живых A/B прошли.2profilesclean/4reservationsreleased.
Две новые localOAuthcopies;sourceauth/catalogue/inputs/rubric/task hashes прежние.
CLI установленный b5ad7c602ea1 из private root3,тот жеbinaryhash;с тех пор в ветке
менялись только два документа,поэтому measuredcode и evidence тестов сохраняются.
Новый budget имеет прежние25границ с новыми scopes;RAMиdeadline проверяются перед dispatch.


В ходе серии4 владелец разрешил RAM/CPUusageдо99.9%. Утверждённая поправка
хранится в root4/evidence/resource-budget-amendment.json с фактическим recorded_at,
run_id и SHA исходного frozenbudget. ДляRAM используется MemAvailable≥ceil(MemTotal×0.001):
39.397MiB при MemTotal38.473GiB. Прежний CPUmax100% сохраняет разрешение99.9%.
Rawbudget/probes/штатныйacceptance не переписываются;owner-amended budget оценка
показывается отдельно как поправка посреди серии. Остальные контейнерные/FS/OOM/
coverage/cadence/identity/cleanup требования не меняются. Review:No findings.
Исторический stopсерии3 не отменяется,её6unassigned не становятся попытками.
