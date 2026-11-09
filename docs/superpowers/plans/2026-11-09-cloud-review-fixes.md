# Исправление замечаний облачного подключения

Цель — устранить семь замечаний ревью `c5e75acb34` по поручению пользователя от 2026-11-09.
Спецификация — `docs/superpowers/specs/2026-11-05-dock-cloud-auth-design.md`.
Рабочая ветка — `dock-cloud-auth`, база исправлений — `c5e75acb34`.

## Решения и проверки

Использовать существующие контроллер авторизации, HostPort, CLI и локальные fixtures.
Для каждого поведения сначала воспроизвести отказ тестом, затем внести минимальное исправление.
Публичные интерфейсы, защита секретов, deadlines и подтверждённое завершение процессов сохраняются.
Сборка, установка, слияние и выпуск в это поручение не входят.

- [x] F1 — `cloud-auth.ts` и auth tests. Повторный start после ожидания отмены учитывает закрытие и более позднюю отмену. Проверить отсутствие нового device request и записи после close/cancel.
- [x] F2 — `cloud-auth.ts`, Host tests. Ошибка чтения cloud store видна в безопасном cloud-статусе. Host с custom-профилем работает, disconnect позволяет удалить повреждённую запись. Ошибки защиты/удаления хранилища остаются явными.
- [x] F3 — `host-port.ts`, recovery tests. Новые read/tools второго чата ожидают уже начатое восстановление Help в собственном budget. Отмена одного запроса не отменяет чужой запрос.
- [x] F4 — `evals/src/profile.ts`, profile tests. Setup и проверки endpoint сохраняют prefix Dock base URL с завершающим slash и без него.
- [x] F5 — `standalone-run.ts`, startup/PTY tests. Уже подключённый пользователь без Loginom generation пропускает настройку и входит в обычный TUI без повторного cloud connect.
- [x] F6 — `cloud-auth.ts`, auth tests. Ошибка сохранения новой пары включает demand-only cooldown, после 30 секунд новый запрос может восстановиться.
- [x] F7 — Windows settings driver и Desktop live check. Драйвер передаёт актуальный fixture input, Windows использует явное proxy environment, POSIX сохраняет login-shell проверку. Проверить контракт переносимым тестом и реальным POSIX shell. GUI и native Windows остаются явно непроверенными.

## Итоговая проверка

- [x] Независимое ревью плана до реализации.
- [x] Пакетные тесты изменённых путей и `bun typecheck` в Host, opencode, Desktop и evals.
- [x] Независимое ревью итогового diff, устранение замечаний в текущем scope.
- [x] `git diff --check`, запись результатов и ограничений в `docs/testing/loginom-ai-agent/cloud-auth.md`.

## Ход работы

Все семь исправлений завершены. Циклы RED → GREEN выполнены для каждого замечания. Независимые ревью плана и итогового diff одобрены. Пять непересекающихся наборов дали 342 PASS, 4 SKIP, 0 FAIL. Финальные package-local typechecks Host, opencode, Desktop и evals прошли. Новые сборки, GUI, installed CLI/PTY и native Windows/macOS не запускались. Полные результаты и ограничения сохранены в cloud-auth.md.
