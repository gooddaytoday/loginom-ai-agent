# Импорт — Loginom Data файл

Устойчивый ID: `component.imports.Lgd`. Slug: `imports-lgd`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `imports.lgd` / `native`. Исходный LGD через проверенную доставку либо серверный источник; checksum=verify; сохраняются порядок, типы, метки и NULL.

Ограничения: Повреждённый checksum отклоняется; без DDF, Variant, переменных и отключения проверки.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [lgd-import-node.mjs](../../../../packages/loginom-runtime/client/lib/lgd-import-node.mjs):1–71; [lgd-parameters.mjs](../../../../packages/loginom-runtime/client/lib/lgd-parameters.mjs):1–39; [imports.lgd.md](../../../../packages/product/skills/loginom-automation/references/nodes/imports.lgd.md):1–17. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние


Внешняя среда: самостоятельные LGD и manifest из заранее квалифицированного stock Loginom; собственный каталог загрузки; этап 2 — отдельные 32/64-bit LGD и DDF fixtures stock Deductor, без зависимости от нового exports-lgd. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Один самостоятельный LGD с всеми значениями и свойствами полей; NULL/empty, пустая схема и честный отказ повреждённого файла.
- Этап 2 — r02, r03, r04: LZO/LZ4/без сжатия, 32/64-bit, checksum/corruption, DDF и управляющий путь; каждую совместимость принимать отдельно.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [LGD-файл](https://help.loginom.ru/userguide/integration/import/ldf.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/import_lgd.ts:27 — :sandbox, skip:91,100; тесты :267 (DDF), :282 (переменные). Новый агент LGD ещё не поддерживает` — источники требований, не текущая приёмка.
