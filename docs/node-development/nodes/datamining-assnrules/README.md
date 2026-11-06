# Ассоциативные правила

Component ID `component.dataMining.AssnRules`, slug `datamining-assnrules`.
Native fulltype `TBGAssnRulesEngine`, Loginom 7.4.2.

## Текущий срез v0.4.0

Зарегистрирован `datamining.assn_rules` / `fp_growth`. FP-growth: дискретные строковые ID транзакций и товары; support/confidence 0…100, max_items; Train текущего входа; порты 0/1, доли результата 0…1.

Ограничения: Без рекомендаций (порт 2), второго входа, сохранённого apply и дополнительных фильтров.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [assn-rules-node.mjs](../../../../packages/loginom-runtime/client/lib/assn-rules-node.mjs):1–36; [assn-rules-parameters.mjs](../../../../packages/loginom-runtime/client/lib/assn-rules-parameters.mjs):1–17; [datamining.assn_rules.md](../../../../packages/product/skills/loginom-automation/references/nodes/datamining.assn_rules.md):1–28. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [Discovery LAB-777](discovery.md) · [Реестр](../../registry.json).

Этап 0 подготовлен, `ready_for_development`: живое исследование,
самостоятельные fixtures, независимый Apriori на stdlib, пользовательские
задания и expected для двух примеров. **Критерии — предложение до утверждения
оркестратором. Runtime handler ещё нет.**

Предлагаемый этап 1: основной вход Transaction/Item, min support=50%,
min confidence=60%, max_items=2; min lift=0 и одиночные наборы включены.
Принимать порты 0/1 — частые наборы и правила. Первый пример даёт 4/2 строки,
второй 6/6 и проверяет отсечение частой тройки. Все ячейки и типы, точный
порядок полей, строки без порядка, real atol/rtol=1e-10, NULL точно.

Все три native порта исследованы. Рекомендации порта 2 имеют дополнительный
отбор; его общий контракт и oracle не установлены, предлагается отдельный этап.
Также отложены вспомогательный вход, другие длины и фильтры, native NULL/дубли,
holdout без переобучения. Предлагаемые type/mode: `datamining.assn_rules` / `fp_growth`.

Новых общих механизмов не выявлено; обучение, tolerance и несколько портов
поддержаны базой. Общий SKILL.md уже превышает бюджет 40 000 Б — см. замеры
в discovery. Модельных прогонов и cold-check не было. После чтений произошёл
разрыв связи; закрытие пакета/logout не подтверждены. Аналитическая,
интеграционная и релизная готовность не повышаются.
