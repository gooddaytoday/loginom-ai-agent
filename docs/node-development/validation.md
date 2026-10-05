# Проверка комплекта документации

## Завершение переработки подпланов, 2026-10-05

В ветке `node-coverage-plans` завершены пакеты A–I из временной инструкции: переписаны оставшиеся **74 подплана и 74 карточки**. Все **78 компонентов** имеют подпланы с разделами 0–6 по [шаблону](templates/node-plan.md). Для **14 ранее реализованных узлов** указан `reverification_required` и следующий этап 0 — перепроверка; для **63 новых** — `discovery_required`, исследование и самостоятельные этапы разработки. Кросс-таблица сохраняет принятый подплан редакции 4. Четыре пилота не изменены этой переработкой.

Все 62 прежних новых черновика теперь оформлены по шаблону, включая пилот ARIMAX; 61 переписан в этой работе. Сохранены **330/330 требований rNN** оставшихся черновиков: полный текст каждой возможности распределён по этапам, независимые проверки перенесены в разделы данных/приёмки. У JavaScript r08 уточнена ссылка на полный список FS-методов; объём проверки сохранён. У реализованных сохранены адресные действия, fixtures/oracle, негативные случаи и непокрытые режимы Help. Приёмочные комплекты реализованных узлов собирают будущие карточки Multica.

Переработка процесса, шаблона и валидатора выполнена предшествующими коммитами: RUNBOOK заменяет прежние отдельные документы процесса, карточки задаются разделом 0 подплана, валидатор проверяет строку статуса и заголовки 0–6. Готовность `registry.json` и его `plan_status` не изменялись; `history/`, `provenance.json` и четыре пилотных каталога неизменны относительно исходного SHA `179067ffa`. Архив остаётся историческим источником, его PASS не переносится.

Проверено в текущей работе:

- `python3 docs/node-development/tools/validate.py --render`, затем обычная проверка — PASS, `errors: []`: 78 компонентов, 15 зарегистрированных обработчиков, контроль 342 исторических файлов и ссылок.
- Повторная генерация `inventory.md` не меняет байты; `git diff --check` проходит.
- Дополнительная сверка относительно `179067ffa`: все требования rNN сохранены в этапах, старые таблицы требований удалены; реестр, архив, происхождение и пилоты не изменены.
- Выборочно перечитано по два подплана каждого пакета; проверены относительные ссылки, узловые источники и номера строк базы `loginom@dada8010e`. Help локально на `353e506b`, E2E на `486caef44`, обе копии без изменений.
- Независимо вычитаны Выполнение программы, Разбор XML, REST и Python; замечания о зависимостях Python и определённости входного сценария исправлены и перечитаны.

**Не проверялось:** runtime-тесты, живой UI, E2E, модельные CLI-прогоны и аналитическая приёмка узлов. Исходный архив ZIP отдельно не проверялся. Доступность компонентов, мастера, умолчания, реальные схемы/типы, seed/детерминированность и внешние среды остаются предметом этапа 0; конкретные открытые факты перечислены в каждом подплане.

## Общие изменения W и ограничения приёмки

Номер W локален подплану. Одинаковый номер не означает общий контракт между разными узлами; переиспользование требует принятого SHA и адресной регрессии. Нужные конкретному этапу W согласует владелец до реализации; поздние W не блокируют ранний самостоятельный срез.

| Узел | Предложения W по всем этапам |
|---|---|
| [Условие](nodes/control-condition/plan.md) (`control-condition`) | W1, W2, W3 |
| [Выполнение узла](nodes/control-execnode/plan.md) (`control-execnode`) | W1, W2, W3 |
| [Цикл](nodes/control-loop/plan.md) (`control-loop`) | W1, W2, W3, W4 |
| [Узел-ссылка](nodes/control-referencenode/plan.md) (`control-referencenode`) | W1, W2, W3 |
| [Подмодель](nodes/control-supernode/plan.md) (`control-supernode`) | W1, W2, W3 |
| [ARIMAX](nodes/datamining-arimax/plan.md) (`datamining-arimax`) | W1, W2 |
| [Ассоциативные правила](nodes/datamining-assnrules/plan.md) (`datamining-assnrules`) | W1, W2, W3 |
| [Кластеризация транзакций](nodes/datamining-clope/plan.md) (`datamining-clope`) | W1, W2, W3 |
| [Кластеризация](nodes/datamining-clustering/plan.md) (`datamining-clustering`) | W1, W2, W3 |
| [EM Кластеризация](nodes/datamining-emclust/plan.md) (`datamining-emclust`) | W1, W2, W3 |
| [Линейная регрессия](nodes/datamining-linregression/plan.md) (`datamining-linregression`) | W1, W2, W3, W4 |
| [Логистическая регрессия](nodes/datamining-logregression/plan.md) (`datamining-logregression`) | W1, W2, W3, W4 |
| [Нейросеть (классификация)](nodes/datamining-neuralnetclass/plan.md) (`datamining-neuralnetclass`) | W1, W2, W4 |
| [Нейросеть (регрессия)](nodes/datamining-neuralnetreg/plan.md) (`datamining-neuralnetreg`) | W1, W2, W4 |
| [Самоорганизующаяся сеть](nodes/datamining-sonn/plan.md) (`datamining-sonn`) | W1, W2, W3 |
| [Экспорт — База данных](nodes/exports-database/plan.md) (`exports-database`) | W1, W2, W3 |
| [Экспорт — Excel файл](nodes/exports-excel/plan.md) (`exports-excel`) | W1, W2, W3 |
| [Экспорт — Kafka](nodes/exports-kafka/plan.md) (`exports-kafka`) | W1, W2, W3 |
| [Экспорт — Loginom Data файл](nodes/exports-lgd/plan.md) (`exports-lgd`) | W1, W2, W3 |
| [Экспорт — Tableau файл](nodes/exports-tableau/plan.md) (`exports-tableau`) | W1, W2, W3 |
| [Экспорт — Deductor Warehouse](nodes/exports-warehouse/plan.md) (`exports-warehouse`) | W1, W2 |
| [Экспорт — XML файл](nodes/exports-xml/plan.md) (`exports-xml`) | W1, W2, W3, W4 |
| [Импорт — База данных](nodes/imports-database/plan.md) (`imports-database`) | W1, W2, W3 |
| [Импорт — Excel файл](nodes/imports-excel/plan.md) (`imports-excel`) | W1, W2, W3 |
| [Импорт — Kafka](nodes/imports-kafka/plan.md) (`imports-kafka`) | W1, W2, W3 |
| [Импорт — Loginom Data файл](nodes/imports-lgd/plan.md) (`imports-lgd`) | W1, W2 |
| [Импорт — 1С Запрос](nodes/imports-onecrequest/plan.md) (`imports-onecrequest`) | W1, W2 |
| [Импорт — Deductor Warehouse](nodes/imports-warehouse/plan.md) (`imports-warehouse`) | W1, W2 |
| [Импорт — XML файл](nodes/imports-xml/plan.md) (`imports-xml`) | W1, W2, W3 |
| [Формирование XML](nodes/integration-datatoxml/plan.md) (`integration-datatoxml`) | W1, W2 |
| [Выполнение программы](nodes/integration-execcmd/plan.md) (`integration-execcmd`) | W1, W2 |
| [Разбор XML](nodes/integration-extractxml/plan.md) (`integration-extractxml`) | W1, W2, W3 |
| [REST-запрос](nodes/integration-restrequest/plan.md) (`integration-restrequest`) | W1, W2, W3 |
| [SOAP-запрос](nodes/integration-soaprequest/plan.md) (`integration-soaprequest`) | W1, W2, W3 |
| [SQL-скрипт](nodes/integration-sqlscript/plan.md) (`integration-sqlscript`) | W1, W2, W3 |
| [Квантование](nodes/preprocessing-binning/plan.md) (`preprocessing-binning`) | W1, W2, W3 |
| [Конечные классы](nodes/preprocessing-coarseclasses/plan.md) (`preprocessing-coarseclasses`) | W1, W2, W3 |
| [Разбиение на множества](nodes/preprocessing-datapartition/plan.md) (`preprocessing-datapartition`) | W3 |
| [Редактирование выбросов](nodes/preprocessing-elimoutlier/plan.md) (`preprocessing-elimoutlier`) | W2, W3 |
| [Сглаживание](nodes/preprocessing-smoothing/plan.md) (`preprocessing-smoothing`) | W2 |
| [JavaScript](nodes/programming-javascript/plan.md) (`programming-javascript`) | W1, W2, W3, W4 |
| [Python](nodes/programming-python/plan.md) (`programming-python`) | W1, W2, W3, W4 |
| [Автокорреляция](nodes/research-autocorrelation/plan.md) (`research-autocorrelation`) | W2 |
| [Корреляционный анализ](nodes/research-corranalysis/plan.md) (`research-corranalysis`) | W2 |
| [Факторный анализ](nodes/research-factoranalysis/plan.md) (`research-factoranalysis`) | W1, W2, W3, W5 |
| [Качество данных](nodes/research-quality/plan.md) (`research-quality`) | W3; W2 условно по этапу 0 |
| [Соединение (таблицы по позиции)](nodes/transform-coluniondata/plan.md) (`transform-coluniondata`) | W1 |
| [Разгруппировка](nodes/transform-ungroupdata/plan.md) (`transform-ungroupdata`) | W1, W2, W3 |
| [Калькулятор (дерево)](nodes/trees-calculatortree/plan.md) (`trees-calculatortree`) | W1, W2, W3, W4, W5 |
| [Таблица в дерево](nodes/trees-datatotree/plan.md) (`trees-datatotree`) | W1, W2 |
| [JSON в дерево](nodes/trees-jsontotree/plan.md) (`trees-jsontotree`) | W1, W2 |
| [Слияние (дерево)](nodes/trees-joindatatree/plan.md) (`trees-joindatatree`) | W1, W2 |
| [Дерево в таблицу](nodes/trees-treetodata/plan.md) (`trees-treetodata`) | W1, W2 |
| [Дерево в JSON](nodes/trees-treetojson/plan.md) (`trees-treetojson`) | W1, W2 |
| [Объединение (дерево)](nodes/trees-uniontree/plan.md) (`trees-uniontree`) | W1, W2, W3 |
| [Калькулятор (переменные)](nodes/variables-calculator/plan.md) (`variables-calculator`) | W1 |
| [Соединение (переменные)](nodes/variables-coluniondatavar/plan.md) (`variables-coluniondatavar`) | W1, W2 |
| [Таблица в переменные](nodes/variables-datatovar/plan.md) (`variables-datatovar`) | W1, W2 |
| [Замена (переменные)](nodes/variables-replace/plan.md) (`variables-replace`) | W1, W2 |
| [Переменные в таблицу](nodes/variables-vartodata/plan.md) (`variables-vartodata`) | W1, W2 |
| [Текстовый экспорт](nodes/text-export/plan.md) (`text-export`) | W1 — файловая холодная приёмка |
| [Фильтр строк](nodes/row-filter/plan.md) (`row-filter`) | Возможный W1; второй порт требует адресного независимого аудита |
| [Заполнение пропусков](nodes/missing-values/plan.md) (`missing-values`) | Возможный W1 для допуска; пороговый набор из 120 строк требует полного адресного аудита |

У Скользящего окна порт управляющих переменных относится к следующей отдельной карточке. В первом этапе Обогащения, Сэмплинга и Соединения табличных данных общих W не предложено; достаточность оболочки подтверждает этап 0. Кросс-таблица W1–W3 уже входит в `dada8010e`, её прежняя приёмка не доказывает остальные узлы.

Нынешний cold-check проверяет табличный порт 0, до 100 строк на выход, числовые значения точно, строки без учёта порядка. `outputs[]` различает узлы, а не несколько портов одного узла. Полные результаты деревьев, переменных, файлов, вложенных графов, внешних эффектов, порядок и большие наборы требуют явно описанных дополнительных аудитов/согласованных W. Этап 0 статистических узлов закрепляет численные допуски до прогона; динамическая схема программирования требует собственной same-node проверки при смене источника.

## Коммиты переработки

| SHA | Изменения |
|---|---|
| `b9322bc48` | G: интеграция и программирование |
| `eceedee95` | D: обучаемые узлы |
| `1761821ef` | H: предобработка и статистика |
| `623a5f479` | C: управление и переменные |
| `da9ef525e` | I: трансформация и деревья |
| `266060e94` | A: реализованные, первая группа |
| `63840c768` | B: реализованные, вторая группа |
| `069dd8683` | E: экспорт |
| `4aa3c58a4` | F: импорт |
| `1f09a5e36` | Уточнения входов программирования и зависимостей этапов |

Временная инструкция удаляется отдельным следующим коммитом; итоговая точка продолжения остаётся здесь. Предшествующие четыре локальных коммита `9632c8ea9`, `92394ed8f`, `031ffb1e4`, `179067ffa` сохранены.

## Точка продолжения

- Ветка: `node-coverage-plans`, целевой PR [#34](https://github.com/gooddaytoday/loginom-ai-agent/pull/34) → `loginom`; исходник проверки runtime `dada8010e`, результат переработки — `1f09a5e36` плюс запись проверки и удаление временной инструкции.
- Результат: 78 подпланов по шаблону; 14 перепроверок, 63 исследования, один принятый подплан; документационная проверка PASS.
- Ограничения: живых прогонов нет, готовность реестра прежняя; CI не исправлялся — изменения `a771f3f11` и `4319e180f` находятся вне объёма ветки.
- Генератор продолжает из раздела 0 выбранного узла после сверки активной карточки, SHA, аккаунтов и среды; W нужного этапа — по решению владельца.
- Слияние PR и выпуск выполняет владелец отдельной командой.
