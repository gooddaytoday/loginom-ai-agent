# Доставка уточнений Multica

Жизненный цикл, совместное использование и безопасная очистка артефактов MAS описаны в [artifacts.md](artifacts.md). Для поручения с артефактами `handoff.py` импортирует расположенный рядом `artifacts.py`; `--artifact <ID>` закрепляет данные до dispatch.

Это обвязка существующих API, без изменения сервера, ролей доступа, очередей или моделей. Процесс определён в [регламенте сквада](../../docs/testing/loginom-ai-agent/multica-mas.md).

## Новое действие после PASS

Готовый PASS с новым следующим действием передавать через обычный dispatch, даже когда Регистратура занята. @all/update.py хранит информацию без обязанности запустить продолжение; проверка running перед POST не устраняет гонку завершения.

```sh
python3 handoff.py --issue <UUID> --agent <UUID> --sha <40-hex-source-SHA> \
  --scope capture-receiving --message /private/next.txt --receipt /private/next.json
```

Один автор передачи, стабильный ключ карточка/роль/SHA/действие. До отправки сверить все старые назначения по предмету, включая сообщения без маркера. Квитанция assigned подтверждает trigger/coalesced/planned/delivered привязку к run; completed — прочитать результат, приёмка отдельно. При blocked outcome, cancelled/failed run или неизвестной отправке автоматического нового POST нет. Повтор — точная receipt; новый SHA является отдельным кандидатом. Проверка маркера не заменяет единственного отправителя при конкурентной записи.

Существующее назначение можно подтвердить без POST: добавить `--existing-comment <UUID>` и сохранить в message его точный текст. Прежний SHA/роль/связанный run должны совпасть. Новый механизм очереди, права или human token не требуются.

## Агент: уточнение существующей работы

Разместить `handoff.py`, `update.py` и импортируемый `supplement.py` рядом. Использовать текущие `MULTICA_SERVER_URL`, `MULTICA_TOKEN` и, при наличии, `MULTICA_WORKSPACE_ID`. Не передавать секреты аргументами и не получать операторский токен.

```sh
python3 update.py --issue <UUID> --task <running-or-queued-UUID> \
  --message /private/update.txt --receipt /private/update-receipt.json
```

В своей карточке `parent_id` автоматически берётся из trigger текущего `MULTICA_TASK_ID`, а не из назначения получателя. При отсутствии task context можно явно передать `--parent <точный trigger UUID>`. В чужой карточке чужой trigger не подставляется.

Текст без agent/squad mentions. Сообщение публикуется с явным @all, preview без адресатов и точным readback. Это не сигнал немедленного пробуждения: получатель читает delta на безопасной границе содержательного этапа и перед завершением. `recorded` подтверждает запись, не выполнение поручения.

Для точного повтора использовать тот же текст и receipt. После потерянного ответа инструмент ищет исходное сообщение; при неизвестном исходе не отправляет его снова. Изменённый текст с прежней receipt отклоняется. На закрытый run до первоначальной отправки — отказ: сначала сверить результат и необходимость нового действия. Инструмент не отменяет и не создаёт запуски.

## Оператор

`POST .../tasks/{task}/supplements` и comment steer сервер ограничивает human actor; agent token для них не подходит. `supplement.py` используется только оператором с уже предоставленным человеческим доступом. Он сохраняет `client_request_id` до POST, проверяет exact target и readback, повторяет запрос только с тем же ключом, никогда не создаёт successor как fallback. Агентский `update.py` импортирует из этого файла лишь HTTP/receipt helpers.

Применение уточнения проверяется по журналу или следующему содержательному результату адресата. `pending` не означает delivery failure или завершение работы. Не менять права для обхода ограничения.

## Проверка

```sh
python3 -m unittest discover -s scripts/multica -p 'test_*.py'
```

Тесты включают завершение адресата между preview и POST, устойчивый successor, coalesced/deferred link, потерю ответа после завершения, заблокированный dispatch, неизвестный POST и exact retry без повторной отправки. Они выполняют реальные HTTP-запросы и отдельные процессы CLI на локальном contract fixture: потеря ответа, повтор, смена текста, закрытый run, неверный target, несовпадающий readback, запрещённые mentions и неизвестный результат отправки. Они не заменяют проверку живых серверных прав и фактической доставки в Multica.

## Условное обновление checkpoint

```sh
python3 checkpoint.py --issue <UUID> --revision <fresh-revision> \
  --checkpoint /private/checkpoint.txt --receipt /private/checkpoint-receipt.json
```

Только `PUT /api/issues/{id}` с `description` и `expected_revision`, 1–20 строк до 500 символов. До PUT — свежее GET и приватная receipt; после — точное GET. Конфликт означает перечитать и согласовать новый текст, затем новую revision/receipt. Не повторять старый текст поверх чужих изменений. После неизвестного ответа сначала GET; повторная receipt только сверяет результат, не пишет. 401/403 сохраняют draft и отказ без подмены agent token токеном владельца. Статус, assignee и запуск не меняются.

Контракт проверен в исходниках Multica `7ab92d7622ecd81d179a8d83ae2dea74835a5069`: `server/internal/handler/issue.go` (`UpdateIssueRequest`, `UpdateIssue`, `updateIssueAtomically`), `server/cmd/server/router.go`, `server/internal/middleware/auth.go`, `server/internal/service/issue_trigger.go`. Task token проходит штатную авторизацию workspace; human-only guard для description отсутствует. Проверка revision выполняется также при атомарной записи. Dispatch зависит от status/assignee transition, а не description. Совместимость с установленным сервером и правами конкретного task token проверяется отдельно живым агентом.

## Допуск прогона

См. [admission.md](admission.md). Проверки обвязки: из `scripts/multica` выполнить `python3 -m unittest discover -s . -p 'test_*.py'`. Эти HTTP/process тесты не означают модельную или узловую приёмку.

## Assignment identity and release-result adoption

A quoted `Handoff-ID` in a completed receiver's `Artifact-release` result is not
another assignment. Selection requires canonical action headers and exact body;
explicit legacy adoption can use its original pinned artifact descriptors to bind
source/scope/key. The full original body is compared without whitespace repair.
Sender comment author, source task and issue must match authoritative run metadata;
receiver result must belong to that same issue and a run linked to the original
assignment. Duplicate originals, conflicting headers, unlinked markers and missing
metadata refuse. A marker is never skipped merely because its body differs.

Receipts retain their original wrapper fingerprint and add a separate complete
comment fingerprint, source/scope and verified sender identity only through normal
readback reconciliation. Existing prepared fingerprints are never repaired.
`--existing-comment` remains read-only: no POST/rePOST, server/task/outcome edit,
artifact release or pin rewrite. Historical acceptance is unchanged. Missing
provenance means refusal to reconcile, not cancellation of the original work.

Addressed controls: `python3 -m unittest test_handoff_adoption` from this directory.
`replay_handoff_adoption.py` can verify a supplied complete original/release body,
run metadata and prepared receipts against a selected source helper through local
HTTP/process/filesystem fixtures. It redirects all requests to loopback, uses an
offline token, and never invokes admission/model/native work. Installed pinned kit
replacement and central source/catalog pins require the existing publisher/owner
workflow after independent review; changing this checkout does not install it.

Legacy read-only adoption scans every descriptor-bound original comment, including originals without a standalone Handoff-ID header. Multiple original IDs refuse as ambiguous. A supplied Handoff-ID/Source-SHA/Action header must agree with the descriptor action and may not contain duplicate fields; explicit --existing-comment does not override it. Receiver release results may repeat descriptors only with verified linkage to the selected original run. Full body/wrapper fingerprints, sender/issue/source-task proof and UNKNOWN/no-rePOST guards remain mandatory; historic receipts are not migrated.

Canonical and legacy selection validate raw supplied Handoff-ID/Source-SHA/Action counts and complete values before branching. Malformed duplicate fields cannot be hidden by valid-value matching; they refuse without selecting metadata or changing the prepared fingerprint.

Original admitted execution producer: `admission-origin.md` defines the once-only
claim/birth contract and current unsupported RunCommand private reader seam.
`test_admission_origin.OriginTest` checks real offline claim/FS/process boundaries
without CLI/model spawn. New producer source does not install itself or qualify
SDK/native origin; receiving requires separately reviewed authoritative pins.
