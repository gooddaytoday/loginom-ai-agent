# JavaScript: bounded Date/civil identity proposal

Статус: **дизайн проверен координатором; реализация назначена, live ещё не выполнен**. Основание
исходников: `7982cc35425efbac15d5c225893bd7a1544b5491` (source72).
Runtime, tests, fixtures, config и private evidence этим документом не меняются.

Координатор сообщил завершение source72: safe integer — 12 native cells,
exact PASS; outside-safe — 9 cells, characterized, `9007199254740993` превратилось
в `9007199254740992`, exact PASS=false. Оба cleanup 3/3, browser lease CLOSED.
Это контекст следующего среза, а не самостоятельно повторённые здесь live проверки.
Date/civil и полный G5 остаются открытыми.

## Фиксированный предмет проверки

Единственный private selector — `civil-datetime`, таблица `Value`, 3×1,
native schema type 2 / `datetime`, JS `DataType.DateTime`:

1. `null`;
2. `2024-02-29T23:59:59.123`;
3. `2026-03-29T01:59:59.999`.

Источник — `fixtures/operator-only/typed-cases.json`, case `civil-datetime`;
SHA256 `35dd2d1e145ff186b83582b8981af3e8510cfbc53cd078ae660d2bbfb4fd1046`.
Требование — одновременно exact native serial bytes и civil components,
включая миллисекунды, без implicit UTC conversion. Дата 29 марта не задаёт
часовой пояс или DST. Не добавлять Date API matrix, locale/Intl/Date.parse,
epoch arithmetic или произвольные типы/размеры таблиц.

## Что уже существует

Все пути ниже относительно репозитория.

| Источник | Наблюдаемая возможность и граница |
| --- | --- |
| `packages/loginom-runtime/client/lib/text-import-procedure.mjs`, `validateSettings` | Явный тип datetime разрешён; format имеет только decimal_separator, delimiter, null_marker, text_qualifier. Date mask, locale и timezone не задаются. |
| `packages/loginom-runtime/client/lib/text-import-readback.mjs`, `textImportConfigurationReadback` | Проверяет наблюдённые source/format/columns/mapping и применение wizard. Не доказывает семантику date parser. |
| `packages/loginom-runtime/client/lib/text-import-node.mjs`, import readOutput | После собственного completed Execute открывает Table, настраивает precision, читает и восстанавливает формат, возвращается в graph. Есть execution/port/read receipts. |
| `packages/loginom-runtime/client/lib/node-output-procedure.mjs`, `openNewOutputTable`, `configureTablePrecision`, `verifyTableDateTimeFormat`, `restoreTablePrecision` | Активный output обязателен; reader не исполняет inactive node. Маска `yyyy-mm-dd hh:nn:ss.zzz`; подтверждаются поле и применённый формат. Table creation/navigation/formatting — реальные UI effects. |
| `packages/loginom-runtime/client/lib/table-output-values.mjs`, `decodeTableOutput` | Проверяет маску и календарь, ровно три цифры миллисекунд; выдаёт local_datetime, precision=millisecond, timezone=unspecified. Не использует Date.parse/UTC. При недоказанном формате добавляет datetime_display_precision. |
| `packages/loginom-runtime/client/lib/variant-native-decode.mjs`, `decodeVariantFrame` | Tag7 содержит finite binary64 и восемь LE bytes с logical offset2; temporal_semantics=unverified. Tag1 — NULL; transport padding не является value oracle. |
| `packages/loginom-runtime/client/lib/variant-native-values.mjs`, `adaptCell`, `adaptRead`, `temporalProfile` | Date допускается только с exact profile `loginom-7.4.2-native-oadate`; иначе unknown temporal semantics. Выход native_serial_only, civil_time_verified=false, epoch_verified=false, timezone=unspecified. |
| `packages/loginom-runtime/tools/loginom-acceptance/javascript-native-input-driver.mjs`, `createJavascriptNativeInputSupport` | UI INPUT читается до native INPUT; имеются verifyNativeInputUi, provenance, onProof. Нужно связать полную civil attestation с native baseline до JS. |
| `packages/loginom-runtime/tools/loginom-acceptance/javascript-native-input-contract.mjs`, `verifyNativeInputRead` | Сейчас adaptRead не получает dateProfile; fixed cell oracle не поддерживает Date. |
| `packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-contract.mjs`, `javascriptNativeRoundtripProbe`, `verifyNativeRoundtripRead`, `verifyNativeRoundtripOutcome` | Есть fixed Data-only identity source и повторная проверка raw evidence. Date profile/civil oracle отсутствуют; outside-safe relaxation относится только к integer. |
| `packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-driver.mjs` | Native Preview → bound read → lifecycle → exact proof → journal ACK → cleanup. Независимого civil OUTPUT чтения нет. |
| `packages/loginom-runtime/tools/loginom-acceptance/javascript-execution-runtime.mjs`, `readPassive` | Пассивный Table read с precision/restoration и private JS output opening существует, но его fixed sales oracle или mismatch/discovery ветви не являются Date 3×1 contract. Не переиспользовать без выделенного fixed Date пути. |

Особенно важно: `precision.numbers_verified` не удостоверяет datetime.
Нужны явное отсутствие datetime limitations и проверка каждого non-NULL cell.
Для одного столбца dialog readback может быть pending; требуется подтверждённый
applied_format из привязанного Table cache, а не только введённая маска.
Восстановление первоначально пустого datetime format имеет отдельный путь;
receipt восстановления обязателен.

Исходник `tools/loginom-acceptance/node-import-done-live.mjs` содержит пример
импорта `29.02.2024 23:59:58.123` с datetime column. Это source-only precedent
с другим значением и прежним compatibility profile, не доказательство Ubuntu
admission данного среза. Нельзя подменять им canonical `23:59:59.123`.

## Get/Set проходит через Date bridge

`references/js_node_loginom_system_prompt.md`: DateTime=2; описание Set требует
Date object для DateTime, Get/Set signatures включают Date. Поэтому прямой
`OutputTable.Set("Value", InputTable.Get(row,"Value"))` по документированному
API семантически пересекает native → JS Date → native boundary. Это вывод
из API, **не проверенное устройство server implementation** и не raw byte copy.
Отсутствие `new Date` в probe не отменяет bridge conversion.

Предлагается сохранить существующий Data-only identity template, выбрав
DataType.DateTime: AssignColumns, цикл по RowCount, Append перед Set и прямой
Get. Не добавлять Date literals, parsing, getTime, toISOString, UTC/local getters,
ручное округление или timezone correction. Фактические object identity,
prototype, epoch, local getter semantics и округление bridge здесь не доказаны.

## Admission и неизменяемый baseline до JS

Предложение для будущего fixed CSV, ещё не созданного и не проверенного:

```text
Value
__JS_NULL__
29.02.2024 23:59:59.123
29.03.2026 01:59:59.999
```

UTF-8, delimiter `;`, qualifier `"`, NULL marker `__JS_NULL__`, explicit
datetime/Непрерывный. DMY lexical form выбран по существующему source precedent;
до live необходимо закрепить его bytes/hash. Преобразование canonical civil
строк — только перестановка компонентов, без Date constructor/parser.
Нельзя автоматически пробовать альтернативные форматы или менять expected
values после результата. Точная civil проверка — обязательный admission gate.

После единственного import Execute, **до создания JS**, проверить:

- Полную 3×1 datetime schema, row order, NULL отдельно, filters off, complete
  sample; обе civil строки точно canonical, включая `.123` и `.999`.
- Применённую millisecond mask, per-cell precision, owner/execution/port,
  Table creation/settings, успешные restoration и return-to-graph receipts.
- Native INPUT: NULL tag1; два tag7 с finite 64-bit serial и восемью LE bytes.
  Разрешать существующий dateProfile только в fixed private Date contract
  после civil admission. Не добавлять пользовательский profile/RPC selector.
- Один и тот же document/workflow/node/port, completed import execution,
  исходный CSV/config/source pins и неизменность dataset между двумя чтениями.
- Сохранить полный civil proof и raw native proof, их digest, read IDs,
  source/execution associations в immutable baseline с exact journal ACK
  **до JS creation/execution**. Не брать baseline из будущего OUTPUT.

Native serial bytes нельзя вычислять из предположенного OLE epoch. Root
`typed-native-oracle.json` не содержит предвычисленного date oracle и требует
захват bytes с проверенного native INPUT. У native projection оставить
civil_time_verified=false и epoch_verified=false; independent civil attestation
хранить отдельно с явной связью, не переименовывать serial-only proof в epoch proof.

Если импорт не создаёт точные civil значения, остановить семейство до JS.
Native constructor/editor или подготовленный package — отдельное будущее
исследование provenance; доказанного fallback здесь нет. JS-generator не
заменяет независимый INPUT.

## Предлагаемый bounded run после отдельного допуска

1. Зафиксировать fixture/source/runtime pins; выполнить INPUT admission выше:
   civil read, затем native read, immutable ACK.
2. Проверить текущие source/node/edge/runtime guards; создать fixed identity
   JS, выполнить ровно один explicit Execute и подтвердить fresh completion.
3. Прочитать полный civil OUTPUT через отдельный private passive Table path;
   восстановить формат/graph и проверить неизменные owner/execution/cache.
   Затем выполнить существующий single-use native OUTPUT read из 3 cells.
4. Прочитать civil upstream повторно; восстановить graph, проверить guards;
   native upstream read из 3 cells сравнить с исходным baseline. Сохранить
   исходную связь compact/full execution receipts, не заменить свежим snapshot.
5. Итоговый verifier заново проверяет все raw native/civil evidence,
   associations, journal ACK и owned cleanup. Всего 9 native cells и 9 civil
   cell observations, без повторного native replay для получения удобного результата.

Table navigation может изменить controller/cache identities. Совместимость
этого порядка с удерживаемым input dataset **не доказана live**. До/после каждой
UI фазы проверить удержанные bindings, graph/source/execution и dataset.
При изменении — refusal, не rebind/refresh baseline и не повторное исполнение.
Два связанных наблюдения не доказывают atomic server snapshot; сохраняются
ограничения observed_local, no_server_snapshot/unobserved ABA.

Успех возможен только при exact civil match canonical на всех стадиях,
native significant bytes OUTPUT/upstream равны INPUT, NULL сохранён,
полные coverage/ownership/lifecycle/cleanup подтверждены. Предлагаемый статус
`civil_and_native_identity_observed`, g5_complete=false. Epoch/timezone по-прежнему
не установлены. Civil совпал, bytes изменились — exact identity FAIL;
bytes совпали, civil изменился — civil/association FAIL. Никаких tolerances,
millisecond rounding waiver или integer characterization exemption для Date.

## Необходимые будущие изменения

Следующие файлы находятся в `packages/loginom-runtime/tools/loginom-acceptance/`:

- `javascript-native-fixtures.mjs`, новый `fixtures/javascript-native-input-civil-datetime.csv`:
  один fixed selector, 3 строки, datetime/type2/DateTime, canonical civil oracle,
  immutable CSV hash; без предсказанных serial bytes.
- `javascript-native-input-contract.mjs`, `javascript-native-input-driver.mjs`:
  строгий civil admission, association с raw native proof, explicit private
  dateProfile, frozen pre-JS baseline и его ACK.
- `javascript-native-input-binding.mjs`, `javascript-native-input-read.mjs`,
  `javascript-native-roundtrip-binding.mjs`, `javascript-native-roundtrip-read.mjs`:
  bounded fixed enum/type2; сохранить все существующие owner/source/count/once guards.
- `javascript-native-roundtrip-contract.mjs`: DateTime identity, проверка
  baseline, profile, всех трёх пар evidence и exact native/civil outcome.
- `javascript-native-roundtrip-driver.mjs`, `javascript-execution-runtime.mjs`,
  `javascript-live.mjs`: private civil OUTPUT/upstream orchestration, full
  receipts, cleanup и финальный report. При необходимости выделить единый
  owner/read/restore helper `javascript-native-datetime-civil.mjs`; не расширять
  generic discovery/mismatch или public descriptor ради Date.
- `javascript-native-roundtrip-owner.mjs`: проверить совместимость инвариантов;
  менять только при доказанной необходимости, не ослаблять retained identity.

Переиспользовать shared text-import, node-output, table-output, variant-native
и private JavaScript output-opening primitives без изменения, где возможно.
Существующий decoder/profile gate достаточен для serial-only bytes; публичное
расширение Date semantics не требуется.

## Отрицательные проверки и последующая приёмка

Будущие source tests должны отвергать неправильные schema/type/tag/rows/order,
NULL как пустую строку, неверную дату/месяц/leap day, отсутствие/truncation ms,
Z/offset, чужую или только введённую mask, pending applied format без proof,
datetime limitation при numbers_verified=true, неизвестный dateProfile,
неверные source/port/execution associations, baseline после JS, journal ACK drift,
cache replacement, native byte drift при одинаковом civil, civil drift при
одинаковых bytes, неполный lifecycle и неизвестный cleanup.

Планируются fixed Date contract tests и расширение Python fixture audit только
для CSV/civil lexical equivalence — без изобретённого epoch oracle. Сохранить
проверки прежних real/bool/string/integer срезов и public deny boundary.
Тесты в этом design-only ходе не запускались.

Перед full roundtrip рекомендуется отдельный root-owned INPUT-only admission
в новом назначенном профиле. Если exact INPUT gate закрыт, JS не создавать.
Затем отдельный root-owned roundtrip и независимый audit raw 9 native cells,
civil receipts, исходных compact/full execution, pins/journal/cleanup.
Scalar native auditor сам по себе не доказывает civil semantics и association.
Профили и команды запуска этим документом не назначаются. Реализация требует
следующего поручения координатора; текущая работа заканчивается proposal.

## Допуск реализации координатором

Root сверил существующие node-output/table-output, private input/roundtrip drivers
и границы temporalProfile с source72. Назначен Fix73 в прежней задаче/worktree:
реализовать ровно указанный fixed Date/civil slice и адресные source tests.
Root владеет commits, профилями и headed live. Сначала отдельный input-only
admission; full roundtrip — только после проверки точных civil/native INPUT.
Приватный root civil-datetime-preflight.json содержит независимые canonical
components, не ожидаемые serial bytes. Общие G1–G7/J01–J27 остаются в силе.
