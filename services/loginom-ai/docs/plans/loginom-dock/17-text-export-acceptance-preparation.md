# Node17 Text export: пакет подготовки автономной приёмки

**Обновление после проверки координатора:** запуск закрыт из-за отсутствия
независимого byte-read между reject и replace. [Точный blocker, guard и вариант
решения](17-text-export-reject-baseline-gate.md). Подготовительные PASS ниже
не закрывают этот gate и не разрешают Hermes.

13.09.2026 завершено назначение `node17:acceptance-preparation:1:25249210`.
Подготовлены цель, fixtures, ожидаемые байты, независимый аудитор и условия
единственного будущего Hermes-прогона. Модель не запускалась, слот не назначался.
Повторное полное review не проводилось. Финальная автономная приёмка не закрыта.

Обработчик остался в source `2524921058b29db0e79e9a188ec7bb8fa9ef9d8c`;
клиентские файлы относительно него не изменились. Подготовительный harness
закоммичен `21e4b978052dcd38169eef6bdd7f93582162d4aa`.
Runtime: `347615cbae29323d80b57488b794ecce607b5b9e0d2fbe86aa88b7460241311c`.
Все 155 входов runtime и 245 входов harness проверены после фиксации; совпали.
Ветка `codex/node-17-text-export`, task `01a09a36-695b-7da0-b7ca-1ec521afa17e`.

[Полный manifest и доказательства](17-text-export-acceptance-preparation.json).
Предыдущие [разработка](17-text-export.md) и [R1/R2](17-text-export-fix.md)
остались отдельными фазами с собственными SHA и доказательствами.

## Полный объявленный goal

[Текст задания](../../../tools/loginom-acceptance/goals/text-export-node-complete.txt)
передаётся Hermes через существующий `run.py`, без нового интерпретатора сценариев.
22 полные операции: три импорта, фильтр пустого входа, четыре новых экспорта,
patch пустого файла и TSV, default reject, explicit replace, Done, Close,
после save/reopen три сохранённых импорта, фильтр и четыре сохранённых экспорта.
Отдельно три доставки fixtures, save_checkpoint, явное save_as/reopen и итоговое
save_checkpoint. Никаких зашитых старых GUID в задании нет.

[Контракт fixtures и байтов](../../../tools/loginom-acceptance/fixtures/text-export/contract.json)
содержит три исходных CSV и семь независимых golden outputs. Имена файлов
формируются из уникального run ID; source bytes и golden bytes раздельны.
Golden outputs не загружаются вместо результатов Loginom.

| Случай | Размер | Существенные свойства |
| --- | ---: | --- |
| CSV | 124 | 5×3, Unicode, кавычки, перенос внутри строки, пустая строка, NULL |
| TSV | 115 | Без заголовка, BOM, CRLF |
| Typed | 138 | 3×5, integer/string/real/boolean/datetime, запятая, Да/Нет, NULL |
| Wide | 3005 | 3×40, полный состав строковых полей, особые метки первого/последнего |
| Empty | 15 | Пустая таблица с заголовком и полной схемой 3 полей |
| Zero | 0 | Настоящий пустой файл без заголовка |
| Changed | 131 | Сохранённый Done: запятая, метки, BOM, CRLF; Close отменён |

SHA-256 каждого golden файла, типы и параметры находятся в contract.json.
Native datetime в полночь остаётся датой без времени — подтверждённое поведение
Loginom 7.4.2 Linux, а не обещание fixed-width timestamp.
UTF-16/ANSI/fixed-width/переменные/соединения с папками/requested mappings,
несколько входов и файлы >16 MiB остаются вне заявленного scope.

## Новые live gates на исправленном runtime

Loginom 7.4.2 Linux, `http://logi-test-plan.bg.local/app/?testable=true`,
исключительно test-2 и /test-2. Каждая диагностика — отдельный source session/profile.
Оба окна: viewport:null, inner 1508×862, outer 1508×949. Отдельный test-2 вход
и его хранилище подтверждены текущим UI. Source harness не использовал Hermes.

1. Новая сессия `.dock/text-export/live-1789303099350` открыла исправленный
   `/test-2/node17-review-fix-20260913.lgp`. CSV, typed, wide и прежний Done
   выполнены с inputs=[], mappings=[] и только destination patch. Для CSV
   независимо сравнён baseline именно исправленного source, включая GUID,
   полный mapping, все параметры кроме пути и свежий execution_id.
2. В той же текущей сессии созданы/проверены новый CSV, TSV patch, empty и zero.
   Фильтр Empty сначала выполнен с parameters={} без перенастройки: выходы 0/5.
   Полное сравнение 8 файлов, их схем/источников/событий прошло, 72 подмены
   event evidence отклонены. Это текущая матрица, не переименование старых логов.
3. На новом CSV применён Done с запятой/метками/BOM/CRLF; затем Close с другими
   параметрами. Execute не запрашивался; файл Done и файл Close отсутствовали
   в полном обновлённом native store. Подготовительная копия сохранена отдельно
   как `/test-2/node17-preparation-20260913.lgp` через public save_as.
4. После logout/закрытия первого браузера новая сессия
   `.dock/text-export/live-1789303884824` открыла именно подготовительную копию.
   Changed/typed/wide/zero выполнены только с новым destination. Для всех четырёх
   совпали GUID, вся входная схема и mapping, сохранённые параметры; документ и
   выполнение новые. Все байты совпали с golden. Empty перед этим повторно
   выполнен с parameters={} и дал 0/5. Никакой скрытой перенастройки мастера нет.
5. Внешний аудитор проверен на этих реальных новых receipts: 4/4 PASS.
   Шесть подмен (runtime, старая session, неполный inventory, неожиданный Done-файл,
   скрытая перенастройка, чужой baseline GUID) отклонены без изменения оригиналов.
   Последний полный native store содержал 67/67 записей, сохранены все entries;
   оба конкретных Done/Close пути отсутствуют. Файлы других задач не изменялись.

Default reject, explicit replace и независимое повторное скачивание baseline
уже проверены в correction round на том же runtime 347615cb. Эти доказательства
сохранены в `.dock/text-export/live-1789301890244`; они не относятся к старому
runtime afc19995. R1/R2 исходные FAIL сохранены. Историческая wide/empty матрица
разработки не используется вместо перечисленных новых gates.

Пакет подготовки после проверки сохранён через public save_checkpoint и закрыт.
Форма входа test-2 подтверждена, второй браузер закрыт. Последний save сам по себе
не повышает persisted_content_verified: доказательство persistence — отдельное
переоткрытие и сравнение предыдущего сохранённого состояния выше.

## Независимый аудитор и проверка harness

`text_export_acceptance.py` проверяет goal/pins, фактические model usage и auth
policy, публичные вызовы/результаты, доставку/входные байты, все 22 операции,
file evidence, целиком байты и типы, source links, отказ/Done/Close, сохранённые
импорты и экспорты. Требуется отдельный `--external-dir` именно будущего model-run;
эта подготовительная диагностика не может закрыть тот gate.

Внешняя часть читает raw receipts/events/native files новой session и полный
inventory; PASS-флаги из стороннего отчёта не заменяют их. Проверка отсутствия
требует count=total=len(entries), а не только видимых строк или фильтрованной
выборки. Manifest внешней сессии и порядок сбора описаны в
[text-export README](../../../tools/loginom-acceptance/text-export-README.md).

Пройдена 21 целевая Python-проверка: новые fixtures/параметры запуска/persistence,
user-result verifier, byte auditor, subscription и runtime preflight. Внутри
byte-аудитора — 14 отрицательных byte/receipt случаев; в проверке сохранности —
7 отрицательных вариантов. На шести реальных текущих результатах независимая
Python-проекция совпала с настоящей JS user-v1, включая file_artifacts/Done/Close.
Полный агрегатор автономной приёмки ещё не испытывался на новом model-run;
его итог до реального прогона и внешней проверки остаётся pending.

## Immutable candidate и допуск

Повторно прочитаны из Dock manifest, actions, selectors и source-index:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json`.
SHA manifest: `bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a`.
Все четыре хеша совпали; стандартный pinActionCatalog прошёл проверку.

Каталог достаточен для candidate-запуска с текущим source: link.create совпадает
с проверенным локальным primitive; save_as/save_checkpoint имеют /test-2, отличие
от локального source — только roots/revision. Current source cards показывают
candidate_node_apply_available=true для imports.text, exports.text и filter_data.
`catalog_add_available=false` у exports.text/filter_data означает отсутствие
этих типов в старом низкоуровневом node.add; это не разрешение вызывать node.add
с выдуманным enum. Используется штатная отдельная полная source node.apply.
`full_node_apply_available=false` и acceptanceVerified=false сохранены: production
admission не заявляется. Новые VPS build/stage и source packet не нужны.

Реальный источник MCP прошёл initialize/list_tools без prepare, входа или модели;
доступны node.apply/wait/status и artifact delivery. Отдельная проверка auth/runtime
также прошла. Два первых MCP precheck отказали из-за подготовки операторской папки:
runtime browsers и режим 0700 не были воспроизведены полностью. Третий запуск
в новой корректной приватной папке прошёл. Исходные отказы сохранены; клиент,
VPS и credentials для обхода не менялись.

Два поздних диагностических чтения full inventory остановились по timeout
старого TF-2: после закрытия пакета новая файловая вкладка получила TF-3.
После read-only inventory контекста прочитан TF-3 без повтора неизвестного
продуктового действия. Ошибки аудитора, запущенного до появления нового receipt,
означали missing evidence и не были представлены как успешная проверка.

## Замороженный будущий запуск и оставшиеся gates

Один будущий прогон: openai-codex / gpt-5.6-sol / low, существующая ChatGPT
подписка Hermes 0.21.0; timeout 3600 секунд, max_turns 100, fallback отсутствует.
Auth guard `existing-hermes-no-refresh-or-import-v1` запрещает refresh и import
из Codex CLI. Перед запуском повторить штатный read-only preflight: токен должен
сохранять предусмотренный harness запас срока; при отказе не менять провайдера
и не вращать shared refresh token в копии. Node 24.19.0, MCP 0.0.80,
Playwright 1.63.0-alpha-2026-08-31, Chromium 1243 / 153.0.8010.12, SDK 1.30.0.
Hermes skill SHA `b9c0c5a9d09cbcc2e1f6d93dc41206f0d3837c517fcf970d4d2d787f4edf4872`.
Adapter `0.1.0-rc.4-acceptance`; отдельные home/state/profile/artifacts, test-2,
visible maximized/viewport:null. Clipboard остаётся на общем штатном lock.

После отдельного назначения слота команда использует `run.py --run` с
`--goal text-export-node-complete --model-profile chatgpt-sol`, явно указанными
URL/test-2/storage, URI/SHA выше, `--timeout 3600 --max-turns 100` и закреплённым
Node. До назначения допустим только `--preflight --output NEW_FILE`.

Оставшиеся gates и владельцы:

- Координатор проверяет этот пакет и выделяет единственный Hermes-слот;
  новый запуск не должен пересекаться с другой приёмкой.
- Координатор обеспечивает место для evidence перед запуском: на момент
  завершения осталось около 2.6 GiB, ранее уже был ENOSPC. Старые FAIL/evidence
  разработчик не удалял. Это конкретное ограничение среды для будущего прогона.
- В выделенной фазе повторить свежие auth/source/harness/catalog и MCP gates;
  изменение любого source/harness pin требует новой фиксации, не переноса PASS.
- Только будущий полный Hermes-run, его публичные receipts и независимое
  переоткрытие в новой сессии могут закрыть автономную приёмку. При неуспехе —
  адресная диагностика, без автоматического повторного review или обхода модели.

Main/push/merge/VPS/общий клиент/memory routing не менялись. Общая actor memory
доступна; найденные исторические записи не использовались как новая готовность.
Устойчивые lessons этой фазы относятся только к node17/component.exports.Text,
source 25249210/runtime347615cb: сохранность доказывается destination-only
повторным экспортом в новом документе и новой session; полнота inventory требует
всех записей и свежего владельца вкладки. Их закрепление — в этом документе и
штатном capture завершённой фазы, без ручной записи в restricted peers paths.
