# Baseline Luna/xhigh/high speed

## Цель и фиксированные условия

Согласованный владельцем полный baseline: 78 готовых кейсов по три
независимых раунда, всего 234 измерения, в шесть потоков. План независимо
проверен отдельным агентом до выполнения; итоговый verdict — принят.

- Ветка `baseline-luna` создана от `autonomus-eval`, исходный SHA
  `05bb48274f53f510fb19c4d79a6272a8ee474178`.
- Оценивается полная CLI-сборка из этой ветки, исходная версия 0.3.4.
  Product source SHA, installed artifact manifest/hash и acceptedHarness
  фиксируются отдельно. Глобальная установка CLI не заменяется.
- Product model `openai/gpt-6-luna-fast`, variant `xhigh`: API model
  `gpt-6-luna`, requested service tier `priority`. Фактический tier
  сообщается только при наличии provider metadata; явный downgrade — блокер.
- Корпус: 3 ordinary, 65 analytic, 10 node; drafts исключены. Порядок:
  round-major, внутри ordinary → analytic → node. `parallel=6`,
  `batchSize=6`, `repeat=1`; round находится в ключе manifest.
- Судья `gpt-6-sol/xhigh`, threshold 70, timeout 5 минут; node оценивается
  кодовым checker. Task timeouts 15/30/60 минут берутся из task.json.
- Исполнитель EvalBaseline, управляющая модель сохраняется. Карточка
  назначается EvalOps без squad; одно native-поручение EvalBaseline из
  настоящей задачи EvalOps с подтверждённым delegated_from_task_id.
- EvalOps periodic 1800 секунд до прочитанного итога измерений. Затем
  событийный надзор доставки и отдельного ответа исполнителя. Scoped
  blocked rule и native delegation failure; дополнительный scheduler нет.
- Бюджет: 281 started measurement attempts, 3 последовательные технические
  ошибки, 24 часа без прогресса включая readiness/ожидание/ремонт,
  batch timeout не более 8 часов.

LAB-262 и её результаты/конфигурация/незавершённая доставка сохраняются.
Основной сервер runner1: использовать только после свежей проверки units,
процессов, native reservations и ресурсов. Чужие retained claims не трогать.
При занятости ждать, автоматически на другой сервер не переносить.

## Выполнение

- [x] Создать чистую ветку от согласованного SHA.
- [x] Сохранить этот план и исходные решения до acceptedHarness freeze.
- [x] Подтвердить обязательные offline checks закреплённого исходного кода.
  Использовать применимые exact-SHA/tree evidence; при необходимости из
  evals выполнить `bun typecheck`, unit/full suite и native fixtures.
- [x] Собрать/получить полный CLI штатным build-cli.ts: Bun 1.3.14,
  Node 24.19.0, Chromium 1246, channel prod, browser recovery включён.
  Локальная версия `0.3.4-baseline.<SHA>`; CI candidate допустим при
  совпадении source SHA, architecture, manifest и build options.
  Вариант Bun baseline выбирать только при отсутствии AVX2 на runner.
- [x] Выполнить verify-cli-candidate, проверить payload/archive/hash,
  доставить полный artifact в новый immutable каталог и проверить снова.
- [x] Зафиксировать harness/corpus/input/rubric/checker, каталог моделей,
  skills, judge executable/config и Loginom images/resource pins.
- [x] После build/offline checks создать отдельную карточку и campaign ID,
  новые manifest/journal/results и ровно 234 уникальных ключа.
- [x] Опубликовать несекретный паспорт сборки и проверить upload/download.
  Маленький файл не доказывает доставку большого архива.
- [x] Создать scoped wakeups (periodic 1800 + blocked), перечитать их.
- [x] Первый reserve выполнить с authenticated issue.created_at через
  `--initial-progress-at` до remote readiness. Срок и issue ID сохранять.
- [x] Подтвердить доступ EvalOps/EvalBaseline из их runtime и native delegation.
- [x] Проверить существующие освобождённые slots штатным fresh native verify N6
  с новым binary, browser, bwrap, auth и подтверждённым cleanup. Повторный
  prepare нужен только при установленном дефекте подготовки.
- [ ] Проверить READY всех шести слотов штатным requestPreflight. Первые
  ordinary3 и первый analytic6 являются baseline-измерениями; подтвердить
  события/историю/артефакты/судью/очистку и реальный N6 overlap.
- [ ] Довести службой все 234 ключа без ручной остановки после первых batch.
- [ ] Подтвердить финал, доставку, отдельный ответ и post-final no-op.
- [ ] Сохранить сравнение с LAB-262 и итоговый checkpoint.

Новый bundled catalog не содержит Luna: одинаковый актуальный public
snapshot и его hash установить во всех шести profile/cache/models.json.
Использовать per-slot auth.json без auth.sharedDir; обычный CLI run
сохраняет совместимый формат auth/events/history. Shared OAuth новой
сборкой не поддерживается. Штатный gate требует не менее 8,25 часа до
expiry; seed обновлять только при отсутствии собственных active batches.

После измерительного admission продукт и экспериментальные условия
заморожены. Quality FAIL завершает свой ключ без повторов ради PASS;
technical ERROR отделён от качества. Восстановление продолжает missing,
судейство готового артефакта — без новой генерации. Ремонт harness только
по установленной причине, TDD и отдельное независимое ревью до поставки;
исходные результаты/receipts/clock сохраняются. Journal вручную не править,
ownership/cleanup guards не обходить. Partial не завершает цель 234.

## Приёмка и сравнение

- Учтены все 234 уникальных ключа; проверены обязательные Results/artifacts,
  отдельно указаны PASS/quality FAIL/technical errors.
- Native cleanup/release и освобождение своего owner подтверждены.
- Машинный итог прочитан обратно. EvalBaseline опубликовал отдельный ответ
  в parent reportCommentId с точным `eval-executor-final:CAMPAIGN` marker.
- Полный архив скачан обратно, SHA-256 совпал, статус `in_review`, scoped
  wakeups выключены. Повторный вход не создаёт admissions/publications.
- Сравнение описательное: одновременно меняются CLI, модель, reasoning,
  tier и evaluator. LAB-262 raw 208/234 показывать отдельно от diagnostic
  corrected replay 221/234; старые verdict не переписывать.
- Сопоставить качество, устойчивость трёх раундов, no_artifact, время,
  токены и technical errors. Cost указывать только по достоверному учёту.

LAB-262 завершила 234 измерения (208 PASS/26 FAIL), но архив около 57 МБ
не доставлен. Причина неизвестна; HTTP timeout publisher 30 секунд.
Новый протокол публикует измерительный итог до архива, но сам upload-сбой
ещё не доказан исправленным. При реальном отказе установить и исправить
причину, сохраняя готовые результаты и отчёт.

## Checkpoint

27.10.2026: реализация начата по явному поручению владельца. Ветка создана,
runtime/agent models не менялись. Подготовка, freeze и handoff завершены;
текущая точка продолжения приведена в последнем подразделе ниже.
Private evidence: `/home/kiselev/storage/tmp/luna-baseline-20261027/`.

### Подготовка поставки

Полный CLI `0.3.4-baseline.05bb48274f` собран из чистого исходного SHA.
Build, manifest, archive roundtrip, verify-cli-candidate и version — PASS.
Archive SHA-256 `8a8400a34d55000351fc923177b52cbc51a1f67db6d9880bb9c5c149e2ad8eab`,
binary SHA-256 `457c40d01cc79423b43a893b2eb86c98039e2e15fef08acab76c055e207c7873`.
Private receipt: `build/artifact-receipt.json` в каталоге evidence выше.

Runner1 подтверждён: AVX2, достаточно памяти/диска, measurement batch
LAB-262 inactive, owner отсутствует, свои reservations released; семь
чужих retained сохранены. Архив LAB-262 перечитан и hash совпал; её
publisher продолжает доставку. Это не readiness новой сборки.

Отдельный новый harness/state размещается внутри существующего разрешённого
каталога `full-corpus-033/baseline-luna`; CLI — в отдельном runtime-каталоге.
Так используется прежний строгий root judge helper без его изменения.
Native slots/pair/resource budget сохраняются; их
повторно проверит новая поставка. Прежний одинаковый frozen catalog
`ac20d24a2b631a32b596ab5de765dfe8d5049d7d7081838745cfa29d917d189a`
уже содержит Luna/xhigh/priority, поэтому обновлять профили не требуется.

Корпус пересчитан штатными hash-функциями: 78 кейсов, 234 уникальных ключа,
изменений inputs/rubrics/timeouts относительно LAB-262 нет.

Блокер обязательных host fixtures воспроизведён: ready появлялся раньше
heartbeat; cleanup использовал неподдерживаемый systemd249 флаг.
Минимальные test-only fixes прошли RED → GREEN (7/7 host tests), ещё три
повтора race дали 2/2 каждый; owned processes/units освобождены. План и
diff независимо проверены отдельными агентами. Production harness и CLI
этими fixes не меняются. Typecheck и итог full-suite qualification пока
ожидаются; исходный полный suite выполняется другой задачей и не дублируется.

### Offline qualification завершена

Полный исходный suite завершён: 1370 PASS / 77 SKIP / 7 FAIL,
1454 tests / 7296 assertions. Это не чистый PASS: пять ошибок окружения
успешно перепроверены на настоящем host; native recovery — на runner1.
Последний fixture ошибочно не записывал обязательный attempt/result.json.
Его test-only исправление использует тот же emptyResult-based attempt в
summary и result; отрицательная проверка process proof сохранена.
Exact RED → GREEN на runner1 — 1/1, typecheck и соседний offline test — PASS;
план и diff приняты независимыми рецензентами. Production-код не менялся.

PR evals-unit на исходном SHA: 1306 PASS / 65 SKIP / 0 FAIL
(job 122156426465). Этот unit job исключает Docker node-ops fixtures,
поэтому они проверены отдельно. Push job того же SHA упал в SIGINT fixture:
watcher не успел послать сигнал; тот же test прошёл в local full suite и PR.
Это существующее ограничение flaky fixture, не production blocker baseline.
Полные диагностики находятся в private evidence, не в Git.

CLI и новый harness установлены отдельно, старые десять защищённых файлов
не изменились. Новые templates проверены и пока не активированы. Единственный
новый sudo grant разрешает start ровно `loginom-evals-baseline-luna@6.service`;
независимый review и visudo/effective-policy read-back — PASS.
Следующий шаг: закрепить финальный acceptedHarness, создать новую карточку,
scoped wakeups и 234-key manifest, выполнить anchored reserve и передать Ops.

### Freeze, LAB-334 и native handoff

Карточка [LAB-334](https://mas.kartamyshev.dev/lab/issues/LAB-334) создана
27.10.2026 в 14:59:39 МСК после build/offline qualification. Campaign ID
`luna-xhigh-fast-20261027`; карточка назначена EvalOps без squad.
Accepted harness — чистый `ed129d19471d1fd42f2e6104486df6e7dd0f943f`;
product source по-прежнему `05bb48274f53f510fb19c4d79a6272a8ee474178`.
Позднейшие doc-only commits не меняют установленный acceptedHarness.

Новые config/state/manifest/journal находятся в
`/home/user/.local/state/loginom-evals/runner1/full-corpus-033/baseline-luna/`.
Проверены 234 уникальных ключа, corpus/input/rubric/checker pins, resource
budget, judge и images. Manifest после штатной JSON canonicalization имеет
SHA-256 `b488bf70037772958e579a57a4bf08a880b8ebfa8c401a8ae5c9431163f3ae47`.
Ordinary fallback timeout закреплён `EVAL_TASK_TIMEOUT_MS=900000`;
analytic/node сохраняют явные timeout кейсов. Полный несекретный паспорт
прикреплён к карточке, скачан обратно и проверен по SHA-256
`0b26e6fb2f9221f9d6703a5ce936ebc73b87fa889858c51b710e545439b65df9`.

Первый reserve выполнен до readiness с authenticated created_at карточки:
`initialProgressAt=1793102379000`. Повтор Ops сохранил owner/clock.
Включены и перечитаны только scoped wakeups: periodic 1800 секунд
`01a17d3c-c444-7348-ac61-c7920991bafa` и blocked
`01a17d3c-a11e-70c7-bd06-d8ba69dabf0a`. Уведомление о delegated task failure
обеспечивается native delegation; дополнительного scheduler нет.

EvalOps лично подтвердил SSH и свободные ресурсы, затем передал ровно одно
поручение из task `01a17d41-9879-7820-bc6a-ba9f49d43ebe`.
EvalBaseline task `01a17d43-779b-79c4-afba-80a72b154c81` имеет точную native
атрибуцию delegation с evidence comment `01a17d43-7770-7c3f-a8f3-aaec4b343e60`.
Исполнитель принял поручение, самостоятельно подтвердил SSH, clean HEAD,
pins и reservations и в 15:11 МСК начал fresh managed native verify N6
под controllerLock. Измерения на этой точке ещё не подтверждены.

Следующий шаг: дождаться verify/cleanup и штатного requestPreflight READY
для всех шести слотов, затем проверить ordinary3 и analytic6 как реальные
измерения. Запуск/продолжение принадлежат EvalBaseline и campaign-службе;
технический ремонт координирует EvalOps. Не дублировать активные операции.

### Модельный gate и ремонт сетевого окружения

В 15:13 МСК initial native verify завершилась `ready=true`, code 0,
6/6 slots, finalization=released; prepare и изменения пользователей не
потребовались. Command ID `af9a486d-e867-4e6c-b28d-14f4ba36d91c`.
EvalBaseline включил и запустил точный campaign unit; controller сам создал
первый ordinary batch `20261027-121306-ed129d19-dtocol` в `batches/1`.
Локальная проверка pins/environment прошла, но модельный requestPreflight
ещё не получил READY: это отдельный gate, не результат native verify.

На 15:24 МСК measurement admissions и результатов по-прежнему 0/234.
В `request-preflight-a` наблюдались штатные retries 1–3 с `Cannot connect
to API: Unable to connect`. CLI log подтверждает alias Luna-fast, но не
завершённый ответ, xhigh по истории или фактически обслуженный priority.
Controller/batch активны, исходный clock и pins сохранены. Службы не
останавливали, новые модельные запросы и smoke не создавали.

EvalOps read-only локализовал причину: proxy отсутствует уже в controller,
batch и CLI; прямые TCP к chatgpt.com остаются SYN-SENT. Через существующий
`http://127.0.0.1:2080` endpoint без авторизации отвечает HEAD 405 с TLS.
Это подтверждает транспортный путь, а не готовность модели/авторизации.
Сетевые службы и настройки LAB-262 не изменялись.

Минимальный environment repair независимо принят и передан EvalOps
комментарием `01a17d51-4a86-799e-bce2-563527b34903`. После terminal batch
и подтверждённого cleanup: штатный repair ownership/lock; proxy только в
новом controller.env (batch.env производный), согласованные HTTP(S)_PROXY
и lowercase, ограниченный NO_PROXY для loopback/фактического Loginom;
restart только нового controller и штатный resume. Код не меняется,
проверяются env diff/read-back, effective env и настоящий requestPreflight.
Обновления pins, продукта, clock, бюджета, auth seed и старых служб нет.
Отдельный verify поверх штатного resume не добавляется.

EvalOps принял этот план в `01a17d52-1a38-7c7a-88b7-a783cdbedfbc`.
На 15:25 изменение ещё не применено из-за активного batch; продолжение
сохраняется на существующих blocked/periodic wakeups, без новых таймеров.
Следующая точка проверки: terminal/cleanup, repair/resume и requestPreflight
READY всех шести, затем первые настоящие ordinary3 и analytic6.

В 15:31 первое periodic-пробуждение EvalOps выполнило штатный quiet
check-in. Controller автоматически учёл первый неуспешный preflight
(startedAttempts=0, consecutiveErrors=1) и начал batch2 без измерений.
По независимому review закреплённого кода прежнее ожидание уточнено:
`repair` разрешён при active batch; inactive guard относится к `resume`.
Штатный hold проще остановки units и не требует ручной правки journal.

В 15:36 EvalOps выполнил штатный `repair --repairer EvalOps` под lock:
read-back подтвердил repairing=true, repairer=EvalOps, прежний owner/clock,
startedAttempts=0. Review comment `01a17d5c-1f39-70b9-b9cf-1a42c9de7039`;
native task `01a17d5c-1f4f-7e0c-9467-0c3037417912`. Активный request-preflight
не отменён, новые measurement admissions и следующий batch заблокированы.
После natural terminal и cleanup: stop только нового campaign-controller,
точечное изменение controller.env, штатный resume из нового env с тем же
repairer, затем start controller. Не выполнять restart поверх активного
batch и не добавлять отдельный verify поверх resume.

Исходные метрики LAB-262 извлечены без её изменения в private receipt
`lab262-source-metrics.json`: raw 208/234 (71/69/68 по раундам), diagnostic
corrected 221/234 (75/73/73); четыре измерения без LGP и CSV. Реальная
стоимость неизвестна. Сравнение будет дополнено новыми измерениями.

### Продолжение после hold

Свежий read-only снимок 15:49 МСК подтвердил terminal второго batch в
15:46:21: exit 2, оба batch accounted, startedAttempts=0, attempts=[],
consecutiveErrors=2. Request-preflight process cleanup подтверждён;
campaign-wide cleanupVerified ещё отсутствует. Hold не создал третий batch.
Сам repairing=true не переводит issue в blocked в ed129, поэтому следующий
шаг был адресно передан EvalOps (`01a17d68-2a12-74ce-97bd-1369c7b7acad`).

Прямое продолжение environment repair взял отдельный чат стенда по явному
поручению владельца; он координируется с действующей задачей EvalOps.
Новых поручений/мутаций окружения из этого чата не выполнять параллельно.
Source-политика preflight доработана отдельно, проверена и опубликована
в `8685deb150`; [checkpoint доработки](2026-10-27-preflight-readiness.md).
Стоящие инструкции трёх агентов обновлены с read-back, но установленный
acceptedHarness ed129, CLI05bb и условия LAB-334 этим не меняются.
