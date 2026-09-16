# Текущее состояние

Producer зарегистрирован как collapse_native_sessions_v1. Runtime e33dd667,
source621bf7a4. Прежняя матрица10/470 — исторический runtime51, текущая адресная
проверка existing-input —75+75ячеек. 32native tests PASS. Полная автономная приёмка
ещё не выполнена; candidate/slot остаются у координатора.
verify_reopened/verify_loss допускают explicit expected_runtime только для анализа
истории. FULL model auditor всегда вызывает их с default текущей версией; receipt
из старой версии не закрывает новый run. Loss в независимом harness имеет prefix
текущего run и current runtime, а не фиктивное событие в журнале модели.
Полный актуальный отчёт: docs/loginom-dock/node16-native-gates-progress-2026-09-13.md.

Ниже история реализации (состояние до последней интеграции).

---

# Node16 native gates — диагностический checkpoint

Только приёмочные инструменты. Product handler/runtime не изменяются.
`READONLY_PRODUCER` автономного runner остаётся `None`; этот каталог **не допускает
Hermes** и не закрывает полную матрицу, candidate stage, loss bridge или slot.

- `readonly-download.mjs`: чтение реальных файлов через наблюдённый Loginom 7.4.2
  FileDownloader/OpenFile/GetFileInfo/ReadBuffer. Только `/test-1/<каталог>/<файл>`;
  размер до 256 KiB, блоки до 16 KiB; проверка владельца, документа, размера,
  загруженных функций и освобождения потока. Не создаёт upload receipt.
- `native-functions.json`: точные исходные строки и SHA наблюдённых функций.
- `collapse-live.mjs --readonly-first <manifest.json>`: запрещает new-draft/copy,
  открывает сохранённый пакет, скачивает CSV+LGP с ожидаемыми SHA **до создания
  runtime**, сохраняет raw browser replies и локальные байты. После этого
  диагностические команды могут менять UI: marker не описывает дальнейшую фазу.
- `package_snapshot.py`: ограниченное чтение Unit.xml непосредственно из скачанных
  LGP; проверяет пару ImportText/ColumnFlipping, native ports/link; возвращает
  полные Component-деревья. Не выводит значения по отсутствующим XML-атрибутам:
  отсутствие и явное значение при сравнении различаются.
- `verify_downloads.py`: сопоставляет реальные base64 browser replies с локальными
  байтами, ожидаемыми SHA, native document/session, порядком скачивания, mode и
  cleanup; отдельно сравнивает сохранённые Component/link. Это диагностический
  verifier, не outer autonomous auditor. Текущая startup последовательность
  фиксирована (geometry/login/prepare/directory/source/package).

Нельзя выдавать вручную составленную JSON квитанцию за допуск. Интеграция полного
fresh-session evidence bridge в autonomous runner ещё не завершена. Текущий
verifier не доказывает результат исполнения после переоткрытия и не подменяет
10 независимых exact-table аудитов.

Наблюдение `live-1789310363604` подтвердило исходные CSV 13 B и LGP 8802 B перед
первой записью, точное совпадение SHA и Component/link с baseline. Затем два
пустых режима прошли case-only oracle. Последующая all-null доставка остановилась
до upload на навигации нескольких файловых вкладок; исходный AMBIGUOUS сохранён.
Фальшивая гипотеза о save dialog снята строгой проверкой CSS visibility. Реальный
header-ignore LGP скачан; settings/link совпали с новой, ещё не настроенной копией.
Новая самостоятельная all-null диагностика начата после logout/закрытия старой
сессии и проверки пустых native upload managers. Полные результаты фиксируются
в итоговом отчёте фазы, не в этом промежуточном checkpoint.

## Fresh-session bridge (текущий source)

`--readonly-first <case manifest> --public-user-v1 --reopen-case` выполняет
непосредственно после открытия пакета и до команд оператора:

1. Нативное чтение CSV и LGP в browser-5/6; runtime ещё не создан.
2. Чтение графа в browser-8, разбор скачанного Unit.xml, сравнение с baseline.
3. Только после успешной проверки — настоящий upload **тех же байтов по тому же
   пути**, с новым grant/operation в этой сессии. Старые receipts не внедряются.
4. Выполнение существующего импорта с `settings={}` и `mappings=[]`; затем
   существующей Свёртки с `parameters={}` и `mappings=[]`, точное чтение всех ячеек.
5. Независимое повторное чтение графа. В пакет ничего не сохраняется.

`verify_reopened.py` заново проверяет raw bytes, порядок, native граф/Component,
исходные компактные MCP envelopes и journal через **тот же** outer `native_case`.
Он сопоставляет реальные настройки импорта/Свёртки и полную таблицу с baseline.
`export_live.py` сохраняет фактические MCP ответы; не превращает raw outcome в
якобы ранее полученный user-v1 ответ. `public-node-wire.mjs` включает user-v1 только
явным opt-in и сверяет его с внутренним сохранённым результатом.

`verify_loss.py` сопоставляет настоящий raw ответ успешного жеста, его последующую
потерю, native значение checkbox/роли, исходный AMBIGUOUS, настоящий публичный
повтор и отказ resume. Между потерей, повтором и resume browser sequence не меняется.
Это проверка сохранения неопределённости, не успешного восстановления операции.

`verify_bundle.py` и `collapse_node_acceptance.audit_native_diagnostics` принимают
manifest `kind=collapse_native_sessions_v1` с десятью отдельными `sessions`, run_id
и `loss_session`. Сырые данные перепроверяются; готовые `*_PASS.json` не являются
входным доказательством. Диагностический результат всегда имеет
`model_run=false`, `hermes_acceptance=false`, `subplan_complete=false`.

Outer persistence умеет потреблять такой же набор отдельных сессий при будущем
model run, но дополнительно требует исходные model calls/results, тот же run_id,
исходные save_checkpoint operations и точное совпадение baseline с model output.
Этот путь **ещё не проверен на Hermes run**. Отдельный admission остаётся закрыт:
`READONLY_PRODUCER=None` означает отсутствие принятого автономного producer,
а не отсутствие диагностического загрузчика. Никакой JSON-флаг не разрешает модель.

Неизменяемый acceptance-kit закреплён на историческом source77385e36; его fixtures,
expected и goal не меняются. Текущий runtime после разрешённого переноса NULL fix:
`51ceb0d186560a82c7f91b54390bf6300945456bc052c5358d3a948ca534ab1e`.
Сводка фактически пройденных случаев и оставшихся gates — в отчёте node16.
