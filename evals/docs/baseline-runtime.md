# Runtime baseline

Executor: `src/baseline.ts`, вход `script/run-baseline.ts`, команды prepare/start/resume/check/smoke/recover-measurement/abandon.
Live `--limit` запрещён, fixture допускает fake/dir и тестовый limit. Smoke требует
`--case calc-data-double|crosstable-fixed-sum` и создаёт отдельную серию с одним заданием
attempt=1; повтор создания существующей серии запрещён. Отсутствие артефакта оставляет
соответствующую проверку внедрения незавершённой, без автоматического повтора.
Общий harness принимает `--infra-retries 0|1`, по умолчанию 1. Smoke замораживает
budget=0 в manifest и передаёт его обычному и узловому runner; полный baseline — 1.
Run config сохраняет бюджет; перед записью измерения его сверяют с manifest.
У calc-data-double в исходном корпусе нет oracle.csv: smoke замораживает независимый oracle
Double = Amount × 2 из исходного CSV, затем сверяет колонку Double штатным CSV parser/compare.
Дополнительные колонки допускаются по исходному SPEC. Case, prompt, судья и raw summary
не изменяются; результат дополнительной проверки сохраняется в производном smoke report.
Проверенность интеграции и quality PASS показаны отдельно: product FAIL не скрывается.

Private v2 config фиксирует `roles.evalbaseline.readinessIssue` на UUID карточки LAB-32.
Перед первым dispatch live smoke создаёт неизменяемый admission в
`R/operations/baseline-readiness/ISSUE/CASE.json`. Он привязан к карточке, task, серии
и manifest hash; один кейс получает один admission. Новая серия/каталог и concurrent
запрос не сбрасывают лимит. Неполная запись или UNKNOWN требуют разбора, без нового dispatch.
`checkBaselineReadiness(config)` читает обе сохранённые серии: готовность требует
live mode, artifact/evaluator/oracle, подтверждённую очистку и два разных release receipt.
Fixture mode не подтверждает live готовность. Полный start до этого gate заблокирован.

## Общая поставка

Для всех исполнителей helper поставляется как `R/support/baseline-v2/evals/` с полным source
SHA и файловыми хэшами manifest. Checkout/корпус/профили/CLI задаёт private config.
v1 сохраняется; v2 добавляет eval-only evalbaseline со своим CLI. Rich/Ben сохраняют global
CLI или собственный cliBin; reference/cold baseline запрещены. Squad и приёмка не меняются.
Config переключается атомарно после FREE, отсутствия active/queued задач, harness lease,
pending recovery и проверки всех пяти профилей и Loginom. Private backup v1 сохраняется.
Lease без TTL переживает сбои и не освобождается чужим исполнителем.

## Данные и проверки

Manifest фиксирует пины/case files/три круга. Atomic journal с fsync записывает admission
до dispatch, run ID и raw hashes. `measurements/KEY/runs/RUN` хранит отдельную попытку.
Stand handle, executor.lock, harness admission/process identity — private, вне экспорта.
Отчёты и экспорт всегда новые производные каталоги. Raw-файлы становятся read-only.
При prepare/resume/dispatch проверяются CLI full manifest/хэши/права/symlinks, clean SHA
и корпус, config, Docker ID/image/network/mounts/marker, Loginom/Python, proxy/connection
fingerprint, bwrap launcher/binary, AppArmor и Dock revision. Plaintext secrets не сохраняются.
Chrome sandbox должен быть root:root 4755; фактическая граница проверяется native check.

Полная baseline-серия с сохранённым, но неизмеренным исходом удерживает стенд и возвращает
`AWAITING_RECOVERY`. Допуск следующего slot и штатная фиксация release запрещены, даже если
очистка ошибочного запуска подтверждена. Ошибки и расходы сохраняются; этап 3.2 плана ещё
требует завершения проверок crash/reconcile и аварийного бюджета.
Smoke сохраняет собственный release после подтверждённой очистки, включая infra error;
ошибка оставляет его readiness незавершённым и не разрешает автоматический повтор.
После записанного release допуск нового измерения отклоняется как `SERIES_RELEASED`.
Complete требует всех измерений,
оценки и release receipt. Infra/judge errors отдельны; расходы продукта включают исходный
infra retry. Токены судьи harness не предоставляет: явно null. Compare используется по
кейсам внутри коллекций, сохраняя исходный одно-кейсовый evaluation lineage. Node code PASS
сравнивается отдельно; различия изоляции и неполный корпус ограничивают выводы.

## Продолжение и аварии

Штатный сигнал передаётся harness; сохранённый исход записывается, pending задания остаются.
Resume проверяет пины, обе блокировки, raw hashes, процессы, архивы, профили и storage.
Старый собственный harness lease retire требует первоначальную identity/device/inode/nonce,
непрерывное process evidence и две idle-проверки. PID сам по себе недостаточен.
Crash RUNNING допускает только запись существующего единственного terminal run с полноценным
summary/cleanup, без нового продуктового вызова. Неполный/отсутствующий summary даёт
UNKNOWN_OUTCOME_REQUIRES_RECOVERY и сохраняет серию для оператора.

Оператор использует штатный node-eval-ops recover с исходными owner/acquiredAt/process
evidence и точным storage ledger; затем проверяет SETTLED и исходные файлы. Потерянное
измерение не превращается в измеренный PASS/FAIL. Подтверждённая аварийная очистка сама по
себе не закрывает пропущенное измерение и не разрешает штатный release полной baseline-серии.
Терминальное прекращение такой серии с отдельной причиной и проверкой очистки ещё требуется
реализовать в этапе 3.2; оно не будет означать полный baseline.
`resume --recover-executor` требует предварительного разбора: исходная identity/inode/stand
owner совпадают, PID+starttime отсутствует, сохранённые измерения/cleanup/профиль проверены;
guard архивируется. Stale journal.lock, запуск без terminal summary и неподтверждённая очистка
автоматически не восстанавливаются. Нужен разбор atomic journal/temp и реальной evidence.
Ручное дописывание качества или внешнее повторение продукта ради PASS запрещены.

`recover-measurement --series DIR --job KEY --kind infrastructure|judge --evidence PRIVATE_JSON`
добавляет атомарный admission только для первого пропущенного slot. Evidence version=1
содержит baselineId/jobKey/executionId/executionFilesSha256, kind/cause, fix {id,files},
validation {path,sha256}, taskId/runId. Файлы fix и validation — абсолютные, private, с SHA256.
Validation version=1 связывает baselineId/jobKey/executionId, pinsSha256 и fixSha256; требует
status=PASS, exitCode=0, modelCalls=0 и команду немодельной проверки. В live helper дополнительно
проверяет процессы/все прежние executions/архивы/профили/storage и выполняет фиксированный
native Loginom check под теми же пинами. Его новый admission не заменяет первоначальный.
Исходные receipts копируются и fsync сохраняются закрыто и неизменяемо до записи journal.
Нет admission при executor guard (включая неполный), живом child, UNKNOWN или failed cleanup.
Подтверждённое измерение с failed cleanup также запрещает допуск следующего кейса.
Повтор того же evidence возвращает существующий admission; новая reservation по тому же
исправлению не разрешена. Неполная запись admission не разрешает новый продуктовый вызов.

Infrastructure `resume` выполняет admission однажды в новом `recoveries/ID/runs/RUN`, сохраняя
исходный `recorded` job. Первый валидный результат становится результатом логической попытки,
включая FAIL/timeout/no_artifact; следующие jobs выполняются после него. Все product executions
и встроенные retries учитываются в расходе и проверке очистки. Экспорт содержит исходный run
и дополнительные run в разных путях; private recovery evidence исключён.

Judge `resume` запускает отдельный supervised worker и штатный `judgeTask` на копии прежнего
артефакта. Продукт не вызывается; исходные summary/result/verdict остаются неизменны. Новый
каталог содержит связь с исходным run и хэши артефакта. Первый валидный verdict окончателен,
включая score=0; ошибка судьи остаётся пропуском. Расход продукта считается один раз, время
дополнительного judge учитывается отдельно. Каждый штатный judge вызов сохраняет `judge/attempt-N.json`
с результатом, ошибкой и временем и `judge/verdict-N.json`, если ответ получен. Успешный retry
не скрывает предыдущую ошибку; отчёт учитывает время всех сохранённых вызовов. В экспорт входят
receipts, все полученные verdict и связь восстановления,
а process proof остаётся закрытым. Проверки всех границ crash/reconcile и аварийный бюджет ещё
не завершены; это не готовность к live.

`resume --recover-executor` использует тот же reconcile в fixture и live: проверяет private
receipt PID/starttime/uid дочернего harness, подтверждает его завершение и принимает ровно один
сохранённый terminal run. Живой child, отсутствующий/неполный receipt или отсутствующий summary
блокируют продолжение. Обычный resume не переисполняет UNKNOWN. В live дополнительно проверяются
общий lease, профили, история и вся process evidence перед снятием прежнего executor guard.

Терминальное прекращение: после подтверждения всех процессов/архивов/очистки оператор выполняет
штатный helper release с completion kind=baseline, затем `abandon --series DIR --reason REASON
--evidence /absolute/operations/completed/ARCHIVE/release.json`. CLI проверяет настоящий release
receipt, owner/пины/хэш, исходные evidence и отсутствие executor guard/UNKNOWN/failed cleanup.
В journal записываются причина и время; итог `abandoned` сохраняет пропуски и никогда не означает
полный baseline. Серия закрыта для новых admissions; новая серия автоматически не создаётся.
Abandon не снимает блокировки и не служит заменой безопасной очистке.

## Доставка

Check --export использует allowlist summary/config/report/verdict/oracle/package/CSV/code
results и проверяет известные credentials, включая распакованный package. MCP/tool logs,
guards, profiles/auth/history/DB исключаются. Verifier проверяет архивный SHA256, весь delivery
manifest, уникальность имён и обычные файловые типы без извлечения. Absolute/escaping paths,
links, extra files и изменённые bytes запрещены; распакованный лимит 2 GiB. Скачанный архив
Multica проверяется тем же verifier; доставка не заменяет полноту и live-приёмку.
