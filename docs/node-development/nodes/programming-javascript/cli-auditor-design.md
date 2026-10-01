# Независимые аудиторы JavaScript для фазы 4

Продолжение утверждённого [плана](plan.md), 2026-10-02. Аудиторы читают
сохранённый native journal; не запускают Hermes, браузер или JavaScript модели.
Решение `allow_configured_output: true` остаётся отдельным контрактом чтения
контекста и не превращает `source_pending` в доказательство исполнения.

## Разделение проверок

`javascript_configuration_evidence.py` проверяет admitted request, порядок
фаз, принадлежность нативных observations/actions, source delivery receipts
и настройки/сопоставления независимо от публичного readback. Ожидаемый исходный
код задаётся оператором после получения фактически авторского кода; его hash
не берётся из проверяемого результата. Обязательны совпадение UTF-8/LF,
подтверждённые Setting/Close для source-read, observed generation/declared grids
и полные reciprocal mapping stores. Это проверка конфигурации Execute;
Done/Close и opt-in context сохраняют собственные уже проверенные аудиторы.

`javascript_output_evidence.py` проверяет две отдельные свежие execution groups:
materialization и итоговое исполнение. Использует существующие независимые
Python-проверки history/owner/Table, выделяя последовательности по записанным
границам фаз. Полный выход сравнивается с отдельно переданным oracle, включая
каждую ячейку, тип, NULL, порядок, схему и execution identity. Сумма не заменяет
эту проверку. Первая версия поддерживает бизнес-oracle integer/string/NULL;
прочие scalar/native-byte доказательства остаются отдельными проверками G5.

Общий procedure auditor получает узкую поддержку существующего runtime-ожидания
Table после единственного Add: только свой port/views/node, исходный deadline
из admission, два устойчивых подтверждения новой карточки, отсутствие посторонних
масок и действий во время ожидания. Лимит остальных ожиданий остаётся 15000 ms.
Нативный журнал не переписывается и не нормализуется под старый аудитор.

`javascript_node_acceptance.py` объединит эти проверки с фактическими candidate,
model/variant, доставкой входных файлов, Save/cold и cleanup evidence. Его
окончательный транспорт определяется реальными standalone CLI записями,
а не историческим Hermes envelope. До реализации этой проверки узел не получает
`ready_for_acceptance`. Проверки конфигурации/выхода сами по себе не доказывают
автономность модели, отсутствие hardcode, persistence или готовность продукта.

## Входная проверка standalone CLI

Первый транспортный модуль — `javascript_cli_evidence.py`: собственная сессия
из `<profile>/data/loginom-ai-agent.db` читается SQLite `mode=ro`/`query_only`.
Используется фактическая v1 схема `session`/`message`/`part` и восстанавливаются
ID из колонок, как `message-v2.ts`. Наружу выходят только модель/вариант,
hash/размер/имя текстовых file snapshots и metadata/digests публичных tool parts.
Reasoning, system/developer, auth secrets, бинарные вложения и исходные payloads
не сохраняются и не печатаются. Этот модуль не экспортирует базу.

Очищенные CLI `events.jsonl` сопоставляются с metadata собственной сессии:
фактические OpenAI Sol/low, terminal tool IDs/callIDs/messageIDs/status/time,
input/output digests, полнота завершённых вызовов, отсутствие truncation и
соблюдение исходных30 минут. Повтор идентичного terminal event допускается
как повтор доставки; изменённый terminal part с тем же ID refused. Все события
сохраняются у controller до проверки, а не заменяются последним статусом.

Проверка file snapshots не заменяет native admission/upload: следующий слой
итогового аудитора отдельно связывает prepare/input_artifacts, delivery/import,
свежую JS операцию, Save/cold/cleanup и candidate/knowledge pins. Пока эти слои
не реализованы, успешный транспортный тест не получает acceptance PASS.
Первый модуль проверяется на SQLite fixtures фактической структуры и
самостоятельных негативных случаях, без запуска candidate до F review.

## Проверки и воспроизводимость

Связка публичного node call с native admission проверяет реальный compact
profile. Agent `session/tools.ts` соединяет MCP text blocks через `\n\n`;
первый JSON block — receipt, следующие blocks могут содержать advice. Runtime
`user-workflow.mjs` восстанавливает полный ранее выданный workflow_ref, добавляет
read/mapping/budget defaults, а для нового text import — source/format/column
defaults и путь из подтверждённой delivery. Поэтому raw compact arguments не
обязаны равняться expanded journal request. Аудитор проверяет точное ожидаемое
расширение и сохранение всех явно заданных параметров/source_text, original ID,
public polling/retry, final checkpoint/outcome и public execution/node identities.
Это отдельная связка; она не доказывает бизнес-правильность или отсутствие hardcode.
Текущий normal-worker binding охватывает attempt1, status/wait и SAME-ID apply
retry без повторного native admission. Resume/multiple terminal outcomes требуют
отдельной проверки reconciliation; не игнорируются и не объявляются этим helper
принятыми. Общий acceptance verdict до добавления всех обязательных слоёв отсутствует.

Итоговая задача требует Save последней редакции по unique path, а не два Save
из исторического calculator сценария. Проверка не вводит искусственное требование
`package.save_as` или модельного reopen: обычный `package.save_checkpoint` и
последующий независимый cold reader должны закрывать persistence. Full small
result может быть прочитан поздним `dock_node_read`; сам default apply preview
на5 строк не является полным6-row proof и не заменяется controller-only read.

`javascript_cli_persistence.py` реализует только normal-worker last Save/dirty-state
binding. Выбранный JS Execute должен иметь public/native node binding; финальный Save
идёт после него по externally allocated own path с pinned action revisions.
Все public Save IDs должны иметь единственный native admission/completion;
SAME-ID retry связывается с той же mutation и новым bridge dirty read. Новый source
или admitted mutation после Save требуют последнего checkpoint. Первый путь нельзя
перезаписывать; `replace` относится только к подтверждённому собственному Save.
Public compact Save output, continuation и JSON advice сверяются с native facts.
Последний read обязан подтвердить `modified:false`, read_only и собственные
session/document/account/path, без заявления о persisted calculations.
Предыдущий dirty Save может завершиться новым checkpoint; два Save не обязательны.

Helper сверяет rendered graph между native Save preflight/trace, но не объявляет
это независимым доказательством GUIDs/topology/positions. Его cold persistence,
settings persistence, native GUID graph, process cleanup и CLI acceptance flags
остаются false. Отдельное path-only cold чтение должно связать actual source bytes,
settings/mappings, GUID graph и fresh полный результат с writer, после нормального
закрытия writer. Ни runtime-produced unit fixtures, ни старый immutable trace
не заменяют свежую headed candidate/CLI проверку.

Native admission связывается с фактическим standalone Host, без Codex/Hermes
ticket envelope. `packages/loginom-host/src/host.ts` передаёт в `inputStore`
chat `${generation}:${cliSessionID}` и исходный user message ID. `inputs.ts`
формирует имя `${SHA256(JSON.stringify([chat,userMessage]))}-${index}-${name.slice(-120)}`;
`name` — basename, `slice` использует UTF-16. Поэтому `input_artifacts.name`
нельзя сравнивать с простым исходным именем вложения. Индекс берётся из фактического
порядка file parts; имя, bytes и digest связываются с original user snapshot.
Первый успешный `loginom_dock_prepare` должен подтвердить fresh owned draft,
runtime/catalog pins и точный native workspace journal. Upload grants должны
иметь уникальные IDs, папку своего аккаунта, точный destination и overwrite=reject.
Это admission proof, а не загрузка/импорт/исполнение или итоговая приёмка.

Production `execution-journal.mjs` пишет в `target` фактический
`metadata.targetIdentity` из workspace: profile_id/loginom_build/platform/browser.
В isolated fixed captures использовался origin/build. Configuration/output
аудиторы сохраняют прежний строгий default, а для production получают отдельно
закреплённые target/origin: весь journal target должен совпадать с внешним pin,
origin/build всех native observations — с известным стендом. Переписывать
production journal под старый origin-header нельзя. Тестовая проекция header
старого capture проверяет лишь совместимость формы; fresh CLI proof ею не заменяется.
Для origin допустимы только URL.origin и эквивалентный root URL.href с `/`;
пути, query/fragment и другой сервер не принимаются. Исходные bytes/digests сохранены.

`javascript_cli_candidate.py` отдельно сверяет Linux x64 bundle с внешними
immutable pins: исходный commit/tree, manifest, Node/browser и модуль JS knowledge.
Проверка читает полный inventory, права и symlinks по контракту `cli-manifest.ts`,
а вложенный resource manifest связывает с фактическими файлами и ограничивает
ссылки своим resource root по `resources.mjs`. `sourceDirty` сохраняется как
факт manifest; clean tree не вводится как дополнительное условие. Файловые
fixtures проверяют также согласованные изменения inventory/resource manifests,
чтобы отказ не ограничивался внешним hash manifest. Этот модуль не исполняет
бинарники и не доказывает доставку knowledge или использование candidate моделью.

Unit/regression tests проверяют настоящие Python функции и отказ при изменениях
owner/deadline/sequence/source/settings/mapping/value/type/NULL/row/schema/freshness.
Санитизированные минимальные fixtures не содержат secrets, полных логов,
готового JavaScript или бизнес-oracle в каталоге, доступном модели. Приватные
неизменённые headed-журналы Code449/declared450 используются дополнительно;
их hashes и команды записываются в checkpoint. Это повторный анализ имеющихся
наблюдений, не новый live run. Свежая product/candidate headed-проверка и две
Sol/low CLI попытки следуют после предусмотренного same-task F review.
