# Единственное review: узел17 Text export

Назначение `node17:review:1:110da29a`, 13.09.2026. Component
`component.exports.Text`, ветка `codex/node-17-text-export`, app task
`01a09a36-695b-7da0-b7ca-1ec521afa17e`. Проверен полный final diff от
`a3b419bde8a660e1905284ee62a46362d5a49e09` до
`a0912da98a6fd65a497f955115afa855bb45853d`; исходный коммит
`110da29abe5d247c76ed71b09f7e6b7f6d0b588b`.

Результат: **2 подтверждённых P2 findings**, требуется один correction round.
Код и тесты не изменялись, коммиты не создавались. Hermes, новое review,
merge/push/deploy и изменения памяти/хуков не запускались.

## R1 — P2: специальный Next отправляет действие после отмены

Место: `client/lib/text-export-procedure.mjs:86–89`, также `:19–39`.

`configureTextExport` напрямую вызывает `execute` после await onRecord для
`text_export_next_prepared`, обходя `channel.perform` и его checkBudget.
После записи нет `ctx.signal.throwIfAborted()`; в task не передаётся deadline.
Сам `exportNext` задаёт новые 15 секунд уже после первого клика и не наблюдает
отмену перед кликом Next или ответом Yes/No на overwrite-диалог.

Воспроизведение на неизменённом финальном коде: `.dock/node17/review/probes.mjs`.
Использована настоящая `configureTextExport` и сохранённые native configuration/
workflow refs финального сценария. Fake transport только считает отправки;
callback записи `text_export_next_prepared` вызывает AbortController.abort().
Получено `signal_aborted=true`, `next_browser_mutation_dispatched=true`.
В Loginom для этого воспроизведения не выполнялись действия.

Последствие: отменённая операция продолжает менять страницу мастера и может
ответить на диалог замены после отмены. Это не доказательство записи файла после
отмены: actual Execute находится позднее и проверяет сигнал отдельно. Дефект
касается дополнительного UI-эффекта и несоблюдения lifecycle/deadline контракта.

Исправление: связать специальный переход с тем же bounded cancellation/deadline
контрактом, что у остальных мутаций; перепроверять после awaited reads/journal и
перед каждым жестом. Отдельно покрыть отмену до dispatch, между Next/overwrite
answer и истечение общего бюджета. Не повторять неопределённый жест.

## R2 — P2: неподдержанный сохранённый decimal default допускается до Execute

Место: `client/lib/text-export-procedure.mjs:82–85`,
`client/lib/text-export-parameters.mjs:46–48`; потребитель —
`client/lib/node-result-schema.mjs:84` (exportConfigurationReadback).

Existing patch проверяет только явно переданные параметры. Final retained guard
проверяет encoding/delimiter/header/line_ending/bom, но не параметры первой
страницы. Нативный локальный decimal separator имеет значение `""`: это реальное
наблюдение `text_export_native_read` операции `export-empty-copy5`,
`.dock/text-export/live-1789299534188/execution-events.jsonl`, runtime
`96f34c91eff1f908432c7ac417cc05dbfc920404ccf4825ba95fa510ab5cd78a`.
Этот native default исправлялся явным параметром в успешном development case;
он не доказывает корректность destination-only patch узла с сохранённым default.

Для существующего узла с таким default запрос `{destination: новыйCSV}` проходит
валидацию и final format guard. После Done/Execute readback содержит `""`, тогда
как публичная schema разрешает decimal_separator только `.` или `,`. К этому
моменту Execute уже мог создать/заменить файл. Diagnostic MCP consumer отвергает
результат по output schema; permissive user-v1 projection сама по себе не
устраняет выход за объявленный контракт.

Воспроизведение `.dock/node17/review/probes.mjs`: на реальной final configuration
меняется только observed decimal_separator на подтверждённый native default.
`validateNativeExportFormat` принимает конфигурацию; настоящий `textExportReadback`
создаёт результат, а SDK Ajv validator для nodeApplyResultSchema возвращает
`valid=false`. Такой же пробел получен для сохранённого text_qualifier=""; наличие
этого варианта в реальном UI в review не подтверждалось, поэтому отдельным native
finding он не считается.

Исправление: перед Finish/Execute проверить весь сохранённый контракт обеих
страниц. Для локальных defaults либо доказанно нормализовать фактическое значение
и согласовать readback, либо завершить с понятным отказом до файлового выполнения.
Не заставлять агента узнавать неподдержанный формат только после записи файла.

## Что проверено без новых findings

Проверены output lease и отдельность input/upload admission, exact session/
document/workflow/node/execution/destination binding, filename/origin/regular-file/
no-symlink checks, лимит 16MiB, retain/release, отсутствие silent retry неизвестного
скачивания, default reject/explicit replace и freshness chain. Существующий
transport скачивания переиспользован; новый произвольный downloader не добавлен.

Полный graph/port mapping, empty/wide, CREATE owner scroll и CONNECT mask wait,
эффекты и cleanup, сохранение и повторное открытие сопоставлены с кодом и журналом.
Известное ограничение пустого filter после reopen (сначала получить схему его
выполнением) не объявлено новым дефектом: оно уже явно описано, и неготовая схема
не выдаётся за successful export. Длительный native stop отдельно не проверялся.

После disk ENOSPC выполнен read-only аудит **11/11** сохранённых фактических файлов:
полные bytes/SHA, JSONL phases, source link, settings, execution и per-case runtime.
Данные не повреждены. Отдельно все 11 действительных результатов пропущены через
настоящий `compactNodeResult` и JSON roundtrip: file_artifacts и configuration
сохранились полностью, в том числе 40 полей. Это проверка пользовательской
проекции, не новый запуск bridge/Hermes. Свободное место при review: около 7.1GiB.

Доказательства:

- `.dock/node17/review/probes.mjs`, `probes.json` — два детерминированных дефекта;
- `.dock/node17/review/integrity.json` — независимое чтение 11 файлов после ENOSPC;
- `.dock/node17/review/projection.mjs`, `projection.json` — user-v1 без потери данных;
- `.dock/node17/review/runtime-boundaries.json` — сравнение source manifests.

## Границы runtime и новые подтверждённые lessons узла17

Финальный source runtime
`afc199953de8a6a7e0d1e3a04247a98e69d85d832e26d0168a06b2c0bb6b8cab`:
каждый файл его `clientSourceManifest` совпал с текущим source. На нём прошли
reopen-csv, reopen-typed, reopen-done и new-final. Старые результаты не перенесены
на этот runtime автоматически:

- wide (`live-1789298553347`) отличается по node-target-browser,
  text-export-parameters, text-export-procedure;
- empty/zero/replace (`live-1789299534188`) — по text-export-parameters/procedure;
- первые new CSV/Typed (`live-1789297661190`) — также по text-export-node/palette.

Подтверждённые новые выводы относятся только к **узлу17 Text export**,
`component.exports.Text`, `codex/node-17-text-export`, source `110da29a`:
специальный Next сейчас не соблюдает отмену; native decimal default="" требует
дополнительной проверки существующего узла; сохранённые native evidence не
повреждены ENOSPC; текущая user-v1 проекция сохраняет полную byte receipt.
Исторические сведения узлов11–16 не являются lessons или proof узла17.

Следующий шаг — один correction round по R1/R2, только после назначения
координатора. После правок нужны адресные проверки исправлений, затем отдельно
разрешённая автономная приёмка; повторный полный review не запускать.
