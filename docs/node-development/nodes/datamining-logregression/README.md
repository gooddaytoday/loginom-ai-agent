# Логистическая регрессия

Устойчивый ID: `component.dataMining.LogRegression`. Slug: `datamining-logregression`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Подплан — `ready_for_development`: этап 0 выполнен в LAB-534 на Loginom 7.4.2,
база `v038@2098aafcf46eaea118b18cb529f6bf045a5704eb`.
[Живое исследование](discovery.md) и [приёмочный комплект](acceptance/README.md)
содержат предложенные критерии; владелец утверждает их до отдельного назначения
этапа 1. Обработчика и модельной приёмки пока нет, готовность реестра не повышена.
W1/W2/W3 уже есть в базе; W4, коэффициентный порт 1 и сводка порта 2
исключены из первого среза решением карточки.

## Планируемый объём по этапам

- Этап 1 — Бинарный Enter: обучение, классы, вероятность, явный порог, CSV и сохранение.
- Применение к holdout и переобучение после замены источника — отдельное назначение.
- Этап 2 — Все способы настройки модели.
- Этап 3 — Нормализация, выборки и валидация.
- Этап 4 — Полная статистика и управление переменными.

Предложенная регистрация `datamining.log_regression` / `enter` добавляет 786 Б
к полной inputSchema dock_node_apply. Runtime-кода в этапе 0 нет.

## Источники

- [Логистическая регрессия](https://help.loginom.ru/userguide/processors/datamining/logistic-regression/) — `loginom-help@353e506b:data/processors/datamining/logistic-regression/README.md`.
- [Логистическая регрессия — Сводка](https://help.loginom.ru/userguide/processors/datamining/logistic-regression/report.html) — `loginom-help@353e506b:data/processors/datamining/logistic-regression/report.md`.
- [Логистическая регрессия — Коэффициенты регрессии](https://help.loginom.ru/userguide/processors/datamining/logistic-regression/coef-regression.html) — `loginom-help@353e506b:data/processors/datamining/logistic-regression/coef-regression.md`.
- [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) — `loginom-help@353e506b:data/processors/normalization/normalization-continuous.md`.
- [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) — `loginom-help@353e506b:data/processors/normalization/normalization-discrete.md`.
- [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html) — `loginom-help@353e506b:data/processors/validation.md`.
- `e2e-tests@486caef44:bg/labels.ts:163-183 — метки Data Mining; tests/toreview/acceptance/workflow/teach/teach_node.ts:27-49 — список обучаемых компонентов, :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
