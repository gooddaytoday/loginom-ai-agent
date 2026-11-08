# Корневые массивы и сериализация — предложение LAB-1042

Этап 0; [наблюдения, бюджеты и общий стоп](../trees-datatotree/modes-discovery.md).
[Комплект](acceptance/modes/README.md), [ожидания](acceptance/modes/expected.json),
[значения и метки дерева](fixtures/modes/input.json). Runtime не изменён.

Шесть циклов: root array, splitting на том же узле, pretty+labels, даты
(ISO → custom), sibling arrays, пустой массив (multi_row off → on).
Предлагаемые строки: один документ при off, по элементу при on; для [] —
один документ [] либо ноль строк. Схема строкового выхода сохраняется.
Эти числа — гипотезы до native-пробы. JSON AST сравнивается независимо,
порядок массивов точный, ключей объекта — по исходной schema.
Pretty дополнительно требует перенос вне строковых токенов; AST это не доказывает.
Метки Бета/Позиции/Код отличаются от технических ключей; коллизии не разрешаются.
Sibling arrays длины 2/3 не перемножаются при сериализации.
Civil datetime проверяется без смены timezone; ISO и custom spelling требуют
живого результата, пример custom не считается точным native-форматом.

Наблюдено: пять флагов и реальное включение полей DateFormat/TimeFormat
при выключении ISO. На портах остаётся tree 0 → table 0. Результаты на данных,
мультистрочный CSV, Save/cold — not_checked.
Оценка: 6 циклов в `tree-conversion-{parameters,node,context}.mjs`;
общий reader/root/date guard и сохранённый serialization readback также
требуют согласования. Новый форматирующий matcher не добавлен.
