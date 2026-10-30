# Дерево в таблицу: этап 0

Парное исследование LAB-536 выполнено на Loginom 7.4.2, база runtime
`2098aafcf46eaea118b18cb529f6bf045a5704eb`. Общий протокол наблюдений,
точные `data-tid`, параметры и границы —
[trees-jsontotree/discovery.md](../trees-jsontotree/discovery.md).

Подтверждены tree input 0 → table output 0, выбор leaf с каскадом ancestors,
отдельный выбор глобального индекса массива, повторение родителей on/off,
короткие имена/метки и полный результат 4 × 6. Без повторения parent id/active
после первой строки являются NULL (`bg-cell-null-value`), не пустыми строками.
Missing note и явный JSON null уже одинаковы на входном дереве.

Причина нулевого выбора прочитана через кнопку ошибки:
«Не выбрано ни одного узла с данными». Native FullType не подтверждён;
составные имена/метки, несколько sibling arrays, пустые массивы, Variant,
даты и cold persistence не проверены. Model/cold PASS не заявляется.

Предложение runtime — `trees.to_table` / `selected_nodes`; общий контракт,
семантика, размер схемы и оценка — [contract.md](../trees-jsontotree/contract.md).
Свой [task.md](acceptance/task.md) проверяет no-repeat; входы и независимый
oracle общие для пары. Общая поддержка tree_io требует решения владельца.
