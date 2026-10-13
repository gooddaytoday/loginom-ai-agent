# Блокеры parallel evals

## Bootstrap administrator — открыт, 2026-10-13

Постоянные конфиги созданы в `/home/kiselev/.local/state/loginom-evals/parallel/slots.json`
и `/home/kiselev/.local/state/loginom-evals/research/slots.json` (private regular 0600).
Файлы администратора по указанным в них путям отсутствуют:

- `/home/kiselev/.local/state/loginom-evals/parallel/secrets/loginom-admin.json`
- `/home/kiselev/.local/state/loginom-evals/research/secrets/loginom-admin.json`

`loadSlots` реально отказал с `SLOT_PATH_PRIVATE` до Docker mutations. Требование
плана: bootstrap credential предоставляет владелец в private regular file 0600;
исходные права/лицензия не выдумываются программно. Пароли работающих dev/legacy
пользователей не заимствуются, файлы с фиктивными credentials не создаются.

Нужны исходные административные credentials, пригодные для новых pinned-image
пар; конкретную JSON-схему закрепит trusted adapter в задаче 2. Секреты нельзя
передавать через Git, results, argv или сообщения. После появления файлов:
проверить owner/mode/schema, создать постоянные пары и квалифицировать admin login.

Ограничение затрагивает постоянный bootstrap задачи 1а и живые проверки задач
2–5/10. Disposable Docker infrastructure integration не входит в Loginom под
пользователем и не доказывает admin readiness. Unit-реализация и немодельные
Docker проверки могут продолжаться.
