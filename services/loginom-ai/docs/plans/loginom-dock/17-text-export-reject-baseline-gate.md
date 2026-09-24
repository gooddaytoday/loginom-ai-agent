> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-0eac77314b7d` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# Node17: незакрытый reject-baseline gate

Назначение `node17:acceptance-kit-fix:1:reject-baseline`.
Ложный PASS и расход модели предотвращены: до появления согласованного
реального reader `run.py --run --goal text-export-node-complete` отказывает
до credentials/runtime/model; полный аудитор также возвращает FAILED.
**Сам gate независимого чтения ещё не закрыт.** Публичного byte-reader для
повторного чтения завершённого экспорта в текущем клиенте нет. Ни фиктивный tool,
ни синтетический receipt, ни повторное использование старого файла не добавлены.

Защита закоммичена `1ebf54bc93e781ea2a22e4722ea0bf5e8902872c`.
Source обработчика `25249210`, runtime
`347615cbae29323d80b57488b794ecce607b5b9e0d2fbe86aa88b7460241311c` не менялись.
[Новые pins и точный список изменений](17-text-export-reject-baseline-gate.json).
Goal и fixtures неизменны: 22 node operations, 3 deliveries, все save/reopen gates.
Предыдущий подготовительный manifest остаётся историческим, не разрешением запуска.

## Что проверено без нового live-прогона

- `executor.mjs:1934` / verifyArtifact принимает только текущую pending
  `artifact.upload` с подтверждённым cleanup. Завершённый export не соответствует
  этому контракту. Source-only probe вызвал настоящий verifyArtifact и получил
  отказ до браузера: 0 browser calls. Это проверка кода, не native download.
- `artifacts.mjs:144` / stageNativeOutput и `text-export-output.mjs` обслуживают
  приватный output lease внутри уже исполняемого node.apply. Они не являются
  публичным повторным чтением файла. Новый Execute запрещён этим заданием и
  изменил бы проверяемый baseline.
- `dock_ui_action` имеет double_click для наблюдаемого элемента, но подтверждает
  UI-жест. В `workspace-ui.mjs` этот путь не регистрирует download event,
  не удерживает новый файл и не возвращает проверенный SHA/size. Следовательно,
  сам публичный жест нельзя представить как полное byte-доказательство.
- Knowledge `read` работает с viking URI, не с `/test-2` Loginom storage.
  Проверенный перечень MCP tools не содержит отдельного retained-output reader.
  Pending upload verifier не переименовывался в такой reader и не обходился
  фиктивным upload: это дало бы лишнюю загрузку и могло изменить baseline.

Память OpenViking здорова. Выполнены только локальные малозатратные проверки:
2 readiness tests и 4 tests существующего Text export kit прошли. Source probe
сохранён в `unavailable:artifact-5c7120f8ede57c1a`. `git diff --check`
прошёл. Hermes, браузер, VPS, общий клиент и каталоги не запускались/не менялись.

Это проверки fail-closed поведения, **не** выполненная семантическая матрица
missing/stale/foreign/changed/after-replace raw downloads. Такая матрица имеет
смысл лишь после согласования реального источника данных; её PASS не заявляется.

## Минимальный конкретный вариант для решения координатора

Предлагается одна acceptance-only вставка в isolated MCP entry wrapper, по
существующему принципу `fault-launcher.mjs`, но с явно отдельным типом read observer,
без подмены результатов или исполняемого кода обработчика. **Это не публичный
byte API: требуется отдельное разрешение на host-owned native read в приёмке.**
Вставка ещё не реализована и не запущена.

1. Wrapper наблюдает реальные public outcomes и фиксирует первоначальный CSV
   artifact текущего run/session/node/path: исходные SHA/size, original operation
   и execution ID. Все они сверяются с замороженным CSV expected и исходными
   native bytes, не берутся из свободного текста модели.
2. После terminal FAILED/cleanup=true ровно ожидаемого reject wrapper принимает
   следующий public запрос replace того же пути, но задерживает его **до dispatch**.
   Подмена body, дополнительный Execute и дополнительная delivery запрещены.
3. Через уже принадлежащий этой source session browser transport отдельный
   host-owned read observer заново наблюдает собственный Loginom/file-storage
   контекст, находит точный `/test-2/Dock-export-RUN_ID-csv.csv`, подписывается на
   download **до** проверенного жеста и скачивает в новый приватный файл. Нельзя
   открывать второй browser/profile или использовать URL из догадки. Используется
   тот же browser client; SDK-wrapper должен закреплять его identity.
4. Observer сравнивает фактическое имя, origin, размер, raw bytes и SHA с исходным
   artifact, сохраняет raw browser response, новый файл и отдельную неизменяемую
   запись. В запись входят run/session/runtime/harness SHA, node/document/workflow,
   точный path, original/reject/replace operation IDs, original SHA+size, новый
   download identity, порядок событий и hashes связанных journal records.
5. Только после подтверждённого чтения, cleanup и возврата в собственный workflow
   wrapper передаёт исходный replace. При отсутствии файла, неоднозначности,
   timeout, смене владельца или отличии байтов replace не передаётся. Нет fallback
   к старому lease или повторного чтения после replace. Время чтения учитывается
   в общем timeout; новое разрешение должно закрепить его отдельный верхний предел.

Это сохраняет 22 node operations/3 deliveries; добавляется ровно одно
диагностическое чтение. Runtime source hash клиента остаётся прежним, однако
новые wrapper/observer/adapter/harness hashes обязаны быть явно закреплены.
Wrapper располагается только в acceptance tools, не в client runtime, не в
каталоге production и не в установленном plugin. Он не маскируется как обычная
публичная операция и не меняет семантику source node.apply.

## Обязательная проверка после согласования reader

Независимый Python verifier должен проверять реальные bytes, а не поле passed;
привязку к исходному artifact и двум конкретным операциям; уникальный новый
скачанный файл (не старый output lease); полную связь с native response и
монотонный порядок **reject terminal → read start → read completed → replace
request dispatch/prepared → replace effect**. Одного timestamp недостаточно:
нужны последовательность перехваченных запросов и связи с journal records.

Отрицательная матрица должна минимум отвергать:

- отсутствие read/raw file/browser download event;
- исходный старый lease или запись предыдущего run;
- чужие session, runtime, node, path, original/reject/replace IDs;
- изменённые byte/size/SHA, включая одинаковый размер;
- read до terminal reject, после replace dispatch или после его Execute;
- две read-записи, неподтверждённый cleanup, переиспользованный verification ID;
- несовпадение raw receipt и сведённой записи, изменение цепочки журнала.

После малозатратных адресных тестов потребуется отдельная узкая native-проверка
reader на новом закреплённом harness — не новый полный review обработчика.
До этого guard остаётся закрытым. Альтернатива — отдельное задание на публичный
read-only output API; оно затронет client runtime и не входит в текущее разрешение.

Следующий trigger принадлежит координатору: решение по предложенному
acceptance-only observer либо отдельное назначение публичного reader. Слот
Hermes не запрашивается, ограничение диска остаётся. Разработчик не начинает
инструментирование до этого решения.
