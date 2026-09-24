> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-ea00db028445` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Кандидат узла14 для test-4: запрос серверной подготовки

Статус: **ожидает отдельного назначения координатора**. Это описание входов,
не свидетельство сборки, публикации, установленного клиента или автономной приёмки.
Координатор подтвердил 13 сентября, что server/build/publish/install этим потоку
пока не разрешены; разработчик продолжает прямые проверки.

## Состав локальных изменений

- `packages/loginom-runtime/executor/catalog/actions.json`: candidate node.add revision4 допускает
  `preprocessing.data_recovery`, добавлен selector dependency.
- `packages/loginom-runtime/executor/catalog/selectors.json`: `component.preprocessing.data_recovery` →
  `ModelForm;colVendors_Компоненты>Предобработка>Заполнение_пропусков`.
- `packages/loginom-runtime/executor/catalog/source-index.json`: dependency добавлена к node.add.
- Версия исходного шаблона: `2026.09.13-node14.1-candidate`.
- Selector evidence: E2E `2cad5602158fd2e4836d821d644a2b8d92f571a2`,
  `bg/selectors.ts:470–474`, SHA256
  `59f5ed385076a5ca4cb97827647bbbca49da9380717fb44f204aa415e4b4e9e3`.
- Runtime type `preprocessing.data_recovery`, mode `impute`, стабильный coverage ID
  `component.preprocessing.DataRecovery`. Handler и API находятся в той же ветке;
  публикация каталога сама по себе их готовности не доказывает.

## Требования к отдельной сборке

Существующий закреплённый manifest:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.11-parallel-pilot.1-candidate/manifest.json`,
SHA256 `4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`.
Readback pinned actions подтвердил `/test-1`, `/test-2`, `/test-3` у обеих операций
сохранения; `/test-4` отсутствует. Переиспользовать их URI/SHA для изменённого
содержимого нельзя.

Для нового immutable candidate предлагается отдельная версия
`2026.09.13-node14-test4.1-candidate`. Требуемый разрешённый корень **только `/test-4`**
для `package.save_checkpoint` и `package.save_as`; задача не даёт разрешения на
сохранение в другие аккаунты. Исходные package roots шаблона не переписываются:
штатный builder применяет явный `--package-root /test-4` и новую версию.
Профиль: Loginom **7.4.2**, macOS, Chromium, ru; геометрия видимой проверки —
`--start-maximized`, `viewport: null`. Использовать штатный
`deploy/loginom-dock/build-action-catalog.mjs` на VPS с этими входами и отдельным
пустым output directory. Нужна явная новая `--version`, отличная от версии шаблона.

После разрешённого staging координатор передаёт фактически прочитанные
manifest URI/SHA и совместимость. Проверить хэши файлов, отсутствие stale actions,
readback обоих allowed_roots и новое изолированное pinning. Production/current,
контейнеры, общая установка клиента, MCP и глобальные профили не переключаются.
До этого `package.save_checkpoint` под test-4 через прежний каталог не заявляется
проверенным; ручное диагностическое сохранение в UI не заменяет эту проверку.
