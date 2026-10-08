# CSV cold replay: проверенный адаптер, 2026-10-08

**Результат: собственный контроль warm + два свежих cold выполнения PASS.**
Это проверка нового адаптера на синтетическом reference, не приёмка пакетов
кандидата и не analytic A/B. Этапы5–8 и их соответствующие пункты остаются открыты.

## Что реализовано

`packages/loginom-host/script/skills-acceptance/cold-export.mjs` — независимый
тестовый runner; он не поставляется продуктом и не является model tool.
Получает доверенный план `planColdReplay`, проверяет принадлежность пакета/выхода
попытке, локальный endpoint, абсолютные resource/output paths и точный GUID.
Загружает проверенные runtime resources установленного CLI49. В новой browser
сессии открывает сохранённый пакет и точный узел `exports.text`.

До исполнения читает фактический путь сохранённого экспорта через штатный
мастер и отменяет мастер без применения настроек. Несовпадение UI и плана —
`COLD_SAVED_EXPORT_DESTINATION_MISMATCH`, до execution control. Затем штатный
execution driver подтверждает новый процесс, точный owner и completed result.
Parent собирает только назначенный свежий CSV до logout и подтверждает его SHA;
без подтверждения runner завершает FAIL. Runner отдельно подтверждает закрытие
пакета/logout и отсутствие собственных процессов; oracle и проверку файлов
выполняет parent. Статус runner не выдаётся за полный oracle PASS.

Контроллеры сохранены рядом с evidence. Общий deadline480s,
execution240s и collection30s; неопределённый эффект не повторяется. В принятом
контроле restore выполнялся только для собственных файлов с проверенными SHA.
Settings не применялись повторно, исходный `.lgp` не перезаписывался.

## Исходная ошибка fixture и отрицательный контроль

Первый локальный surrogate заменил пути только в XML, сохранив исходные `.bin`.
UI прочитал старый destination `/user/ref-sales-by-category-1.result.csv`.
Поэтому два первоначальных execution-контроля не получили ожидаемый собственный
CSV и остались FAIL. Это ошибка подготовки контрольного пакета, не установленная
регрессия продукта. На исходном destination обнаружен файл; его прежнее
содержимое до контролей не снято, восстановление/перезапись не доказуемы.
Этот файл не удалялся и не менялся при очистке. Ошибка явно сохранена.

После добавления preflight проверен тот же несогласованный собственный пакет:
точный mismatch отказ, ни одного execute step, закрытие/logout SUCCEEDED,
remaining0, container removed. Отдельный negative review PASS относится только
к guard; whole receipt исходного положительного контроллера сохраняет FAIL.

Для положительного контроля создан новый собственный XML-only reference с
уникальными путями. Удаление `.bin` относится только к первоначальной подготовке
этого синтетического контроля; настоящий пакет продукта не преобразуется для
cold replay. До первого исполнения UI подтвердил именно назначенный путь.

## Положительный контроль

Evidence root:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/cold-export-sales-xml-control-49-20261008`.

- Установленные ресурсы clean `49b1584f23b4aa47e18b26119389d6f45623fc94`.
- `warm-green`, `cold1`, `cold2`: child0, свежий CSV до logout, oracle0,
  package/input SHA неизменны, settingsReapplied=false, remaining0,
  cleanup SUCCEEDED и контейнер удалён в каждой попытке.
- Перед `cold1` восстановлены точные сохранённые package/input bytes;
  собственные warm output и перед `cold2` cold1 output перенесены в backups.
  Отсутствие назначенного output перед каждым исполнением доказано parent.
- Все три CSV имеют одинаковый SHA; compare использовал неизменные accepted
  `sales-by-category` task/oracle и frozen harness9d7b463c4.
- После сохранения копий и SHA удалены только девять точно перечисленных
  файлов двух собственных контролей. Own containers remaining[].
  Loginom server/client не останавливались и не переключались.
- Model/judge/Help calls0. Ни одного аналитического A/B запуска.

`control-summary.json` и `manifest.json` содержат receipts, хэши всех evidence,
контроллеров и копий собственных серверных файлов перед удалением.

## Проверки и ограничения

Четыре последовательных guard TDD цикла проверяют настоящий Node entrypoint:
чужой пакет, чужой output, remote endpoint и отсутствующий GUID отклоняются
до браузера/создания output и без раскрытия private sentinel.
Живой negative mismatch и positive warm/cold контролируют фактическую UI ветку.
Итоговый suite planner/reader/acceptance/docs: **88 PASS, 0 FAIL, 783 assertions**,
`bun typecheck` PASS. Native capture выполнен тем же pinned Node24.19.0/Bun1.3.14;
логи и safe signal сохранены в `live-followup-49-20261008/final-validation`.

Первый финальный suite в Codex sandbox дал70 PASS/18 FAIL: async `Bun.spawn`
вернул пустые streams при child exit0. Независимый signal collector повторил
builder3/3 и sentinel probe; direct Node/spawnSync получали streams, native
capture того же async probe и builder работал. Это стабильное ограничение
sandbox capture, не подтверждённый дефект продукта. Исходные FAIL сохранены;
assertions и продуктовый код не менялись для устранения этого эффекта.

Parent для analytic artifacts, независимое восстановление выбранных пакетов
baseline/candidate, структура и judge72–90 попыток ещё должны быть проверены.
Предварительный XML planner сам по себе не доказывает соответствие `.bin`;
reader теперь проверяет фактическое назначение до исполнения. Этот контроль
не доказывает правильность произвольного графа, всех его параметров или входов.
