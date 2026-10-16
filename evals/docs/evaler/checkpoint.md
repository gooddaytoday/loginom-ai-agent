# Node evals — checkpoint
Дата: 16.10.2026; A/B/C готовы, защита одного вызова реализована по TDD.
Код B: 45f2e14690; при допуске импорта rework_limit=3 без сброса счётчиков.
Продолжение B привязано к issue/report/SHA; unknown cleanup требует stand_ready.
Ben ограничен frozen SHA; бюджеты, ERROR и независимость не изменены.
SHA назначения — из шапки карточки: B/C и проверенная защита одного вызова.
Общий контракт: ../evaler-orchestration.md; команды: operations.md.
Активные CLI/helper/config/container: ../2026-10-16-text-import-integration.md.
Процедура и доказательства C: ../node-eval-cleanup.md.
C: один сброс на eval-tests; READY → COMPLETE → RELEASED → FREE в 15:04 МСК.
C: 622 PASS / 6 SKIP / 0 FAIL; typecheck PASS, 0 model/reference/product/cold.
Первый typecheck без tsc сохранён; devdeps Ben установлены по lockfile, код clean.
Шесть профилей чисты; их настройки сохранены; старый lease и архивы сохранены.
Причина старого writer не доказана; supervisor/once guards не ослаблены.
До допуска LAB-58–63 — backlog/revision14, прежние run IDs; очереди пусты.
Node runner принудительно задаёт repeat=1/--no-infra-retry; общий default прежний.
Владелец разрешил LAB-58 после review/доставки/SHA/бюджетов/preflight; LAB-59–63 не запускать.
