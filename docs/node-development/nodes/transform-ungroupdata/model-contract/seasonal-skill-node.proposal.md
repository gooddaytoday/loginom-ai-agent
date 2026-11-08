# Разгруппировка по заданным долям

<!-- mode: shares -->
Тип `transform.ungroup_data`, режим `shares`. Для распределения итогов по готовым долям выбирай этот узел через `dock_node_apply` с `mode:"shares"`. Сначала прочитай карточку типа через `dock_action_describe`. Вход 0 — групповые итоги, вход 1 — опорные позиции с готовыми долями. Оба источника выполни до настройки. Доли — уже заданные дроби; веса не поддерживаются, сезонность — режим `seasonal`.

Если `dock_node_apply` для этого режима вернул отказ, прочитай его причину и исправь подтверждённую настройку. Не подменяй Разгруппировку цепочкой `transform.calculator`, `transform.join_data` или `programming.javascript`: такой обход не проверяет её native настройки. Если продолжить нельзя, сообщи отказ; неизвестный эффект сначала разреши по выданному `next_step` исходной операции.

На новом узле передай `parameters.ungroup`: полные `keys` со связями `total`/`support`, `value_field`, `item_field`, `share_field`, `rounding` и `balance`. Указывай точные имена из схемы соответствующего входа. Существующий узел с `parameters:{}`, `inputs:[]`, `finish:"execute"` повторно считает текущие источники без смены настройки. Настройки не заменяют фактические связи графа; проверь readback обоих входов и ключей.

`rounding.format`: `none`, `precision` (число знаков `value`) или `multiple` (целый положительный шаг `value`). `balance`: `none`, `last`, `proportional`, `equal`. Явно выбирай политику пользователя: native умолчания — вычисление долей, точность 2 и пропорциональная балансировка — не равны простому умножению на готовые доли.

При `none`/`none` результат равен итогу × неотрицательная доля без нормирования суммы долей; отрицательная доля даёт ноль. NULL в итоге удаляет строки этой записи. Строки с NULL-долями пропускаются; NULL-наименования сохраняются. В таблице итогов каждая группа должна быть уникальна. NULL-ключ сопоставляется с NULL, пустая строка отдельно. Итоги без опорной группы и лишние опорные группы не создают деталей.

Читай порт 0 целиком для небольших данных: исходные поля входа 0, `<value_field>_Rounded`, поле наименования и `OutputValue`. Значения результата — вещественные. Округлённый итог повторяется для каждой позиции, поэтому его нельзя суммировать как распределённую величину. При `last` остаток получает последняя позиция входного порядка, а не позиция с максимальным именем. Сохрани пакет после чтения. Обучение и отдельный `apply` для этого режима не нужны. Порт 1 и переменные в этом режиме не читаются.
<!-- /mode -->


<!-- mode: seasonal -->
`mode:"seasonal"`, native method «С учётом временных колебаний и сезонности опорных данных». Link Group only; Period is the datetime order field on BOTH inputs (`seasonality.*_order_field`), never a group key. Pass every `seasonality` value explicitly. Use `read.ports:[0,1]` and export each port with its own `exports.text`. Drop confidence-band fields from port 0 only via output mapping `excluded` when the task asks; never drop other columns. Keep NULL quality NULL. Empty or NULL-only inputs give empty ports with full schema; still export both. Nonconstant estimator, band formula, other periods, real totals and saved-model apply are out of scope.
<!-- /mode -->
