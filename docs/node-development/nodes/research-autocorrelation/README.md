# Автокорреляция

Устойчивый ID: `component.research.AutoCorrelation`. Slug: `research-autocorrelation`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; подплан `ready_for_development` по этапу 0 / LAB-643.
[Discovery](discovery.md) содержит живые наблюдения Loginom 7.4.2;
[приёмочный комплект](acceptance/README.md) — предложенные критерии, независимый
oracle и expected. Владелец утверждает критерии до отдельного назначения этапа 1.
Модельных прогонов, CLI-сборки и PASS обработчика нет; implementation/integration/release
не повышаются. W2 уже поддерживается базой; общих правок для предложенного среза не выявлено.

## Планируемый объём по этапам

- Этап 1 — Одна числовая серия, временная АКФ по лагам и полный выход; без NULL, положительная дисперсия.
- Этап 2 — Частотная/автоматическая АКФ и ЧАКФ.

Приращение полной схемы: 690 Б, с 43 329 до 44 019 Б на базе
`v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`. Числовой допуск — abs=1e-8
для АКФ/ошибки; ordered и output_port=0 уже поддерживаются оснасткой базы.

## Источники

- [Автокорреляция](https://help.loginom.ru/userguide/processors/scrutiny/autocorrelation.html) — `loginom-help@353e506b:data/processors/scrutiny/autocorrelation.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/autocorrelation/autocorrelation.ts:155-250 — execute, отсчёты, домен и числовые роли; autocorr_pacf.ts — ЧАКФ` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
