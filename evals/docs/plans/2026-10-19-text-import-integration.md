# Перенос LAB-58–63 в text-import-evals

Дата: 2026-10-19. План утверждён владельцем и независимо проверен до исполнения.

## Цель и границы

Собрать в `text-import-evals` принятые eval LAB-61 и необходимые продуктовые исправления CLI. Исходная общая ветка и `origin/text-import-evals`: `d627dd2651a7146e55cf2c87ceb85af10ee67b4b`.

LAB-58 уже включена (`68161f9e34` и `f2aa79b415`, merge `a08f584e74`), LAB-59 включена (`c05028803f`, merge `3414f0becb`), LAB-60 включена (`c0588df2b3` → `7500e2c3b8`). Повторный перенос не нужен. Их 32 кейса и reference.lgp должны сохраниться побайтно. LAB-62–63 пока представлены только drafts; готовых реализаций в проверенных refs нет.

Новые live/model-прогоны, сборка и установка CLI, изменения AppArmor/ОС, публикация ветки, изменения карточек и запуск LAB-62–63 в этот этап не входят. Исходные результаты и installed pins сохраняются с историческим смыслом.

## Порядок переноса

1. Сохранить binary diff, исходные refs и индекс рабочей копии в `/home/kiselev/storage/tmp/`. Только после повторной проверки отсутствия unstaged/untracked изменений и равенства индекса `204c5c0258` обновить устаревший checkout командой `git read-tree -m -u 204c5c0258 d627dd2651`. При изменившемся состоянии остановить этот шаг без принудительного восстановления.
2. Последовательно перенести только runtime source/tests следующих четырёх зависимостей из истории `origin/lab61-owner-fix`, по одному адаптированному коммиту с исходным SHA: `2acc44bae02663132b5ec3e26a7257a1bc1a9cdc`, `97499df591b34f9f4290b30610965c8ee0b7a76f`, `27b11bf2307cb94dd1ca73708f64659270f02e93`, `d17a0fc42513171b3c7563bb005d5a7919d72b9b`. Использовать scoped diff `packages/loginom-runtime/` и `git apply --3way --index`. Старые docs/native matrices этих коммитов не переносить. Перед реализацией каждой зависимости воспроизвести соответствующий поведенческий RED, затем GREEN с исходными положительными/отрицательными тестами.
3. Выполнить полный `cherry-pick -x` последовательно: `2e990a84aa25dc37a4e808da564be752aae6f564` (`origin/lab61-epoch-fix`), `4070ca4a70c03bf4fcb0024fa860e3bac987b547` (`origin/lab61-initial-fix`), `a2ba3d0fc8de25c50e497233506b4a6e4f50e06d` (`origin/lab61-owner-fix`). Остальную историю старой CLI и OS proposals не включать.
4. Выполнить `git cherry-pick -x 7d3a5cbda2873094219dec836b1b6c0ffa40f639..a0218e41029e51c8bf4134a8594e4dfe598e1b35` из `origin/owned-truth-predicates`. Это 31 линейный коммит: четыре начальных до `1b93b62c8b` из `origin/lab61-diagnostics`, `6ed1f51393` из `origin/lab61-initial-cases-a2ba` и 26 checker/test fixes до принятого exact SHA. Не переносить вершины промежуточных веток повторно.
5. Сохранить source → integrated SHA mapping и результаты проверок в этом документе; обновить действующий runbook и checkpoint (до 20 строк), не переписывая исторические отчёты.

## Совместимость и проверки

Перенос `97499df591` добавляет необязательные `settings.format.multiple_delimiters`, `date_format`, `date_separator` и соответствующие readback schema/types. При отсутствии параметров прежнее поведение сохраняется. Protocol и Server HttpApi не меняются, генерация Client не требуется. Не заменять runtime целиком старым `a2ba`: сохранить target-specific guards, в том числе `workspace-ui.mjs`.

- Побайтно сравнить 140 файлов десяти кейсов, checker и его тест с принятым `a0218e4102`; полный Git tree с ним совпадать не должен.
- Подтвердить сохранность всех материалов 32 кейсов LAB-58–60 и 32 reference.lgp относительно исходной общей ветки.
- Выполнить runtime RED → GREEN для неполных настроек, форматов дат, владения combo и количества полей; затем один полный `bun run test:upstream` из `packages/loginom-runtime` с Node 24.19.0.
- Из `evals/` выполнить `bun test --timeout 30000` и `bun typecheck` с Bun 1.3.14. Временные данные и сырые логи держать в `/home/kiselev/storage/tmp/`, не в Git.
- Проверить итоговый diff и чистоту ветки. Сохранять исходный SHA в каждом переносе; адаптированным коммитам давать conventional commit title.

## Исполнение

Устаревший checkout восстановлен до `d627dd2651` без изменения ref. Индекс и рабочие файлы точно соответствовали `204c5c0258`; binary diff, список refs и индекс сохранены в `/home/kiselev/storage/tmp/text-import-integration-20261019T133451Z/`. Рабочая копия после обновления чистая.
