> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-235e2f36bd89` и изменения: [происхождение](../../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../../docs/node-development/README.md).

# N13-R2: выбранный пакет переноса, без применения

Источник: `a63586fe096f4fd7f17f346c391834d3e34bdaa4`.
Целевая база: 7d7f0bc2a23c8db5d57fbeb9ceb57d3a8ca29907 (исправление manual output узла13).
Полные blob SHA исходного родителя, источника и целевой базы, SHA256 каждого
файлового diff и каждого hunk приведены в [manifest.json](manifest.json).

- [source-selected.patch](source-selected.patch): только выбранные source hunks.
- [terminal-failure.patch](terminal-failure.patch): тот же payload с адаптированным
  контекстом d.ts и node-apply.test.mjs к целевой базе; изменения узла13 сохранены.
- 11 файлов / 18 hunks. В node-result-schema.mjs выбраны только failed execution
  и local_node_failed. Остальные выбранные файлы соответствуют terminal-failure
  части указанного source-коммита.

Не включены missing_values schema/readback, input-mapping recovery и более новый
node14 target-placement fix. В generator проверяется побайтовое совпадение
добавленных/удалённых строк при адаптации контекста. Новое содержимое целевых
файлов для этой адаптации существует только в памяти процесса.

Проверка: `git apply --check terminal-failure.patch`, exit0; SHA256 рабочих файлов
до/после совпали. Патч не применялся, cherry-pick/merge отсутствуют. Этот пакет
подготовлен для решения координатора и **не даёт разрешения на перенос**.
Целевая база и выбранные11 файлов должны быть повторно проверены перед будущей
разрешённой интеграцией. Runtime/live gate R2 остаётся OPEN; дальнейшие проверки
описаны в [плане R2](../../node-13-r2-integration-plan.md).

Воспроизведение из корня репозитория на указанной целевой базе:
`python3 packages/loginom-runtime/tools/loginom-acceptance/prepare_date_time_r2_transfer.py <output-dir>`.
Generator записывает только пакет и вызывает dry-check; изменения в исходники
не вносит. SHA256 итогового patch: 47830abe656d8a5abed35e27ee4ca54fb8d46bb4e5b45ce4f47b2b6dc833a182.
