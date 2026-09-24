> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-ee264a7bc0a4` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node14: native-save candidate preflight, 2026-09-13

Команда: `node14:native-save-candidate-preflight:1:921f5d51e78cd190f1352900ee755fee9c2b614759b46b04595e3dc34537a483`.

Проверка подготовки завершена без модели. Production source остаётся
`c32a5d5e163fe174afba59abce973ac405742cdc`, runtime —
`a9db4113ac69d38d7227e971ece3652acf3e1bf836723e6e577917eda916406f` (156 файлов).
Изменены только упаковка каталога, goal/fixtures manifest, диагностические
harness/verifier и документация. Полная автономная приёмка остаётся не выполненной.

## Candidate и упаковка

Версия `2026.09.13-node14-test4.1-candidate`, manifest
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node14-test4.1-candidate/manifest.json`.
SHA manifest `921f5d51e78cd190f1352900ee755fee9c2b614759b46b04595e3dc34537a483`.
Байты локальной копии server-candidate сверены с manifest, manifest также прочитан
через зарегистрированный Dock MCP. Свежие source MCP сессии закрепили этот же SHA.
Compatibility: Loginom7.4.2, macOS, Chromium, ru; E2E
`2cad5602158fd2e4836d821d644a2b8d92f571a2`, оба save-root только `/test-4`.
Candidate staged, не activated; server/current и общий клиент не переключались.

В exporter добавлен tracked `packages/loginom-runtime/executor/capability-abi.json`, который publisher
импортирует при старте. Новый packet-v2 содержит11 файлов; publisher `--help`,
publisher import и builder import прошли в изолированно извлечённом комплекте.
Локальный build/stage не выполнялся. Старый10-file packet-v1 сохранён.

## Исправление startup и сохранение покрытия

Реальный старт полного набора из9 CSV был отклонён до prepare: production
`admitStartupArtifacts` допускает не более8. Старый неуспешный запуск сохранён в
`unavailable:artifact-c7adeaf37ccbc2d2` вместе с первоначальным
`full-goal-mcp.json` и `full-goal-startup-blocker.json`.

`reordered.csv` содержит те же3 строки, что `precision.csv`, в другом порядке
полей. Теперь «Точные числа» и «Перестановка» используют один и тот же pinned CSV;
у Missing Values «Переставленные поля» явно задано входное сопоставление
Note,Untouched,Count,Id,Amount и одинаковые метки Same у Note/Amount. Имена и типы
различных полей сохранены. Исторический CSV не удалён: тест сравнивает прежние и
новые expected, включая все значения, порядок, метки и Null; отличается только
SHA источника. Сохранены9 импортов,12 финальных Missing Values,14 содержательных
этапов, Done/Close/preserve и все случаи threshold/precision/empty/source-change.

Тест реального admission принял8 файлов;9 по-прежнему отвергнуты. Mapping проверен
по production API schema. Новый полный model-free prepare прошёл с8 artifacts в
user-v1: session `69006a92-7487-4a34-9607-5bc81cd6727f`, document
`1789274297139-0bh09fsj2tl8`. Отдельная initialize/list_tools сессия осталась idle.
Evidence: `unavailable:artifact-8c09bfd0bd5eec85`.
Порядок и метки нового варианта goal ещё должны пройти полный автономный сценарий;
успешный startup не является выполнением его12 результатов.

## Native save и независимое переоткрытие

Component session `a9d5d907-f6bd-4443-92bf-6b9cc253c86c`, document
`1789273118522-a05656u26wu`; evidence
`unavailable:artifact-8ea5b8912633e465`.
Три CSV доставлены штатно с проверкой байтов. Созданы2 импорта и2 Missing Values;
input/output autosync=false. У первого импорта заменён core.csv на changed.csv
с тем же GUID, затем тот же Missing Values выполнен с parameters={}, inputs=[],
mappings=[]. Среднее Amount стало20 вместо5, настройки и связь сохранены.
Второй результат —120 строк, threshold0, один пропуск из120.

`package.save_checkpoint` revision2 успешно сохранил новый файл
`/test-4/packages/Node14-native-20260913-071823-64a944c0.lgp`.
Проверены полный native trace, точный путь и неизменный граф. Операция не закрывала
и не переоткрывала пакет. После неё оператор отдельно закрыл именно этот пакет;
свежая observation подтвердила отсутствие package_identity, узлов и диалогов.

Отдельный reader открыл сохранённый пакет в новом document
`1789274036912-olu13mhqp5d`, прочитал настройки импортов с Cancel, затем выполнил
существующие Missing Values с parameters={}, inputs=[], mappings=[]. Полностью
прочитаны4×5 и120×5, всего620 ячеек; значения, Null, schema, policy, threshold,
оба mappings, GUID и две связи прошли независимые проверки. Исходные raw table
receipts также сопоставлены с каждым значением и номером строки. Источники после
Cancel были inactive, после выполнения зависимого узла — active; execution IDs
новые. Source bytes после reopen повторно не скачивались: связь с ними доказана
предыдущими upload receipts и сохранённым source path/format/schema.
Evidence: `unavailable:artifact-cd7224ec76e98868`; итог
`unavailable:artifact-c9ae04c5761ac2e5` (`passed=true`,
`scope=native_component_diagnostic`, `model_started=false`, `full_goal_accepted=false`).

Geometry-wrapper проверен в настоящих source MCP prepare: viewport=null,
inner1508×862, outer1508×949, available1512×949. Reader также проверил своё окно.
Все собственные диагностические процессы завершены. Общие браузеры и runtime
не перезапускались.

## Изменения независимого verifier и проверки

Live-журнал выявил отсутствующие правила для закрытия output-port wizard и
диалога строковой замены Missing Values. Добавлены точные проверки node/port,
opening-operation, поля и record ID, диалога, разрешённых контролов и masks.
Отрицательные тесты отклоняют чужой owner/port/field, неверный stage/dialog,
отключённое/числовое поле, лишние controls и truncated value.

Reader получил отдельный `--component-run`: проверка вычисляется из фактического
source journal, node/source evidence и native-save/close receipts. Не создаются
искусственные Hermes usage, pre-audit PASS или full-goal acceptance; обычный
`--pre-audit` сохраняет прежний полный gate. Повторный аудит component прошёл.

517 Python-тестов и2 Node admission/API-теста прошли. Syntax и diff checks прошли.
Полная client suite не повторялась: production не изменён; прежние1432/1SKIP
относятся к предыдущей проверке production pin, а не к этому этапу.

Общий overwrite→close случай `package.save_as` принадлежит Node12. Здесь был
новый путь и `package.save_checkpoint`; исправление или прохождение overwrite
не заявляется. Hermes не запускался; новый слот требует команды координатора.


## Фиксация

Harness и отчёт зафиксированы коммитом `3c999b30a483790d5367f9e78e7bc865e3a38cd3`.
[Финальные pins](missing-values-native-candidate-pins-2026-09-13.json) содержат
новые goal/fixture/harness SHA и SHA каждого основного receipt. Свежий source
preflight подтвердил395 build inputs, совпадающих с этим коммитом, и прежние156
runtime inputs; отдельный subscription/dependency preflight прошёл без модели.
Исторические preparation pins и старые отрицательные receipts сохранены.
