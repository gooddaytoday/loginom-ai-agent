# Точка продолжения description/dataset

2026-09-21. Цель активна, план ещё не выполнен полностью.

- Baseline .10 завершён: 7 PASS, 3 BLOCKED (D45,D48,D65), 10/10 попыток, assistance=none. Все baseline Desktop закрыты.
- Исправлена потеря видимой точки частично обрезанной кнопки Visualizers; повторный hit-test и отказ при перекрытии сохранены.
- .11 целевой D45 BLOCKED: модель переопределила configure_ms=120000; Stop и закрытие подтверждены. .11 исторический, final на нём не запускался.
- .12: компактный user-v1 API не принимает budgets; приложением заданы ограниченные defaults 300000/120000/600000 ms. Полный диагностический контракт и явные deadlines сохранены. Resume неизвестных эффектов не добавлялся и сроки старых операций не продлевались.
- Проверки: полный runtime 2283 PASS, 2 Windows-only SKIP, 0 FAIL; transforms 5045 PASS. Общий macOS source-check Product/Host/Desktop/Agent ранее PASS на .11. .12 изменил только компактную JS-схему/инструкции и тесты.

## Установленный кандидат .12

Source `c643db47657f6644b167d27dbaa0dec269e769c4`; build `/Users/kartamyshev/.cache/loginom-macos-build/description-20260921-12`. DMG/ZIP/offline smoke/installed signature/ASAR equality PASS.
Установка: `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.12/Loginom AI Agent.app`.
ASAR `66ee2a56ad65c8af034f5737313f8dd90ddbbee346549ea8c39365bd8e800696`.

## Активная попытка

D45-target12-a01 завершена CREATED_EXECUTED_SAVED: 4 узла, save/modified=false/cleanup подтверждены, Desktop закрыт. D48-target12-a01 завершён CREATED_EXECUTED_SAVED: 6 узлов, save/modified=false/cleanup, Desktop закрыт. D65-target12-a01 завершён CREATED_EXECUTED_SAVED: 7 узлов, save/modified=false/cleanup, Desktop закрыт. Итоговая серия final12 выполняется; свежий момент отправки и предел см. private controller-checkpoint.json. Модель GPT-5.6 Sol low, подключение ready, тот же сервер Loginom7.4.2. Исходные файлы неизменны, технические подсказки не отправлялись.

Приватные доказательства: `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`. Самый свежий active state в `controller-checkpoint.json`; baseline manifest в `manifest.json`; каждая попытка имеет свой `metadata.json`.
Node REPL: `app12/page12/backend12/headers12/run12/candidate12/ctl/pw`. Не печатать backend/headers. `ctl.collectAttempt(backend12,headers12,run12)` сохраняет chat/receipts и проверяет доставленные bytes/hash и модель. Успех требует отдельно проверить конечные исполненные выходы и save+modified=false+cleanup. `ctl.finishAttempt(app12,page12,run12,summary)` сохраняет результат и закрывает Desktop. Модуль контроллера `attempt-controller-v6.mjs` сохранён вне Git; все изменяемые параметры передавать явно.

Далее: пройти final10 на одном кандидате в порядке D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Final12: D02 PASS (10 узлов), D47 PASS (6 узлов), D23 PASS (7 узлов), D45 PASS (4 узла), их Desktop закрыты. D19 PASS (7 узлов), Desktop закрыт. D36 PASS (4 узла), Desktop закрыт. D24 PASS (7 узлов), Desktop закрыт. D48 PASS (8 узлов), Desktop закрыт. D27 BLOCKED (6 узлов, pending node-weekday-analysis-a02, Visible port identity is not rendered в target, resume тайм-ауты), модель завершилась сама, Desktop закрыт. D65 PASS (6 узлов), Desktop закрыт. Final12 завершена: 9 PASS / 1 BLOCKED. DEBUG_ONLY D27 завершён: 7 SUCCEEDED и save, cleanup/close подтверждены; точное состояние F12 не повторилось. Evidence /var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-U7J0yn. В исходниках подготовлена строго проверяемая первая привязка alternate SVG нового табличного порта. RED/GREEN регрессия, полный runtime 2284 PASS / 2 SKIP, transforms 5045 PASS. Общий macOS source-check PASS: 8 групп Product/Host/Desktop/Agent. Затем зафиксировать исходники, собрать новый кандидат, целевой D27 и новая полная final-серия. Точная первопричина F12/recovery ещё не доказана. Точный текущий статус — в metadata активной попытки и final12-manifest.json. При новом необходимом исправлении сохранить историю и повторить final целиком на новом кандидате.

Предел каждой попытки 30 минут от отправки, один активный сценарий; не повторять pending-мутации. Пользовательскую установку и профиль не трогать. F03/F07 recovery не подтверждены; аналитическая правильность not_checked.
