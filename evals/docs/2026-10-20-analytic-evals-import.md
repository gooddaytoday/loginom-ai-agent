# Перенос 30 analytic evals, 2026-10-20

## Контрольная точка

- Ветка `analytic-evals-import`, база `loginom` / `775778d38bbb728805fac8af161a7211f03db170`; основной checkout этой работой не переключался.
- Согласованный план независимо проверен до исполнения; существенных замечаний нет.
- Перенесены 30 новых ID / 240 файлов; все 35 прежних ID / 280 файлов неизменны. Исходная приёмка новых 30 — PASS.
- RED: 22 pass / 1 fail (ожидалось 65, получено 35). GREEN после копирования: 23 pass / 0 fail. Загрузка 65 задач, выбор через `--only` и все ожидаемые хэши подтверждены.
- Полный `bun test`: 770 pass / 8 skip / 0 fail, exit0; `bun typecheck` PASS. Независимый пересчёт near-miss PASS: 35 задач / 114 мутаций.
- Независимое итоговое ревью PASS; замечание об устаревшей фразе README исправлено и перепроверено. Все предусмотренные проверки переноса завершены. Публикация и слияние не выполнялись.
- Временные доказательства переноса: `/home/kiselev/storage/tmp/analytic-evals-import-20261020-8tp1ioan/`.

## План и гарантии

1. Повторить импорт `3e746890a3`: полные восемь файлов каждого нового кейса копируются из `/home/kiselev/git/agent-validation/sources/analytic-evals` в `evals/tasks/analytic` без преобразований.
2. Сохранить все прежние 280 файлов, включая более новую рубрику `category-rating-revenue` из `c8906864a4`; внешняя копия этого старого кейса не заменяет репозиторную.
3. Обновить существующий corpus pin test через RED → GREEN, README и статус калибровки в AGENTS. Loader, API, runner, изоляцию, профили и хранилище Loginom не менять; исходную коллекцию не удалять.
4. Перенести существующий JSON калибровки новых 30, сохранив 60 результатов и foreign references. Повторные платные вызовы, browser rerun и baseline не требуются для неизменных материалов.
5. Проверить 240 новых / 280 прежних файлов, loader65/only, хэши, `bun test test/task.test.ts`, `bun test`, `bun typecheck` и `python3 script/check-calibration-corpus.py --tasks tasks/analytic` из `evals/` с TMPDIR под `/home/kiselev/storage/tmp/`.
6. Независимое ревью итогового diff; один локальный коммит `feat(evals): import 30 analytic reference cases`. Push, PR и слияние не входят в перенос.

## Подтверждённые хэши

- Итоговые 65, agent inputs: `dd1a21c6be4e0482ea3d1fd700ec1f5e4140abb037502d0310f16fda8e9773cc`.
- Итоговые 65, rubric: `a39049e6d2660ce57f9ae23dd3e1ddbc99ea4d1adb8cfa8c953c2c7582579377`.
- Только новые 30, agent inputs: `44bf0ec4a2fcd938726e0d0bc0000db5241649d065d12c6ce42b315bcec167c7`.
- Только новые 30, rubric: `6dc47e0fa91e8cfdd2d9d8062f9fd2c7758ace0868b498cf31526412c6503fe6`.

Общий rubric отличается от внешнего корпуса из-за сохранённого исправления старого кейса. Near-miss корпус остаётся 35 задач / 114 мутаций; новые 30 не имеют near-miss покрытия.

## Проверки переноса

- Все 240 новых файлов и сохранённый JSON калибровки побайтно совпали с источником, в том числе после помещения в Git index. Все прежние 280 файлов совпали со снимком и базовым commit; лишних файлов в их каталогах нет.
- Loader загрузил 65 задач и отдельно новые 30 / прежние 35; `--only monthly-retention-curve` выбрал ровно один новый кейс. Все четыре хэша выше подтверждены фактическим loader.
- `bun test test/task.test.ts`: RED 22 pass / 1 fail до копирования, GREEN 23 pass / 0 fail после него.
- `bun test`: 770 pass / 8 skip / 0 fail, 778 тестов в 59 файлах, 655.51 с, exit0. Восемь существующих проверок settlement/registration пропущены штатными `nativeBusy`/`browserBusy` guards: на хосте есть сторонние Loginom/Chromium-процессы. Эти проверки не объявляются выполненными; чужие процессы не останавливались.
- `bun typecheck`: exit0. `python3 script/check-calibration-corpus.py --tasks tasks/analytic`: exit0, 35 задач / 114 мутаций.
- Команды запускались из `evals/` с `TMPDIR=/home/kiselev/storage/tmp`; Bun1.3.14, frozen install без изменения lockfile. Тестовые процессы CLI/судьи использовали фикстуры; новых платных оценок, браузерных повторных выполнений и baseline не было.
- Независимый проверяющий подтвердил байты, состав, калибровку, относительные ссылки и ограничение diff 245 путями: 240 файлов кейсов, три существующих файла и два документа. Открытых замечаний нет; `git diff --check` прошёл.

## Источник принятой серии

- Построение: CLI `0.2.2`, source `a0c3eb758bd5b2d492aa525815f0e9009b3d8835`, модель `openai/gpt-6.1-sol/xhigh`, Loginom 7.4.2.
- Linux artifact: run `39210148809`, `loginom-linux` ID `12168030843`; SHA256 архива `c612eab428e5dc16b9a6105cb4fd401a00c04a25dee6390644b50e86044283b9`.
- Все 30 ранее прошли независимый oracle, проверку фактического графа/полного CSV, отдельное браузерное повторное выполнение с новым CSV и независимое post-review. Исходные CSV сохранены побайтово.
- Упрощений 0, JavaScript 0; технические подсказки использованы только для T10 `bread-milk-affinity` (попытка 4) и T51 `source-device-conversion` (попытка 3). Primary-v2 T10/T12 исправляют авторские единицы измерения и не являются упрощениями.
- Исторические абсолютные пути в provenance и пакетах сохранены как доказательства прежней приёмки; они не являются рабочими зависимостями loader. Входы агента остаются только prompt и inputs.

## Перенесённая калибровка

- [Исходный JSON](2026-10-20-analytic-evals-30-calibration.json) скопирован побайтово из серии `20261020-004227-calibrate-f7LxCs`; SHA256 `b554465b365c50a5048aa514bd0b5dc8e8516dd8d820c7a4ad5c5add61c24cec`.
- Судья `gpt-6-sol/xhigh`, `codex-cli 0.157.0`; все 30 positive получили 100 и oracle=true, 30 foreign negative: 29×0 и 1×25. Пороги 90/40 пройдены; предупреждений и ошибок в итоговом JSON нет.
- Сохранены все 60 строк, включая reference каждого negative: калибровка использовала круг выбранных 30, а не итоговых 65. Positive содержит oracle CSV; negative проверяет чужой пакет без result-пунктов. Near-miss 0; baseline не выполнялся.
- Шесть файлов промпта, схемы и кода оценивания совпали с закреплённым harness исходной серии; рубрики новых 30 совпали с JSON. Повторного судейства при переносе не было.

## Соответствие источников новым кейсам

- T01 → [student-score-summary](../tasks/analytic/student-score-summary/task.json); источник `analitic-tasks/task01-basic-statistics`.
- T03 → [age-pressure-correlation](../tasks/analytic/age-pressure-correlation/task.json); источник `analitic-tasks/task03-correlation`.
- T05 → [tenure-churn-profile](../tasks/analytic/tenure-churn-profile/task.json); источник `analitic-tasks/task05-prediction`.
- T08 → [cluster-label-crosswalk](../tasks/analytic/cluster-label-crosswalk/task.json); источник `analitic-tasks/task08-clustering`.
- T09 → [negative-words-rating](../tasks/analytic/negative-words-rating/task.json); источник `analitic-tasks/task09-sentiment-analysis`.
- T10 → [bread-milk-affinity](../tasks/analytic/bread-milk-affinity/task.json); источник `analitic-tasks/task10-market-basket`.
- T11 → [area-price-linear-fit](../tasks/analytic/area-price-linear-fit/task.json); источник `analitic-tasks/task11-regression`.
- T12 → [zscore-anomaly-check](../tasks/analytic/zscore-anomaly-check/task.json); источник `analitic-tasks/task12-anomaly-detection`.
- T13 → [treatment-followup-profile](../tasks/analytic/treatment-followup-profile/task.json); источник `analitic-tasks/task13-survival-analysis`.
- T15 → [department-worktype-productivity](../tasks/analytic/department-worktype-productivity/task.json); источник `analitic-tasks/task15-hypothesis-testing`.
- T20 → [price-quality-intent](../tasks/analytic/price-quality-intent/task.json); источник `analitic-tasks/task20-conjoint-analysis`.
- T25 → [contract-payment-churn](../tasks/analytic/contract-payment-churn/task.json); источник `analitic-tasks/task25-churn-prediction`.
- T26 → [social-engagement-roi](../tasks/analytic/social-engagement-roi/task.json); источник `analitic-tasks/task26-social-media`.
- T29 → [segment-net-purchase-value](../tasks/analytic/segment-net-purchase-value/task.json); источник `analitic-tasks/task29-customer-segmentation-clv`.
- T36 → [channel-unit-economics](../tasks/analytic/channel-unit-economics/task.json); источник `analitic-tasks/task36-unit-economics`.
- T38 → [monthly-retention-curve](../tasks/analytic/monthly-retention-curve/task.json); источник `analitic-tasks/task38-retention-analysis`.
- T40 → [feature-usage-conversion](../tasks/analytic/feature-usage-conversion/task.json); источник `analitic-tasks/task40-product-analytics`.
- T41 → [sector-weighted-allocation](../tasks/analytic/sector-weighted-allocation/task.json); источник `analitic-tasks/task41-portfolio-analysis`.
- T44 → [journey-outcome-profile](../tasks/analytic/journey-outcome-profile/task.json); источник `analitic-tasks/task44-customer-journey`.
- T50 → [search-engine-cost-efficiency](../tasks/analytic/search-engine-cost-efficiency/task.json); источник `analitic-tasks/task50-seo-sem`.
- T51 → [source-device-conversion](../tasks/analytic/source-device-conversion/task.json); источник `analitic-tasks/task51-yandex-metrica`.
- T53 → [service-digital-processing](../tasks/analytic/service-digital-processing/task.json); источник `analitic-tasks/task53-gosuslugi`.
- T54 → [campaign-region-loss-share](../tasks/analytic/campaign-region-loss-share/task.json); источник `analitic-tasks/task54-yandex-direct`.
- T55 → [district-weighted-indicators](../tasks/analytic/district-weighted-indicators/task.json); источник `analitic-tasks/task55-rosstat`.
- T57 → [listing-promotion-efficiency](../tasks/analytic/listing-promotion-efficiency/task.json); источник `analitic-tasks/task57-avito-analytics`.
- T58 → [city-weather-risk](../tasks/analytic/city-weather-risk/task.json); источник `analitic-tasks/task58-openweather`.
- T60 → [coin-market-momentum](../tasks/analytic/coin-market-momentum/task.json); источник `analitic-tasks/task60-coingecko`.
- T61 → [mission-media-content](../tasks/analytic/mission-media-content/task.json); источник `analitic-tasks/task61-nasa`.
- T62 → [currency-change-profile](../tasks/analytic/currency-change-profile/task.json); источник `analitic-tasks/task62-exchangerate`.
- T64 → [country-access-diversity](../tasks/analytic/country-access-diversity/task.json); источник `analitic-tasks/task64-ipapi`.
