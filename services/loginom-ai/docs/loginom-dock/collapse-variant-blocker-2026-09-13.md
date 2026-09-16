# Узел16: граница точного чтения variant

2026-09-13, Loginom7.4.2, ветка `codex/node-16-collapse-columns`, базовый SHA
`a3b419bde8a660e1905284ee62a46362d5a49e09`. Это диагностические результаты
незавершённого кандидата, не приёмка main/установленного клиента.

Адресная проверка по команде координатора
`node16:variant-ui-followup:1:live-1789276952774` выполнена в собственной
сессии test-1. Каталог `/test-1/node16-20260913-a56c2488`.
Набор `Node16-types-off.csv`, SHA256
`5f3583e562ddda79e6eeff1029c4d3733f4b260faf5c162ea1bd3b0ada61b235`.
Исходные scalar-значения проверены штатным точным Table reader после импорта.

## Наблюдение

Новый узел `Node16TypesOff`, GUID `b0378a62-24a4-4a3e-9882-707594b98ce6`,
выход0 `4ba0e2c2-69ad-3a32-bbdc-75714efe7a51`.
Роли: Id,Zone информационные; S,I,R,B,D транспонируемые в этом порядке;
игнорирование Null выключено. DataTypes действительно исключён в выходном
мастере, настройка подтверждена Done, узел выполнен вручную диагностом.
Preview показывает15строк и ровно Id,Zone,Names,DisplayNames,Values;
локальная FColumnInfosStore подтверждает Values DataType6, DataTypes отсутствует.

В уже загруженном FDataTable.FDataSourceStore (Ext.data.BufferedStore) записи
имеют собственные поля data/session/internalId/id/phantom/joined/store.
В data только пять выходных колонок и $id; самостоятельный subtype в проверенных собственных data properties не найден. Это не доказывает отсутствия любого иного UI-пути Loginom.
Records704/705/706 содержат соответственно строку"1", JS number1 и JS number1
для исходных S/I/R. Два последних результата неразличимы по собственному
значению и metadata записи. Схема Values сообщает только variant.
Names→тип входа пригоден для контрольного сравнения, не доказательство типа
фактически прочитанной variant-ячейки.

Date record708 — настоящий Date без собственных дополнительных полей:
epoch1709240398123, ISO2024-02-29T20:59:58.123Z, локальные компоненты
2024-02-29 23:59:58.123, timezoneOffset−180. Миллисекунды НЕ потеряны в Preview.
Также сохранены real1.2345678901234567, integer2147483647 (подтверждённый
пример, не утверждение полного диапазона integer), false, пустая строка и Null.
Отсутствие integer/real discriminator достаточно, чтобы строгий контракт
DataTypes-off оставался непроходимым. Для integer вне безопасного диапазона
JS точность этим опытом не доказана.

Обращений к native RPC, fetch/selectAsync, getters proxy/$self не было.
Диагност использовал собственные уже загруженные UI data properties и стандартные
Date.prototype методы. Reader продукта с догадками не добавлен.

## Доказательства

Локальный каталог `.dock/node16/live-1789278261737/`:

- `import-types.json`: публичный импорт с точными scalar-значениями.
- `apply-types.json`: роли успешно настроены обработчиком; output mapping
  остановлен после исключения: общий verifier ошибочно требует исходную метку
  у новой exclusion-записи. Исторический AMBIGUOUS не переименован в успех.
- `browser-992.json`, `mapping-failure.json`: exclusion_source с исходным
  DataTypes/«Типы данных», исключённая запись DataTypes/DataTypes/integer.
- `excluded-execute.json`: диагностическое Done и выполнение.
- `preview-local-types-off.json`:15локальных записей, scalar/Date значения.
- `preview-bound-evidence.json`: native owner node/port, полная пятиколоночная
  схема, собственные ключи записей и привязка к тому же загруженному store.
- `preview-owner-native.json`: ограниченная инвентаризация локальной UI-модели.

## Минимально необходимый новый read-контракт

Для полного exact variant_io нужен отдельно согласованный источник, возвращающий
для каждой ячейки native discriminator (boolean/datetime/real/integer/string/Null)
и lossless scalar payload, независимо от отображаемого DataTypes. Числа должны
сохранять native integer decimal и достаточную real representation, datetime —
локальные компоненты с миллисекундами и явной семантикой времени.
Ответ требуется связать с Loginom version, document/workflow/node/output port,
execution freshness, schema identity, offset и row identity; проверять неизменность
владельца до/после чтения и не менять output mapping. Конкретный transport/API
пока не выбран и не реализован. Raw native RPC остаётся за пределами разрешённой
архитектуры. Независимая часть handler продолжается.

## Адресно установленная точка потери и техническая опция

Прочитаны три статических frontend-файла по URL из document.scripts собственного
браузера (только GET JavaScript, не native API). Локальные копии в
`.dock/node16/frontend/`. Точные SHA256:

- `rpc.js`: `afeb91811a02da1f7841fb8c03e3003686c98a051f09186af082a3c44a12b4cc`.
- `bg.rtl.rpc.js`: `11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973`.
- `bg.model.rpc.js`: `53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f`.

В `rpc.js:4248` TBGMessageDynamicData.ReadVariant читает Int16 xVarTypeIndex,
затем преобразует типы3/20 (целые) и4/5 (real) в обычное значение xResult;
в строке4331 возвращает только xResult. Date7 декодируется из OADate.
Именно здесь discriminator исчезает из результата этого decoder; аналогия с
наблюдаемым Preview подтверждена, но полный caller-chain Preview до этого метода
не установлен. Нельзя утверждать, что Preview всегда использует именно его.

В `bg.rtl.rpc.js:39419` реально объявлен IBGDataSource.AsVariant(Row,Col),
remote method321/interface116. Он получает ответ через DispatchMessageAsync,
вызывает ReadVariant, освобождает raw response и отдаёт primitive.
Вызов AsVariant напрямую потому НЕ исправит discriminator; собственный reader
должен получать tagged payload до ReadVariant и читать integer bytes без
промежуточного JS Number. Простое подключение данного proxy запрещено текущим
контрактом и технически недостаточно.

Reviewable опция: отдельная version-pinned capability read_variant_cells с
фиксированными bounds/owner/execution checks и read-only native transport,
который читает именно tagged binary response метода321 до преобразования.
Декодировать whitelist native variant tags, запрещать interface/unknown tags,
сохранять signed integer decimal из bytes, binary64 representation и OADate
со строго проверенной локальной семантикой. Метод321 здесь — конкретный
кандидат источника, не проверенное end-to-end решение: нужны подтверждение
соответствия исходному типу variant, диапазонов и типов, разрешение нового
read-контракта и отдельные transport/ownership/negative/live tests.

Альтернативная пассивная capture-точка до ReadVariant у обычного UI-запроса
могла бы избежать самостоятельного native чтения, но требует доказать связь
каждого сообщения с конкретной ячейкой и owner; сейчас такая связь и transport
не установлены. Никакая перехватывающая обёртка не установлена, RPC не вызван.
Адресное исследование остановлено на этих подтверждённых исходниках.
