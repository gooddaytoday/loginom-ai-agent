# LAB-61 — дизайн initial draft refusal

Цель: выполнить неизменённый initial TASK через компактный user-v1, сохранив создание и закрытие собственного draft и известный отказ до настройки. Это новая версия измеряемого продукта от exact2e990, не утверждение об успехе текущей CLI.

## Контекст и варианты

Ben01a14b0e независимо подтвердил отсутствие публичного пути. Новый запрос без columns отклоняется в validateTextImportNodeParameters до target; configureTextImportFields также строго требует полный контракт. Существующая ветка ImportInitialSettingsError для пустого existing node умеет закрыть owned draft, но не создаёт его. Исходные TASK/input и ожидания Ben сохранены.

1. Выбран: узкий путь в существующем imports.text/new. Он сохраняет одну составную операцию, текущий каталог user-v1 и строгий native proof. Изменяет измеряемую CLI, поэтому требует новой версии и независимого source review.
2. Отдельный публичный blank-draft creator потребовал бы нового API и дополнительного lineage между вызовами; текущая задача этого расширения не требует.
3. Признать ранний request.validate или ослабить checker проще, но это убирает исходное требование создания/закрытия draft. Такой вариант не выбран и не разрешён.

## Граница и поток

Публичные tool names и signatures сохраняются. Иначе валидный новый imports.text с полным исходным source/format и отсутствующим свойством columns получает специальный исход initial-refusal через существующий guarded target lifecycle. Сначала проверяются форма, ограничения, upload identity/lineage и остальные admission условия. Не допускаются произвольные неполные/malformed запросы, columns=null/[] и неизвестные поля как обход первоначальных guards.

После принадлежащего операции создания/open своего draft исходные настройки остаются неизменными, настройки не дополняются columns. До любых source/format/column setters, Apply, mapping, Done или Execute формируется типизированный initial refusal и выполняется существующее bound owned close. Native journal связывает исходную операцию, новый target, owner/graph/wizard и доказанное закрытие. Подтверждение на уровне настроек не скрывает факт временного создания target.

Unknown effect, потеря owner, смена graph, транспортная неопределённость, отсутствие подтверждения close и expiry сохраняют правдивые unsettled/effect/cleanup состояния и обычные guards. Не продлевать исходный deadline, не повторять неизвестный жест, не создавать второй browser context или общий creator. Валидный полный new import и существующие partial update/format epoch пути сохраняют поведение.

## Тесты и поставка

Адресный RED на exact2e990 показывает недостижимость нужного lifecycle; GREEN нового candidate проверяет всю составную операцию через реальные функции и явно тестовые native fixtures. Проверяются omitted/empty/null × done/execute/close, lineage/owner/intent, запрет settings/Apply/Execute, верный native close, его сбои, неопределённость, expiry, complete-new и existing-patch regression. Только fixtures не являются live proof: после независимого Ben review нужны отдельные immutable build/admission и новый настоящий reference.

Первые действия Rich только offline. Установленные2e990/d6/helper/config/AppArmor не меняются. Nine ready reference сохраняют старую provenance, reference14/product0 и исходные FAIL остаются историей. Новый product всех10 выполняется позднее на новой версии после gates Evaler; full acceptance остаётся отдельной стадией.

## Контроль подготовки

- [x] Прочитаны current card/runbook/checkpoint, исходный TASK, exact validators/driver и независимый Ben review.
- [x] Необходимые уточнения определены исходным TASK и поручением владельца; выбор технического устранения делегирован координатору.
- [x] Рассмотрены три варианта; выбран минимальный lifecycle в существующей операции.
- [x] Дизайн представлен в беседе; текущая owner-автономия применяется без повторного запроса того же scope.
- [x] Дизайн сохранён вместе с явным новым initial-scope, не расширяющим задним числом42f7.
- [x] Подготовлен отдельный план и сохранена нативная цепочка Evaler→Rich→Evaler→Ben→Evaler.
