# Node evals — checkpoint
Дата: 16.10.2026; A применён, B реализован и проверен offline.
База B: text-import-evals@c02b83b257; источник кода/тестов B: 45f2e14690.
SHA назначения берётся из шапки карточки; до исполнения он должен включать B.
Контракт: ../evaler-orchestration.md; операции: operations.md.
Серия и отдельный установленный helper: ../2026-10-16-text-import-integration.md.
Методика: ../../skills/loginom-node-eval-case/SKILL.md, из назначенного checkout.
Evaler — лидер; Rich — автор; Ben — независимость и итоговая готовность стенда.
LAB-56/57 приняты; повтор пилота и его очистки не требуется.
B: rework_limit по умолчанию 1; для импорта при допуске назначить 3.
B: четвёртый REJECT → blocked; continue_after_evaler привязан к issue/report/SHA.
B: unknown cleanup требует проверенный stand_ready; Ben ограничен frozen SHA.
B: 37 тестов handoff/CLI PASS, bun typecheck из evals/ PASS; без модели и Docker.
Бюджеты/история не обнуляются; новый dispatch сохраняет SHA и проверяет очередь.
C ещё не проверен; repeat=1 пока допускает infra retry, защита одного вызова не реализована.
Multica и стенды в пакете B не изменялись; карточки остаются на опубликованном A до будущего допуска.
Следующий шаг: C и защита одного вызова, затем отдельный разрешённый старт LAB-58.
