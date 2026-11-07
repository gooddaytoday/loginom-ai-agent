Предложение LAB-1011; критерии пока **не утверждены**. Наблюдения и блокеры —
в разделе LAB-1011 [подплана](../../plan.md). Основной старый XLSX-комплект
в родительском каталоге сохраняется отдельно.

`oracle.py` / `expected.json`: XLS, XLSX, numeric cell style, замена книги,
заблокированные append/replace-sheet. Новые задачи — `../task-*.md`.
Модель получает соответствующее задание и входные файлы, без oracle/expected.
Для existing сценария ей дают подготовленные копии seed-книг; описание задачи
фиксирует разрешённое действие. `--case seed` проверяет независимые fixtures.

```sh
python3 -m pip install -r docs/node-development/nodes/exports-excel/acceptance/modes/requirements.txt
python3 docs/node-development/nodes/exports-excel/acceptance/modes/oracle.py --self-check
python3 docs/node-development/nodes/exports-excel/acceptance/modes/oracle.py --case numeric --file downloaded.xls
node docs/node-development/nodes/text-export/acceptance/modes/schema-size.mjs
```

XLS reader — xlrd; XLSX reader/writer — openpyxl; XLS writer — xlwt.
Writers используются только для fixture и квалификации oracle. Их PASS не
подтверждает Loginom, происхождение файла, Save или cold.
Встроенный `write_book(path, sheets_for('seed'))` воспроизводит смысл seed-книг;
ZIP timestamps не являются критерием сравнения Excel-файла.

`proposed-*` — документационный проект будущей карточки/инструкций только для
доступной части, не установленный skill. Сжатые байты JSON считает общий sizing
script; 64-символьные хеш-поля — нули. Runtime и общая оснастка не изменены.
