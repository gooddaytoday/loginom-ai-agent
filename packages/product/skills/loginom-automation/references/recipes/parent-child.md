# Иерархия id/parent_id

В Loginom 7.4.2 trees.from_table задаёт ручную структуру, а не рекурсию по
ключам. Это подтверждённый пробел: используй programming.javascript только
для валидации связей и сборки вложенного JSON. Импорт и экспорт — стандартные
узлы. Сначала прочитай [JavaScript](../nodes/programming.javascript.md) и его schema.

Импортируй id, parent_id, name как string: ведущие нули значимы. Пустой
parent_id/NULL — корень; несколько корней допустимы. Не сортируй строки.
Проверь technical names входа перед Get; если они отличаются, замени только
имена входных полей в коде ниже. Не подменяй исходник готовым JSON из ответа.

Создай JS с schema_mode=declared, одним выходным полем name=JSON, label=JSON,
type=string, data_kind=Дискретный, usage=Не задано. Тогда схема сохранится
даже при ошибке Execute. Код не вызывает AssignColumns; после полной
валидации пишет ровно одну строку. Обход идёт по всем компонентам, не только
от корней. Перечень ошибки — id строк в порядке входа; в cycle только участники
цикла, без ведущих к нему потомков. Не ловить throw и не заменять ошибку строкой.

```javascript
import {InputTable,OutputTable} from "builtIn/Data";
const rows = [];
const byId = new Map();
for (let i = 0; i < InputTable.RowCount; i++) {
    const parent = InputTable.Get(i, "parent_id");
    const row = {id: InputTable.Get(i, "id"), parent_id: parent == null || parent === "" ? null : parent, name: InputTable.Get(i, "name"), children: []};
    if (typeof row.id !== "string" || row.id === "" || byId.has(row.id)) throw new Error("Parent-child invalid id: " + row.id);
    rows.push(row);
    byId.set(row.id, row);
}
const orphans = rows.filter(function(row) { return row.parent_id !== null && !byId.has(row.parent_id); });
if (orphans.length) throw new Error("Parent-child orphan ids: " + orphans.map(function(row) { return row.id; }).join(", "));
const checked = new Set();
const cyclic = new Set();
rows.forEach(function(row) {
    const path = [];
    const positions = new Map();
    let key = row.id;
    while (key !== null && !checked.has(key)) {
        if (positions.has(key)) {
            path.slice(positions.get(key)).forEach(function(id) { cyclic.add(id); });
            break;
        }
        positions.set(key, path.length);
        path.push(key);
        key = byId.get(key).parent_id;
    }
    path.forEach(function(id) { checked.add(id); });
});
if (cyclic.size) throw new Error("Parent-child cycle ids: " + rows.filter(function(row) { return cyclic.has(row.id); }).map(function(row) { return row.id; }).join(", "));
const roots = [];
rows.forEach(function(row) {
    if (row.parent_id === null) roots.push(row);
    else byId.get(row.parent_id).children.push(row);
});
const document = JSON.stringify({roots: roots});
OutputTable.Append();
OutputTable.Set("JSON", document);
```

Результат — один документ {roots:[…]} без Root; children есть и у листьев ([]).
Потомок до родителя допустим. Если нужен порт дерева, подключи
[JSON в дерево](../nodes/trees.from_json.md) к полю JSON. Если нужен JSON, готовой строки
достаточно; [Дерево в JSON](../nodes/trees.to_json.md) нужно только при сериализации
порта дерева. Не создавай техническую обёртку и не теряй массивы children.

При NODE_EXECUTION_FAILED передай точный текст с перечнем id, останови
вычисления и экспорт; не создавай частичное дерево. Сохрани настроенный пакет
штатным Save, затем заверши с явным отказом. Не исправляй входные данные.
