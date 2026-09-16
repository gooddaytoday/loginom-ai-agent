# Node17 — одна диагностика download

Assignment `node17:download-diagnosis:1:43a7d37f`.
Отдельный диагностический admission проверяет exact runtime/harness/goal/catalog
и не использует/не ослабляет component/full gates. Runtime155 не менялся.
В entry установлен внешний allowlist публичных операций до observer interceptor.
Private runner создаёт эксклюзивный one-shot marker задания до новой сессии.
Один prepare, одна доставка, source/original/reject, один replace-intent;
actual product replace запрещён в SDK непосредственно до actual-dispatch anchor
даже после успешного observer. Диагностическая остановка не является приёмкой.
Обычные acceptance gates остаются закрыты.

Проверки до живого запуска: 30 Node PASS, 20 Python PASS. В том числе
synthetic real SDK observer success/negative с actual-dispatch=0, cancellation
и incomplete через gate, запрет других публичных действий и повторов.
Отдельные safe received/decoded/failure receipts сохраняют поля ответа и
не подменяют отсутствие ответа синтетическим. Старый FAIL не изменяется.

Разрешена одна новая actual stdio user-v1 test-2 сессия по шести пунктам
[плана](17-text-export-download-evidence-fix.md). После результата — закрытие,
независимый аудит, без повторного запуска и без исправления причины на лету.

## Результат единственной попытки

Checkpoint `09224b61`, runtime155/harness281, manifest
`7cb6d4bc3511a216c8a96133d688678027f504223961a3b42e2444f6f6ea0e91`.
Run `20260913-160304-10ef26d7`, session
`f3fc2f2f-2266-457b-87ae-cd2799ce5594`.

Диагностическое скачивание **успешно**. Старый отказ не воспроизведён,
его причина остаётся неизвестной. Исправления на лету и повторов не было.
Аккаунт/owner/Avatar closure независимо подтверждены за 154 мс. Source5×3,
исходный CSV124 и reject с cleanup без execution прошли. В том же документе
observer выполнил 21 шаг за 2135.07 мс: один download и один возврат в исходный
граф; до/после совпали граф, узлы и связь с источником.

Свежие 124 байта независимо сравнены с эталоном, SHA256
`9f9972ed174053d02745df8df0c3c2d44697b33f7fb6da2ce8463eb58cc5d13a`.
Native received→decoded→validated сохранены до соответствующих проверок;
ответ сообщил SUCCEEDED/downloaded, download_count=1, listener_registered=true,
effect_possible=true, cleanup_complete=true. `pending_ui_actions=null`: поле
не сообщено native ответом и не превращено в ноль. Settings/global atomicity
не заявлены проверенными.

Независимые проверки связали actual public replace-intent, session/run/read,
исходные journal hashes baseline/source/reject, происхождение и профиль,
точный native code и browser request, исходный deadline, action ledger и
decoded проекцию с сохранённым completed native результатом. Native code SHA:
`b480f9dc28cd8f67af11e0e9e75d160b0ac641d94ff056fbdc3d225e2d43c8fb`;
browser request SHA:
`68eac8e4383087f747fa2fd3cac994de5c842f97b4d2cb5af45f5c1621524ad8`.

После observer сработал безусловный diagnostic_stop. **Actual-dispatch=0,
product replace events=0.** Общий gate предварительно записывает событие
`replace_dispatch` при входе в callback и вернул
`REPLACE_DISPATCH_OUTCOME_UNCERTAIN`; здесь это обозначает вход в запрещающий
диагностический callback, а не вызов продукта. Сохранены исходное имя события,
ошибка и отдельный diagnostic-stop; они не переписаны в PASS. Отсутствие
actual-dispatch файла дополнительно подтверждено полным исходным журналом и
проверенным расположением запрета до product handler.

Браузер и stdio закрылись, PID собственной сессии отсутствуют, global config
не изменился. Runtime155/harness281 снова проверены. Обычные component/full
gates всё ещё закрыты с `Native observer component changed since evidence`;
приёмка user-v1 компонента, goal22/3/save-reopen и Hermes не выполнены.

Следующий минимальный шаг, владелец — координатор: оценить эти доказательства
для отдельного узкого допуска component на текущих pins, сохранив полный gate
закрытым; реальный replace в компонентной проверке требует нового отдельного
назначения. Диагностический успех не даёт такого разрешения автоматически.

[Машинный результат и SHA256 доказательств](17-text-export-download-diagnosis.json).
