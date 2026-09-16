# Node16: проект exact variant контракта

Назначение `node16:variant-contract-design:1:dc93af3f`. Основание — решение
координатора `node16-variant-contract-next-step-2026-09-13.md` в основном checkout.
**Предлагается ограниченный exact native scalar путь для Collapse через существующий
node output/user-v1. Проект и pure adapter проверены; public wiring ещё не выполнен.**

Отсутствие native32, server cancellation и server atomic snapshot само по себе
не блокирует исходную цель16. Реальные tags20/5 представляются как64-битные.
Полный узел пока не принят из-за отсутствия публичного подключения и сквозной
проверки всего результата после save/new session/reexecute.

## Четыре независимых утверждения

| Свойство | Конкретный контракт | Чего это не доказывает |
| --- | --- | --- |
| Cell exactness | Native tag + значимые bytes из fixed321; subtype берётся только из tag; JSON roundtrip сохраняет значение | Не устанавливает одновременность разных ячеек |
| Table coverage | Уникальные координаты всех R×C ячеек, полная schema, без фильтра; R≤50,C≤8, размер JSON≤1MiB | Частичная колонка Values или sample10 не равны всей таблице |
| Execution binding | Private host receipt: read_id, document/workflow/package/node/port/source, completed execution, schema/count; до/после каждого ответа и в конце | Сам по себе переданный пользователем JSON не является receipt |
| Consistency | Своя completed execution, один активный reader/операция; наблюдаемые owner/cache/schema/process identities не менялись | `atomic_snapshot=false`, невидимый ABA не исключён |

`exact_native` относится к ячейке. `read_coverage.table_complete` относится ко всей
таблице. `read_consistency` возвращается отдельно и не сводится к одному `exact=true`.
При наблюдаемом изменении весь read отвергается: нельзя возвращать успешный
префикс со значениями от разных состояний.

### Достаточность observed-local для исходной задачи

Для приёмки16 предлагается собственный статический импортный fixture, отдельные
пакет/аккаунт/browser, один локальный исполнитель, завершённый узел без текущего
выполнения и исключение новых UI-мутаций на время чтения. Это операционная граница
согласованности собственной задачи, а не глобальная транзакционная гарантия.
Чтение после нового выполнения получает новый execution/read ID; старый receipt
отклоняется. Такой профиль не снижает требование точных значений и полной таблицы.

Однако текущие evidence не доказывают невозможность сторонней серверной мутации
или ABA без видимого cache event. Pure adapter допускает только stability_basis `owned_static_completed_fixture`;
неизвестный профиль стабильности отклоняется.
`exclusive_operation` означает исключение
операций собственного исполнителя; оно не обещает исключения всех серверных
писателей. Неизвестный внешний writer, изменение входа/переменных/планировщик или
неподтверждённая неизменность результата должны означать отказ от полной
согласованной приёмки, а не только предупреждение поверх success.

Конкретный оставшийся gate перед подключением: проверить на собственном fixture
весь R×C результат в одном read при удержании локальной операции, намеренные
deactivate/reexecute/смену результата во время чтения и сохранение owner binding.
Нельзя подменить это двумя совпавшими read/hash: ABA может ускользнуть и от них.
Если требуется гарантия при произвольных внешних мутациях, fixed321 недостаточен;
альтернатива — отдельно согласованный server revision/snapshot либо неизменяемый
материализованный результат с версией, привязанной к completed execution. Такой
путь здесь не реализован и не назначен. Для исходного собственного fixture
server-wide atomicity не добавляется как обязательная цель.

## Предлагаемые ячейки user-v1

`type` остаётся типом столбца (например `variant`). Новое `cell_type` — native
скалярный subtype; `is_null` определяется tag1. `precision:"exact_native"`.
`native.tag` обязателен; unsupported tags3/4 и прочие пока отклоняются, а не
превращаются в64-битные. При появлении реального tag32 потребуется отдельный
admission; добиваться его искусственно при нормализации платформы не требуется.

| tag / cell_type | value и representation | Дополнительные точные поля |
| --- | --- | --- |
| 20 / integer | decimal string, `decimal_integer` | decimal; native.bits64, encoding signed-int64-le, bytes_le |
| 5 / real | shortest roundtrip decimal string, `binary64_decimal`; −0 это строка `"-0"` | decimal; native.bits64, encoding ieee754-binary64-le, bytes_le authoritative |
| 1 / null | null, `native_null`, is_null=true | native.encoding null; без резервных байтов |
| 8 / string | исходная Unicode string, `native_string` | native.encoding utf8, utf8_hex; только проверенный UTF-8; пустая строка не Null |
| 11 / boolean | JSON boolean, `native_boolean` | native.encoding boolean8, bytes_le00/01 |
| 7 / datetime | восемь native bytes в hex, `native_oadate_binary64_le` | decimal OADate для чтения человеком; bits64, temporal_profile, semantic_scope native_serial_only, timezone unspecified |

Datetime profile: `loginom-7.4.2-native-oadate`. Авторитетны исходные binary64 bits,
не строковый ISO и не browser Date. `civil_time_verified=false`,
`epoch_verified=false`. Неподтверждённый temporal profile отклоняется. DST gap/fold,
отсутствие timezone в payload и исторические offsets с секундами исключают
автоматическое объявление этих bytes точным epoch. Даже для диапазона0100–9999
проект не экспортирует вычисленные civil components как исходное значение.
Политика отрицательных дробных OADate отдельно не доказана, поэтому преобразование
в календарь не включено. Exact native serial удовлетворяет сохранению native
значения; интерпретация в timezone была бы отдельным контрактом.

Пример различия одинакового представления:

```json
[
  {"type":"variant","cell_type":"integer","value":"1","representation":"decimal_integer","native":{"tag":20,"bits":64,"bytes_le":"0100000000000000"}},
  {"type":"variant","cell_type":"real","value":"1","representation":"binary64_decimal","native":{"tag":5,"bits":64,"bytes_le":"000000000000f03f"}},
  {"type":"variant","cell_type":"string","value":"1","representation":"native_string","native":{"tag":8,"utf8_hex":"31"}}
]
```

Это сокращённый пример полей; реальный adapter добавляет is_null/precision/encoding.
Неиспользованные slot bytes Null/string/boolean и transport padding не являются
значением и не передаются в user-v1. Иначе пустая ячейка могла бы раскрыть
остаточные bytes предыдущего значения и давать ложные различия после reopen.

## Полная таблица и размер ответа

Существующие `sample`, `sample_rows≤10`, `sample_complete` сохраняют смысл.
Добавляются `cell_type`, `native` в каждую ячейку и поля порта:

- `exact_table:{rows:[...],complete:true}` — только если прочитаны все R×C,
  максимум50×8, JSON результата≤1MiB. Включает информационные поля и имена/метки,
  не только Values. Порядок строк/колонок привязан к исходной schema.
- `read_coverage:{cells_read,rows_read,columns_read,table_complete}`.
- `read_consistency:{kind:"observed_local",changed:false,exclusive_operation:true,
  atomic_snapshot:false,unobserved_aba_excluded:false}`.
- `binding` и `cell_precision` для связи со свежей execution и областью точности.

Например15строк: sample_complete=false, но exact_table.rows.length=15 и
read_coverage.table_complete=true. Для15значений Values в таблице15×4 полнота=false,
exact_table отсутствует. Пустая таблица требует подтверждённую schema/count0,
а не отсутствие ответов. При R>50/C>8/превышении размера exact-full запрос отказывает;
автоматических страниц/нового RPC/скрытого расширения лимитов нет. Неполный
диагностический результат может сохраняться с partial_table, но не проходит gate16.

Для будущего запроса предлагается additive `read.coverage:"full"|"sample"`, default
sample. Exact-full обязан вернуть exact_table или fail closed. Это проект изменения
node-api, не уже доступная опция. `require_exact_numbers` не переименовывается:
для variant оно требует numeric subtype/value, а полный exact scalar read включает
также строку, boolean и native date. Display fallback остаётся возможен только
при обычном запросе без требования exact-full и сохраняет явную неподтверждённость.

## Pure prototype и граница доверия

`tools/loginom-acceptance/collapse/variant-contract/adapter.mjs` не содержит RPC,
browser calls или public imports. `adaptCell` повторно декодирует saved significant
bytes и не доверяет ранее вычисленному decoded/display/Names/DataTypes.
`adaptRead` сверяет expected binding, read_id/lifecycle, координаты, размеры и
consistency inputs. Эти аргументы должны поступать из private trusted host closure;
функция сама не удостоверяет UI и не превращает JSON assertions в доказательство.

Новые read_id/workflow_id/package_id в результате fixed reader ещё не добавлены: это явное требование
будущего подключения. Table tests используют synthetic host receipts и проекцию
реальных bytes; они не объявлены live full-table acceptance. Для нулевых строк
понадобится attested empty-result branch: complete schema/count,0RPC, завершённый
lifecycle; существующий прототип raw reader сам не принимает rows0.

Lifecycle после cancel/deadline/transport ambiguity остаётся retired. Поздние
callbacks только освобождают свои буферы; следующий RPC/публикация запрещены.
Pending request buffer не освобождается по timeout. Успешный read проверяет
releasedRequests/Responses и pending0; неопределённая сессия закрывается целиком
с проверкой завершения собственного browser/process. Server cancel не обещается.

## Минимальный public integration plan и владельцы

Все изменения ниже требуют следующего назначения; в этом commit их нет.

| Модуль | Точный предполагаемый diff / владелец |
| --- | --- |
| новый client/lib/variant-native-read.mjs | Перенос только принятого fixed321 diagnostic reader; private capability, pinned frontend, read_id, завершённый lifecycle, полный guards и byte budget. Владелец node16; общий transport не менять |
| новый client/lib/variant-native-values.mjs | Pure scalar conversion из этого прототипа, strict discriminated cell validation; node16 |
| client/lib/calculator-node.mjs readOutput | После completed execution и schema выбрать bounded exact reader только для разрешённого Collapse variant. Связать Preview datasource с тем же port/table, вернуть graph и прежний cleanup; node16 с согласованием общего владельца |
| client/lib/collapse-node.mjs | Явный opt-in implementation flag для exact variant; не включать RPC всем tabular handlers |
| client/lib/table-output-values.mjs | Принимать только trusted exact supplement того же execution/schema/координат; не выводить subtype из display. Обычный scalar/UI путь сохранить; общий владелец через координатора |
| client/lib/table-output-pages.mjs | Не расширять sample10 автоматически. Exact-full отдельный bounded read; существующее horizontal paging остаётся UI sample |
| client/lib/node-result-schema.mjs | Strict union cell_type/native/representation, read_coverage/read_consistency/exact_table max50×8, sample по-прежнему≤10 |
| client/lib/user-results.mjs | Allowlist новых cell/port полей; JSON roundtrip exact_table без усечения. Проверить actual compactNodeResult, не только proposedUserPort |
| client/lib/node-api.mjs | Additive read.coverage, согласованный exact-full отказ и документация семантики native date; общий API владелец/координатор |
| client/test и tools/loginom-acceptance/collapse | Регрессии прежних handlers + independent full result audit после fresh reopen; node16 |

Нужна проверка полного public path strict schema→MCP result→actual user-v1:
проектный `proposedUserPort` этого не заменяет. В runtime.pin/frontend provenance
должны входить реальные подключённые модули. Не добавлять generic proxy/RPC tool.

## Acceptance mapping к подплану16

| Требование исходного16 | Конкретный acceptance evidence / статус |
| --- | --- |
| N×K, оба ignore_empty | Независимый ожидаемый multiset и порядок для полного R×C; Null/empty/0/false. Handler evidence есть; exact-full public повторить |
| Mixed scalars, одинаковое отображение1 | integer20/real5/string8, boolean11/date7/Null1, decimal/bytes сравнение всех ячеек.38saved cells проверены adapter; public full pending |
| DataTypes-off | Полная таблица с исключением/перестановкой поля DataTypes; subtype только tag. Существующий fixture подходит, actual user-v1 exact pending |
| Идентификаторы, одинаковые метки, кириллица | Читать все информационные/Names/DisplayNames вместе с Values; сравнить по native source name и source-row key, не по label |
| Homogeneous и wide | Сохранить scalar тип схемы; предыдущий52-row integer case не считать полным variant read с лимитом50. Для variant≤50 отдельный fixture; >50 отказ без ложного complete |
| Empty/all Null | Schema/count0 при пустом входе, полный результат при ignore_empty=false,0 при true согласно native policy; отдельная проверка empty branch |
| Mapping/roles/done/close/lost reply | Сохранённые handler checks + focused regression при wiring; read lifecycle не обнуляет mutation checkpoints |
| Save → новая сессия → reexecute | Сохранить пакет, logout/close; новый document/execution/read ID, проверить roles/mappings/ignore_empty, активировать источник, reexecute; сравнить полный exact_table до/после, не только sample10 |
| Negative acceptance | Подмена numeric1 строкой1, raw tag/bytes, native date browser epoch, пропуск последней строки/колонки, чужой port/execution/read ID, stale/deactivate/reexecute, cancellation/deadline; whole-read отказ |
| Autonomous final | Только после wiring/debugging, по отдельному Hermes slot назначению; существующий Sol/low и независимый аудит полного goal. Сейчас не запускался |

Не сравнивать message IDs, незначимые reserved bytes или execution ID как данные
между сессиями. Сравнивать всю schema, кратности/порядок по контракту, cell_type,
значимые scalar bytes/values. Новые execution IDs обязаны различаться; смысловые
native данные статического fixture должны совпасть.

## Проверки этого этапа

27 focused tests PASS, включая17 негативных случаев, JSON roundtrip/full vs sample,
отказ unknown temporal profile и отсутствие утечки reserved slots. Неиспользованные slot bytes в Git fixtures обнулены; replay сравнивает
ту же нормализацию, значимые bytes не изменены. Три SHA исходных
private artifacts сверены перед replay; независимо Python struct/UTF-8 проверены
38native ячеек. Это проверка scalar adapter и проектной сериализации, не новая live
приёмка. Новые браузеры, RPC, Hermes, public wiring, общий transport/plugin/VPS
не запускались. Доступ к памяти healthy, recall main shared actor подтверждён;
из памяти не взяты исторические ограничения native32 как новая цель.
