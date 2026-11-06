# Автокорреляция

Устойчивый ID: `component.research.AutoCorrelation`. Slug: `research-autocorrelation`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `research.auto_correlation` / `time_domain`. Одна integer/real серия в порядке входа; lag_count включает 0; Lag/ACF/StdErr/Significant, порт 0; обновление без Train.

Ограничения: Не менее двух конечных значений с положительной дисперсией; NULL вызывает отказ. Без PACF, нескольких серий и иных областей.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [auto-correlation-node.mjs](../../../../packages/loginom-runtime/client/lib/auto-correlation-node.mjs):1–23; [auto-correlation-parameters.mjs](../../../../packages/loginom-runtime/client/lib/auto-correlation-parameters.mjs):1–20; [research.auto_correlation.md](../../../../packages/product/skills/loginom-automation/references/nodes/research.auto_correlation.md):1–25. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1 — Одна числовая серия, временная АКФ по лагам и полный выход; без NULL, положительная дисперсия.
- Этап 2 — Частотная/автоматическая АКФ и ЧАКФ.

Приращение полной схемы: 690 Б, с 43 329 до 44 019 Б на базе
`v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`. Числовой допуск — abs=1e-8
для АКФ/ошибки; ordered и output_port=0 уже поддерживаются оснасткой базы.

## Источники

- [Автокорреляция](https://help.loginom.ru/userguide/processors/scrutiny/autocorrelation.html) — `loginom-help@353e506b:data/processors/scrutiny/autocorrelation.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/autocorrelation/autocorrelation.ts:155-250 — execute, отсчёты, домен и числовые роли; autocorr_pacf.ts — ЧАКФ` — прочитанные исходники, не результат выполнения.
