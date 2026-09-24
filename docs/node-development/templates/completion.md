# Завершение этапа

- event_id: <устойчивый ID>; campaign_id/node_id/attempt_id: <...>.
- phase: <...>; outcome: completed | blocked | failed | paused.
- developer task/turn, reviewed/fixed/source SHA: <...>.
- Выполненный scope: <...>; доказательства с версией/платформой: <...>.
- Замечания и адресные проверки: <...>.
- CLI session ID, package path, save/reopen/cleanup receipts: <при наличии>.
- Непроверенное/недоступное: <...>.
- Ресурсы освобождены / ещё заняты: <...>.
- Требуемый следующий этап или blocker с owner/next trigger: <...>.

Одно сообщение на завершённую фазу. Отдельно сообщаются только настоящие блокеры.
Completed development не означает accepted, integrated или released.
