# 07. Группировка — аудит требований

Статус: **implemented / live_verified**; автономный аудит **49/49 PASS**.
Source runtime; production и установленный клиент не обновлялись.
[Ход работы](07-progress.md), [закреплённые источники](07-source-pins.md).

| Требование | Реализация и доказательство |
| --- | --- |
| Новый/существующий узел и точный вход | `grouping-node.mjs` в общем lifecycle; новый узел `group-exclusion-1788972821805`, изменение `group-full-1788971123153` |
| Полные упорядоченные группы и показатели | Native ChainedStore/input inventory, dispositions6/7, точные record IDs; конфигурация и независимый аудит нескольких ключей |
| Пять функций и несколько функций поля | sum/count/avg/min/max, проверка всех14 переключателей Factor и итогового bitset; `group-null-1788972776859` 3×7 |
| Имена/метки и дублирующиеся метки | Прямые native source→target links, общий редактор/порядок выхода; одинаковые метки суммы/среднего, аудит 4×3 |
| Остальные настройки | Проверка неизменности кэширования/сортировки и concat options, input field IDs/types/labels |
| Mapping и autosync | Общий input/output mapping; исключение optional key и autosync=false, восстановление после сохранения подтверждено |
| Ошибка до создания узла | Отсутствующее поле и сумма строки — NOT_APPLIED/cleanup, node=null; конфликт имён отклонён до браузера |
| Точные значения и полнота | Независимый Python oracle сравнивает полный multiset и raw table pages/форматы, binary64 без допуска; отдельный расчёт не использует итог handler |
| Null/пустые/отрицательные/дробные значения | Fixture150bytes, группы A/B/C, count включает строки, avg игнорирует пропуски; all-null sum/avg/min/max = Null |
| Пустой вход | `group-empty-full-1788973846231`, 0×7, configuration/output audits PASS |
| Execute и новое выполнение | Общий process baseline, новое execution identity, точный native child + Show Node + свежая Table; без повторного запуска по неизвестному ответу |
| Done/Close/Factor Cancel | `group-done-qa-1788973939508`, `group-close-qa-1788973896904`, `group-factor-cancel-1788974047351`: без Execute; отмена сохранила исходную конфигурацию |
| Гонка до жеста | Strict UI_EPOCH_CHANGED refresh, максимум2; общая последовательность preflight/main исправлена и независимо проверена |
| Потерянный ответ Apply | `group-lost-factor-1788974089038`: один реальный Apply, dropped response, повтор того же ID не выполняет действие; AMBIGUOUS/configure pending |
| Checkpoint и package persistence | Local checkpoints у успешных узлов; отдельный save, сохранность настроек исключения и новый выход после reopen проверены независимо |
| Автономный goal-only Hermes | `20260909-204416-901e8de6`, Sol/low, 49/49 PASS; повтор по замороженным исходникам совпал |

## Итоговая автономная приёмка

Run `20260909-204416-901e8de6`, `openai-codex / gpt-5.6-sol / low`,
существующая подписка, без fallback. Пакет:
`/user/dock-p3/packages/Dock-acceptance-20260909-204416-901e8de6.lgp`.
Пять node.apply: импорт 8×5, новая Группировка 3×7, изменение того же узла 4×4,
повторный импорт и Группировка после reopen. Два save; лишних аналитических
узлов и модельных UI-кликов нет. Все точные значения, null semantics, native
links, сохранённые настройки и свежие execution identities приняты независимым
аудитором. Полный multiset итогового выхода до/после reopen:

| Group | OtherTotal | MeanAmount | TextRows |
| --- | ---: | ---: | ---: |
| A | 30 | 1.25 | 2 |
| A | -1 | -2.5 | 2 |
| B | 3 | 0.0617283945061725 | 2 |
| C | 7 | Null | 2 |

Evidence root: `.dock/grouping-v3/hermes-runs/20260909-204416-901e8de6`.
Сохранены и побайтно проверены 256 файлов:102 runtime +154 harness inputs.
Повтор `audit_directory` из frozen-source дал тот же **49/49 PASS**.

| Артефакт | SHA256 |
| --- | --- |
| Runtime revision | `5641f29244f3c3b77bbddc947b09539f7cfc2c544ca9c49b121f48dba7915c01` |
| grouping-node-audit.json и grouping-node-frozen-audit.json | `d501c8200f77292fd285ee51f0cefc03843e4e1723f3807c13aa291ead305f97` |
| frozen-source-manifest.json | `ab36eaee7dd9ead81ce6d784d65035887bc28e1fe4ef023003578a822014b7af` |
| evidence.json | `300f4f49baaae4876addb0e500834dcddb43d5fd9ee6d3f8497e7ac92d4be074` |

Два прежних FAIL сохранены и разобраны в [progress](07-progress.md): дефекты
oracle/ограничение identity mapping, затем некорректный URI справки. Текущий PASS
получен новым независимым прогоном после диагностики; старые результаты не переписаны.

## Проверки исходников

Client: **1115 PASS, 1 SKIP**, Python: **409 PASS**. Полные журналы:
`.dock/grouping-v3/final-client-tests.log`, `.dock/grouping-v3/final-python-tests.log`.
Адресные live/audit доказательства находятся в двух диагностических каталогах:
`.dock/calculator-v3/live-1788967321873` и `.dock/calculator-v3/live-1788973416670`.
Ни локальные тесты, ни Codex-диагностика не заменяют Hermes acceptance.

## Границы

- Реализован `aggregate`; имена — ASCII identifiers до128 символов. Sum/avg —
  только integer/real; остальные режимы не объявлены готовыми обработчиками.
- Поддержан один активный табличный источник, единственный output0. Полная
  перенастройка требует явного входа. Для aliases задаётся полный input mapping;
  повтор существующего узла без изменений использует parameters={}, inputs=[], mappings=[].
- Входные исключения, исключение агрегатов и включение ранее исключённого ключа
  не поддержаны общим mapping handler. Optional key исключается с исходными
  именем/меткой; заданный порядок действует внутри native active/excluded групп.
- При autosync=true Loginom может переставить сквозные поля относительно
  переименованных агрегатов после открытия пакета. Сохранность явного порядка
  проверена при autosync=false. Handler сообщает фактически наблюдённую схему.
- При вытеснении старой истории процессов (наблюдалось на21-м запуске) действует
  отказ подтверждения, а не ложный успех. Произвольное удаление истории/повторный
  Execute для обхода проверки не выполняются. Offscreen запись выявляется bounded scroll.
- Обработчик candidate source runtime; публикация релиза, VPS build/deploy и
  обновление установленного клиента в эту реализацию не включены.
