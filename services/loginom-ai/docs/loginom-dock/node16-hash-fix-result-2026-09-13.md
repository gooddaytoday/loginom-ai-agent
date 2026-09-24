> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-090cb015ef92` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16: отпечаток схемы до первого выполнения

Статус: **локальное исправление проверено; полная автономная приёмка НЕ пройдена**.
Source: `b0709ec0f6f820a8988f4683297388894813935e`.
Runtime: `e4e9ecbea5242cd403351fb5e4d5feaec38d18edfb7355f520985b752bed78a3`.

Третий Hermes run `20260913-205733-a38816e5` остался FAIL/-15: девять случаев
278 ячеек подтверждены, но Close перед wide остановился на пустом native schema
fingerprint. Его request, scenario, evidence и исходный audit сохранены с SHA256.
Новый model run не запущен; слот освобождён координатором и передан другому узлу.

В отдельных собственных UI-сессиях Loginom 7.4.2 установлено: после Done перед
первым выполнением effective columns имеют usage=1 (Undefined), а сохранённые
ColumnDefs — 192 (Information/Transposed). GetColumnsHash(1) возвращал пустой
Uint8Array, хотя существовали 25 полей. GetColumnsHash(1|192) на тех же объектах
вернул 20 байтов. Добавлен наблюдённый getter ColumnDefs.get_PresentUsageTypes;
обе маски проверяются и включены в retained snapshot signature. Пустой hash
непустой схемы по-прежнему отклоняется. Маски повторно сверяются после await.
Это наблюдаемая стабильность, **не атомарный снимок или монотонная версия**.

Проверено на свежем source harness `unavailable:artifact-fbef31390fc4e63b`:

- Новая собственная копия и тот же проверенный wide CSV; источник выполнен.
- Новый узел `eeca59ac-f0f8-44b4-abca-8bb3872921f0`: Done с Id + M1…M24.
- Close с другим флагом и только M24: SUCCEEDED/discarded, без выполнения.
- Повторное чтение: все 24 роли, ignore_empty=false, оба mapping сохранены.
- Execute и full output: независимый замороженный case oracle подтвердил
  48 строк × 4 столбца = **192 ячейки**. Для сравнения использована явно
  диагностическая проекция raw результата; это не Hermes или user-v1 MCP run.
- Настоящий retained snapshot: columns=1, definitions=192, hashed=193,
  20 байтов, mutation_calls=0, acquired/released=105/105.
- Existing negatives: conflict/empty отклонены до браузера; missing дал
  NOT_APPLIED/effect_possible=false/cleanup=true, native node/ports/graph прежние.
- New negative missing: только port click/F3/preview close; proof и исходные
  observation/signatures связаны, схема полная, graph before/after совпал.
- Сохранён `Node16-hash-fixed-complete-20260913-205733.lgp` в выделенном
  `/test-1/node16-20260913-a56c2488`. Save completed; независимое повторное
  открытие именно этой копии в данном диагностическом этапе не заявляется.
- Upload/download managers пусты, logout=true, harness закрыт; процессов
  собственной live-сессии после закрытия нет.

22 focused client tests PASS; полный клиентский набор **1525 PASS / 1 SKIP**.
Повторного полного review не проводилось. Future auditor: 28 отрицательных
семантических подмен отклонены; отдельно 14 runner/admission tests PASS.
Повторный разбор исходных данных подтвердил те же 9 случаев и 3 negatives,
но не превратил прерванный run в full PASS. Дельта verifier описана в
`services/loginom-ai/tools/node16-audit-reevaluation/README.md` и отдельных versioned reports.

Для coordinator staging подготовлен минимальный пакет
`unavailable:artifact-0630aec25a3bb8bd`: 184 записи, 1 957 088 байтов исходников.
Все записи tar сверены с manifest; относительно предыдущего candidate изменены
только три production-файла collapse-existing-input*. Credentials, `.dock` и
тесты в пакет не включены. Четыре ранее разрешённых служебных acceptance-файла
сохранены без изменений; новые файлы verifier остаются локальными.
Manifest SHA256: `b9d4db257d419c997171f1bbdd58a5908ebefe536659b7967910b17e1c61e82a`.
Tar SHA256: `d795ee74825b270d152d9ba253e4b6218047af5a2ca91e17efb192b0677e6a08`.

Следующие gates: новый candidate stage/readback у координатора → свежий
настоящий user-v1 MCP rehearsal → новое назначение эксклюзивного Sol/low слота →
полный Hermes goal → 10 независимых свежих открытий и current-run loss audit.
Старый stage/rehearsal не признаётся допуском нового runtime. Main, сервер и
общий установленный plugin не менялись. Node16/subplan/hermes_acceptance=false.

## Candidate3: новый допуск

Координатор назначил `node16:hermes-full:4:b0709ec0` и слот
`node16-hermes-20260913-3b74bd5f`. Candidate manifest SHA256
`3b74bd5f23b400542dcdcb300495406541a5e298feef4c7caeefd3c6c6f4284f`;
server stage/readback 4 PASS, без activation. Свежая actual MCP user-v1 сессия
`badf4b51-7932-44f5-ad62-bac26a96dc4a` в
`unavailable:artifact-3ebf931a1b2ab1b3` подтвердила READY7.4.2, runtimee4e9,
manifest/action/selectors и только выделенный storage root. Окно1508×862,
outer1508×949 при available1512×949; viewport=null/start-maximized.
Проверочный bridge/browser закрыт, процессов этой сессии нет. Обновлены только
служебные stage/admission/harness pins, production source не менялся.
