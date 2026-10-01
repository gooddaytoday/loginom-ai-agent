# Корреляционный анализ: спецификация приёмки

Native/CLI/cold execution **NOT_RUN**. [Подплан](../plan.md) покрывает все четыре показателя.
CSV используют UTF-8, comma и `NULL` как маркер пропуска при явном профиле импорта.
Имена выбираются технические; row_id — происхождение наблюдения, не анализируемый фактор.
Types/data_kind/text order и empty string задать явно в бизнес-входе, не угадывать.

[cases.json](cases.json) содержит все 15 nonempty masks. Для каждой пары selected sets
проверять ровно L×R pair identities, четыре identification columns, выбранные real
коэффициенты и integer lag только с CCF. Zero mask публичный API отвергает до эффекта.
Смена flags на том же узле меняет schema; actual schema не выводится из expected.

## Independent reference

[math_reference.py](math_reference.py) использует рациональные центрированные суммы,
средние tied ranks, собственный подсчёт concordant/discordant/ties и полные candidate
CCF curves. [expected.json](expected.json) фиксирует 36 аналитических пар P/S/K,
ASCII ordinal calculation, pairwise/listwise NULL и гипотезы нормировки CCF.
Три source-defined числовых коэффициента имеют hand anchors, включая tau-b11/13;
Wiki формулы со связями не копируются без проверки математического определения.

На lag.csv проверить impulse shift/sign. Новый ccf-ties.csv с двумя нулевыми средними
имеет равные по модулю extrema при lag−1 и+1 с противоположными знаками в обоих
приложенных full-energy candidates. Периодичность lag.csv сама по себе не доказывает
несколько одинаковых **максимальных** extrema. Native tie order и нормировка остаются
деталями реализации; oracle принимает одно утверждённое правило, не любой candidate.

Категории/NULL/constant/small cases имеют отдельные outcomes. Undefined mathematical
value не заменяется автоматически zero или typed NULL. Для full native acceptance
заморозить actual type eligibility, collation, NULL policy, output schema и CCF contract.

## Mutants и сохранение

Проверять подмену коэффициента/знака/лага, tau-a вместо tau-b, неверные tied ranks,
удалённую/лишнюю pair row, переставленные стороны/labels, неправильный type/schema,
лишнюю lag column без CCF и NULL→zero. Они должны дать FAIL. Численные real —
atol=rtol=1e−12 proposed; schema/lag/identities/NULL — exact. Не расширять допуск для
неизвестной формулы. Full read, повторные source mutations с original operation,
save и independent cold описаны в [общем контракте](../../../contracts/documentation-based-acceptance.md).

Будущая CLI Sol/low7200s получает [business task](task.md), входы и уникальный output
path; expected/oracle изолированы. Текущий комплект не запускает приёмку.
Офлайн: `python3 docs/node-development/check-three-node-plans.py` из repo root либо
`python3 math_reference.py --check` из этого каталога. CHECK не означает native PASS.
