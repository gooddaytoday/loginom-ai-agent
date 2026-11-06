# Замена

Устойчивый ID: `component.transform.Replace`. Slug: `replacement`. Исторический подплан 11.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.replace_columns` / `exact`, `regex`. exact и regex; внутренняя таблица правил; output_mode add/replace; политика отсутствия совпадения. exact: rules[].result_type string/integer/real/datetime; пропуск сохраняет входной type. type/from — тип ключа; to и other.value — тип результата.

Ограничения: При смене result_type other.keep запрещён, чтобы не создавать Variant; для datetime только other.null и локальное ISO-время с целыми секундами. Boolean-правил нет. Regex остаётся string; ограниченный набор ASCII-паттернов, групп, [0-9], положительного {n}, якорей и inline (?i), без zero-length совпадений; внешние правила не поддержаны.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [replacement-node.mjs](../../../../packages/loginom-runtime/client/lib/replacement-node.mjs):1–27; [replacement-parameters.mjs](../../../../packages/loginom-runtime/client/lib/replacement-parameters.mjs):1–91; [transform.replace_columns.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.replace_columns.md):1–49. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.replace_columns` / `exact`, `regex` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V37. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Внутренняя exact-таблица для string/integer/real, replace/add и фактический признак _Replaced.

Ограничения: Regex поддержан для строк; внешняя таблица, Boolean-правила и неточное числовое сравнение не поддержаны. Datetime доступен как result_type в exact. real other.mode=value поддерживает максимум 2 десятичных знака; точные пары не имеют этого общего ограничения. String не длиннее 2048 символов без NUL/CR/LF; non-ASCII case-insensitive ключи отклоняются; большие Int64 передавать десятичной строкой.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/substitution/) — `loginom-help@353e506b:data/processors/transformation/substitution/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/replacement-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/replacement-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 11](../../../../services/loginom-ai/docs/plans/loginom-dock/11-replacement.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/replace/{replace,replace_datasets}.ts; tests/toreview/acceptance/mapping/mapping_replace.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
