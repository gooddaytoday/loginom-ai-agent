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

`status` только читает общую блокировку. FREE не означает готовый Loginom. `preflight` выполняет штатный допуск и реальный `loginom check` установленного CLI внутри bubblewrap с Chromium, собственным lease и role env. Проверяется ready/`LOGINOM_CONNECTION_VALID`, credentials/WebSocket/лицензия и прежний container ID; модели не вызываются. Затем helper подтверждает завершение процессов и архивирует короткую проверочную историю/диагностику в приватные каталоги. Preflight не является статическим HTTP-check и не назначает paid smoke/reference. Если acquire/preflight/unit отклонены, сохранять безопасную причину; для занятого ресурса нет blocking wait, expiry или удаления lease по PID.

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
