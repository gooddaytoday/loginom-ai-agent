# Результаты локального eval smoke после rebase — 2026-10-12

Получены все16 измерений: analytics **5 PASS /5 FAIL**, node-evals **4 PASS /2 FAIL /0 ERROR**. Все шесть node CSV прошли oracle; два полных node-eval не прошли обязательные native evidence checks. Одна продуктовая попытка на кейс, product FAIL не повторялись; infra retry0. Ни окончательных infrastructure/judge ERROR, ни незавершённого cleanup/recovery не осталось. Автоматический cleanup подтверждён15/16; sales-by-category потребовал отдельного явного recovery, исходный FAILED receipt сохранён.

Полностью автоматическое прохождение данного smoke не подтверждено: первый live-run остановился на cleanup. Отсутствие продуктовой регрессии также не доказано: есть7 FAIL, два native observation timeout требуют дальнейшего отдельного исследования, а модель отличается от исторических прогонов. Один прогон не является статистическим сравнением качества.

## Исправление и пины

- Rebase pin61705f09577234d312c852685153b0c2080b156c, до rebase684e729cf0f2c4fa014783a814d34f6dfb28fd17; eval harness/корпус на rebase были сохранены. [Исходный отказ до модельных попыток](2026-10-12-rebase-admission-blocked.md).
- Исправление/harness/новый полный CLI: **d11710a6178891062a1268fcffac9407b22331a4**, branch evals-readiness-fix. Только evals readiness: process-local starting требует настоящего loginom check с Help.ready в одном процессе; исходный status не подменяется. [TDD и причины](2026-10-12-readiness-fix.md).
- CLI0.0.0-dev-202610120845, sourceDirty=false, sourceTreeSha256=ea056c6d6697b54c78e1ff7881af2a15bbac158cd2b4fd91038ddc3952c611e5, binary SHA256=50cf3ff54b49aa228f246d50d5ae5a5b732be37374aa7e7a0cf703d191e2834d. Полный build через packages/loginom-host/script/build-cli.ts, manifest и candidate integrity PASS; artifact вне checkout, глобальный CLI не заменён.
- Bun1.3.14/revision0d9b296af33f2b851fcbf4df3e9ec89751734ba4, Node24.19.0, Chromium revision1243. Codex judge CLI0.157.0.
- Продуктовая модель **openai/gpt-6-luna-fast/high** фактически подтверждена по архивной БД каждой из16 сессий. Catalog SHA256 до/после7c07a5b59344957df62049b8908f5d05154a3412527979d14bf8c802e4bf2d17; fast alias→gpt-6-luna, serviceTier=priority. В профиль перенесены только OpenAI OAuth и каталог; прежняя история/БД не переносились. Отдельный OAuth refresh не испытывался, модельных отказов авторизации не было.
- Analytics judge gpt-6-astra/high, threshold70, CSV oracle; node-evals без LLM-судьи. Task timeout1800000ms, judge timeout300000ms. Во всех пяти оцениваемых analytics judge_attempts=1, score100 и oracle PASS; no_artifact оцениваются FAIL/0 без вызова судьи.
- Unit TDD RED→GREEN, focused18 PASS; весь suite **557 PASS /0 FAIL /0 SKIP**, 2847 assertions; bun typecheck PASS. Тесты завершились до live. Узкий диагностический namespace probe:3 штатных process tests PASS; временный150ms dumpability denial воспроизведён3/3, но причина PID1501560 не установлена.
- Inputs/rubric analytics: 7502c8bef07e894d59cf0445a8b8f785877c6041471773a5b6051166474705de /55086130fe6c3e045fb3b5890a94cb421cf6e59394357a1f88953017a531428f; nodes: ab7aa8dd4b2ebcde3bf302bc7ea5154ac6772701baff17168478f21e71d6b74b /0b941a3bb6d3ea480a45727ebbbd7318d008b5f9b8cc41fef298f7cc4244f040. Task, prompt, данные, oracle и рубрики не изменялись; API/форматы не менялись.

## Команды и runs

Рабочий каталог /home/kiselev/.codex/worktrees/rebase-evals-smoke/loginom-ai-agent/evals. with-env.ts — внешний приватный loader; env.json содержит binary mode/path, model/variant, собственные profile/workspace/results и LOGINOM_CONTAINER=loginom-evals-isolated. Дочерний агент изолирован bubblewrap/supervisor от Git, корпуса, oracle, результатов и архива истории.

```bash
ANALYTIC_IDS='ab-revenue-per-converter,abc-pareto-groups,articles-by-author,basket-category-width,customer-activity-segments,first-last-touch,monthly-demand,risky-approved-claims,sales-by-category,support-by-priority'
NODE_IDS='crosstable-fixed-sum,crosstable-sliding-average,crosstable-reconfigure,crosstable-multi-row-keys,crosstable-min-max,crosstable-sliding-source-refresh'
bun "$RUN_ROOT/with-env.ts" src/run.ts --tasks tasks/analytic --only "$ANALYTIC_IDS" --repeat 1 --timeout-ms 1800000 --label rebase-analytics-luna-fast-high
# После подтверждённого recovery: только ещё не выполнявшийся десятый кейс, новый lease receipt.
bun "$RUN_ROOT/with-env.ts" src/run.ts --tasks tasks/analytic --only support-by-priority --repeat 1 --timeout-ms 1800000 --label rebase-analytics-luna-fast-high-continuation
bun "$RUN_ROOT/with-env.ts" script/run-node-evals.ts --tasks tasks/node-evals --only "$NODE_IDS" --timeout-ms 1800000 --label rebase-nodes-luna-fast-high
bun script/check-node-run.ts "$RUN_ROOT/results/20261012-104645-d11710a61-dirty" "$NODE_IDS" tasks/node-evals
```

RUN_ROOT=/home/kiselev/.local/share/loginom-evals-local/readiness-fix-20261012. Analytics initial20261012-084833-d11710a61:9 измерений, exit1 из-за cleanup; continuation20261012-103514-d11710a61-dirty:1 измерение, exit0; nodes20261012-104645-d11710a61-dirty:6 измерений, generic harness exit0, code runner/повторный checker exit1 (продуктовый FAIL), errors=[]. Dirty в двух поздних runs связан только с текущей записью документации; исполняемые исходники и корпус совпадали с d11710a61, полный CLI clean d11710a61. Исходные summary.json/report.md и все result/verdict/events/пакеты/CSV сохранены. Повторный node checker дал JSON, идентичный code-verdict.json.

## Analytics

- **ab-revenue-per-converter: FAIL**, status=no_artifact, score=0, oracle=False. AMBIGUOUS на target: Node procedure roots could not be observed. Пакет/CSV не созданы; первопричина native observation не установлена. Cleanup confirmed.
- **abc-pareto-groups: FAIL**, status=no_artifact, score=0, oracle=False. В output mapping передано6 из7 полей: total_revenue пропущен вместо явного excluded. Dock остановился AMBIGUOUS и заблокировал сохранение pending-операцией. Cleanup confirmed.
- **articles-by-author: FAIL**, status=no_artifact, score=0, oracle=False. В output mapping передано4 из5 полей: positive_articles пропущен вместо явного excluded; последующие операции/save заблокированы pending. Cleanup confirmed.
- **basket-category-width: PASS**, status=completed, score=100, oracle=True. CSV и оценивание успешно. Cleanup confirmed.
- **customer-activity-segments: PASS**, status=completed, score=100, oracle=True. CSV и оценивание успешно. Cleanup confirmed.
- **first-last-touch: FAIL**, status=no_artifact, score=0, oracle=False. AMBIGUOUS output_mapping: Node procedure readiness timeout: complete output definition page at0. Пакет/CSV не созданы; native timeout не атрибутирован rebase или модели. Cleanup confirmed.
- **monthly-demand: FAIL**, status=no_artifact, score=0, oracle=False. Агент дважды скопировал UUID неверно: выдано6c14d584-6c4c-40e0-958b-fc5951c6007b, передано6c14d584-4c6c-40e0-958b-fc5951c6007b. Upload REQUEST_REJECTED; grant совпал, это не отказ OpenAI OAuth. Cleanup confirmed.
- **risky-approved-claims: PASS**, status=completed, score=100, oracle=True. CSV и оценивание успешно. Cleanup confirmed.
- **sales-by-category: PASS**, status=completed, score=100, oracle=True. CSV и оценивание успешно. Исходный cleanup FAILED; отдельный recovery confirmed, продуктовый результат не менялся.
- **support-by-priority: PASS**, status=completed, score=100, oracle=True. CSV и оценивание успешно. Cleanup confirmed.

## Node-evals

- **crosstable-fixed-sum: PASS**; CSV oracle PASS, cleanup confirmed. Все обязательные кодовые проверки прошли.
- **crosstable-sliding-average: PASS**; CSV oracle PASS, cleanup confirmed. Все обязательные кодовые проверки прошли.
- **crosstable-reconfigure: PASS**; CSV oracle PASS, cleanup confirmed. Все обязательные кодовые проверки прошли.
- **crosstable-multi-row-keys: FAIL**; CSV oracle PASS, cleanup confirmed. В node_apply.read нет coverage=full; последующий node_read даёт sample, не обязательные native bytes/binding. Final read и зависимая export/save proof не выполнены; CSV oracle PASS.
- **crosstable-min-max: FAIL**; CSV oracle PASS, cleanup confirmed. В node_apply.read нет coverage=full, exact_table отсутствует. Обязательная final native read proof не выполнена; зависимые mask/mapping/export/save checks также FAIL. CSV oracle PASS.
- **crosstable-sliding-source-refresh: PASS**; CSV oracle PASS, cleanup confirmed. Все обязательные кодовые проверки прошли.

Для двух node FAIL в requests отсутствовало coverage=full; receipt содержал sample_complete, но не exact_table.complete/native bytes/binding. Положительный sliding-source-refresh запрашивал coverage=full и получил exact_table.complete=true. Парсер распознал создание CrossTable и receipts; обязательные proof checks не ослаблялись, post-hoc чтение/экспорт ради замены результата не выполнялись.

## Runtime incidents и восстановление

Bun harness остановил event loop на kernel vm.max_map_count:65531 отображение при лимите65530. Два runtime потока повторяли madvise DODUMP/DONTDUMP→EAGAIN; main ждал futex. Временно выставлено262144, тот же процесс продолжил capture и cleanup, maps снизились2075. basket-category-width получил PASS100+oracle без повторного вызова модели; его wall duration1689s включает задержку. Для воспроизведения длительного smoke с этим Bun на данном хосте нужен достаточный vm.max_map_count; baseline65530 после прогона восстановлен.

sales-by-category: автоматический supervisor сохранил Cannot inspect process identity PID1501560 и остановил dispatch. Исчезнувший PID отсутствовал в ledger; точный errno не сохранён, поэтому первопричина не атрибутирована. Исходные result.json, cleanup.json, process-cleanup.json, summary/report неизменны. Recovery опирался на проверенный private launcher receipt с namespace/CLI exit0, полную связанную ledger19 identities и два привилегированных свежих /proc прохода по342 процессам: нет identities/groups/sessions, владельцев FD профиля или процессов bundle; writer отсутствует. Сигналы не отправлялись. При завершении init PID namespace ядро завершает его процессы — [pid_namespaces(7)](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html). После durable once receipt снят только точный marker dev/inode/UID/mode/SHA256, затем штатные native recovery, diagnostic/history archive, empty isolated storage и точная retirement исходного harness lease. Это отдельное явное подтверждение, автоматический FAILED receipt не переписан. Support продолжен отдельным run, первые9 кейсов не повторялись.

После16 попыток profile clean, process/harness markers отсутствуют, storage/backups пусты, нет pending recovery. Original Loginom/Studio восстановлены: исходные container IDs/mounts/running/restart policies сверены с baseline; original running/always, isolated stopped/no, Studio HTTP200. Порядок массива Docker mounts нормализован по Destination для сравнения. UserStorage исходного контейнера не очищалось. Незавершённые изменения основного checkout сохранены.

## Evidence и ограничения

Приватный root содержит artifact-pin.json, build/unit logs, selection/catalog pins, model-proof.json, final-verification.json, node-oracles.json, node-check.json, process-completion-recovery.json, recovery-sales/receipt.json, post-run-clean.json и stand-restored.json. Профиль/env/OAuth/raw history находятся только в приватных0700/0600 каталогах вне Git и mounts агента; в публикуемые результаты их включать нельзя. Начальный pre-model blocked root/lease61705 сохранён для расследования, активных процессов он не содержит.

Итог подтверждает выполнение всех16 измерений на Luna fast/high и работоспособность оценивания/архивирования с одним явным recovery. Полностью автоматический smoke не прошёл; первопричина одного /proc inspection failure неизвестна. Product PASS9/16, FAIL7/16; два node CSV корректны при недостаточной native proof. Нельзя утверждать отсутствие продуктовой регрессии или статистическое сохранение качества. Решение readiness готово на отдельной ветке; merge/push и смена глобального CLI не выполнялись.
