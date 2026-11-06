# Экспорт — Loginom Data файл

Устойчивый ID: `component.exports.Lgd`. Slug: `exports-lgd`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `exports.lgd` / `native`. Новый LGD: compression=lz4, checksum=compressed, overwrite=reject; output.file_artifacts, без табличного выхода.

Ограничения: Без append, DDF, Variant, переменных и иных вариантов сжатия; Save пакета отдельно.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [lgd-export-node.mjs](../../../../packages/loginom-runtime/client/lib/lgd-export-node.mjs):1–158; [lgd-parameters.mjs](../../../../packages/loginom-runtime/client/lib/lgd-parameters.mjs):1–39; [exports.lgd.md](../../../../packages/product/skills/loginom-automation/references/nodes/exports.lgd.md):1–14. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние


Внешняя среда: сервер Loginom с LGD writer и собственным каталогом; заранее квалифицированный штатный LGD reader/пакет в отдельном профиле, независимый manifest; этап 2 — отдельные серверы Loginom 32/64 bit. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Одна новая LGD-выгрузка в наблюдённом штатном режиме сжатия, свойства всех полей и полный небольшой набор; принятый reader не зависит от будущего imports-lgd.
- Этап 2 — r02, r03, r04: пять сочетаний compression/checksum, отдельная квалификация bitness, bindings и повторное открытие; Deductor 5.3 и ниже не обещаются.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [LGD-файл](https://help.loginom.ru/userguide/integration/export/ldf.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/export_lgd.ts:28 — :sandbox; строки 291-297 — сжатие/переменный путь. Проверки UI и обратный импорт не заменяют независимый manifest` — источники требований, не текущая приёмка.
