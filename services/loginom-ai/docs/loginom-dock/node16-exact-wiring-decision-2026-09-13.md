# Узел16: границы подключения exact variant к результату

Основание: проект7e1bbab9 и изолированная диагностика bff616f3/dc93af3f.
Координатор рассматривает подключение только в ветке16/source runtime, без общего
плагина/production и без объявления полного узла принятым.

Разрешаемая граница после проверки проекта:

1. Сначала подтвердить live полный R×C read собственного статического fixture
   под локальной блокировкой операции, completed execution и проверкой owner/
   port/schema/cache/process до/после. Намеренное изменение отклоняет весь read.
   Профиль стабильности выводится из проверенного состояния и происхождения входа,
   а не пользовательского флага или заранее написанного receipt. Невозможность
   подтвердить такой профиль оставляет exact-full недоступным для этого сценария.
2. Затем подключать перечисленные проектом модули только для Collapse opt-in.
   Fixed321/interface116 остаётся private capability. Вызов не становится общим
   RPC tool/transport; native/frontend pins входят в runtime provenance.
3. Additive read.coverage=full|sample с прежним default sample. Full обязан
   вернуть все R×C в exact_table или явный отказ; sample≤10 не меняет смысл.
   Лимиты50×8/1MiB проверять на фактической сериализации полного результата,
   запрещено скрыто усекать ответ. Пустая таблица требует независимого count/schema
   и завершённой execution, а не отсутствия RPC responses.
4. Native subtype только из поддержанного tag; int64/float64 lossless JSON,
   значимые bytes, без reserved slots/padding. Datetime — native OADate bytes
   с явным native_serial_only, без ложного civil/epoch. Unsupported отказывает.
5. Trusted supplement должен создаваться внутренним driver и связываться с
   execution/read ID/port/schema/координатами. Не принимать клиентский JSON как
   доказательство. Проверить фактические result schema/MCP/compactNodeResult.
6. Сохранить обычные scalar readers и guards/cleanup/recovery/save других узлов.
   После cancel/deadline/неопределённого callback нет поздней публикации или
   следующего чтения; закрытие только своей сессии не меняет старый checkpoint.
7. После wiring — все клетки/типы при DataTypes-off, empty/Null, reexecute/change
   negatives, save/new session/reexecute и независимое сравнение полного результата.
   Регрессии общего read/result пути обязательны. Hermes только отдельным слотом.

Observed-local consistency не является server atomicity. Неизвестный внешний
writer/динамический источник/непроверенная стабильность исключают этот профиль;
флаг atomic=false не служит доказательством согласованности. Нужные расширения
согласовывать с координатором. Межветочных переносов и mainmerge здесь нет.

## Проверка проекта и обязательное исправление

Помощник сверил6prototype SHA, decoder SHA и3private artifacts/38cells.
Обнаружен дефект tag8: TextDecoder по умолчанию удаляет начальный U+FEFF.
Координатор воспроизвёл на UTF-8 EF BB BF 41: текущий decoder вернул A,
ignoreBOM:true сохранил U+FEFF+A. До wiring исправить с roundtrip тестом и
по возможности native string fixture. Добавить byte budget до накопления
буферов, кроме итогового JSON лимита. Остальные границы проекта согласованы
для реализации в source ветке16; public opt-in включать после live gate пункта1.
