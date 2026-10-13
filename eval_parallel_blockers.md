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
пар; driver закрепил JSON-схему: ровно два непустых string-поля `username` и
`password`, без NUL, private regular file 0600 текущего UID, nlink=1, без symlink.
Секреты нельзя
передавать через Git, results, argv или сообщения. После появления файлов:
проверить owner/mode/schema, создать постоянные пары и квалифицировать admin login.

Ограничение затрагивает постоянный bootstrap задачи 1а и живые проверки задач
2–5/10. Disposable Docker infrastructure integration не входит в Loginom под
пользователем и не доказывает admin readiness. Unit-реализация и немодельные
Docker проверки могут продолжаться.

Driver rejection integration отдельно квалифицировала malformed/missing private
credential и несовпадение runtime hash до browser launch. Format-only canary
временный fixture не использовался для Loginom auth и удалён; постоянные
bootstrap credentials не создавались. Browser/readonly RPC пути ещё не проверены.

Bun→Node→supervisor bridge прошёл отрицательную интеграцию на собственной
disposable pair: 3 tests/17 assertions, init not_applied, dispose confirmed и
continuous process absence proof. Это позволяет продолжать независимый код,
но не снимает bootstrap blocker и не доказывает browser/admin readiness.

## Model и judge OAuth — внешний вход, открыт 2026-10-14

После успешной установки shared-oauth candidate metadata-only проверка обнаружила отсутствие `parallel/model-oauth/auth.json`, `parallel/judge-codex/auth.json` и `parallel/onboarding/profile`. Путь установленного candidate и hashes закреплены в private `/home/kiselev/.local/state/loginom-evals/parallel/candidate-receipt.json`. Source/manifest/capability qualification PASS; это не действующая авторизация.

План задачи 7 требует свежий вход владельца с внешним подтверждением аккаунта: shared модельный вход в private onboarding profile с `LOGINOM_AI_AGENT_SHARED_AUTH_DIR` и HTTP-only false, затем отдельный `CODEX_HOME=.../parallel/judge-codex codex login --device-auth` для судьи. Desktop/prod auth не копируются и существующие OAuth stores других задач не заимствуются. Harness может подготовить directories и проверить статус, но согласие аккаунта выполняет владелец.

Этот blocker относится к model/refresh и judge live gates. `--skip-judge` не требует judge auth; немодельные и fake CLI/judge проверки могут продолжаться. Команды входа и неизменяемые пути остаются в задаче 7 плана; токены в этот файл не записывать. Вопрос пользователю отложен до завершения независимых задач.
