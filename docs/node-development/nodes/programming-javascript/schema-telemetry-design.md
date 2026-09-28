# JavaScript: code-side metadata и физический выход

Дата: 2026-09-28. Выбранный дизайн source96; runtime admission и live ещё не выполнены.
Полный [план](plan.md) и обязательные G/J сохраняются. Этот документ не объявляет
готовым публичный handler и не закрывает прежние одноколоночные D cases задним числом.

## Основание и выбор

[Metadata diagnostic](metadata-diagnostic-design.md) source94/95 проверил границу
настоящих selectors. В source95 прошла принадлежность model port своему узлу,
но engine Socket и model Socket оказались разными native objects. Наблюдение
сохранено в [checkpoint](checkpoint.md); причина различия пока не доказана.

Равенство этих внутренних объектов не является требованием конечного handler.
Для проверки generated names требуется наблюдать API внутри JS и фактический
выход. Предлагается перейти к подготовленной двухколоночной telemetry вместо
очередного изменения equality guards ради успешного engine metadata diagnostic.
Текущие source94/95 guards и старые evidence не меняются. ROOT сверил конечный
socket audit и выбрал этот путь для реализации в прежней developer задаче.

В штатном `TabForm.js` (retained fix47, строки1676–1748) FindEnginePort подтверждает
кандидата через асинхронный `bg.IsEqualObjects(P.Socket,W.Socket)`. Эквивалентность
этого вызова сравнению `$OW/$O` не доказана: реализации в конечном проверенном
наборе нет. Поэтому несовпадение raw IDs не доказывает несвязанность объектов,
а прохождение Number/Name/Index не заменяет штатную проверку. Исследование этой
внутренней связи отложено; текущий telemetry путь её не вызывает и не утверждает.
ROOT проверил6audit sources по SHA; private receipt
`operator96-root-socket-audit-verification.json` закрепляет пути и hashes.

## Фиксированные пробы

Private proposal `schema-telemetry-proposal-01/manifest.json` подготовлен ROOT;
его SHA256 `1685c64ef2b0e34fb538b069b8ce939e751e9a249b6f72ae7d50eccd24ded6ea`.
Пять отдельных источников: control, cyrillic, space, leading-digit, unicode-label.
Перенос в runtime-каталог сохраняет точные source bytes/hashes. Node syntax check
не является проверкой ChakraCore; первый live допускается только для control.

Вход — прежний integer-safe: один Value/Value/Integer, четыре строки. Скрипт
читает Get(1,"Value") и проверяет -9007199254740991, один раз AssignColumns задаёт
два столбца: исследуемый Integer/index0 и String/index1 `__JS_Metadata`.
Снимок реальных GetColumn(Index,Name,DisplayName,DataType) выполняется до Append
и после записи Integer. JSON со снимками записывается во второй столбец.
Он содержит probe_id, version1, column_count2, before/after. Requested literals
не выдаются за наблюдённые имена. Различия before/after сохраняются.

Это отдельное семейство с явным discriminator/source hash/owner. Не расширять
существующие C/D/calibration IDs, не принимать произвольный JS и не включать
старый engine metadata diagnostic одновременно с telemetry.

## Физическая схема и чтение

Существующая Preview binding удерживает datasource D и FColumnInfosStore своей
открытой таблицы. Для telemetry output требуется ровно два наблюдённых поля в
порядке0/1 с типами Integer4/String5, одна строка. Полные фактические Name/DisplayName
берутся из этого поля metadata cache и фиксируются в binding; не подставляются
из запроса или из telemetry JSON. Provenance — наблюдаемый Preview cache,
`bridge_verified=false`; это не доказательство native D.ColumnDefs, derived
datasource либо P↔D identity. Для before/upstream прежний одноимённый
одноколоночный Value guard сохраняется.

Удерживать обе field-object references и точные scalar metadata snapshots;
проверять их до/после чтения вместе с прежними node/port/source/Done/process,
datasource/cache/session/cookie guards. Перестановка/смена поля, label/type/name,
замена datasource или source digest даёт отказ. Новый observed-name путь допускается
только фиксированным telemetry case; обычный reader не становится permissive.

Native321 читает ровно одну строку × два индекса0/1 через уже проверенный decoder.
Сохранить соответствие request/response, ownership, timeout, release accounting,
retirement и отказ неизвестным тегам. Не читать через UI formatting или eval JSON.
Существующие транспортные/JSON byte limits не ослаблять; проверить реальную
сериализацию максимально допустимого telemetry payload и явно отказать при
превышении, без обрезания. Telemetry JSON ≤8192 UTF-8 bytes; строки metadata
≤128 UTF-16 units/512 UTF-8 bytes. Проверка структуры не должна игнорировать лишние
поля, дубликаты индексов, отсутствующие/повторные свойства или неподдержанные типы.

## Независимый результат

Проверить исходные4cells, выход Integer=-9007199254740991 и полный String JSON,
затем неизменный upstream4cells. Физическая схема и code-side before/after должны
сохраняться раздельно. Их равенства/различия вычисляются как наблюдения; не требовать
заранее угаданной нормализации и не утверждать общую native identity слоёв.
Представление bytes Integer проверяется независимым oracle.

Результат остаётся point-in-time/observed-local: не доказывает атомарный server
snapshot, отсутствие ABA, состояние после сохранения либо порядок внутреннего
переименования. Отказ AssignColumns/исполнения не превращается в успешную
characterization только по строке ошибки. Старые одноколоночные D cases остаются
отдельными not_run до собственного решения по их evidence.

## Приёмка реализации

Локальные tests должны исполнять реальные binding/reader/driver boundaries:
успех2cols, чужой source/case, неверные count/index/type, drift обоих полей,
NULL или неверный native tag, malformed/oversized JSON, lost ACK, timeout/late
completion, отсутствие повторного Execute и прежняя cleanup policy.
Regression прежних одно-колоночных cases обязательна. Отдельные unit fixtures
не заменяют successful actual driver integration и независимый ROOT audit.

После frozen candidate, review и tests ROOT выполняет один fresh headed control.
Дальнейшие четыре sources допускаются только после его проверки, каждый со своим
fresh profile/evidence. Не запускать новую error calibration. При uncertainty
сохраняется исходный report и выполняется отдельная разрешённая recovery без replay.
