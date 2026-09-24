> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-08d0257266de` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 13: комплект кандидата полной приёмки подготовлен

Назначение `node13:acceptance-candidate-preparation:1:5a4c46fc`.
Исходный source commit `5a4c46fc3a9eb19c0fb440c19decdd1931df7b82`, ветка
`codex/node-13-date-time`. Клиент не изменён; runtime остался
`2488fdaa08e4d6da9b7a31fb7598f675a8ad972efd65640b34cbc851feb16e2b`.
Изменения этой фазы относятся к подготовке, защитному запуску и документации.
Hermes, браузер и модель не запускались; слот не занимался.

## Решение по каталогу

Нужен новый candidate: **2026.09.13-node13-acceptance.1-5a4c46fc-candidate**.
Прежний immutable `2026.09.11-parallel-pilot.1-candidate` не переписывался.
Сохранённые bytes manifest с SHA `4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`
прошли настоящий parser клиента, но новая проверка отклонила grants
`/test-1`, `/test-2`, `/test-3`: для нового кандидата требуется только `/test-3`.
Существующий admission также явно исключает historical parallel-pilot.
Это достаточная причина отдельного кандидата; свежесть старого remote catalog
и возможность его повторного использования не заявляются.

Подготовлен детерминированный **source archive из 9 файлов**: существующий builder,
полная транзитивная цепочка его относительных импортов и четыре catalog JSON.
Каждый файл сверён с Git blob исходного source commit и текущими bytes.
Архив дважды сформирован одинаково и прочитан обратно без расхождений.
Это исходники для сборки action catalog, не локальный production bundle клиента.

- Архив: `unavailable:artifact-4be574362b6dc4b3`.
- SHA256 архива: `3daf75bb171c4297b9f7b2b013b4310555640ca9810ac07413fde923a7a5903e`.
- SHA256 source manifest: `772f5f873dbe6a95c851e258e40992540e7e3c0c9a24fc4eed11026e5b88752a`.
- [Source manifest](node13-acceptance-preparation/source-manifest.json),
  [отдельная compatibility](node13-acceptance-preparation/compatibility.json).

`manifest.json` и `compatibility.json` лежат также рядом с архивом в source-packet.
Исходный catalog compatibility в архиве сохранён побайтово; для сборки обязателен
явный файл compatibility Loginom 7.4.2/macOS/Chromium. Локальный исходный default
7.5.0-alpha не используется. Предложенный URI записан в source manifest, SHA
**будущего catalog manifest ещё неизвестен** и не заменяется SHA source manifest.

Координатор на VPS проверяет архив и все blobs, распаковывает в отдельный пустой
каталог и выполняет `build_argv` из manifest: стандартный builder, новая версия,
`--candidate --package-root /test-3 --compatibility PACKET/compatibility.json`.
`OUT_NEW_EMPTY` и `PACKET` — пути координатора. В архиве нет npm-зависимостей:
транзитивные импорты builder используют только включённые файлы и Node builtins.
Сборка, stage/readback и активация в этой фазе не выполнялись.

## Замороженные входы и проверки

ТЗ, CSV и expected **не изменены** относительно принятого исправления 10 строк:
10×4 источник; обе версии календаря 10×27; пустой календарь 0×27;
месяцы 8×3; кварталы 6×3. Все 12 преобразований по каждой из двух дат,
NULL, ручные имена/метки/порядок/исключение и обе полные ветки обязательны.
Несовместимая fixture на 12 строк не возвращалась.

[Inventory 263 файлов](../../../../packages/loginom-runtime/tools/loginom-acceptance/fixtures/date-time/inputs.json)
перезакреплён на текущие harness/auditor bytes. Независимый Gregorian oracle и основной контракт
`date_time_sales_acceptance.py` сохранены: точные значения не выводятся из actual.
Аудитор требует все результаты до сохранения, один финальный checkpoint и
переоткрытие всех шести узлов в другой сессии без перенастройки.
Добавлена обязательная связь фактического prepare со skill revision, URL и
compatibility из текущих pins. Синтетические проверки не объявлены живым доказательством.

Добавлен `date-time-direct-reopen.mjs`: явное прямое открытие точного пакета
завершённого run, проверка шести GUID, последовательное исполнение сохранённых
узлов и создание полного `diagnostics.json`. Нет SaveAs-копии или сохранения.
Он вызывается оператором внутри существующего `date-time-live.mjs` через
`reopenDateTimeAcceptance(ctx, ABSOLUTE_RUN_DIRECTORY)` после завершения Hermes.
В этой фазе adapter проверен как исходник; полный live direct-open протокол
остаётся отдельным обязательным gate **до финального Hermes**. Исторические
переоткрытия 4×27/4×8 не доказывают этот новый контракт 10×27.

## Текущие pins и защищённый запуск

[Окружение](node13-acceptance-preparation/environment.json): Node 24.19.0,
Playwright 1.63.0-alpha-2026-08-31, MCP 0.0.80, SDK 1.30.0,
Chromium revision 1243 / 153.0.8010.12. Закреплены hashes фактических executable,
Hermes source commit и весь клиентский runtime, включая native skill/adapter.
Existing ChatGPT subscription проверена без вывода или сохранения токенов;
guarded Hermes version 0.21.0 подтверждена без модели.

[Remote pins](node13-acceptance-preparation/current-remote-pins.json): заново
прочитан manifest серверного skill, проверены manifest integrity и downloads всех
его файлов. Revision `afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790`.
Frontend: текущая HTML-страница и 17 статически подключённых ресурсов, только
контрольные суммы. Это fingerprint точек загрузки; динамически загружаемые модули
целиком не покрыты. Проверка реального prepared build 7.4.2 остаётся обязательной.

Единственная точка запуска — `date_time_launch.py`. Обычный вызов без `--run`
проверяет admission и не запускает модель. `--environment-preflight --output NEW`
проверяет локальные зависимости и существующую подписку без браузера/MCP/модели.
При `--run`, до вызова модели, дополнительно проверяются актуальное окружение,
настоящий parser всех файлов candidate, exact grants/revision checkpoint и
заново считанные skill/frontend bytes против admission. Несовпадение закрывает
запуск. Затем используется прежний изолированный `run.py`, только
`openai-codex / gpt-5.6-sol / low`, без fallback.

[Admission template](node13-acceptance-preparation/admission.template.json)
намеренно не является разрешением: final HEAD, remote candidate SHA, receipts,
run_id, бюджет и слот остаются незаполненными. Числа и подписи нельзя выдумывать.
После фиксации этой подготовки final source_commit должен совпасть с фактическим
HEAD, а source archive продолжает точно описывать неизменённые builder inputs
commit 5a4c46fc. Новые harness bytes привязываются отдельным inputs inventory.

Проверки: **538 Python PASS**, настоящий public schema положительных таблиц и
отказ для 11/12 строк; source/archive readback PASS; полный inventory PASS;
запуск по template отклонён, `model_started=false`. В полном test log строка с
runtime `aaaa…` принадлежит старой mock-проверке и не является preflight;
настоящий текущий результат записан отдельно в environment.json.
Полный клиент ранее прошёл 1477 PASS / 1 SKIP на этом же runtime, повторно
в этой подготовке не запускался. Новые клиентские исправления не потребовались.

## Границы принятого и оставшиеся gates

[Evidence map](node13-acceptance-preparation/evidence-map.json) связывает R1,
manual-output, R2 и R3 с точными отчётами, commits и runtime boundaries.
Review1 **completed** (`d316b2f4`, turn `01a098ab-6821-7c20-9c9a-b6a01337a07c`);
fix1 completed (turn `01a098b7-450c-79f0-b3c5-cccc1548609c`). Новый review не нужен
для выполнения этого назначения и не запускался. `full_review:false/OPEN`
в прошлой R2-фазе означает отсутствие повторного review той фазы, а не открытый
первоначальный review или требование нового цикла.

R1 configure и R3 приняты на прежних runtime; R2 принят на текущем 2488fdaa.
Текущее восстановление 4×8 подтверждает сохранность manual configuration, но
не заменяет прежний persistence и новый полный goal. Старые FAIL неизменны.
Для admission остаётся явно привязать historical receipts через решение
координатора о совместимости либо целевую свежую regression; им нельзя молча
приписать новый runtime. Старые gate labels OPEN в historical template не
отменяют уже принятое координатором bounded исправление.

До Hermes требуются: VPS build + immutable stage/readback; current candidate
compatibility/grants; native preparation и полный direct-open/auditor live gate;
актуальная привязка regression receipts; final admission и отдельная команда
слота с run_id/бюджетом. Затем — один автономный прогон и независимый аудит
полной цели с переоткрытием. Готовность всего узла не заявлена.

Main/push/deploy/activation/plugin/routing, повторный review и node15 не менялись.
Чужие AGENTS.md/.gitignore сохраняются вне коммита.
