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
