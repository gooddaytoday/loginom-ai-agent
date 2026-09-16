# Контракты расширения исполнителя

**Разделение current/target — 7 сентября 2026.** Новый полный `node.apply`,
пакетное описание контрактов и чтение выхода определены в
[плане](../plans/2026-09-02-loginom-dock-implementation-plan.md#public-node-contracts)
и пока не реализованы. Ниже описаны существующие механизмы; новый составной
контракт должен явно перечислять эффекты и квитанции фаз.
Старое требование `reopened=true` относится к `package.save_as` и не задаёт
поведение будущего промежуточного сохранения. Reopen мастера импортного пилота
также не становится обязательным шагом нового продуктового пути.

## Registry и версии

Локальный `client/lib/capability-registry.mjs` связывает action key, versioned
capability, фиксированный handler и effect kind. Из него строятся tool enums
и клиентский допуск. Сериализованный browser body содержит собственную таблицу
функций; host выбирает handler только по локальному registry. Новый JSON action
не добавляет исполняемую функцию. ABI manifest описывает те же пары для
серверного publisher; contract test проверяет согласованность. Старый клиент
отклоняет неизвестный action/capability до browser call.

Capability ABI 1 / executor 1.2.0 описывают четыре зарегистрированных алгоритма,
включая `node.configure_text_import` с прежним Done/reopen/readback контрактом.
Точный clientRevision всё равно меняется при правках registry/validator/body.
Добавление нового обработчика требует новой executor revision, входных файлов
session/packaging, tests и принятого каталога. Registry — не механизм загрузки
кода с сервера. Новые effect kinds ниже являются контрактом разработки;
ни одного нового handler они сами по себе не включают.

## Виды эффектов

| Kind | До изменения | Доказательство результата | Reconciliation и ownership |
| --- | --- | --- | --- |
| create | Точный контекст и исходный состав | Diff созданных объектов/портов/связей | Только объекты исходного diff; неизвестное завершение блокирует повтор |
| save | Точный пакет, путь и политика конфликта | Сохранение, закрытие, открытие того же пути и содержимого | Сохранённая receipt; один DOM-снимок не доказывает прохождение close/reopen |
| configure | Identity мастера/узла, исходные настройки и разрешённые поля | Readback применённых значений, типов и mappings | Сравнение исходных/ожидаемых/фактических настроек; закрытие мастера не означает Apply |
| delete | Точный объект и его зависимости | Отсутствие выбранного объекта плюс сохранность остальных | Diff по identity, включая incident edges; отсутствие одноимённого label недостаточно |
| execute | Версия графа, узел/пакет, исходный status | Новая execution identity и подтверждённое окончание | Timeout не перезапускает; старый зелёный значок не является новым вычислением |
| inspect | Scope, revision и границы выборки | Read-only данные с completeness/truncation | Страницы объединяются только на одной revision; нет владельца mutation |
| transfer | Разрешённый artifact SHA/size, source/destination, overwrite | Receipt и проверка байтов назначения | Частичная запись остаётся неопределённой; не трогать чужой путь при повторе |

Прежде чем включить строку, handler реализует эти условия исполняемой логикой,
а независимая приёмка проверяет данные и сохранность. Текст в таблице не
заменяет реализацию pre/postconditions.

## Поддерживаемый subset схем

Action definitions schema version 1 принимают только `type`, `description`,
primitive `enum`; для object — `properties`, `required`, `additionalProperties:false`;
для array — `items`; для string — `minLength`, `maxLength`, `pattern`; для
number/integer — `minimum`, `maximum`. Типы keywords, конечность границ,
порядок границ, enum types/duplicates и вложенные schemas проверяются при
допуске. Неизвестный или неуместный keyword отклоняется. `$ref`, `oneOf`,
defaults, object enums и произвольные расширения не поддерживаются.
Обязательные и разрешённые поля проверяются по собственным свойствам объекта.

Оболочка outcome проверяет identity, status, phase, effect_possible, output,
error и trace. Успешный outcome не может содержать ошибку или объявлять
`goal_verified=true`; успешный domain output дополнительно проходит schema
действия. `effect_possible` описывает возможность UI-эффекта и не доказывает
предметный результат: открытие и отмена диалога могут дать NOT_APPLIED.
Раздельный versioned proof для gesture/domain/settings/data/completeness и
goal obligations ещё требуется для завершения P1.

## Подсказки восстановления

`recovery_options` содержит только реальные значения strategy инструмента
`dock_operation_recover`. Наблюдение и UI repair представлены в `next_steps`
с именем tool, известными arguments, недостающими required_fields и requires.
`id_roles` явно отличает новый request ID от исходной pending operation:
у recover исходный ID — `operation_id`, у UI repair — `recovery_operation_id`.
Это подсказки, а не разрешение обходить runtime guard. Неизвестная receipt
оставляет только observe/inspect; cleanup failure требует restore_control.


## Раздельный блок проверки v1

Клиент возвращает второй JSON-блок `dock_outcome_verification`, связанный с
operation/action и SHA исходной квитанции. Оболочка проверяется до классификации;
предметный успех требует совпадающего локального handler, output schema,
подтверждённого cleanup и postcondition trace. Save дополнительно требует
reopened=true и наблюдения открытого пакета. Исходная квитанция не меняется.
Блок фиксируется в execution journal перед возвратом; отказ записи не стирает
уже завершённую операцию, а возвращает явную недоступность блока.

Поля gesture/domain_effect/observation/settings/data/goal разделены. UI gesture
не повышается до domain effect; нынешний DOM readout всегда bounded, даже если
все известные truncation flags false. Settings/data пока not_checked, а goal
not_verified с пустыми obligations: в текущих трёх actions нет проверки этих
обязательств. Будущие handlers должны добавлять проверяемые evidence contracts,
а не просто менять эти строки. Валидатор блока повторно вычисляет все claims
по bound receipt и отклоняет произвольное повышение.

Приёмка с `--require-verification` независимо проверяет доставку, поля и
соответствующую запись журнала. Digest блока сохраняется и сверяется с журналом;
аудитор этой проверки не переинтерпретирует JSON-number serialization для
повторного вычисления SHA. Unit contract проверяет повторное связывание digest.
Это доказательство заявленных границ действия, не аудит всех данных сценария.

Effect contract v1 теперь реализован в effect-contracts.mjs и ABI: все семь
kinds проходят структурную валидацию; существующие handlers дополнительно
закрепляют resource. Новые kinds не добавляют новых handlers автоматически.
