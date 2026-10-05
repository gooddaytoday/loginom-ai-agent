# Конечные классы

Устойчивый ID: `component.preprocessing.CoarseClasses`. Slug: `preprocessing-coarseclasses`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W1/W2/W3.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Автоматическое построение и три выхода.
- Этап 2 — Внешнее разбиение.
- Этап 3 — Ручная корректировка и заморозка.

Общие изменения: W1 — обучение и переобучение; W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Конечные классы](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes.html) — `loginom-help@353e506b:data/processors/preprocessing/coarse-classes.md`.
- [Настройка внешнего разбиения](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-external-binning.html) — `loginom-help@353e506b:data/processors/preprocessing/coarse-classes/configure-external-binning.md`.
- [Настройка назначений столбцов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-column-usage-types.html) — `loginom-help@353e506b:data/processors/preprocessing/coarse-classes/configure-column-usage-types.md`.
- [Настройка конечных классов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-coarse-classes.html) — `loginom-help@353e506b:data/processors/preprocessing/coarse-classes/configure-coarse-classes.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/preprocessing/coarseclasses/column_assignment.ts:25 — роли/поля; test.skip:602 — отрицательные значения числа интервалов; tests/toreview/acceptance/wizards/coarseclasses/coarseclasses_setting.ts — настройки` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
