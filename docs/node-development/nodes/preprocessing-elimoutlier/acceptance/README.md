# Редактирование выбросов: спецификация приёмки

Выполнение Loginom, CLI и cold reopen **NOT_RUN**. [План](../plan.md) описывает full scope;
калькуляции ниже проверяют математику входов, а не готовый native обработчик.

CSV UTF-8 используют **semicolon**, настоящие переводы строк LF и `?` для NULL.
Колонки RowID/Payload не редактируются. Для types.csv импортировать Integer/Real/Date/
String/Boolean явно; поочерёдно задавать указанные в cases.json data_kind и ordered,
не полагаться на автоопределение типов. Профили импорта входят в бизнес-вход,
точные native outcomes и expected не передаются исполнителю CLI.

## Покрытие

[cases.json](cases.json) задаёт декартовы матрицы, а не выборку happy paths:
2 критерия × 7 методов × 5 типов × 2 вида × 2 ordered =280;
с двумя независимыми methods outlier/extreme —1960 tuples.
Развернуть все tuples при реализации, применить таблицу доступности и contradiction
ordered boolean/string delete. Каждый tuple имеет success, rejection или explicit
unresolved до закрепления правила, ни один не пропускается молча.

Для числовых actions использовать sigma-symmetric и iqr-symmetric с различными
порогами двух классов. Для type matrix — types.csv, для NULL/degenerate — соответствующие
малые файлы. Дополнительно проверять multi, boundary, denominator, quartiles odd/even,
replacement population, modal rounding и равные modal bins.
Новый most-likely-equal-bins.csv имеет несколько modal intervals при floor/nearest/ceil
Стерджеса; старый most-likely-tie.csv сам по себе этого не гарантирует.

## Independent oracle

[expected.json](expected.json) содержит exact rational sum/mean/median/SS, две sigma,
квартильные candidates, strict-boundary discriminant и modal interval candidates.
Выбор population/quartile/bin/tie/priority native правила выполняется до окончательной
приёмки; hypotheses не становятся набором альтернативных PASS-ответов.
Клиппирование рассчитывается по зафиксированной границе, не по output Loginom.

Сравнивать processed и оба diagnostic outputs полностью, по исходным RowID и schema.
Side outputs проверять с original values до замены. Multi X/Y отличает объединение
удалённых строк, два class memberships и disabled field от последовательной обработки.
Типы/labels/data_kind, порядок, NULL и integer64 — exact; вычисленные real имеют
заранее утверждённый tolerance. При all-NULL/empty/singleton нельзя подставлять0 автоматически.

Mutants: неверная замена/fence, удаление соседней строки, дубликат, перепутанный порт,
отредактированные diagnostic rows вместо оригинала, неверный schema/type, NULL→0,
неправильное inclusive сравнение. Каждый mutant должен быть отвергнут.

Один граф/operation проходит value, width и same-width metadata changes, failure repair,
save и independent cold без повторного configure. [Общий контракт](../../../contracts/documentation-based-acceptance.md)
определяет public path и будущий Sol/low CLI7200s. Сейчас implementation не запускается.

Офлайн: `python3 docs/node-development/check-three-node-plans.py` из repo root.
Проверяются frozen JSON, CSV и hand anchors; result не является node PASS.
