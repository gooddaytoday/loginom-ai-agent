# Вложенные записи, схема и корень — предложение LAB-1042

Этап 0; [наблюдения, бюджеты и стоп](../trees-datatotree/modes-discovery.md).
[Комплект](acceptance/modes/README.md), [ожидания](acceptance/modes/expected.json),
[JSON](fixtures/modes/document.json), [ручная схема](fixtures/modes/manual-schema.json).
Runtime не изменён; это не регистрация новых поддерживаемых modes.

Шесть циклов: nested records, manual/strict, forced root, datetime,
sibling arrays, file delivery; седьмой — граничная матрица.
Два items содержат details и parts разной длины; три tags независимы.
Точный Int64, NULL, пустая String, false/0, пути и границы проверяются
на самом дереве, без подмены проекцией через «Дерево в таблицу».
Для manual объявлены id Integer/code String; mismatch не должен выдавать
частичный успешный результат. Игнорирование extra при strict=false пока
только предложение. Forced array для объекта предполагает [object], forced
non-array возвращает object; это тоже требует native-пробы.

Файл document.json должен поступать по штатной проверенной доставке.
Нового параметра source_file у JSONToTree не выдумываем: его UI требует
строковый столбец, а кнопка BuildTreeTemplate без поля дала native validation.
Доставка файла как исходных данных и загрузка шаблона структуры — разные
операции. Точный путь file → исходный JSON столбец в этой сессии не исследован;
до реализации file case требует отдельного подтверждения UI.

`fixtures/modes/limits.json` задаёт небольшие рецепты: ровно 256/257
экземпляров, глубина 16/17, UTF-8 вход 1 MiB / 1 MiB+1. Oracle считает узлы
и строит depth witnesses независимо. У typed ответа отдельный byte bound:
вход, помещающийся в 1 MiB, не гарантирует такой же размер полного ответа.
Существующие лимиты не повышаются, за пределами — явный отказ без усечения.

Наблюдено: auto/strict/root controls, три native root options, date format,
структурные кнопки; не проверены на данных. Оценка: 7 циклов в
`tree-{parameters,node}.mjs` и `node-output-context.mjs` плюс общий reader.
Контракт Variant/date и native file delivery до кода требуют решения владельца.
