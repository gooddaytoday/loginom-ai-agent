# M3: контрольная точка продолжения

- Ветка `dashboard-m3`; канон — [план](../../superpowers/plans/2026-11-12-dashboard-m3.md) и [дизайн](../../superpowers/specs/2026-11-12-dashboard-m3-design.md).
- Задачи 1–11 завершены по поведению; последний срез кода — `ba387a9fc7`. Задачи 12–18 ожидают.
- Профиль dashboard сохраняет ограничение при потере каталога через защищённый серверный флаг; исполнение загружает `Session.getForExecution`, публичный путь/ссылки сохраняются.
- `dashboard_draft` собирает src реальными tsc/Vite, читает согласованный снимок и возвращает общий loopback URL. SQLite-исключение короткое, sample устанавливается последним; Node/Bun, crash и восстановление проверены.
- Задача 8: 4 Desktop + 46 App tests, три typecheck, source Desktop build и E2E — PASS; независимое ревью без замечаний. Новый чат и фактический запрос к dashboard-папке проверены, прежний чат сохранён.
- Задача 9: scoped 22 PASS, полный test/tool 456 PASS, typecheck, source build и native CLI smoke — PASS; независимое ревью без замечаний. Guard проверяет raw path до нормализации, отказывает отмене ссылки через ..; обычный .. и alias работают.
- Задача 10: scoped 69, package 26+36, browser 213, typecheck — PASS; ревью без открытых замечаний. FS permissions Node ограничивают compiler children staging/kit, tsc CLI сохранён; AST и единый PostCSS scanner проверяют конструкции/реальные цели до сборки. POSIX capture PASS; только этот race-тест пропускается на Windows.
- Задача 11: реальный sandboxed Chromium проверяет ready/errors/CSP и закрывается до удаления HOME; отмена ждёт child close. Typecheck/build/browser 222 — PASS; независимое ревью без замечаний. Короткий persistent TMPDIR в environment.sh устраняет Unix socket limit тестового окружения.
- Строгая историческая последовательность TDD для helper задачи 7 не соблюдена полностью; расширенные тесты добавлены после skeleton. Искусственный RED не выдаётся за test-first; дальше первый настоящий RED проверяет controller до production-правки.
- Задача 6: полный Host 435 PASS/6 SKIP; полный backend 4093 PASS/25 SKIP/1 TODO/10 ошибок старой фикстуры, затем изменённый файл 10 PASS/139 assertions. Это совокупное подтверждение, не новый полный GREEN.
- Backend проверять штатным `bun run test` (30 секунд). Полный зелёный финальный CI перед приёмкой M3 обязателен.
- Следующий шаг — задача 12: публикация с явным подтверждением, приватно удержанными входами/результатом и read-back; без автоответа/Allow always. Уточнение владения в Task12 и consistency-plan-review.md обязательно.
- Подробный журнал, отчёты, diff и логи — `.superpowers/sdd/2026-11-12-dashboard-m3/`; окружение — `environment.sh`.
- Временные fixtures находятся вне Git; Node/Bun и template dependencies подготовлены. Для sibling control сначала разрешать настоящий путь work.
- Установленная поставка, настоящая модель, стенд, публикация и задачи 12–18 ещё не приняты. Установка DEB и слияние требуют команды владельца по плану; Windows runtime здесь не проверялся.
- Дополнение Task18 о сохранении Server, исходной Studio и прежнего web независимо одобрено после исправлений; перед исполнением повторно проверить состояние. Стенд и удалённый рабочий компьютер не изменялись.
- Для итогового ревью остаются P3 Copilot `_noop`, Host else-if Minor и прежнее ограничение Product catalog-check для неизменённого `.gitleaksignore`.
- Лимит inotify восстановлен до 65536; постоянные настройки системы не менялись.
