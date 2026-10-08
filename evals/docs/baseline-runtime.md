# Runtime baseline

Executor: `src/baseline.ts`, вход `script/run-baseline.ts`, команды prepare/start/resume/check/smoke.
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

Безопасно очищенная неполная серия может освободить стенд. Complete требует всех измерений,
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
измерение не превращается в измеренный PASS/FAIL. Если восстановить его нельзя, проверенное
recovery completion может безопасно освободить стенд, сохранив неполную заблокированную серию.
`resume --recover-executor` требует предварительного разбора: исходная identity/inode/stand
owner совпадают, PID+starttime отсутствует, сохранённые измерения/cleanup/профиль проверены;
guard архивируется. Stale journal.lock, запуск без terminal summary и неподтверждённая очистка
автоматически не восстанавливаются. Нужен разбор atomic journal/temp и реальной evidence.
Ручное дописывание качества или внешнее повторение продукта ради PASS запрещены.

## Доставка

Check --export использует allowlist summary/config/report/verdict/oracle/package/CSV/code
results и проверяет известные credentials, включая распакованный package. MCP/tool logs,
guards, profiles/auth/history/DB исключаются. Verifier проверяет архивный SHA256, весь delivery
manifest, уникальность имён и обычные файловые типы без извлечения. Absolute/escaping paths,
links, extra files и изменённые bytes запрещены; распакованный лимит 2 GiB. Скачанный архив
Multica проверяется тем же verifier; доставка не заменяет полноту и live-приёмку.
