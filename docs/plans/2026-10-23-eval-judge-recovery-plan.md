# Восстановление незавершённого eval-судейства — план реализации

> Для исполнителя: план прошёл независимое ревью без обязательных замечаний; реализация — `executing-plans` и TDD по правилам `evals/AGENTS.md`. Поставка и живая квалификация выполняются отдельно по основному плану.

**Цель:** готовая генерация переживает остановку harness; служба заканчивает только недостающее судейство под исходными pins, не запускает агента повторно и не пересуживает сохранённое качество.

**Архитектура:** один существующий `AttemptResult` в `result.json` сначала сохраняет генерацию, затем — подтверждённое судейство. Используются нынешние judge gate, offline lease, журнал кампании и правила восстановления; отдельный completion receipt, ledger или универсальный resume не добавляются.

**Стек:** TypeScript, Bun принятой поставки, существующие файловые receipts и fake judge; новых зависимостей нет.

**Основание:** [основной план, разделы 4, 6–10](2026-10-23-autonomous-evals-plan.md); [правила harness](../../evals/AGENTS.md). Node-оценка реализуется отдельно по [node-плану](2026-10-23-eval-node-recovery-plan.md).

## Проверенный исходный контекст

- `runAttempt(input)` экспортирован из `evals/src/run.ts`; принимает `judgeGate?: ReturnType<typeof createJudgeGate>` и `evaluationHash?: string`. Внутренний `attemptBody` заполняет `base` после `runAgent` только в памяти. Полный `AttemptResult`, включая `package_path`, собирается и записывается после вызова судьи. Комментарий «This measured checkpoint survives failures…» пока не означает долговечный checkpoint перед судьёй.
- `judgeTask(input)` / `createJudgeGate()` из `evals/src/judge.ts` используют `judgeInvocation`, который проверяет oracle и допускает `invoke(..., 1)`, затем штатный `invoke(..., 2)`. `invoke` сейчас пишет `judge-events-N.jsonl` и `judge-stderr-N.txt` до проверки cleanup, exit и verdict. `judgedFields(judged)` уже возвращает нужные поля оценки; `AttemptResult` уже имеет `judge_attempts` и `evaluation_contract_hash`.
- `rejudge(config, runId, onRunDirectory?)` и `requireRejudgeRunDirectory(resultsDir, runId)` из `evals/src/rejudge.ts` требуют `summary.json`. Полное пересуждение допускает новую рубрику; несовпадение `agent_inputs_hash` только предупреждает. Это не готовый путь продолжения закреплённой кампании.
- `runOfflineJudge(config, lockRoot = globalLockRoot)` из `evals/src/judge-environment.ts` уже задаёт приватный `CODEX_HOME`, получает `acquireJudgeLease`, сохраняет `offline-judge-command`, освобождает lease только с proof, иначе оставляет quarantine. Перед rejudge он тоже требует summary.
- Prepared-run сохраняет перед измерениями в `config.json` поля `only`, `tasksDir`, `skipJudge`, `agent_inputs_hash`, `rubric_hash`, `judgeTimeoutMs`, `passThreshold`, сведения `judge` и ссылку `commandJournal`. `judge` здесь — captured `judgeInfo`, а не конфигурация команды. `evaluationContractHash({rubric_hash, judge, pass_threshold})` уже связывает рубрику, версию/модель/reasoning/prompt/schema судьи и порог; input hash и timeout проверяются отдельно.
- `writeLeaseReceipt(file, value)` из `evals/src/lease.ts` уже выполняет запись во временный файл, fsync, rename и fsync каталога. Сейчас normal run, prepared post-cleanup и rejudge заменяют `result.json` через `Bun.write`.
- `campaignTick(..., context?)` / `runCampaign(...)` находятся в `evals/script/run-campaign.ts`. Соседняя node-работа уже добавляет удержание незаконченного batch и переход `counted:false→true`; судейство должно использовать эти свойства, не создавать второй учёт.

## Контракт изменения

1. Перед входом в judge gate атомарно сохранить полный Result с окончательными status, exit/failure/session/телеметрией, artifact metadata и `evaluation_contract_hash`. Для незавершённой оценки оставить `judge_status="skipped"`, `pass=null`, `score=null`. Cleanup этим не подтверждается. Если checkpoint не записан, судья не вызывается.
2. Все последующие замены этого Result в затронутых normal/prepared/rejudge/error путях выполняются тем же атомарным способом. Иначе поздний сбой записи может уничтожить защищённый checkpoint. Изменение касается Result, не требует общей миграции файлов harness.
3. Вход `judgeTask` расширяется узким необязательным callback `saveJudgeFields`: он сохраняет только `judge_attempts` перед invoke либо поля существующего `judgedFields` после него. Предлагаемый вход `judgeAttemptsUsed?: number` передаёт уже использованный счётчик. Callback предоставляют `runAttempt` и новый `finishPendingJudge`; calibration и намеренное полное пересуждение сохраняют прежний режим. Это не общий hook произвольных изменений Result.
4. После доказанных exit=0, подтверждённого process cleanup, валидного verdict, score и oracle callback **первым** атомарно сохраняет полный `scored` Result. Затем выполняются вспомогательные копии stdout/stderr. Ошибка этих копий сообщается отдельно, не запускает второй invoke и не заменяет сохранённое качество на `error`. Ошибка самого process proof остаётся технической ошибкой, а не вспомогательной отчётностью.
5. Используется один Result как checkpoint и доказательство готового качества. Caller сохраняет его также в `base`, чтобы последующий error/cleanup путь не вернул старые null-поля. Готовый quality FAIL сохраняется наравне с PASS.
6. Существующие два invoke — общий предел для этой попытки, включая продолжение. `judge_attempts` увеличивается долговечно до каждого реального invoke; очередь gate и проверка версии счётчик не расходуют. Продолжение получает использованное число из Result, сохраняет абсолютную нумерацию логов и предыдущий verdict штатным prev-путём; не получает ещё два вызова после рестарта. Таймаут и deadline кампании не увеличиваются.

## Шаг 1. Сохранить генерацию и готовое судейство в одном Result

**Файлы:** `evals/src/run.ts`, `evals/src/judge.ts`, атомарные Result writers в `evals/src/prepared-run.ts` и `evals/src/rejudge.ts`; тесты `evals/test/run.test.ts`, `evals/test/judge.test.ts`.

- [ ] Первый RED — тест `runAttempt persists generation before delayed judge`. Вызвать публичный `runAttempt` с fake agent, `dir:` fixture artifact, реальным `evaluationContractHash` и разрешённым `fake-codex.ts --gate-log … --delay-ms …`. После judge-маркера `start`, пока вызов не завершён, прочитать Result: artifact/session/телеметрия/hash сохранены, оценка skipped/null, summary отсутствует. Сейчас файл ещё не существует. После завершения того же вызова Result становится scored.
- [ ] Запустить из `evals/`: `bun run test test/run.test.ts -t 'runAttempt persists generation before delayed judge'`; зафиксировать ожидаемый RED. Перенести сборку полного Result до judge и использовать `writeLeaseReceipt`; повторить до GREEN.
- [ ] Следующий отдельный RED→GREEN: вызвать тот же публичный путь, создав реальный файловый отказ записи вторичной `judge-events-1.jsonl`. Подтверждённый scored Result остаётся сохранённым, fake judge запускается один раз; ошибка диагностики видна отдельно. Затем отдельным тестом закрепить сохранённый бюджет: после одного использованного invoke доступен только второй; после двух новый не допускается.
- [ ] Применить атомарные замены во всех перечисленных Result writers, включая catches. Проверить, что неудачная замена оставляет прежний JSON читаемым и не стирает уже подтверждённую оценку.

**Результат шага:** доступен ранний файл генерации; готовое качество записывается до вспомогательных операций и не теряется при их отказе. Никакого нового enum или receipt нет.

## Шаг 2. Закончить один explicit pending Result без summary

**Файлы:** `evals/src/rejudge.ts`, `evals/src/judge-environment.ts`; тест `evals/test/judge-environment.test.ts`.

**Новые узкие интерфейсы:** `finishPendingJudge(config: EvalConfig, resultFile: string, onRunDirectory?: (directory: string) => Promise<void>)` в `rejudge.ts`; возврат той же формы `{code, runDir, judgeCleanupConfirmed}`, что у rejudge. `runOfflineJudge` получает третий необязательный аргумент `pendingResult?: string`; прежние два аргумента и существующие CLI-команды работают как раньше. `code=0` означает законченный этап, в том числе quality FAIL.

- [ ] Первый сквозной offline RED: файловый run содержит captured config, prompt, run.json, artifact и pending Result, но не summary. Через публичный `runOfflineJudge(config, fixture.lockRoot, resultFile)` и существующий `parallelFixture` вызвать разрешённый fake judge. Ожидать одну оценку, исходные session/artifact/телеметрию, тот же evaluation hash, подтверждённое освобождение judge lease и отсутствие созданного summary. Повторный вызов — no-op без нового judge/version probe и без замены готового Result. Сейчас такого режима нет, а старый путь требует summary.
- [ ] В новом режиме проверить принадлежность explicit пути run из `config.judgeOnly`, task/attempt и captured config; не совмещать его с calibration. Для готовых `scored/no_artifact` вернуть no-op до auth/version probe и получения lease, не изменяя файлы. Для незаконченных `skipped/error` требовать сохранённый judge-enabled режим, готовый artifact и отсутствие generation infra/harness/provider/interrupted исхода. Node и намеренный skip-judge сюда не попадают.
- [ ] Загрузить исходный набор задач из сохранённых `only/tasksDir`; строго сверить его input/rubric hashes с captured config. Проверку corpus pins кампании выполняет controller перед вызовом (шаг 3), а не новый неявный поиск внутри `EvalConfig`. Применить сохранённые model/reasoning, threshold и timeout; сверить текущий `judgeInfo` и рассчитанный evaluation hash с сохранёнными. Новая команда/окружение берётся из разрешённой серверной конфигурации, не из редактируемого текста задачи. Не подставлять текущие defaults вместо отсутствующих pins.
- [ ] Переиспользовать offline lease/home/journal/quarantine и существующие `createJudgeGate`, `judgedFields`, `evaluationContractHash`. Передать прежние `judge_attempts` и callback из шага 1. Читать `run.json`/prompt/artifact; `runAgent`, генерацию и заднее создание summary не вызывать. Историю verdict и логов сохранять.
- [ ] По одному RED→GREEN проверить отказ до invoke при смене rubric/judge/threshold/timeout, исчерпанном бюджете и busy/quarantined judge lease. Готовые соседние Result остаются побайтно прежними.

**Результат шага:** один незаконченный этап завершается через прежнюю изолированную среду судьи без агента и summary; повтор безопасен. Обычный `rejudge` остаётся отдельным намеренным пересуждением.

## Шаг 3. Подключить продолжение к существующему controller

**Файлы:** `evals/script/run-campaign.ts`; тест `evals/test/campaign.test.ts`. Опирается на принятый node-путь, не меняет его классификатор.

- [ ] RED→GREEN через `campaignTick`/публичный `runCampaign`: ready Result учитывается, pending regular/analytic Result удерживает тот же batch незавершённым и никогда не выбирается для повторной генерации. Controller получает один explicit result для judge-only; один вызов за итерацию достаточен, отдельной очереди нет.
- [ ] Перед judge-only сохранить обычные owner/flock, final/repair/deadline и native admission guards, усвоить опубликованный финал. Через имеющиеся `context.corpusPinsFile/corpora` и manifest проверить принадлежность задач, corpus hashes и параметры эксперимента; собрать разрешённый agentless `EvalConfig` для выбранного run. Собственный batch должен быть inactive, прежний judge — доказанно завершён, его reservation освобождён штатной сверкой. Unknown/busy/quarantine — блокер и существующий путь EvalOps, а не обход lease. Не брать controller flock повторно из вызываемой функции.
- [ ] После judge-only повторить обычный учёт того же Result. Переход `counted:false→true` использовать один раз; `startedAttempts` не увеличивать. Восстановить правильный progress/streak с учётом порядка последующих результатов. Учитывать фактическое время сохранения завершённого судейства, а не время очередного чтения; повторный тик не продлевает срок.
- [ ] Связанный тест: saved Result без summary → один fake offline judge → учёт качества → следующий missing key. Повтор контроллера не запускает ни прежнюю генерацию, ни готового судью. Истечение общего срока, недоступность API и опубликованный финал сохраняют прежнее поведение основного плана.

**Результат шага:** служба сама выбирает недостающий этап вместо повторного измерения и продолжает кампанию после его подтверждения.

## Проверки перед поставкой и независимое ревью

Все новые поведения реализуются последовательно: один RED → минимальное изменение → GREEN. Команды ниже выполняются только при реализации, из `evals/`, на Bun принятой поставки:

```sh
bun run test test/run.test.ts test/judge.test.ts test/judge-environment.test.ts test/rejudge.test.ts test/campaign.test.ts test/campaign-limits.test.ts
bun typecheck
```

Ревью должно проверить пять конкретных рисков: обрезание checkpoint поздней записью (шаг 1); замена scored после отказа вспомогательного лога (шаг 1); повторный бюджет или смена pins при продолжении (шаги 1–2); обход busy/quarantine/terminal guards (шаги 2–3); повтор генерации и неверный progress после pending (шаг 3). Тесты используют только разрешённые fake процессы и настоящие временные файлы, без global mocks и живой модели. Локальные проверки не объявляются доказательством живого reboot.

## Ограничения, исключения и объём

- Сырой `judge/verdict.json` при всё ещё pending Result не доказывает exit=0 и подтверждённый cleanup. У `runJudgeUnit` эти данные пока возвращаются в памяти; нельзя выдать файл за готовое судейство или передать его в `judgeTask`, который очищает judge directory, без сверки. Неизвестный исход сохраняется и блокируется штатно; действует общий срок и частичный финал основного плана.
- Атомарный Result закрывает подтверждённый исход, но не обещает exact-once вызов провайдера при смерти процесса между его выходом и первым сохранением. Автоматическое доказательство такого узкого окна потребовало бы отдельного долговечного протокола исполнителя судьи. Этот механизм здесь не вводится; также не фабрикуются Result/pins для старых запусков без checkpoint.
- Исторические quality PASS/FAIL, исходные receipts, закреплённые модели/критерии и raw история сохраняются. Ошибки доставки/cleanup учитываются отдельно от качества. Новые статусы, completion receipt, ledger, scheduler, CLI-флаг общего resume, изменения Multica, агентов и серверов исключены. Node integration, живой reboot и полная кампания остаются в основном плане.
- Ожидаемый объём реализации: шесть существующих source-файлов, четыре существующих тестовых файла и этот план — **11 файлов, около 450–650 строк diff с тестами и документацией**. Проверять фактический `git diff --stat`; при превышении оценки вдвое пересмотреть конструкцию до дальнейшего расширения. Новый постоянный механизм — только использование уже существующего Result на более ранней границе; callback нужен, чтобы эта запись предшествовала вспомогательным операциям.

Независимое ревью плана и затронутых исходников — PASS: обязательных замечаний нет. Исходники и тесты в рамках подготовки не изменялись, проверки не запускались; внедрение и реальная квалификация этим документом не подтверждаются.
