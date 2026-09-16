> Дополнение после исходной приёмки 10 сентября 2026: короткий пользовательский
> промпт с другим sales.csv выявил ошибку чтения перенесённой подписи графа.
> Исправление принято отдельным run `20260910-125653` на runtime `d023c3ab…`;
> вычисления и сохранённый сценарий — 44/44 PASS исправленного аудитора.
> Это отдельные данные и границы проверки; исторические результаты этого
> подплана ниже относятся к своим исходным pins.
> [Полный разбор](../../loginom-dock/rename-recovery-fix-2026-09-10.md).

# 08. Сортировка и продажи — аудит требований

Статус: **implemented / live_verified**, source runtime. Codex live QA и
самостоятельный Hermes приняты, независимый аудит **56/56 PASS**. V3 завершён. Production и установленный клиент не обновлялись.
[Прогресс и исходные отказы](08-progress.md), [источники](08-source-pins.md).

| Требование | Реализация и проверенное доказательство |
| --- | --- |
| Новый и существующий узел | `transform.sorting / keys`, общий node.apply lifecycle; full new/existing operations 1789022525244 и 1789022689056 |
| Несколько ключей, порядок, независимые направления | Полная замена списка и native readback; Revenue/Id/Note заменены на Note DESC, Adjusted ASC, Id DESC; многоключевые рейтинги продаж |
| Регистр и сравнение с локалью | Явные строковые/variant flags, default locale=true для нового, сохранение существующего; native string fixtures и independent full-row audits |
| Остальные настройки | Кэш и потоки сохраняются, variable-driven flags отклоняются; readback проверяет фактический input inventory |
| Input/output mapping | `MapAlias08`, переименование RevenueValue, одинаковые метки, перестановка и исключение Comment; полный проектированный выход 7 полей PASS |
| Числа, дроби и отрицательные | NumericAsc08 и рейтинги DESC; новые точные Decimal expectations продаж, отрицательная Quantity и ноль |
| Даты | AllTypesSorting DATE с разными значениями, sort-fixture-date-1789026139469, полная упорядоченность и multiset PASS |
| Null, дубли, пустой вход | sorting-edges-v1, ASC/DESC/Latin case=false и тот же узел после пустого upstream; executions45/47/49/53 PASS |
| Ошибка до изменения целевого узла | sort-missing-field-1789027028275 NOT_APPLIED, cleanup=true, effect=false; отдельный graph count подтверждает отсутствие узла |
| Close и Done | sorting-close-1789022851228 отменил новые параметры; sorting-done-1789022858591 подтвердил старые, без запуска и старого кэша под видом нового результата |
| Execute и актуальный результат | Новый process identity, native owner и полная Table; конфигурационный и независимый output аудит, без обещания точности formatted-only variant |
| Гонка до жеста и потеря ответа | Общие lifecycle regression tests: максимум2 строгих pre-gesture refresh, AMBIGUOUS после возможного эффекта и запрет повторного Finish. Sorting-specific fault injection после Execute отдельно не проводилась |
| Checkpoints и roundtrip | QA packages сохранены; ручной six-node sales package сохранён, закрыт/открыт и обе ветви перевыполнены; settings/output audits PASS |
| Самостоятельная задача продаж | Run20260910-113507-53ef2ba4, Sol/low,56/56 PASS; повтор из frozen-source совпал |

## Финальная автономная приёмка

Run `20260910-113507-53ef2ba4`, existing subscription
`openai-codex / gpt-5.6-sol / low`, без fallback. Восемь node.apply: шесть новых
узлов и повтор двух Sorting после финального сохранения и открытия. Приняты
доставка точных250bytes/SHA, десять вычисленных строк, полный порядок четырёх
строк каждой ветви, четырёхэтапное сохранение, граф6/5 и сохранённые настройки.
Внутренними кликами узлов модель не управляла; каждый узел обслуживался локально.

Пакет: `/user/dock-p3/packages/Dock-acceptance-20260910-113507-53ef2ba4.lgp`.
Source CSV SHA `44880a6c4a442226889c06d9703f8ba77316b42b35bd82da14a43dc25c039a6b`.

| Товар | Выручка | Регион | Выручка |
| --- | ---: | --- | ---: |
| Alpha | 50 | East | 68 |
| Beta | 50 | North | 51.75 |
| Gamma | 42.75 | West | 35 |
| Delta | 40 | South | 28 |

Общий итог182.75. Эти строки независимо проверены до и после открытия; равные
товарные суммы упорядочены вторым ключом ASC с учётом регистра, binary mode.

Evidence root: `.dock/sorting-v3/runs/20260910-113507-53ef2ba4`.
Зафиксированы и побайтно проверены275files:109 runtime +166 harness.
Повтор `audit_directory` из frozen-source дал побайтно одинаковый результат56/56.
Аудитор задачи намеренно возвращает `subplan_complete=false`: он проверяет sales
scenario. Закрытие подплана в этом документе дополнительно опирается на QA-матрицу.

| Артефакт | SHA256 |
| --- | --- |
| Runtime revision | `96f8b5db7901c29ab5c631d57ad85f6e0f8b9181ed471b311c238732733e081e` |
| Native skill | `0c5236396c477d5424acc74f8fb693ac59539d840ff91169053131bf3bcad140` |
| Goal | `517fca059e4f65fddae3199c9cacd9edd80fb025aaf3b23ec64d1063eb7f8d12` |
| sales-sorting-audit.json / sales-sorting-frozen-audit.json | `532f4066d13fee7c499ad35b09ea2d7bff6015eaa31bd73cc54465cab811b3fa` |
| frozen-source-manifest.json | `79975073757f84fba5bd72f81a2310c731d76edb5cde7793057440d63c127a79` |
| evidence.json | `d5496bf64c2b2d180fa8ada200169179046655f3d586f048036daefe424fbbc8` |

## Измерения финального прохода

Hermes session metadata:572.17s,27 model API calls,26 public calls. Журнал Dock
покрывает510.19s. Сумма локальных фаз узлов215.63s (включая ожидания/transport).

| Фаза | Сумма, s |
| --- | ---: |
| Source + workflow binding | 0.238 |
| Target | 13.874 |
| Input mapping | 17.532 |
| Open | 20.736 |
| Configure | 26.884 |
| Node finish | 13.444 |
| Output mapping | 36.095 |
| Final finish | 13.176 |
| Execute | 14.939 |
| Read | 58.714 |

Промежутки от user/tool сообщения до следующего assistant сообщения суммарно
382.18s, сохранены в `model-timing-metadata.json` без чтения reasoning. Это оценка
модельных запросов с сетью/обвязкой, **не изолированное время вычисления модели**.
Она может пересекаться с асинхронной работой узлов; складывать её с фазами нельзя.
Ожидания входят в соответствующие фазы, отдельно чистое CPU/UI время не измерено.
Полные интервалы каждой операции — `efficiency.json`.

Provider-reported tokens: input82723, output7978, total1313357, cache_read1222656,
reasoning1126; счётчики cache/reasoning могут входить в другие категории.
Исторические FAIL и остановленный run сохранены; их расходы не включены в эти
измерения финального прохода. После каждого отказа выполнялась Codex diagnosis,
описанная в [progress](08-progress.md); старые результаты не переписаны.

## Проверки исходников

Client: **1141 PASS, 1 SKIP**; Python: **425 PASS**. Полные журналы:
`.dock/sorting-v3/all-client-tests-final.log` и
`.dock/sorting-v3/all-python-tests-audit-fix.log`.
Live evidence: `.dock/calculator-v3/live-1789021537858`.

## Границы доказательств

- Binary mode с case=false игнорирует регистр только латинских букв согласно
  Help; кириллица проверена отдельно. Фактическая локаль QA-узла прочитана в
  Inspector: Russian (Russia). Runtime не извлекает идентификатор серверной
  локали автоматически и сообщает locale_verified=false; язык браузера её
  не доказывает. Порядок произвольной другой локали не объявлен проверенным.
- Native Null ASC-first/DESC-last наблюдался на закреплённом профиле; отдельной
  SQL-политики NULLS FIRST/LAST в параметрах нет. Равные полные ключи не обещают
  стабильности исходного порядка.
- Variant: настройки и сохранение шести строк/типизированной проекции проверены.
  Его formatted_display имеет precision=unverified; общий mixed-type порядок
  и точность внутренних variant значений не доказаны.
- Один вход/выход0, ключи — уникальные внутренние ASCII имена до128 символов,
  не более128 ключей. Полная перенастройка требует явного входа; повтор без
  изменений использует parameters={}, inputs=[], mappings=[].
- На длинной диагностической сессии с несколькими Files tabs оставался безопасный
  navigation timeout до отправки файла. Тот отдельный upload продолжен после
  ручной проверки пути; это не доказательство автономного recovery.
