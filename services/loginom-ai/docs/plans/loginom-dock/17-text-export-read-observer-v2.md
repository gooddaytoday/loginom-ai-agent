# Node17: contract2 подключён офлайн, native smoke не пройден

Назначение `node17:observer-contract-refinement:1:7e9922f4`.
Завершена разрешённая офлайн-интеграция SDK wrapper, native adapter, actual-dispatch
ledger и полного аудитора. **Это не результат native smoke и не допуск Hermes.**
`NATIVE_SMOKE_ADMITTED=false`, entry отказывает до импорта клиента, `run.py --run`
и полный аудитор по-прежнему останавливаются на fail-closed readiness guard.

## Явное изменение утверждения

[Contract1](17-text-export-read-observer.md) и его pins сохранены как исторические:
код `6bb02d1a`, документ `7e9922f4`. Его блокер касался чтения всех применённых
настроек из закрытого графа без открытия мастера. Координатор явно снял это
избыточное требование для узкой проверки сохранности файла.

Contract2 подтверждает только свежие байты исходного файла после terminal reject
до фактической передачи исходного replace в dispatcher, наблюдаемые владельцы,
источник и топологию до/после разрешённых UI-действий. `settings_verified=false`;
исторический readback не выдаётся за текущие настройки. Сохранность настроек
остаётся отдельным предметом существующих handler/reopen gates полного goal.
Внешние concurrent writes и глобальная атомарность не проверены и не обещаются.

## Реализованная связка

- `text-export-observer-client.mjs` — отдельный acceptance entry. Выбран в
  `run.py` только для данного goal. Сейчас отказывает **до создания клиента**.
- `text-export-observer-sdk.mjs` — локальная установка wrappers на SDK в этом
  процессе. Захватывает единственный `loginom-dock-browser` и его точный isolated
  session directory по реально создаваемому transport. Второй браузер не создаёт.
  Перехватывает исходный `dock_node_apply overwrite=replace` перед handler;
  исходные параметры, включая protocol request, передаёт без изменения.
- `text-export-observer-binding.mjs` — derives bindings из сырого execution journal:
  original completed export, source completed operation, terminal reject, точные
  session/runtime/run/path/node/workflow. Pending node или intervening completed
  operation, неоднозначность и stale/foreign anchors отказывают.
- `text-export-observer-native.mjs` — использует существующие read-only graph и
  Files UI primitives. Не читает private applied settings. Через graph reader
  доступны document/workflow, GUID узлов, отображённые табличные ports/links,
  source edge и refs. Сверяются доступные nodes/links/foreign links до/после;
  виртуальные DOM epochs исключены из предмета утверждения. Source GUID и edge
  должны соответствовать исходному input anchor и присутствовать в обоих снимках.
- `text-export-observer-policy.mjs` — закрытый allowlist: graph/roots/root/row
  observations, Files, корень Files, каталог test-2, точный CSV/TSV download,
  возврат в исходную вкладку workflow. Запрещены произвольный JS, Configure,
  Finish, Execute, save, upload, press/reload и graph mutations. При невидимой
  строке отказ; implicit download reveal/scroll не разрешён. Поддерживается
  только ровный `/test-2/<filename>.csv|tsv`, достаточный для полного goal.
- `text-export-read-observer.mjs` — single-shot lock и byte verifier. Весь
  interception/observer interval ограничен минимумом 60 секунд и оставшегося
  общего бюджета. SDK wrapper закрывает также время подготовки bindings.
  Повторного download/gesture нет. Deadline, cancel, нарушение allowlist,
  неподтверждённый cleanup либо изменение observable graph запрещают replace.
  После вызванного dispatcher транспортная неопределённость не выдаётся за
  «replace не вызывался» или успешный публичный receipt.

Вызовы observer проходят одноразовые SDK permits. В exclusive interval посторонний
`callTool`, низкоуровневый `request` и новая connection отказывают; даже перехваченный
и проигнорированный вызывающей стороной отказ отравляет gate. Новые публичные
вызовы через обёрнутый dispatcher также не проходят. Это блокирует конкуренцию
в пределах harness; не устанавливает host-wide или server-wide file lock.

## Доказательства и аудитор

До каждого разрешённого шага записывается durable prepared record, после него —
raw result и completed record в `observer-actions.jsonl`. Сохраняются owner,
монотонные номера/время, структурированный шаг и SHA сгенерированного фиксированного
browser code. Неполная цепочка не даёт PASS. URL download не сохраняется;
проверяется origin, suggested name и exact output binding. Подписка устанавливается
до жеста; download counter проверяет ровно одно событие на том же Page.

`observer.jsonl` связывает reject → read → return → replace intent хешами.
Новый приватный файл сравнивается с исходным retained artifact по actual bytes,
SHA-256 и размеру. Старый retained файл не подставляется вместо нового скачивания.
`actual-dispatch.jsonl` записывается wrapper непосредственно перед вызовом исходного
handler и связывает полный исходный request, последний observer hash и prefix
execution journal. Это instrumentation ledger, не вымышленный public outcome.

`text_export_observer_evidence.py` независимо проверяет raw actions, allowlist,
owner/topology/source projection, raw download, новый файл и цепочку времени.
`text_export_observer_run.py` заново выводит expected anchors из actual session
journal, сверяет retained original file, actual request и следующий
`node_apply_prepared` replace. Полный `text_export_acceptance.py` требует эту проверку
в точке reject/replace, сохраняя все прочие проверки. Главный readiness guard
пока не позволяет итоговому аудитору объявить PASS даже при synthetic evidence.

## Выполненные проверки

- 14 Node tests PASS: 8 core и 6 SDK. Использован закреплённый Node 24.19.0.
- SDK проверен через настоящий MCP SDK и InMemoryTransport, с синтетическим
  browser service: 13 разрешённых native-adapter шагов, затем один неизменённый
  replace. Ни Chromium, ни Loginom, ни Hermes при этом не запускались.
- Негативы: неизвестные gestures/navigation, foreign owner/invocation, прямой SDK
  request в обход callTool, stale source, pending operation, изменение связи,
  hidden scroll, duplicate download, cleanup, actual bytes, timeout/late result,
  истёкший общий бюджет. Ошибки synthetic ответов не считаются native наблюдением.
- 14 Python tests PASS: 8 observer и 6 прежних readiness/acceptance. Позитивный
  proof сгенерирован настоящим JS-wrapper в synthetic SDK run и прочитан Python,
  включая outer actual-journal binding. 24 semantic negative subcases имеют
  заново рассчитанную hash chain; также проверены actions sidecar, actual dispatch,
  symlink/bytes/time/request tampering и отсутствующие доказательства.
- Отдельный запуск entry подтвердил отказ `TEXT_EXPORT_NATIVE_SMOKE_NOT_ADMITTED`
  до импорта клиента. Diff-check PASS.
- Все 155 runtime inputs сохранились. Goal/канонические fixtures не изменились:
  **22 nodeops, 3 deliveries, прежние save/reopen gates**. Точные source/wrapper/
  adapter/verifier/harness pins и diff hashes — в соседнем JSON.

Это адресная проверка реализации contract2, не повторное полное review.
Main/push/VPS/plugin/routing и runtime клиента не менялись. Старые evidence и
чужие изменения сохранены. Постоянные новые файлы — малый исходный код/документы;
собственные временные synthetic fixtures после тестов удалены.

## Оставшийся gate и следующий trigger

Native smoke **не пройден**, admission **закрыт**. Нужна отдельная ресурсная
проверка и команда координатора, затем один узкий native smoke в owned test-2
browser с реальным raw download после reject, возвратом UI и exact replace.
Старое требование исследовать applied settings из закрытого мастера отменено;
не возобновлять это discovery как зависимость contract2.

Последний disk check: 945,975,296 свободных байт (~0.88 GiB), уменьшение относительно
предыдущих ~1.97 GiB; причина в этой фазе не исследовалась. При таком состоянии
автоматического запуска нет. Плановая оценка малых proof/download данных остаётся
≤32 MiB при CSV 124 bytes, **без** роста browser profile/служебных логов; это не
жёсткий disk cap. Перед новым live необходимо оценить весь бюджет ресурсов.
Browser smoke может выявить асинхронную недоступность элементов: adapter сейчас
честно отказывает без retry; такой отказ потребует прямой диагностики Codex перед
любым последующим запуском. После native smoke требуется отдельное решение о
readiness; финальный Hermes Sol/low — только в слоте координатора.
