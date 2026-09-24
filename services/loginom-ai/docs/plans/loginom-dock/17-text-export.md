> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-e8f25ec962cf` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# 17. Экспорт — Текстовый файл

Исходный коммит: `110da29abe5d247c76ed71b09f7e6b7f6d0b588b`.

Разработка кандидата `exports.text` завершена 13.09.2026. Исходные тесты и
независимая native-проверка выполнены. Единственное review и один correction
round R1/R2 завершены; автономная приёмка Hermes ещё не проводилась. Это состояние ветки, не main, сервера или
установленного клиента.

Ветка `codex/node-17-text-export`, постоянный worktree
`unavailable:artifact-56a53afe8ac6fecc`, принятая база
`a3b419bde8a660e1905284ee62a46362d5a49e09`. Назначение
`node17:development:1`, component `component.exports.Text`, аккаунт `test-2`,
хранилище `/test-2`. Непрослитые изменения node11 не переносились.

Исправления: `2524921058b29db0e79e9a188ec7bb8fa9ef9d8c`.
[Отчёт correction round](17-text-export-fix.md),
[доказательства исправлений](17-text-export-fix-evidence.json).

## Контракт кандидата

Один табличный вход, публичный индекс 0, без табличных выходов. Native-вход
Data-1 отличается от Connection-0 и Var-2. Тип `exports.text`, режим `delimited`.
Новый узел требует источник и явные destination, encoding, delimiter, header,
bom, line_ending, decimal_separator, null_marker, text_qualifier. Existing patch
сохраняет неуказанные параметры и существующую связь. `mappings=[]`,
`read.ports=[]`, `sample_rows=0`, `require_exact_numbers=false`.

Поддержаны UTF-8; разделители `;`, `,`, табуляция; заголовок names/labels/none;
BOM true/false; LF/CRLF; двойная кавычка; десятичная точка/запятая;
NULL `?`, `null`, `NULL`, пустая строка. Явные нативные значения даты, времени и
логических полей перечислены в `text-export-parameters.mjs` и публичной schema.
CSV/TSV должен находиться в назначенном `/test-2`; размеры файла ограничены 16 MiB.
Это ограничение тестового кандидата, не выбор аккаунта для production.

Перезапись по умолчанию запрещена. `overwrite=replace` требует заново явно
указать destination. Freshness доказывается native-проверкой отсутствия файла
либо точным native-диалогом замены и новым завершённым выполнением. Файл
скачивается из Loginom через существующий UI/download primitive; ожидаемые байты
никогда не записываются на место экспортного результата.

`output.file_artifacts[]` содержит artifact_id, destination, bytes, sha256,
execution_id, verification_id и freshness_basis. Приватный output lease связан
с session/document/workflow/node/execution/path; он не даёт input/upload admission.
Проверяются обычный файл без symlink, имя, размер, origin и целостность.
В пользовательскую проекцию не попадают host path и приватная привязка.

Done применяет настройки без выполнения; Close отменяет черновик; Execute
дожидается собственного процесса, проверяет файл и возвращается в свой workflow.
Сохранение пакета выполняется отдельно через `package.save_checkpoint`.
Нормальная операция не переоткрывает мастер для проверки результата.

## Реализация и согласованные общие изменения

- `text-export-{parameters,context,procedure,node,output,continuation,palette}.mjs`:
  параметры, наблюдение родного мастера, настройки и overwrite, полная входная
  схема, выполнение, файл, консервативное продолжение и открытие палитры.
- Registry/API/readback/projection расширены кандидатом; source factory передаёт
  artifactStore. Общий download дополнен отдельной привязкой выходного файла.
- `workspace-ui.mjs` наблюдает поля двух export-страниц, связанные списки,
  BOM DisplayEl, размер строки хранилища и точную кнопку обновления.
- Разрешение `node17:file-artifacts:output-lease-proposal:1`: отдельный output lease
  внутри существующей artifact/download инфраструктуры, без нового транспорта.
- Разрешение `node17:palette-reveal-proposal:1`: только exports.text; одна
  прокрутка точного владельца палитры внутри CREATE receipt. Проверки полного
  графа, owner/item/icon, доступной точки drop, перекрытий, отмены и срока.
- Разрешение `node17:connect-preflight-mask-proposal:1`: только exports.text;
  перед первым вызовом link.create до трёх чтений существующего bounded observe.
  Сохранены сравнение полного графа и проверки отмены/срока перед жестом.
  Незавершённый link.create повторно не вызывается.

## Наблюдения до реализации

Live UI Loginom **7.4.2 Linux**, origin `http://logi-test-plan.bg.local`,
`?testable=true`; test-2 и `/test-2` подтверждены в аватаре и хранилище.
Видимый Chromium: viewport null, inner 1508×862, outer 1508×949,
available 1512×949. Использован Node 24.19.0, отдельные source harness sessions.

Палитра `Компоненты>Экспорт>Текстовый_файл`, иконка
`bg-vendor-icon-exporttextfile`. Мастер входного соответствия →
`ExportTextFileParamsWizard` → `ExportTextFilePreviewWizard` → Done.
Конкретные selectors взяты из live DOM; pinned E2E packages.ts/node.ts использованы
для сверки жизненного цикла. Адресных export-wizard selectors в E2E не найдено.
Help прочитан по
`viking://resources/loginom-dock/sources/loginom-help/data/integration/export/txt-csv.md`.
Точка-разделитель и ANSI/ASCII из Help не обнаружены в списках Linux UI.

Skill revision `afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790`,
source package SHA `648b6893d10db335869e2f0eb2b84a5c0e6b30ef66a968bd37da6b213a014f11`,
upstream skill `51ce567d1e7c168f87277bc24fa48c522e333356`.

## Проверки разработки

Полная source suite после исправлений CREATE/CONNECT/широкого входа:
**1398 PASS, 1 SKIP, 0 FAIL** (1399 tests). После добавления запрета табличного
sample и проверки сохранённых unsupported-форматов перед Finish — **10/10**
focused tests; эти guard-изменения проверены также новым source runtime в UI.
Локальные тестовые порты разрешены для suite. Первые sandbox-only отказы
отдельно перепроверены с разрешёнными loopback-портами; они не скрыты как PASS.

Независимый Python-аудитор не импортирует handler, сравнивает все байты с
fixture, SHA/размер, поля, настройки, связь с источником, цепочку фаз,
execution/session/runtime/origin и возврат в workflow. **11/11** native cases
прошли; для каждого отклонены **9/9** подмен журнала, всего 99 отрицательных
проверок. Отдельный unittest содержит 14 подмен receipt/байтов.

| Проверка | Размер | Результат |
| --- | ---: | --- |
| Новый CSV: Unicode, кавычки, `;`, перенос внутри поля, NULL/empty | 124 | PASS |
| Typed: decimal comma, Да/Нет, дата/время, NULL | 138 | PASS |
| TSV, BOM, CRLF, без заголовка | 115 | PASS |
| 40 полей × 3 строки, labels, TSV/BOM/CRLF, последний сложный столбец | 3005 | PASS |
| Пустая таблица со схемой и заголовком | 15 | PASS |
| Пустая таблица без заголовка | 0 | PASS |
| Явная замена CSV, удаление заголовка | 109 | PASS |
| CSV после save/new session/reopen, только новый destination | 109 | PASS |
| Typed после reopen, только новый destination | 138 | PASS |
| Сохранённый Done и отменённый Close после reopen | 131 | PASS |
| Полностью новый узел на финальном source runtime, включая palette reveal | 131 | PASS |

Default reject: мастер закрыт, повторно независимо скачанные 124 байта и SHA
совпали с исходным файлом. Полный обновлённый native store `/test-2` (45/45,
loading=false) подтвердил отсутствие файлов Done и Close. После явной замены
повтор того же operation_id вернул идентичный результат при **0 browser calls**.

Публичный save_checkpoint `/test-2/node17-handler-20260913-5.lgp` подтверждён.
После logout и новой сессии сохранены GUID, входные связи, полная схема и все
неизменяемые настройки CSV/Typed; получены новые файлы с теми же ожидаемыми
байтами. Финальный пакет дополнительно сохранён; диагностические браузеры
закрыты после подтверждённого logout.

Полная матрица с SHA, execution_id, runtime, путями локальных доказательств:
[17-text-export-evidence.json](17-text-export-evidence.json). Воспроизведение
аудита: [text-export README](../../../../../packages/loginom-runtime/tools/loginom-acceptance/text-export-README.md).
Финальный source runtime:
`afc199953de8a6a7e0d1e3a04247a98e69d85d832e26d0168a06b2c0bb6b8cab`.

## Ограничения и сохранённые остановки

UTF-16, ANSI, fixed width, delimiter-space, folder connections, переменные,
несколько входов, requested mappings и файлы >16 MiB не входят в приёмку.
Сохранённая unsupported encoding/delimiter отклоняется до Finish/Execute.
NULL и пустая строка могут иметь одинаковое представление при null_marker="";
это не формат для различения этих двух значений.

Native datetime `2000-01-01 00:00:00` экспортируется как `2000-01-01`, хотя
выбран hh:mm:ss; ненулевое время `2024-02-29 13:14:15` сохраняется.
Ожидаемая typed fixture явно фиксирует это наблюдение, не обещает fixed-width
представление timestamp.

После reopen фильтр пустой таблицы требовал выполнения источника для получения
схемы. До него открытый входной мастер имел 0 полей и маску отключённой кнопки;
общий port-open консервативно оставил AMBIGUOUS. После отдельного штатного
выполнения фильтра подтверждены 0/5 строк двух выходов, оба пустых экспорта прошли.
Автоматическое выполнение upstream-графа и изменение общего mask policy не
добавлялись. Подготовка fixture должна обеспечить известную схему источника.

Ранее сохранены отдельно: wide Done без адресованной последней страницы
(исправлено), CONNECT на краткой маске до вызова primitive (исправлено),
позднее port-open на источнике без схемы (ограничение выше). Pending receipts
не сбрасывались и не переиспользовались; диагностика продолжалась в отдельных
копиях/сессиях. Прерывание во время длительного native export отдельно в live
не воспроизводилось; stop/continuation/ownership guards проверены source tests.

## Передача следующей фазе

13.09.2026: [пакет подготовки автономной приёмки](17-text-export-acceptance-preparation.md)
завершён на source25249210/runtime347615cb. Единственное review и correction
уже завершены; следующий этап — Hermes только после назначения слота координатором.
Ниже сохранён исходный порядок передачи разработки как исторический checkpoint.


Разработка завершена, следующее событие — один review в этой же app task на
Astra medium по команде координатора, затем один correction round. Повторный
полный review автоматически не запускать. Hermes `openai-codex/gpt-5.6-sol/low`
запускается только после выдачи координатором единственного слота. Ни результаты
этой диагностики, ни source tests не заменяют финальный автономный аудит.
Merge/push main/deploy/обновление общего плагина отдельно не разрешены.
Bootstrap `.gitignore`, `AGENTS.md`, runbook сохранены вне feature commits.
