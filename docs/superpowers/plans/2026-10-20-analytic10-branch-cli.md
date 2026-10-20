# Прогон десяти analytic evals на CLI ветки evals-parallel

План утверждён владельцем 2026-10-20; независимое ревью выполнено.
Правила — [контракт](../../../evals/docs/parallel-users-contract.md).
Цель — полный рабочий цикл общей очереди двух слотов: перекрытие работы,
изоляция, reuse, судейство и cleanup. Качество решений оценивается отдельно.
Исходная база harness/CLI: `dca5e33d22`.

## Условия

- Агент `openai/gpt-6.1-sol/medium`, судья `gpt-6-sol/xhigh` через прежний VPN
  launcher, выделенный home и последовательный gate.
- `parallel=2`, `repeat=1`, задача 1800000 мс, judge call 300000 мс, порог 70.
- Общее модельное окно 8 часов от первого dispatch, включая повторные серии.
  По истечении один SIGINT контроллеру и ожидание штатного cleanup без повторного
  SIGINT. Supervisor CLI слота сохраняет бюджеты 90/120 секунд.
- После verify1065633c на acceptance-20261016 владелец разрешил новый стенд
  `loginom-evals-analytic10-20261020-w6kidhm4`, свежие слоты a/b. Старые стенды, инциденты,
  чужие процессы и данные не трогать. Общий сервер для слота не перезапускать.
- Private config без `auth.sharedDir`, две независимые local OpenAI auth copies
  с запасом срока >=8 ч. Исходный auth-store сохраняется; shared refresh не измеряется.
- Новый private root 0700 под `/home/kiselev/storage/tmp/`; секреты и raw evidence
  вне Git. Незавершённые staged/untracked документы сохраняются; свои коммиты
  только по явным путям. Во время build и candidate verification дерево не менять.
- Прежний бюджет N2 копируется до dispatch; CPU host maximum=100 вместо 95
  согласно разрешению владельца. Исторические frozen budgets не менять.
  Остальные bounds: MemAvailable >=8 GiB, FS available >=5 GiB и >=10000 inode,
  Server <=2 cores/256 MiB, Studio <=6 cores/1 GiB; без OOM/ENOSPC/license/provider limits.

## Выборка

Seed `1eae361e4a4d60271a861c641b3a7151`; прежняя фиксированная десятка,
без повторного выбора после результатов:

```text
abc-pareto-groups
articles-by-author
basket-category-width
budget-variance-by-category
category-promo-demand
cohort-spend-activity
defect-rate-line-shift
loan-term-risk
support-by-priority
trial-dosage-outcomes
```

## Подготовка и CLI

- [x] Сохранить план отдельным коммитом; private backup чужих изменений и baseline.
- [x] По TDD перенести минимальное поведение focus password из `694c1d3a4c`:
  воспроизвести readonly password до username blur, исправить, проверить пустой
  пароль/чужую identity. RED FIELD_READONLY → GREEN; 44 related tests pass, Host typecheck pass.
  Дополнительные native cancellation tests: 1 pass/2 fail (2с ожидание), те же 2 failures
  воспроизведены на исходном HEAD без fix; не новая регрессия, вне области этого изменения.
- [x] Создать новый private root: `/home/kiselev/storage/tmp/analytic10-branch-20261020-w6kidhm4`.
- [x] Из `packages/loginom-host` собрать полный payload командой
  `bun script/build-cli.ts <root>/cli-payload --no-archive`, pinned Bun1.3.14
  revision0d9b296, Node24.19.0 из полного дистрибутива
  `/home/kiselev/storage/tmp/evals-cli-inputs-20261019-96cd/node-v24.19.0-linux-x64/bin/node`,
  Chromium1246 из `/opt/loginom-ai-agent/resources/loginom/browsers`.
  `LOGINOM_AI_AGENT_CHANNEL=prod`, уникальная версия
  `0.0.0-evals-parallel-20261020-<source-sha>`. Это development candidate, без публикации;
  prod нужен для существующих profile markers, миграция markers не нужна.
- [x] Штатно установить в новый private HOME, сохранив sandbox; проверить
  `verify-cli-candidate.ts <installed-payload> <repo>`. Глобальные установки не менять.
- [x] Закрепить actual SHA/tree/dirty harness/CLI, binary/manifests/dependency pins,
  выборку/inputs/rubric hashes, модели, параметры и бюджет в private manifest.
  Незакоммиченная чужая документация честно отражается в sourceDirty.

## Дополнение после первого verify

- [x] Сохранить incident1065633c: management cleanup отказал по unknown Chromium2257028/29/31;
  server и два profile retained, judge released. Пустой /proc не заменяет исходный proof.
- [x] Получить решение владельца: новый отдельный стенд, старую пару/квитанции не менять.
- [x] Создать новую пару штатным createPair, закрепить identity; подготовить новые private
  profiles/local OAuth и прежний публичный model catalogue SHA59bcb39e… с gpt-6.1-sol.
  Inputs/rubric hashes совпали с прежней десяткой. Budget scopes перенесены на новую identity.
- [x] Binary management должен явно передавать --headless: после rebase CLI default=false
  сохраняется и для readiness. Независимое ревью минимальной правки выполнено;
  RED exit2 → GREEN exit0/confirmed cleanup через публичный management. Связанные проверки:
  Итог после уточнения routing:104 pass/2 proc-denial skip/0 fail; typecheck и
  независимое final review pass. Headless только для Loginom, в конце args; models/providers
  сохраняют selector. Routing regression также прошёл RED exit2→GREEN exit0.
- [x] Новая сборка CLI8f1808e9804e после headless/routing fix: install и candidate verify pass,
  sourceTree15b69fc3…; Bun1.3.14/Node24.19.0/Chromium1246, prod, sourceDirty=true. Supervisor не менять
  без отдельного воспроизведения: возможная потеря ancestry не объявляется устранённой.

## Gates перед dispatch

- [x] Проверить pair/container IDs/startedAt/network/markers/reservations,
  отсутствие внешних клиентов, ACL, Pool=0, пустой SessionBackup.
- [x] Подготовить private slots config и local OAuth, подтвердить validity >=8ч,
  модель/variant и версию нового binary.
- [x] Проверить lockdown и login judge через прежний launcher без model calls;
  invalid login — stop и вход владельца. Home прежний: parallel/judge-codex.
- [x] Штатный verify --parallel2, отдельно cold loginom check обоих слотов под
  guards/supervisor: ok=true/code=LOGINOM_CONNECTION_VALID/help.ready/**browser.verified**,
  правильные username/URL, подтверждённый process/server cleanup. Verify сам по себе
  может пропустить browser.failed.
- [x] Все четыре существующих немодельных A/B с runtime final binary:4 pass/0 fail, mutual file
  denial, peer survival, deletion after session close/readback, unknown refuses delete.
- [x] Сохранить budget copy до dispatch и после build непосредственно перед run
  подтвердить MemAvailable >=8GiB:20.51GiB в07:27UTC, FS2663GiB/241M inode;
  OAuth запас102ч, две отдельные copies, исходный auth hash сохранён. Недостаток — stop/сообщение владельцу.

## Серия и наблюдение

- [x] Единый штатный `src/run.ts --tasks tasks/analytic --only <10 IDs через запятую>
  --parallel 2 --repeat 1 --timeout-ms 1800000 --label analytic10-branch-61-medium`.
  Явные абсолютные binary/config/budget/results paths, controlled controller env,
  без случайного dotenv. Только binary из новой private installation.
- [ ] Оставаться в активной сессии до завершения, читать новые данные каждые
  30–60 секунд и сообщать краткий статус не реже минуты; admissions/completions,
  judge/score/oracle, cleanup/reuse и любые инциденты сообщать сразу.
- [ ] Каждые пять минут развёрнутый snapshot: completed/10/queued; a/b task+stage,
  elapsed/timeout/last event; provider/tool counts/errors/tokens/reported cost;
  artifacts/oracle/judge calls/scores/gate; cleanup/quarantine/reservations;
  host/container CPU/RAM/swap/FS/inodes/OOM/throttling/sample completeness и limits.
- [ ] Run сам собирает resources.jsonl каждую секунду и завершает collector в finally;
  второго collector нет. Используются events/stderr/admission journal/run/result/cleanup.
  Первые две задачи — контрольная точка входа/provider coverage этой же серии.
- [ ] Судья через systemd буферизует вывод до конца вызова; live state/serialization
  наблюдать по именованным units/journal. Не обещать live judge text/стоимость или
  per-agent CPU/RAM: штатный collector измеряет host/containers. Нулевой reported
  OAuth cost не доказывает бесплатность. Unknown всегда обозначать явно.
- [ ] Ошибки качества без повторов; штатные judge retries сохранить, infra retry нет.
  Quarantine оставляет здоровый слот работать; общие ошибки останавливают admission.
  OOM/ENOSPC, strict budget violation, identity drift/collector loss требуют одного
  SIGINT, если harness ещё не abort. CPU>95 только информация. Возраст события
  не доказывает hang; соблюдать timeout. Resource checks автоматические в конце,
  поэтому во время run пробы читает исполнитель.

## Остановка первой серии и обнаруженный дефект

- [x] Сохранить серию Sp38yS без изменения receipts:2 interrupted,8 unassigned,
  provider socket retry вызвал общий abort; process cleanup confirmed/unknown=[],
  native cleanup BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED, recovery и карантин обоих слотов.
- [x] Проверить после серии verify:exit2/LEASE_FILE_PRIVATE. Независимое ревью подтвердило
  несовместимость Bun.write(mode0664) с readLeaseReceipt(mode0600); старые receipts не менять.
- [x] По TDD проверить настоящие writers через startup readers и заменить запись
  management/attempt/prepared cleanup на существующий writeLeaseReceipt. Без изменения
  критериев retry/recovery и без новой процедуры восстановления. Два RED→GREEN;
 138pass/2proc-denialskip/0fail,593assertions; typecheck и независимое review pass.
- [x] Сохранить blocker в private root/eval_parallel_blockers.md и
  [отчёт о частичной серии](../../testing/loginom-ai-agent/reports/2026-10-20-analytic10-branch-cli.md). Prepared startup не acknowledges recovery;
  его восстановление требует отдельного решения; новая полная серия после writer fix
  выполняется на ещё одном свежем своём стенде в том же окне07:28:25Z–15:28:25Z.
  Независимое ревью подтвердило соответствие авторизации. Техническая приёмка пока не пройдена.

## Полная повторная серия2

- [x] CLI4593a1396b built/installed/candidate verified,treeb448862b…; исходники во время build/verify не менялись.
- [x] Новый private root `/home/kiselev/storage/tmp/analytic10-branch-r2-20261020-3zm1mmp9`,
  новая параae288d3753ad/ebe9872b15e0; прежние стенды/receipts не менялись.
  Отказ PAIR_PORT_BUSY произошёл до создания ресурсов; исходный пустой journal сохранён,
  новый config использует свободный порт52067 и отдельный controller-ready.
- [x] Две новые local OAuth copies, прежние task/input/rubric/catalogue hashes,
  тот же numeric budget с новыми path/container scopes; общее model window не сбрасывается.
- [x] Preparec29d7423 ready/code0 для a/b; новые management receipts0600/confirmed.
- [x] Judge login/version без модели через VPN:exit0/units completed/home released.
- [x] Verify750de3b8 ready/code0 и cold browser/model variant a/b:ready/verified/cleanup confirmed.
- [x] Четыре liveA/B final CLI второй пары:4pass/0fail.
- [x] Final private pins, release/clean gates:2profiles clean/4reservations released;
  RAM16.62GiB,FS2661GiB/241M inode,OAuth102ч, исходный auth hash сохранён.
- [x] Новый полный run второй серииu6JJ0p запущен, прежние10IDs/2слота/модельное окно.
- [x] Первая контрольная точка:обе первые задачи authenticated/READY,provider coverage complete,
  no retries/exit0/process cleanup confirmed; evidence/early-coverage-complete.json.
- [x] Активное наблюдение/разбор/отчёт второй серии завершены; техническая приёмка не пройдена.
  Не объединять с interrupted Sp38yS.

## Остановка серии2 и полная серия3

- [x] Серияu6JJ0p сохранена:5attempts/5cleanup confirmed,5unassigned;
  две оценки100/oraclePASS,basket oraclePASS/judge error64,budget failed/no artifact,
  category interrupted одним SIGINT08:36:59Z. Aclosed/Bquarantined; judge released.
- [x] Причина общего отказа judge:global config08:25:11Z сменил только service_tier
  default→priority,private home осталсяdefault. Strict launcher сработал правильно.
  Два resource intervals пропущены08:29Z; max2.13s,ресурсыincomplete,не PASS.
- [x] Независимое ревью узкого исправления/продолжения выполнено.
- [x] По TDD распознать точную строку lockdown mismatch только в judge stderr
  через существующий watchAttemptIncidents→abort; обычные judge retries сохранить.
  RED→GREEN;77pass/0fail/374assertions,typecheck,независимое review No findings.
  Commitbecff0a541. Launcher/контракт не ослабляются.
- [x] Под judge lease сохранён private config backup, синхронизирован только
  service_tier с текущим canonical config;version/login без модели exit0,units completed,home released.
- [x] Штатный verify1eca1c6b ready/code0 восстановил подтверждённые остатки серии2;
  оба профиля clean,4reservations released. Manual repair не выполнялся;
  новая серия переиспользует эту же пару, с новым CLI и отдельными results.
- [x] CLIb5ad7c602ea1 rebuilt/installed/candidate verified;tree5bb3938896a1…,sourceDirty=true.
  Source/docs во время build/verify не менялись; два своих лишних payload удалены.
  Root3k9rcj844 хранит manifest/hashes; local OAuth101ч,source auth unchanged.
- [x] Новый CLI verify5d07638b ready/code0; cold browser a/b ready/verified,
  правильные URL/users,model medium и cleanup confirmed.
- [x] Четыре liveA/B нового runtime:4pass/0fail;judge version/login exit0,units completed.
  Final gate:2profiles clean/4reservations released; память повторить непосредственно перед dispatch.
- [x] Новая полная та же десятка запущена:20261020-085726-0b749879a1-dirty-gMHr5j;
  отдельный private root3/results,первые dispatch08:58:32Z,два active/8queued.
  Предварительно RAM16.98GiB,FS2659GiB/241M inode;
  тот же deadline15:28:25Z; gates и live наблюдение прежние.
  Повтор нужен для технической проверки,задача budget с нулём не исключается.

- [x] Root3 ранняя контрольная точка:оба первых authenticated/READY под своими users,
  фактическая provider coverage complete;Aexit1/no artifact/cleanup confirmed,Bexit0→judge.
  Качество первого результата не заменяет технические проверки.

## Остановка серии3 и полная серия4

- [x] gMHr5j сохранена:4attempts/6unassigned;abc0/noartifact,articles100/oraclePASS,
  basket/budget interrupted одним SIGINT после нарушения RAM;3cleanup confirmed,
  basket recovery запрещает archive/admission при processproof confirmed/unknown[].
- [x] Resources:1121samples/0missed,maxgap1.39s;RAM7.65GiB<8 в3пробах09:16:00–02Z.
  CPU99.92% разрешён;OOM/license/provider limit нет. Source spike не установлен;
  отдельная проба observer maxRSS163MiB не объясняет падение на несколькоGiB.
- [x] Штатный verify после серии exit2:профиль имеет незавершённое состояние.
  Стенд/receipts/recovery сохраняются без manual repair;judge released.
- [x] Независимое review продолжения No findings:RAM≥8GiB непосредственно перед
  dispatch и прежние gates достаточны;не вводить новые критерии/collector/исключения.
- [ ] Новый свой стенд/2local auth copies,prepare/verify/coldbrowser/modelmedium,
  judge login/version и4liveA/B;переиспользовать CLIb5ad7c602ea1 без rebuild:
  измеряемый код не менялся. Новые identity/budget/pins;старые данные не менять.
- [ ] Та же полная10 в новой серии4;исходныйdeadline15:28:25Z,наблюдение/приёмка прежние.

## Приёмка и завершение

- [ ] Ровно 10 итоговых attempts без пропусков/дублей/подмен; реальное перекрытие
  CLI launcher chains при max concurrency2 (не доказательство overlap HTTP LLM).
- [ ] Reuse только после своего judge/cleanup, без искусственного барьера/баланса5/5.
  duration_ms — agent duration; полный cycle восстанавливается admissions/cleanup/next admission.
- [ ] Сверить slot_id/profile/history/workspace/inputs/archives/artifacts;
  предыдущая история недоступна следующей попытке.
- [ ] Verdict/oracle либо явная ошибка для каждого artifact, все judge units завершены,
  home released. Ноль artifacts/judge calls означает неполный рабочий цикл.
- [ ] Фактическая полная provider/judge coverage; новая session.status позволяет
  проверить busy→idle, но наличие кода само по себе не PASS.
- [ ] 10 cleanup confirmed, slots closed, 4 reservations released, своих server sessions
  и work leftovers нет, архивы сохранены. Полные resource probes и bounds без инцидентов.
- [ ] После серии штатный немодельный verify --parallel2 без ручного ремонта.
- [ ] Причины отклонений: harness/CLI/provider/environment/solution quality.
  Defects автономно TDD/малый commit; после measured-code change полная rebuild/pins
  и новая полная та же десятка в оставшемся8ч окне. Старые серии сохранить без склеивания.
  Unknown ownership/SESSION_NOT_IDLE/invalid login/нехватка RAM — сохранить evidence
  и точное условие продолжения; старые инциденты не очищать.
- [ ] Итоговый report (technical/slot timeline/overlap/reuse/judge/cleanup/resources/limits,
  отдельно quality), актуальные checkbox/checkpoint <=20 строк, отдельный docs commit.

## Checkpoint

1. Harness0b749879a1;CLI b5ad7c602ea1 installed/verified;после watcherbecff измеряемый код не менялся.
2. Старые acceptance1065633c/Sp38yS/root2stand теперь retained;manual repair/удаление запрещены.
3. gMHr5j root3k9rcj844 завершена09:17:42Z/exit1:4attempts/6unassigned,3cleanupconfirmed/basketrecoveryfailed.
4. articles100/oraclePASS,abc0/noartifact;basket/budgetinterrupted после одного SIGINTиз-заRAM7.65GiB<8.
5. Resources1121/0missed/max1.39s;CPU99.92разрешён,новыхOOM/licence/providerlimitнет;budgetfailed.
6. Judgearticles unitterminated/MainPID0;home released;провайдеры первых2complete,aggregateincompleteиз-заinterrupt.
7. Postverifyexit2/незавершённыйprofile;root2standиreceiptsне менять. Observer163MiB,источникmemoryburstне установлен.
8. Root4 /home/kiselev/storage/tmp/analytic10-branch-r4-20261020-bgrox9gn;новыйownstand,прежнийinstalledCLIroot3,modelwindow07:28:25Z–15:28:25Z.
9. Review continuation No findings:штатныеgates+RAM≥8GiB;следующийшагpaircreate/initialize/prepare/verify/cold/A-B.
10. Sourceauth/выборка/seed/inputs/rubric прежние;результаты не объединять,foreignstaged/untrackedсохранены.
