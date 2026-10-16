# Node evals — checkpoint
Дата: 16.10.2026; A опубликован, B реализован, C квалифицирован.
Код B: 45f2e14690; при допуске импорта rework_limit=3 без сброса счётчиков.
Продолжение B привязано к issue/report/SHA; unknown cleanup требует stand_ready.
Ben ограничен frozen SHA; бюджеты, ERROR и независимость не изменены.
SHA назначения — из шапки карточки, должен включать B/C и принятые исправления.
Общий контракт: ../evaler-orchestration.md; команды: operations.md.
Активные CLI/helper/config/container: ../2026-10-16-text-import-integration.md.
Процедура и доказательства C: ../node-eval-cleanup.md.
C: один сброс на eval-tests; READY → COMPLETE → RELEASED → FREE в 15:04 МСК.
C: 622 PASS / 6 SKIP / 0 FAIL; typecheck PASS, 0 model/reference/product/cold.
Первый typecheck без tsc сохранён; devdeps Ben установлены по lockfile, код clean.
Шесть профилей чисты; их настройки сохранены; старый lease и архивы сохранены.
Причина старого writer не доказана; supervisor/once guards не ослаблены.
LAB-58–63 — backlog/revision14, прежние run IDs; Multica и модели не менялись.
Следующий шаг: защита одного физического вызова; repeat=1 ещё допускает infra retry.
Затем отдельный разрешённый старт LAB-58. Сейчас карточки не запускать.
