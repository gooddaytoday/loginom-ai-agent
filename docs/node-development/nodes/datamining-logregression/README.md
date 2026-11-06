# Логистическая регрессия

Устойчивый ID: `component.dataMining.LogRegression`. Slug: `datamining-logregression`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `datamining.log_regression` / `enter`, `forward`, `backward`, `stepwise`. Бинарная String-цель, явные event и threshold (p >= threshold); Train текущего входа, порт 0. selection.criterion: deviance/aic/aicc/bic/hqic; Deviance: entry_significance для forward, removal_significance для backward, оба и entry<removal для stepwise; пороги в (0,1). Пропуск selection сохраняет Deviance 0.05/0.1.

Ограничения: Apply, веса, чтение коэффициентов/сводки не поддержаны. Enter запрещает selection; информационные критерии запрещают significance-пороги.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [log-regression-node.mjs](../../../../packages/loginom-runtime/client/lib/log-regression-node.mjs):1–32; [log-regression-parameters.mjs](../../../../packages/loginom-runtime/client/lib/log-regression-parameters.mjs):1–36; [datamining.log_regression.md](../../../../packages/product/skills/loginom-automation/references/nodes/datamining.log_regression.md):1–15. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

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
