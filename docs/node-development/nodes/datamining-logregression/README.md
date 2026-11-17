# Логистическая регрессия

Устойчивый ID: `component.dataMining.LogRegression`. Slug: `datamining-logregression`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `datamining.log_regression`: Enter, Forward/Backward/Stepwise,
ручные Ridge, LASSO и Elastic Net (`elastic_net`). Бинарная String-цель,
явные event и threshold (`p >= threshold`), константа, epsilon=1e-10,
100% обучения по умолчанию. Execute обучает текущий вход и прогнозирует.
Ручная регуляризация: `regularization.lambda_ridge` для Ridge,
`regularization.lambda_lasso` для LASSO, оба обязательны для Elastic Net;
каждый λ — конечное число >0. Автоматические λ и alpha не поддержаны.
Повторная настройка и обучение — на том же existing-узле.

Нормализация факторов none/standardize; пропуск на существующем узле сохраняет её.
Enter допускает отдельный Real weight_field; Integer Weight не поддержан.
Порт 0 — полный прогноз и исходные поля, порт 1 — полные коэффициенты.
Apply — только сохранённая Enter-модель, без Teach и перенастройки.
Selection: deviance/aic/aicc/bic/hqic; значимости только для Deviance.
Регуляризация запрещает selection и weight_field. Сводка порта 2,
валидация и калибровка остаются вне этого среза.

Elastic Net: native-проба LAB-1694 от 16.11.2026 на worker назначенной пары,
Loginom 7.4.2, до изменения обработчика. Метод выбран по наблюдённой подписи
`Elastic-net (Регрессия "эластичная сеть")`. Оба setup-контрола —
«Задать вручную» (0), оба λ=1 доступны для редактирования.
На исходном train.csv все 32×8 значений и порядок совпали с неизменённым
`acceptance/modes/elastic-net/expected.json`; max |Δp| = 3.33e-16.
Save, закрытие пакета и logout подтверждены без discard. Это native-исследование,
не модельная приёмка нового SHA. Независимый oracle и expected не изменены.

Сценарий `logreg-elastic-net` использует утверждённые task/data и штатные
CSV/Save/cold/cleanup; численные ожидания модели не передаются.
Регистрация не заменяет живую приёмку точного SHA.

Последовательное разбиение Enter: `logistic.partition` с `method:"sequential"`,
`train_percent` и `test_percent` >0, сумма 100. Первые строки — train,
следующие — test; прогноз для всего входа. Пропуск partition сохраняет
прежний контракт 100% обучения. Apply сверяет прежний partition без Teach.
Страница разбиения отдельно активирует свой вход перед чтением размеров.
Readback содержит доли и наблюдённые числа строк, порт 2 не читается.

Native-проба LAB-1744, mas3, 16.11.2026, собственный worker, Loginom 7.4.2:
`LearnPartitionWizard;pedSamplingMethod;ValueControl` = 1 («Последовательный»),
обе процентные ячейки = 50, абсолютные = 32, всего = 64; порядок
Обучающее → Тестовое → Неиспользуемое, валидация = 0.
Порт 0: все 64×10 ячеек совпали с неизменённым expected, max |Δp|=2.371e-10.
Порт 2: наблюдены TotalSamples=64, TrainSamples=32, TestSamples=32;
сводка остаётся вне публичного обработчика и табличного expected.
Save и close/logout без discard подтверждены. Сценарий
`logreg-partition-sequential`: исходные task/data, штатные CSV/Save/cold/cleanup,
oracle и численные ожидания модели не передаются.

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
