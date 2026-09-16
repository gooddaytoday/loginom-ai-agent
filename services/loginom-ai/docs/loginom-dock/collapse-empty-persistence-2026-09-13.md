# Node16: диагностика пустого результата после открытия

Назначение `node16:empty-persistence-followup:1:6e36609d`, собственная test-1,
Loginom7.4.2. Исторические FAIL/AMBIGUOUS и pending-журналы не изменялись.

## Подтверждённая причина и исправление

Сохранённая цепочка `Node16Types → Node16EmptySource → Node16EmptyCollapse`
после открытия имеет прежние node IDs, native port GUID и link IDs. Source —
текстовый импорт `948cff8f-37ba-46b1-8f7c-ba522ed80dc4`; фильтр
`1c08064e-eb9c-4eed-83ce-2c3c0ec67fc1`; свёртка
`637537c5-d755-42dd-af7f-ff5a0a714404`. Связи соответственно
`c2b80446-7b9e-4f9a-9a7f-f337275398d9` и
`b139e4b7-084f-460f-98bf-f81039694ec1`.
Port GUID повторяются между узлами: один GUID без владельца не идентифицирует порт.

После открытия фильтр не активирован. Исторический вход в мастер свёртки в
этом состоянии показывал Id в source list и native предупреждение о потерянных
связях. Штатное выполнение **только фильтра** (F9) без настройки/переподключения
восстановило его полную схему Id,Zone,I,R,S,B,D и ноль строк. Затем свёртка
с parameters={} / mappings=[] успешно завершила настройку и выполнение:
Names,DisplayNames,Values variant,DataTypes,0строк. Граф не переподключался.
Это подтверждает зависимость от активности upstream; дефект сохранения связей
или вмешательство другого диагностического узла данным воспроизведением не
подтверждены. Внутренняя причина lazy-схемы Loginom не исследовалась через RPC.

Реальная недоработка handler: существующий узел мог открыть входной мастер при
неактивном источнике. Добавлена ранняя read-only проверка именно Collapse:
из полного связанного графа разрешаются source owner и output index, проверяется
native active output. При неактивном источнике возвращается NOT_APPLIED,
effect_possible=false, cleanup_complete=true, node:null до мастера/мутаций.
В сообщении требуется сначала выполнить источник. Обработчик не запускает
неявно старую конфигурацию и не удаляет неизвестные связи. Все прежние guards
сопоставлений сохранены. Автоматическое восстановление AMBIGUOUS не заявлено.

## Save → новая сессия → reexecute

- `.dock/node16/live-1789291097039`: before-wizard graph, неактивный Preview,
  F9 источника, source-active-owner (7полей/0строк), successful empty,
  chain-after-success, публичный package.save_checkpoint SUCCEEDED.
- `.dock/node16/live-1789291348311`: новая сессия после этого save, граф до входа
  в мастер, inactive-source-refusal без мутации; затем F9 источника и
  empty-reopened-active SUCCEEDED с прежними ролями и полной схемой.
  verified-source-owner повторно подтверждает filter owner/port и7полей/0строк.
  Ранний preview-after-reopen-activation был прочитан до загрузки таблицы;
  ошибка следующего диагностического чтения сохранена, доказательством не служит.
- `audit_persistence.py`: сравнивает оба графа, save receipt, независимый empty
  output, полный input mapping и12отрицательных подмен. PASS сохранён в
  `.dock/node16/audit-empty-persistence-v3.json`.

## Минимальное воспроизведение

Отдельный пакет `/test-1/node16-20260913-a56c2488/Node16-empty-minimal.lgp`:
ровно три обработчика (плюс системный узел переменных). Новый импорт159bytes
с тем же проверенным SHA, фильтр Id>99, свёртка information=[], S/I/R/B/D,
ignore_empty=false. Созданы штатными UI-процедурами public node.apply.
Первый запуск: source3×7, filter0×7/3×7, collapse0×4.

`live-1789291538922`: полный цикл создания, minimal-chain-before-save,
публичный save-minimal SUCCEEDED. `live-1789291890309`: отдельная новая
сессия, minimal-chain-after-open до мастера, прежние две связи и владельцы;
источник сначала неактивен, после F9 minimal-source-owner-schema подтверждает
7полей/0строк. Первая слишком ранняя попытка до завершения активации получила
NOT_APPLIED/workflow blocked без мутации и сохранена как minimal-reexecution.
Последующий запрос с новым operation ID после подтверждённой готовности
успешен:0строк,полная схема и прежние роли. `audit-minimal-persistence.json`
и `audit-minimal-final-persistence.json` подтвердили цепочку как сразу после
открытия, так и после повторного выполнения;12подмен отклонены в каждом.
Все собственные браузеры завершены после подтверждённого logout.

Source pin после исправления:
`7ed94630353fed483f53a029a3aea7828920235879569b83d303510213b3d239`.
Client tests:1409PASS/1SKIP/0FAIL, directed Collapse:21PASS.

Полный exact non-null variant всё ещё BLOCKED. Для решения подготовлен
[отдельный статический план](collapse-variant-prototype-plan-2026-09-13.md).
Никакой native RPC/transport/interception/hooks не запускался.
