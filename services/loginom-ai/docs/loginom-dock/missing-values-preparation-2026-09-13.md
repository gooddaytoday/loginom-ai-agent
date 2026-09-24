> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-17faf0b2fe6c` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node14: пакет подготовки автономной приёмки

Подготовка завершена до внешнего server-stage gate. Hermes не запускался,
автономная приёмка и native save /test-4 не объявлены пройденными.

Команда: `node14:acceptance-preparation:1:c32a5d5e163fe174afba59abce973ac405742cdc`.
Source/code: `c32a5d5e163fe174afba59abce973ac405742cdc`.
Harness/goal/auditor: **`2bb2bcd620626f06b965412e5e549e559b0d8440`**.
Runtime не изменился: **`a9db4113ac69d38d7227e971ece3652acf3e1bf836723e6e577917eda916406f`**, 156 файлов.

## Передача для VPS

- Архив: `unavailable:artifact-a7938edcb1b999d5`.
  SHA256 `ab94339d26a497cbf467d19b9758c4937911ef40e0e40463ef0ec8b0f59a25a4`.
- Пофайловый manifest: `unavailable:artifact-fa93e474f763ec7a`.
  SHA256 `d3766d8cf818aa1f1ebb73939ef047f498321a746a162fdb361a0431330dc7fe`.
- Воспроизводимый exporter: `packages/loginom-runtime/tools/loginom-acceptance/node14/build_packet.py`.
  Экспортированы **10 tracked файлов точного code commit**, а не рабочий каталог.
  Все байты и полный состав повторно сверены после извлечения. Зависимости
  штатного builder импортированы без сборки. .env, профилей, секретов и
  node_modules в архиве нет.
- [Команды build/validate/stage и readback](../../../../packages/loginom-runtime/tools/loginom-acceptance/node14/VPS.md).
  Версия `2026.09.13-node14-test4.1-candidate`, allowed_roots обоих save actions
  строго `/test-4`; Loginom7.4.2/macOS/Chromium/ru, E2E
  `2cad5602158fd2e4836d821d644a2b8d92f571a2`, node.add DataRecovery.
  Отсутствие immutable версии перед сборкой проверяет координатор.
  `publish-action-catalog.py --stage --validate-only` включает обязательный stage flag.

Сборки каталога на Mac, stage на сервере, переключения current не было.
Реальные URI/SHA и stage-report вернёт координатор после VPS build/readback.

## Goal, fixtures и независимая проверка

[Матрица допуска, команды запуска и порядок сохранения/повторного открытия](../../../../packages/loginom-runtime/tools/loginom-acceptance/node14/PREPARATION.md)
отделяют старые targeted/fault checks от обязанностей обычного Hermes.
[Естественное задание](../../../../packages/loginom-runtime/tools/loginom-acceptance/goals/missing-values-complete.txt)
охватывает все заявленные методы/границы, а не прежний финальный3×5.
В пакете остаются **12 результатов и9 импортов**. Среднее и константа проверяются
на14 содержательных стадиях, дополнительно Done/Close/preserve после отмены.

Закреплены9 CSV и независимый Decimal oracle: положительное/отрицательное
округление Integer, Float precision, среднее вместо медианы, Null/empty/literal
null/zero, активные поля, пороги40/41/42 и0 с1/120, all-null100, empty,
перестановка с Same, смена константы и файла у того же источника.
Expected вычисляется без handler и без чтения его результата.

API возвращает максимум10 строк образца. Goal явно требует полного результата
малых наборов и count+доступного образца для12/120; полного просмотра больших
наборов от Hermes через несуществующий инструмент не ожидается. После сохранения
отдельный reader читает **все строки всех12 результатов**, включая12/120.
Фиксированное sample_rows==10 не является условием полноты малого набора.

`missing_values_acceptance.py` проверяет естественный prompt/hash, provider/model,
подписочную защиту, public calls, raw node/configuration/execution evidence,
реальные upload bytes, настройки и версии источников, исходные GUID, mappings,
полный набор стадий и граф, финальный checkpoint и отдельные reopen/full rows.
Нативные настройки связываются с наблюдениями; итоговые ячейки — с raw строками,
портом и новым запуском. Отсутствующее evidence оставляет passed=false.

Обычный Hermes делает **один финальный package.save_checkpoint**. Save As/reopening
не включён в natural goal и не заменяет checkpoint. Затем
`missing-values-reopen.mjs` открывает точный сохранённый path с новым document ID,
проверяет источники с Cancel и выполняет те же узлы с parameters:{}, inputs:[],
mappings:[] без перенастройки из goal. Реальные saved readbacks и полный выход
проверяются отдельно. Лишние wizard reopen в нормальном пути не требуются.

`missing-values-client.mjs` снимает read-only geometry с точной будущей Hermes
MCP page после реального prepare; не меняет product code, не повторяет жесты,
не расширяет инструменты модели. Аудитор связывает рабочую session с prepare/
journal, допускает дополнительные metadata только при доказанном бездействии
precheck session. Правило len(metadata_sessions)==1 не копировалось.

## Закрытый live gap

На неизменном runtime в отдельном test-4 браузере выполнены:
первый существующий Node14 → полное чтение3×5 → загрузка другого CSV → изменение
файла **того же импорта** → повтор Node14 с parameters:{} → полное чтение4×5.

Evidence `unavailable:artifact-b506391b5fcded85`, session
`6dd781f2-25c4-4715-be64-208c932ce569`, тот же Missing GUID
`de695a64-b435-4bbd-ad4e-7a94852498d3` и Import GUID
`f6b59238-84e2-4e59-9a8f-c865e89d3893`.
Execution до: `1789269837824-gpzttd345a:187:1`, после:
`1789269837824-gpzttd345a:187:6`. Независимые **20/20 ячеек** совпали,
средняя нового Amount равна20; прежняя средняя не использована. CSV имеет
проверенную загрузку; `source-change-audit.json` и исходные requests/outcomes/
полные таблицы сохранены. Это проверка обычного пересчёта, не сериализованного
обученного состояния. Последнее остаётся частью native-save/reopen gate.

Новый CSV оставлен в собственном test-4 как evidence:
`/test-4/node14-preparation-6dd781f2-25c4-4715-be64-208c932ce569.csv`.
Исходный CSV не менялся, пакет закрыт без сохранения диагностических изменений,
собственный браузер завершён. Отложенный вопрос сохранения потребовал отдельно
прочитать точный диалог и выбрать «Не сохранять»; общий save/reopen код не менялся.

## Проверки и pins

- **514/514 Python tests PASS**, включая6 новых компонентных тестов и отрицательные
  подмены session/window/raw cells/checkpoint trace. Лог
  `unavailable:artifact-2894ced6206eeea1`.
- Синтаксис новых JS/Python проверен, `git diff --check` PASS.
- Source preflight: **395 build inputs совпали с HEAD**, runtime156 совпал с c32.
  `unavailable:artifact-32d9524fa31fec22`.
- Реальный subscription/dependency preflight **PASS без модели/MCP/browser**:
  Hermes0.21.0, существующая openai-codex/gpt-5.6-sol/low, fallback запрещён.
  `unavailable:artifact-93d42070dca00ed6`.
  Предыдущие precheck receipts не перезаписывались. Проверка без manifest URI/SHA
  подтверждает среду, не ещё отсутствующий candidate.
- Полный клиент повторно не запускался: production inputs не менялись и совпали
  с ранее проверенным runtime (1432 PASS/1 SKIP в recovery-этапе).
- [Полные хеши source/harness/goal/fixtures/preflight/архива](missing-values-preparation-pins-2026-09-13.json).
  Goal `b23bd28be3640c797524e5e485dda3025b41d11e6ca9547a90e298290b13ff07`;
  fixture manifest `32f4088c70c53b480f734656c292006d08a58fe70448778c23be8c6ffe4219c7`;
  canonical harness inputs `7fce82e8a05572e82d17ac598c3adcd7ce722650ec8917252caf67db7e462189`.

## Оставшиеся gates

1. Coordinator VPS build → stage → readback настоящих URI/SHA, без current switch.
2. Отдельный native save test-4 и полный candidate preflight. Старый каталог не
   используется для обхода корней. Измерение будущего Hermes-окна ещё впереди.
3. Отдельный слот Hermes; естественный goal и обязательный финальный checkpoint.
4. Независимый новый browser/open/execute/full rows всех12 результатов и final PASS.
   Geometry wrapper/полный reader/auditor пока не имеют end-to-end evidence на
   будущем candidate; локальные компоненты и синтаксис не заменяют это evidence.

Получено уведомление координатора: у12 save_checkpoint прошёл, save_as после
подтверждения перезаписи остался AMBIGUOUS; причина sticky mask не доказана.
Общий дефект при подтверждении исправляет владелец12. При воспроизведении в
будущем native14 сохранить зависимость12; параллельной правки или заимствования нет.
Слоты освободились, но выдачи14 не было — модель не запускалась.

Configure recovery13 не дописывался, ветки не сливались. Shared memory здорова,
использован actor targeted recall; routing не менялся. Повторного review,
push/merge/deploy/activation/shared plugin update не было. Чужие `.gitignore`
и `AGENTS.md` оставлены вне коммитов.
