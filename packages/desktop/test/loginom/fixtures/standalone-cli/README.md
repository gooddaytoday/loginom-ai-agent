# CSV oracle самостоятельного CLI

Оба файла имеют имя `sales.csv`, кодировку UTF-8 и LF. Столбец `amount`
числовой: A содержит 10, 20, 25; B содержит 40, 60, 1. Суммы — 55 и 101.
Группировка по Category дополнительно проверяет две группы: Alpha/Beta.

`manifest.json` фиксирует SHA256 точных bytes, число строк и ожидаемые значения.
`runtime-acceptance.ts` читает эти файлы и проверяет hash до запуска чата;
передача attachment и remote delivery дополнительно сверяются с теми же bytes.
Summary сохраняет inputSha256 вместе с отдельным удалённым package/source path.
Direct runtime и CLI interfaces используют одинаковые fixtures.

Исторические прогоны до этого набора могли использовать B со значениями 100, 1
и direct-runtime столбец Value. Их evidence не переписывается и не считается
доказательством выполнения нынешних fixtures.
