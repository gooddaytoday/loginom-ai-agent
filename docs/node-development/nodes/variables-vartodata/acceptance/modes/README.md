Предложение LAB-1038, отдельно от прежних columns/rows acceptance.
Вход — `../../fixtures/modes.json`; задания — `../task-switch.md` и
`../task-variant-empty.md`. Oracle/expected модели не передавать.
Нужен подготовленный пакет с существующим преобразователем columns,
редактируемым источником и отдельными источниками Variant/пустого набора.
JSON — спецификация входов; готового fixture .lgp для новых случаев пока нет.

`python3 docs/node-development/nodes/variables-vartodata/acceptance/modes/oracle.py`
проверяет expected.json, `--write` обновляет его из авторских входов.
Типы и значения вычисляются Python без Loginom. Ожидания описывают фазы,
а не вводят новый формат production cold-check или новый verifier.

Предлагаемые критерии: columns→rows→columns того же GUID, связь сохранена;
полный порядок/схема/значения после добавления и удаления переменной;
declared Variant и фактический string subtype для «19»; подключённый пустой
rows даёт Name/DisplayName/Value и ноль строк. Проверять все ячейки,
typed NULL отдельно от empty/false/0. Нельзя доказывать subtype только preview.
Пустые columns: кратность не установлена, критерий **не утверждён**.
Disconnected input — другой случай, он не доказывает connected empty.
Custom mapping при смене режима не сбрасывать молча, политика до реализации
нуждается в решении. Save/reopen/cold и стандарт ≥2/3 + независимые ≥2/3
на одном SHA; действующие native/identity guards сохраняются.
