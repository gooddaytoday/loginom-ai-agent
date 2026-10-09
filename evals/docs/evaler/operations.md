# Операторские команды Evaler, Rich и Ben

Команды запускаются из `evals/` собственного checkout, содержащего принимаемый код. Установка и воспроизводимость runtime описаны в [runbook](../2026-10-07-eval-tests-runtime.md); эта инструкция не назначает новую модельную попытку. Несекретный конфигурационный файл установлен оператором: `/home/user/.local/share/loginom-evals-runtime/operations/node-eval-ops.json`.

## Shared stand lease

Конфигурация v1 фиксирует runtimeRoot, endpoint, точные container name/ID/storageDir, cliBin и отдельные rich/ben checkout, referenceProfile, evalProfile, workRoots, resultsRoot. Optional offline задаёт только checkout/workRoots/resultsRoot Evaler для чтения доставленных evidence; CLI-профилей у него нет. Helper проверяет канонические непересекающиеся пути и фиксирует digest конфигурации в lease. Несуществующий path, symlink или профиль внутри checkout/CLI-installation не исправлять автоматическим fallback. Несогласованный container ID не заменять текущим самостоятельно.

Созданные исполнителем private receipts/sidecars хранятся в **собственном настроенном workRoots/resultsRoot**, вне checkout и профиля, с правами 0600. Внутренние completion/admission/recovery proofs helper создаёт в закрытом `R/operations/stand.lease/`. Receipt содержит секретный lease token: он не прикладывается к карточке или evidence archive. В комментарий допустимы owner/phase/SHA/acquiredAt и безопасный статус; путь private receipt служит recovery locator, не доказательством передачи результатов.

Пример Rich; `ISSUE` и `TASK` берутся из текущей Multica-задачи, не генерируются заново и не подставляются от чужой карточки. `WORK` — существующий собственный каталог из конфигурационного allowlist. Для Ben заменить роль/пути и использовать exact frozen SHA.

```sh
R=/home/user/.local/share/loginom-evals-runtime
CFG="$R/operations/node-eval-ops.json"
ROLE=rich
ISSUE='<current issue UUID>'
TASK='<current worker task UUID>'
SHA='<full clean SHA at stage admission>'
WORK='<own allowlisted private work directory>'
LEASE="$WORK/stand-lease.json"
cd "$R/checkouts/$ROLE/loginom-ai-agent/evals"

"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" \
  script/node-eval-ops.ts status --config "$CFG"

"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" \
  script/node-eval-ops.ts acquire --config "$CFG" \
  --issue "$ISSUE" --task "$TASK" --role "$ROLE" --phase eval --sha "$SHA" --receipt "$LEASE"

"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/$ROLE/eval.env" "$R/bin/bun" \
  script/node-eval-ops.ts preflight --config "$CFG" --lease "$LEASE"

"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" \
  script/node-eval-ops.ts unit --config "$CFG" --lease "$LEASE"
```

`--phase eval` охватывает весь этап исполнителя: unit → reference → cold → live → cleanup. Owner.sha остаётся первоначальным SHA при приобретении lease. Rich может изменить/закоммитить checkout; финальный runSha/READY SHA фиксируется отдельно и не подменяет identity lease. Ben работает на неизменном frozen SHA. Unit выполняет supervised `bun test` и `bun typecheck` в фиксированном checkout/evals, возвращает private completion proof и использует очищенное окружение. Пропускаются только PATH/HOME/locale/TMPDIR, proxy/Node proxy и явный fixture `EVAL_TEST_LOGINOM_IMAGE`; role EVAL defaults, LOGINOM/auth/Codex keys не наследуются. Role eval.env для unit не загружается. Unit не запускается одновременно с браузером/CLI/live. Сначала закрыть author browser, затем fresh node runner.

Для этих двух доверенных Bun-команд используется отдельный `unit_after_exit` режим supervisor: private nonce и Linux subreaper сохраняют границу владения, а полный `/proc`-допуск и очистка выполняются после завершения команды либо при timeout/interrupt. Сами fixtures намеренно проверяют недоступные процессы во время теста. Оставшийся недоступный процесс, неподтверждённая ancestry или неполные финальные проходы запрещают release. Такой proof допустим только для unit; модельные и native CLI-запуски сохраняют непрерывное наблюдение и прежние критерии приёмки.

`status` только читает общую блокировку. FREE не означает готовый Loginom. `preflight` выполняет штатный допуск и реальный `loginom check` установленного CLI внутри bubblewrap с Chromium, собственным lease и role env. Проверяется ready/`LOGINOM_CONNECTION_VALID`, credentials/WebSocket/лицензия и прежний container ID; модели не вызываются. Затем helper подтверждает завершение процессов и архивирует короткую проверочную историю/диагностику в приватные каталоги. Preflight не является статическим HTTP-check и не назначает paid smoke/reference. Если acquire/preflight/unit отклонены, сохранять безопасную причину; для занятого ресурса нет blocking wait, expiry или удаления lease по PID.

При полном `bun test` вложенные процессные fixtures могут пройти проверки, а внешний supervisor — не подтвердить наблюдение за быстро меняющимся процессом. Успешные тесты и нулевые остатки не заменяют подтверждённый process proof: такая попытка сохраняется как инфраструктурный ERROR с занятым lease. После диагностики допускается одна явно зафиксированная немодельная проверка того же этапа; повторная ошибка требует действия владельца. Не ослаблять supervisor, не признавать неизвестный PID безопасным и не добавлять внешний цикл повторов. Проверка нового SHA после исправления реализации владельцем является проверкой кода; она не разрешает Evaler повторять старые продуктовые попытки или сбрасывать recovery budget.

Приобретение в фазе unit/reference/cold допустимо для отдельного назначенного операторского этапа. После него нужен соответствующий completion proof и фактические cleanup gates. Переход между инструментами не создаёт нового владельца или нового lease.

## Release и recovery

На завершении этапа использовать real completion proof, не переписывая исходные результаты. Для законченного live предпочтителен прямой release: helper сам создаёт private sidecar из аргументов и проверяет freshness, checkout SHA, существующий validator и actual cleanup.

```sh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" \
  script/node-eval-ops.ts release --config "$CFG" --lease "$LEASE" \
  --run '<own fresh run directory>' --ids '<assigned IDs comma separated>' \
  --run-sha '<full clean frozen SHA used by run>'
```

Допустим и явный private completion sidecar; его owner/acquiredAt точно копируются из своего lease. Для законченного live формат:

```json
{
  "version": 1,
  "owner": {"issue": "<issue>", "task": "<task>", "role": "rich", "phase": "eval", "sha": "<acquisition SHA>"},
  "acquiredAt": "<lease acquiredAt>",
  "kind": "eval",
  "runDir": "<own fresh run directory>",
  "runSha": "<full clean frozen SHA used by run>",
  "caseIds": ["<only assigned case IDs>"]
}
```

`runSha` должен совпадать с clean checkout и provenance generic summary; поле owner.sha может быть прежним base SHA Rich. Проверка завершения использует существующий code validator; product FAIL с confirmed cleanup не превращается в инфраструктурный ERROR.

Unit completion создаёт сам `unit`; release такого proof допустим только для отдельного lease phase=unit. Ранний unit proof не освобождает whole-worker phase=eval: нужен fresh eval/reference/cold completion, покрывающий завершённый этап. Для cold/reference, если live не завершал этап, нужны дополнительные реальные evidence:

- `cold`: успешный Playwright browser_close в `browserCloseEvidence` JSONL и адресный `storageLedger` с started_utc/cleaned_utc, storage_before/storage_after, files(name/SHA256), removed и cleanup_confirmed. При baseline/leftovers/неизвестных файлах release запрещён.
- `reference`: настоящий supervisor `processEvidence` cleanup.json собственного reference-profile, фактический закрытый sibling `historyArchive`, storageLedger; browserCloseEvidence, если использовался author UI.

Nested paths остаются в своих workRoots/resultsRoot, а historyArchive — в назначенном sibling `.history`. Не заполнять «confirmed» по одному успешному exit или утверждению агента. В случае нескольких reference/UI операций доказательства должны покрывать весь этап; release также непосредственно проверяет все четыре профиля, отсутствие writer/pending, Chromium/CDP/debugger и чистый container с прежним ID.

```sh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/$ROLE/eval.env" "$R/bin/bun" \
  script/node-eval-ops.ts release --config "$CFG" --lease "$LEASE" --evidence "$WORK/completion.json"
```

Неуспешный release сохраняет lease. Crash, завершённая задача Multica или мёртвый PID не являются разрешением его удалить. Evaler получает BLOCKED со связью issue/task/lease owner/incident/evidence, а не ложный READY.

По отдельному поручению Evaler **тот же worker owner** может выполнить один немодельный recovery на устойчивый incident ID. Input sidecar `NodeStandRecovery` содержит version=1, исходные owner/acquiredAt, profile=`reference|eval`, настоящий processEvidence и optional storageLedger собственных файлов. Evidence должно доказывать принадлежность процессов/profile/writer/files именно этому lease и успешный чистый допуск до исходной работы. Бюджет привязан к исходному immutable lease: резервируется до recovery; crash/ошибка, новое имя incident или новый follow-up task не дают второй попытки. Новый follow-up Multica task того же агента записывается отдельно в report; original owner.task внутри lease остаётся прежним. Нельзя сменить identity lease, украсть его, очистить чужой профиль или бесконтрольно повторить CLI/model run.

Операторское исключение `LAB-31-writer-release-race-v1`: для единственного error `Writer owner unavailable` при штатном unlink(owner) → rmdir(.writer) разрешён отдельный немодельный сбор process settlement. Сам `writerIdentity` повторяет только ENOENT не более 100ms и возвращает null лишь после двух наблюдений исчезнувшего исходного каталога; устойчиво отсутствующий owner, доступы, symlinks и смена identity остаются ошибкой. Source cleanup/summary/code-verdict не изменяются.

```sh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" script/node-eval-ops.ts settle-writer-release \
  --config "$CFG" --lease "$LEASE" --incident '<original incident>' --profile eval \
  --followup-task '<actual new worker task>' --evidence '<immutable failed cleanup.json>' \
  --receipt "$WORK/writer-release-settlement.json"
```

Helper сверяет исходный admission/config/container/CLI/profile, eligible continuous capture, сохранённые ancestry/admissions/writer/runtime directories и нулевые старые проходы. Затем получает два свежих полных процесса/profile/runtime прохода без сигналов, CLI или модели; занятые/неизвестные native процессы и недоступные релевантные identities запрещают proof. Новый `writer_release_settlement` proof связывается SHA256 с исходными cleanup/result и записывается отдельно; закрытая attestation внутри исходного lease запрещает подмену и повторный settlement. Recovery/release принимают его лишь при совпадении attestation/source bytes. `verifyProcesses` сохраняет прежние требования confirmed/capture/verification/absence.

При таком attested settlement адресный storage ledger может включать `kind=package_lock`, `package_path` из неизменного исходного result, имя строго `.<original-package>.lgp.lck` и SHA256 пустого файла. Общий safeName не изменяется; другие dot-prefixed файлы и чужой lock запрещены. CSV по-прежнему требует собственный доказанный ledger/hash. `PROCESS_SETTLED` не освобождает lease и не меняет ERROR: далее выполнить единственный назначенный recovery штатным helper. После SETTLED и чистых profiles/storage допустим назначенный supervised unit, последовательно с CLI/UI; release использует настоящий recovery completion. Новой модельной попытки этот путь не разрешает.

Закрытое исключение `LAB-31-owned-registration-v1-admission` (оператор `01a11b8e-be80-7481-8254-bc2bd014aac1`) продолжает ровно исходный ATTEMPTED incident. Исторический exception остаётся UNKNOWN: доказательство no-dispatch — фактический role profile/source, доминирующий open(wx), непрерывная исходная registration и отсутствие profile/history/storage mutations. Закреплённый admission SHA256 `c79db297982c257c41c5a60dff46fb7311a87c539f260b5106bba6c927f237e5` проверяется вместе с исходным clean admission/config/container/CLI и immutable owner/acquiredAt. Это не общий retry/resume API.

```sh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/rich/eval.env" "$R/bin/bun" script/node-eval-ops.ts lab31-owned-registration \
  --config "$OPS" --lease "$LEASE" --evidence "$ORIGINAL_RECOVERY" \
  --admission "$PRIVATE_ADMISSION_COPY" --followup-task "$FOLLOWUP_TASK"
```

До адресной мутации выполняются свежий полный ancestry/absence settlement и сверка canonical profile/parent, private regular registration, uid/mode/device/inode/bytes/mtime/ctime, PID с исходным launcher и birth identity. Непосредственно перед unlink эти проверки повторяются; live/reused PID, unknown cleanup, symlink или замена файла запрещают удаление. Обычный отсутствующий writer registration не удаляет. Private `owned-registration-once.json` записывается wx/0600 со статусом CONSUMED_BEFORE_MUTATION, исходным ATTEMPTED hash и новым clean SHA до unlink; ошибка/crash не восстанавливают once. Исходный ATTEMPTED receipt и ERROR остаются неизменными. Штатная общая немодельная recovery-цепочка пишет отдельный `owned-registration-settled.json` и настоящий completion, который принимает стандартный release после проверки once/source hashes. После SETTLED — один supervised unit/typecheck под удержанным lease, затем release. Второго continuation и новых model/product запусков нет.

```sh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/$ROLE/eval.env" "$R/bin/bun" \
  script/node-eval-ops.ts recover --config "$CFG" --lease "$LEASE" \
  --incident '<stable issue/task/failed-stage incident ID>' --evidence "$WORK/recovery-evidence.json"
```

После SETTLED использовать возвращённый helper путь `evidence` с private completion `kind=recovery` для отдельного `release --lease … --evidence …`; вручную такой completion не синтезировать. Так подтверждённая очистка освобождает стенд, не переписывая прежний ERROR в PASS. Release атомарно переносит исходный lease и внутренние proofs в закрытый `R/operations/completed/<receipt>/`; этот архив содержит private token/history/diagnostics, его нельзя публиковать или прикладывать целиком. Для карточки подготовить только обезличенный receipt/result. Изменения installation/model/auth/VPN/system/общих критериев, неизвестная ownership/cleanup или исчерпанный recovery — владельцу-человеку. Старые summary/verdict остаются результатом состоявшейся попытки; recovery не разрешает новый quality run автоматически.

## Offline product и handoff gates

Evaler проверяет доставленный archive и manifest по bytes, exact SHA, список кейсов, cleanup и models. Затем использует существующий валидатор на полученных evidence — без новых sessions и без перезаписи исходных результатов:

```sh
bun script/node-eval-ops.ts check-run --config "$CFG" \
  --run '<verified delivered run directory>' --ids '<assigned IDs comma separated>' \
  --tasks '<exact frozen checkout>/evals/tasks/node-evals'

bun script/check-node-run.ts '<verified run directory>' '<assigned IDs comma separated>' \
  '<exact frozen checkout>/evals/tasks/node-evals'
```

Exit0 означает PASS продукта, exit1 — измеренный FAIL, exit2 — ERROR. Eval quality решение принимается отдельно; полный FAIL с confirmed cleanup не требует повторного прогона ради PASS. Сохранять checker output отдельно от immutable evidence. При обнаружении несовпадения delivered SHA/manifest или невалидного набора передача следующему worker блокируется.

Чистый handoff gate получает JSON с `state`, одним событием и наблюдаемыми `pending_tasks`. Он не обращается к Multica, не хранит очередь и не валидирует attachment вместо Evaler:

```sh
bun script/evaler-handoff.ts '<private observed-handoff-input.json>'
```

State/phase/frozen SHA берутся из metadata `evaler.state` и actual comments/tasks. Пишет metadata только Evaler. `last_dispatch.id` — стабильный intent ID, известный до публикации; `root_trigger` — фактический incoming comment ID либо null для assignment без комментария. Parent в таком случае также опускается, фиктивный UUID не создаётся. До публикации сохранить ambiguous intent в metadata. После CLI отправки receipt связывает `dispatch_id` с intent, outcome queued/coalesced/deferred/ambiguous/not_queued и реальным worker task_id. Actual outgoing comment UUID сохраняется как native receipt рядом с state в том же metadata value, отдельно от intent ID. Private file — только cache; он не заменяет карточку.

Штатный read: `multica issue metadata get <issue> --key evaler.state --output json`. Для записи `multica issue metadata set <issue> --key evaler.state --value <JSON>` передавать JSON отдельным argv, не интерполировать его в shell. Например, после проверки receipt:

```python
import json
import subprocess

# issue_id и checked_metadata берутся из verified текущего task/card readback.
subprocess.run([
    "multica", "issue", "metadata", "set", issue_id,
    "--key", "evaler.state", "--value", json.dumps(checked_metadata),
], check=True)
```

Metadata не является доказательством по одному worker claim: Evaler сохраняет там лишь уже проверенное состояние. Native receipt/comment/task связность повторно проверяется при возобновлении. Gate получает вложенный state из этого value; supplementary receipt/evidence поля не являются частью reducer schema.

Report имеет native comment ID, issue/task, phase rich|ben, actual full SHA, READY_FOR_BEN/ACCEPT/REJECT/BLOCKED. `evidence` при положительной передаче — receipt **проведённой Evaler проверки**: attachment_id, manifest_sha256, checked_sha, validation confirmed, cleanup confirmed, product PASS|FAIL. Не переводить необработанный report в confirmed. BLOCKED может не иметь evidence.

Наблюдаемые pending_tasks включают реальные issue/worker-phase/SHA/task ID; нельзя передать пустой список лишь потому, что нет локального cache. `dispatch` предлагается только после допуска; вывод gate включается в единственный routed comment, receipt записывается после actual CLI response без второго comment. При ambiguous — readback, без автоматического repost. `no_action` заканчивает повторный ход; успешный Multica squad activity no_action исключает любые дальнейшие comments.

## Внедрение supplement

Personal templates `evaler.md`, `rich.md`, `ben.md` публикуются как полные активные инструкции; `squad.md` — leader-only briefing. Вместе с контрактом/операторской инструкцией они входят в отдельный новый nonsecret immutable operational supplement с SHA256 manifest. Это заменяет старые route/status/runtime override правила, а не редактирует прежний archive. Дополнительные reference/eval env и auth Evaler не создаются.

Перед переключением read-only проверить очередь/процессы/stand и отсутствие pending cleanup. Обновить настройки без запуска; readback whitelist model/thinking/concurrency/runtime/leader/members/instruction hash. Не печатать raw MCP env. До следующего user-prepared node pilot корректная формулировка — «настроено и проверено статически». LAB-16, аналитический baseline и model smoke автоматически не запускаются.

## Допуск после устранённого авторского инцидента

Исторический `product=ERROR` сохраняется. Evaler может добавить к **своему проверенному** handoff evidence необязательное поле `review_admission: {kind: "recovered_author", resolution_sha256: "<SHA256 отдельного resolution receipt>"}`. Это разрешает только первоначально предусмотренный независимый Rich → Ben прогон на exact clean frozen SHA; не разрешает повтор Rich, смену модели, увеличение recovery/quality budget или ACCEPT при ERROR Ben.

До выдачи допуска Evaler offline проверяет доступность exact SHA, доставленный архив и manifest/SHA256, готовность reference/cold/обязательных позитивов и негативов всех назначенных case IDs. Отдельный resolution receipt связывает issue/task/SHA/manifest, перечисляет **каждый** назначенный кейс и каждую попытку (включая ERROR и not_started), содержит hashes источников инцидентов и подтверждённые recovery completion, архивы истории, cleanup и stand release. Непроверенные заявления автора не становятся confirmed. Receipt и его hash входят в доставленный manifest; исходные ERROR/summary не переписываются. Неполное evidence, stale SHA, незавершённая очистка и ERROR Ben блокируют передачу. Receipt не заменяет offline verification.

## Диагностика перед следующей попыткой

Повторяемый технический отказ reference требует сначала минимальной немодельной диагностики того же отказа. Оставшиеся три попытки не расходуются на неизменившуюся известную причину. Исправление проверяется адресно; требования reference/cold/oracle не ослабляются, специальное переименование узла для F3 не требуется.

После подтверждённого provider headers timeout 300 секунд с нулевыми tokens выполняется один ограниченный немодельный HEAD probe через назначенное приватное окружение. Операторский classified receipt (`kind=provider_headers_timeout`, `tokens=0`, `timeout_ms=300000`) связывается с исходной неизменной попыткой и evidence SHA. `script/provider-route-probe.ts <classified.json> <new-private-probe.json>` использует только назначенные provider base URL/key, 5-секундный timeout, без redirects/генерации/fallback/retry. Receipt резервируется до dispatch; второе использование запрещено даже после NO_HEADERS. Любые полученные headers (в том числе HTTP 401/405) подтверждают ответ маршрута, но не авторизацию или успешную генерацию. Исходная ошибка остаётся самостоятельным результатом.

## Новый admission/recovery комплект — только будущие задания

Product и reference runner получают `EVAL_NODE_OPS_CONFIG=<private config>` и `EVAL_NODE_STAND_LEASE=<private lease handle>`. До dispatch helper проверяет исходный admission/owner и точный профиль, создаёт закрытые harness receipt + `.stand` attestation внутри lease. Не передавать эти пути/receipt/owner bytes в product prompt, sandbox или evidence delivery; публикуются безопасные hashes и операторские итоги.

Обычный `recover` при attested writer-release settlement допускает собственную остаточную `.process-group` только после `registrationIdentity`/`verifyOwnedRegistration` до расходования единственной reservation; затем повторно проверяет identity при удалении. Он архивирует историю, проверяет storage, адресно retire-ит attested harness guard и оставляет общий stand guard до `release`. Старый harness guard без receipt не принимается. Чужой owner/identity, живые или неизвестные процессы и unknown cleanup сохраняют блокировки. `lab31-owned-registration` остаётся закрытым историческим исключением, не повторным recovery API.

`--diagnostic <new-private-file>` сохраняет operation/stage/reason/dispatch `not_started|started|unknown`, включая отказ до management. По умолчанию receipt находится внутри owned lease/archive. `unknown` нельзя считать разрешением повторить dispatch. Секреты, raw env и raw exception text не включаются. После неоднозначного ответа сначала readback.

Skill 1.0.5 и соответствующие CLI/harness pins переключаются только в новых назначениях после освобождения стенда. LAB-55 и принятые исторические результаты используют прежние pins.
