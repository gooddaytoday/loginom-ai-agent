# Knowledge Close: локальное применение к Benchmark

## Результат и разрешение

Владелец 01.11.2026 разрешил применить уже проверенную правку Knowledge к отдельной локальной поставке Benchmark и обновить pins. Новое уточнение владельца: принятая пара требует одной версии runtime для D/B. P19D остаётся на прежней версии без повторения; P19 целиком deferred, если B нельзя корректно завершить на той же версии. Новые неизмеренные пары используют новую проверенную версию для обеих форм.

Source fix и его RED→GREEN, Node/Host проверки и SPEC+QUALITY review — [исходный план](2026-11-01-knowledge-close-exit.md). Точный исторический триггер P19B неизвестен. Реальное исправление исходного пути ещё не подтверждено.

## Способ и границы

Использовать существующие `build-cli.ts --no-archive`, `installCli` и проверки manifest. Штатного overlay нет. Отдельный detached build checkout создаётся из sourceCommit фактически установленного Benchmark; в него переносится только проверенный `knowledge-entry.mjs` из текущего рабочего дерева. Это build scratch, не новая среда Loginom. Основная ветка и её dirty files сохраняются. Новый private install home сохраняет прежнюю поставку и Authoring path.

Никаких новых production скриптов, runtime зависимостей, wrapper, retry, timeout или guard changes. Модели/судья, OAuth, слоты, серверы и бюджеты остаются прежними. Существующие установленные Node/Chromium и pinned build toolchain используются повторно. Build dependencies берутся из lock baseline штатным frozen install; не подключать workspace-код из другого checkout. Не переносить чужие private patches.

## Шаги и проверки

1. Независимое review плана; проверить прежние terminal/cleanup/lease и исходную установленную identity. Сохранить private activation intent, старые config/manifest pins и source diff. Результат: только одна разрешённая поправка к baseline, нет живого владельца слота.
2. Создать отдельный build checkout baseline и внести только Knowledge source fix. Выполнить штатную frozen установку build dependencies и `build-cli --no-archive` с прежними release pins и отдельной development version. Результат: manifest соответствует фактически собранному source snapshot; build не изменил source или lock.
3. Штатно установить candidate в новый private home и проверить manifest/resources/modes, actual binary identity и ровно ожидаемый source diff. Старый install и Authoring неизменны. Результат: целостная отдельная поставка с сохранённым pin receipt.
4. Перед переключением установить отсутствие активных Benchmark операций. Обновить только `EVAL_CLI_BIN` в принятом private config, сохранить старые pins и границу версий в существующем intent. После смены сборки выполнить шаг1 memory-процедуры дизайна: проверить фактический каталог/hook/capture/identity; получить полный snapshot перед модельной серией. Результат: новая версия обозначена честно, память не перенесла ответ D→B.
5. Один обычный запуск следующей ещё не измеренной формы P24B через существующий G06 argv и runner служит проверкой исходной preparation/status цепочки и, если она проходит, единственной модельной попыткой этой формы. Не добавлять отдельный status/model smoke. Проверить original Knowledge ACK + actual exit0/no signal, outcome/попытки, штатные cleanup/archive/releases и необходимые memory/resource evidence. Один независимый combined review законченного этапа. Результат: измеренная B либо конкретный сохранённый отказ без лишних повторов.

При повторном отказе исправленной поставки: сохранить evidence, штатно закрыть собственные ресурсы и проверить одну новую гипотезу, не наращивая обвязку. Не считать ACK доказательством выхода; guard не удалять. Бюджет формы определяется фактическим model dispatch, не числом предмодельных допусков.

## Цена и исключения

Ожидаемый tracked diff: этот план и актуализация прежнего решения в двух нормативных документах/checkpoint, 3–4 файла / 45–80 строк; source fix уже существует и не меняется. Private: один build checkout, candidate/install, pins и стандартные run/evidence. Новых механизмов нет: отдельная сборка нужна, чтобы не захватить посторонние source changes и не переписать действующую поставку.

Исключены новый Loginom setup, OAuth, карантин, N=2, изменение бюджета/моделей/судьи, повторы завершённых форм, commit/push/merge/release. Старые 65 кейсов сохраняются. Только подтверждённый установленный путь снимает текущий блокер; source tests этого не доказывают.
