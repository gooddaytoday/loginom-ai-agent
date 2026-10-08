# Сохранённые отказы CLI scenario-modify49

Read-only разбор подтвердил, что во всех трёх попытках второй CLI-ход
открывал сохранённый пакет с пометкой «только чтение». Кейс не принят;
точная native причина и владелец writer lock пока не установлены.
Продукт, исходный сервер и текущие A/B условия не менялись.

Источник: private `package-docs-20261006/openai-49-cli-scenario-modify-v2-20261008`.
Результат: `scenario-modify-49-readonly-review-20261009/review.json`;
21 file occurrence проверен по SHA256, включая внутренние execution journals.
Новых model/Loginom/judge calls0. Смешанные журналы второго хода содержат
также сохранённый первый ход; prepared events сопоставлены с исходным
именем journal, чтобы повторную копию первого хода не считать новым prepare.

Первый ход: новый draft, ownership_verified=true. Второй ход:
created_draft=false/ownership_verified=false, другой document_id,
navigation label содержит «только чтение». Это наблюдение UI и runtime state,
а не доказательство принадлежности блокировки конкретному клиенту.
Во всех3 есть UNKNOWN_PREPARED_WORKFLOW при попытке передать existing_workflow
без reference, выданного текущим runtime. Попытки1/3 затем дошли до калькулятора
и получили NODE_APPLY_STOPPED: active source output required; mutation не выполнена.
В3 также REQUEST_REJECTED у node_read из-за отсутствия completed local operation.
Нет доказательства, что устранение любого одного из этих симптомов закроет кейс.

Следующая native проверка после освобождения собственного A/B стенда:
наблюдать штатное закрытие пакета/logout первого CLI-хода и состояние exact own
пакета перед вторым ходом в свежей изолированной acceptance. Не перезапускать
сервер между пользовательскими ходами ради прохождения; не удалять неизвестные
locks и не ослаблять guards ownership/active-source. Исправлять продукт только
после подтверждения причины, через отдельный RED→GREEN и новый candidate.
Дальнейшие изменения кандидата должны учитываться в A/B условиях и приёмке;
текущие frozen бинарники не редактировать на месте.
