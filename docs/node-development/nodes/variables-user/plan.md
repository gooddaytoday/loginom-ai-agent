## Переменные сценария: real и datetime — предложение этапа 0

LAB-898, 05.11.2026. Исследовательская база: голова `origin/v040-int7`,
`353f4df461156f639e25109773034b0b12864904` (PR #748). Цель docs-PR — `v040`.
Подплана `nodes/variables-user/plan.md` в базе не было; базовый W1 описан в
`docs/node-development/variables/` и reference `variables.user.md`.
Этот раздел добавляет только исследование режима, не готовность runtime/релиза.
Решение включать ли режим в 0.4.0 принимает владелец после критериев ниже.

[Discovery](discovery.md), [приёмка](acceptance/README.md),
[карточка типа](node-card-proposal.json), [reference](skill-reference-proposal.md).
Правила работы — назначение и актуальные instructions сквада, не этот подплан.

## Предлагаемый срез

Существующий builtin `variables.user`, mode `values`, output 4:
создание и patch конечного real/binary64 и civil datetime с целыми секундами,
а также typed NULL. Вход даты — ISO local с секундами и optional .000.
Чтение и сохранение уже существующей даты — до миллисекунд. Не менять тип
существующей переменной, ID, label, порядок, неприсланные значения, lifecycle
Done/Close/Save, guards владения и отказ dirty snapshot.

Предел записи даты не равен пределу чтения: `...59.123` в исследованном
редакторе превращается в `...59.000`; непустые миллисекунды входа отвергать
до редактирования. Пустая дата в UI может стать текущим временем; API `""`
для real/date запрещён. NULL задавать только явным checkbox.
Это предложенный узкий срез, а не согласованная полная запись всех datetime.

## Критерии до правки обработчика

Полная матрица и ограничения — в acceptance/README.md. Два результата по
transactions.csv: день отчёта с границей `[day, next_day)` и доли строго выше
порога. Вторая фаза меняет только две переменные; неизменные consumers должны
дать новые результаты. Oracle Python вычисляет обе фазы независимо от Loginom.
Приёмка по стандарту: ≥2/3 модельных PASS и отдельно ≥2/3 независимых PASS
на одном SHA, typed cold полного сохранённого пакета и проверки пакетов.
Этап 0 установил native UI/cold поведение, модельные бизнес-PASS не заявлены.

Прямой real/date operand Фильтра строк потребовал бы расширять его контракт.
Он не нужен для этого среза: существующий Калькулятор поддерживает typed
variables и формулы Var.name, затем Фильтр работает по вычисленному признаку.
Если эта связка в этапе 1 требует неаддитивной общей правки — stop/blocked,
один вопрос владельцу; свои readers или обходы ограничений не добавлять.

## W2 и затрагиваемые пути этапа 1

Новая оболочка результата не нужна: `nodeVariableOutputSchema` уже содержит
`cell:anyOf[legacyCell,nativeCellSchema]`. Legacy cell описывает finite real
и `local_datetime`/millisecond; `decodePortCell` умеет Date до мс. Добавить
datetime к enum variable.type и TypeScript, real/date к metadata-map
`readVariableRecords` для `values`, datetime к preview при необходимости.
NULL проверять по ValueIsNull; DisplayValue читать как Number/Date,
не форматированный текст таблицы. Не понижать native/exact guards W2.

W2 #721 `createNativeVariantReader` принимает table source interface116
и завершённое исполнение; builtin wizard такого source/исполнения не имеет.
Не подключать к нему скрытый RPC и не выдавать wizard Date за exact_native.
Для typed semantic snapshot достаточно существующего декодера;
доказательство исходных native bytes — отдельный объём, здесь не предлагается.

Ожидаемые изменения: `client/lib/crosstable-variables.mjs` (validation,
тип 3/2, num/datetimefield, независимое сравнение real/civil, no-op с мс),
`node-api.mjs` (schema/описание), `node-output-context.mjs` (добавочные типы),
`node-result-schema.mjs` и `node-contracts.d.ts` (enum datetime), узловые тесты;
продуктовый reference/маршрут и существующие сценарии/cold expected.
`packages/agent`, общий transport/decoder Variant, deadline/budget не менять.
Новые enum/типы добавляются без смены формы envelope; если обязательные
проверки трактуют реальную правку как расширение публичного контракта,
получить решение владельца до кода.

## Оценка

**2 цикла + 1 резервный**, ориентир 120–200 строк runtime и 100–180 строк
адресных тестов, без независимой приёмки. Это оценка, код этапом 0 не написан.
Цикл 1: writer/schema/typed snapshot, create/NULL/бизнес и Save/cold.
Цикл 2: patch/identity/Close/refusals, обе фазы и регрессия старых типов.
Резерв — только под наблюдённый новый отказ и новый бизнес-прогон.
В каждом цикле — живой бизнес-прогон; лимиты модели не менять.

Размеры модели и проверки фиксируются в discovery.md. Карточка/reference
лежат только как предложения; runtime и установленный skill не изменены.
