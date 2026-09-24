# Checkpoint / продолжение

- campaign_id, node_id, attempt_id, phase, execution_status: <...>.
- developer task ID и CLI session ID (разные): <...>.
- repo/worktree/branch/base/source SHA, незакоммиченные изменения: <...>.
- runtime/candidate/model/variant/platform/Loginom version: <...>.
- profile/browser/account/storage/package и занятые ресурсы: <...>.
- Последнее завершённое действие/evidence: <...>.
- Pending operation, частичный эффект, состояние мастера: <...>.
- Save/reopen/cleanup: <подтверждение или UNCONFIRMED>.
- Проверки и ограничения, старые FAIL: <...>.
- Общая память, проверенный route и устойчивые выводы: <...>.
- Memory generation/registration ID и exact cwd/task ID: <...>.
- Допуск actor health/find/read и bootstrap/hooks receipts: <...>.
- Capture/extraction/read-back из основного checkout: <ожидает/проверен, evidence>;
  cursor сохранён, повторной регистрации либо второго захвата нет: <подтверждение>.
- Незавершённые события/неясная доставка/dispatch_id: <...>.
- Следующий безопасный шаг, owner, next trigger: <...>.

Новый агент сначала сопоставляет checkpoint с фактическим состоянием. Не повторяет
неясную отправку, не пересоздаёт пакет и не сбрасывает профиль для «чистого старта».
