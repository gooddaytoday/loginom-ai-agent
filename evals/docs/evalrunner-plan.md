# EvalRunner — согласованный план реализации

Дата: 2026-10-09. База реализации: `74cfb803f0488da60db6ab09dfc0ea2042572cf5`, отдельная ветка `eval-runner`.

## Обязательная граница LAB-55

Работы EvalRunner не вмешиваются в LAB-55. Пока не подтверждены 144 измерения,
оценивание, очистка/архивы, действительный release, проверенная доставка и свободный
стенд без active/queued задач и pending recovery, разрешена только локальная подготовка
и необходимое чтение. Серверные checkout/config/helper/CLI/профили/службы не меняются;
блокировки, карточка, инструкции, результаты и мониторинг LAB-55 не затрагиваются.
Новые задания, smoke, live eval и мониторы не создаются. Зависимые действия отложены,
а независимая локальная работа продолжается.

## Этап A — локальная подготовка

- [ ] Config v3: независимая eval-only роль evalrunner, единая блокировка, совместимость v1/v2.
- [ ] Manifest v2: роль, кандидат, immutable baseline reference; совместимость старых серий.
- [ ] Проверка утверждённых CLI/model/reasoning pins и собственных путей во всех командах.
- [ ] Независимый readiness: два smoke вне baseline; product FAIL/no_artifact допускается только при исправном тракте и cleanup.
- [ ] Реестр принятого baseline, явное операторское принятие с проверкой предыдущего указателя.
- [ ] Явное сравнение объявленных CLI/model/reasoning изменений; остальные различия ограничивают выводы.
- [ ] Инструкция агента, шаблон задания, конфигурация, локальная поставка и checkpoint.
- [ ] Fixture/offline проверки, bun test и bun typecheck из evals; без live вызовов.

## Этап B — отложено до завершения LAB-55

- [ ] Свежая проверка всех условий перехода; один статус карточки или отсутствие PID недостаточны.
- [ ] Регистрация завершённой доставленной LAB-55 как первого baseline, исходные данные неизменны.
- [ ] Поставка/helper/config и собственные checkout/profile/judge-home/history EvalRunner.
- [ ] Создание Multica EvalRunner в проекте de16c24b-4121-45c3-9f5a-e16ddabb90e8, без squad.
- [ ] Readback: runtime Codex (eval-tests), gpt-6.1-sol/xhigh, concurrency=1, workspace visibility.
- [ ] Подготовительная приёмка на параметрах LAB-55; полный сравнительный запуск только по назначенной карточке.

## Контракт

Полный frozen corpus LAB-55: 3 regular + 35 analytic + 10 node, три круга = 144.
Кандидат: установленный immutable CLI с version/source/hash и модель/reasoning продукта.
Неуказанные model/reasoning наследуются из принятого baseline; latest запрещён.
Судья/корпус/рубрики/лимиты неизменны. Baseline фиксируется при prepare и продвигается
только по решению владельца. Product FAIL окончателен; infra/UNKNOWN/failed cleanup блокирует.
Только назначенная карточка, без расписаний, установок и исправлений продукта/harness.
OpenViking actor/automatic Git Peer; недоступность памяти блокирует исполнение.
Отчёт: coverage, per-case transitions, completion/oracle/LLM score, node PASS n/3,
infra/recovery/cost/time отдельно; analytic structure может быть unavailable.
Три попытки не означают статистическую значимость. Curated archive и read-back hashes;
после доставки — in_review, новый baseline принимает владелец.
