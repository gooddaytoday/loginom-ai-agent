# Блокеры parallel evals

## Draft admission fixture: retained unused slot reservation

2026-10-14: /tmp/evals-admin-user-e3H9B4, own research nonce
eddb11f2-bde0-4659-aba7-d6ff61201875, server full ID
1790125f8e1408aca0312cc2db75c1214708d1cf198f70d98f3c8c44d4ed9ef0,
Studio2d467bf07fddc87fff4a7418dee81f15681c0b67fe0b3118ff40a3c8e779776f.
Первый draft упал до отсутствующего createBlockedUser; finally close оставил
reservation, destroyPair отказал PAIR_RETAINED_INCIDENT. Pair/root/secret/journals
сохранены; отсутствие нынешнего PID не разрешает remove reservation или destroy.
Нужны recovery-only CAS и доказанное unused/clean release (account absence,
native process proof, committed archive) через lifecycle API. Native wire CRUD
продолжен на других disposable pairs без slot admission; они штатно уничтожены.

## Незавершённый live admin dispose — причина пока не воспроизведена

Research admin-fYV8vv: probe unknown/dispose confirmed, затем test timeout90s;
финальный connection receipt остался ready. Подтверждённого cleanup этого
incident нет. Пять локальных channel/supervisor tests×3 и два actual Node/pipe
order probes прошли (15 PASS/63 assertions, оба final00). Последующие live
read-only/design-refusal проверки завершились; перестановка await как fix не
подтверждена. Journals/profiles сохраняются, targeted closure/admission остаются
gates. Диагноз: evals/docs/2026-10-14-admin-design-capability-diagnosis.md.
Продолжение: проверить lifecycle на квалификации design user, сохраняя incident;
отсутствие нынешнего PID не разрешает освобождение его fence или удаление данных.

## Bootstrap administrator — внешний вход получен, live qualification открыта

Обновление 2026-10-14 16:23 UTC: оба **фактически настроенных** файла
`parallel/secrets/loginom-admin.json` и `research/secrets/loginom-admin.json`
присутствуют. `loadSlots` + private receipt reader + schema validation PASS:
regular current-UID0600, два непустых string-поля username/password без NUL.
Содержимое не выводилось и не копировалось. Выбранные container names свободны,
постоянный pair journal отсутствует; следующим шагом создаётся research pair.
Public create research 2026-10-14 завершился infrastructure-ready, persisted
pair.json и resource/identity read-back PASS. Evidence:
`/home/kiselev/.local/state/loginom-evals/research/evidence/pair-bootstrap-20261014`.
Pinned-candidate native admin login/role read-back + browser/native dispose теперь
PASS: target1/7 (6.22s), combined48/123 (36.33s), typecheck/diff PASS. Timeout
root cause — Studio password readonly до focus — исправлен штатным focus;
диагноз evals/docs/2026-10-14-admin-password-focus-diagnosis.md. Unknown старых
probes сохранён; server sessions/ACL/backup/licence counts ещё не квалифицированы.
Acceptance pair ещё не создана.
Отсутствие admin file больше не блокирует factory; admin login и роль
подтверждены на research. Лицензия, qualified session RPC/ownership и остальные
readiness gates ещё требуют проверки.

Историческое состояние на 2026-10-13:

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

## Model и judge OAuth — файлы появились, live qualification открыта

Обновление 2026-10-14 16:23 UTC: configured model-oauth/auth.json и
judge-codex/auth.json присутствуют как regular current-UID0600. Проверены только
metadata, auth bytes не читались; действующий вход, сроки/refresh и реальные
model/judge calls ещё не квалифицированы. Отсутствие файлов больше не считается
актуальным blocker; прежние наблюдения и onboarding инструкции сохранены ниже.

Историческое состояние:

После успешной установки shared-oauth candidate metadata-only проверка обнаружила отсутствие `parallel/model-oauth/auth.json`, `parallel/judge-codex/auth.json` и `parallel/onboarding/profile`. Путь установленного candidate и hashes закреплены в private `/home/kiselev/.local/state/loginom-evals/parallel/candidate-receipt.json`. Source/manifest/capability qualification PASS; это не действующая авторизация.

Подготовка directories завершена 2026-10-14: model-oauth, judge-codex, onboarding и onboarding/profile — canonical owner1001/mode0700 (read-back). Отсутствие onboarding/profile устранено; оба auth.json по metadata-only проверке всё ещё отсутствуют. Installed candidate eb85403ce4 квалифицирован только для synthetic-schema public status и bwrap status consumers; live OAuth/forced refresh не квалифицированы.

План задачи 7 требует свежий вход владельца с внешним подтверждением аккаунта: shared модельный вход в private onboarding profile с `LOGINOM_AI_AGENT_SHARED_AUTH_DIR` и HTTP-only false, затем отдельный `CODEX_HOME=.../parallel/judge-codex codex login --device-auth` для судьи. Desktop/prod auth не копируются и существующие OAuth stores других задач не заимствуются. Harness может подготовить directories и проверить статус, но согласие аккаунта выполняет владелец.

Этот blocker относится к model/refresh и judge live gates. `--skip-judge` не требует judge auth; немодельные и fake CLI/judge проверки могут продолжаться. Команды входа и неизменяемые пути остаются в задаче 7 плана; токены в этот файл не записывать. Вопрос пользователю отложен до завершения независимых задач.

Static Studio inspection 2026-10-14 независимо от credentials закрепила RPC interface inventory (private admin-source-4905babb/rpc-inventory.json): Session.Guid и managed object ID доступны в surface, UI CloseSession использует proxy row. Это не живая квалификация: GUID↔managed-ID/CLI correlation, reconnect stability и close/read-back остаются неподтверждёнными. Дополнительный blocker несовместимости API не заявлен по одним descriptors; нужен owner-backed Loginom run из уже указанного bootstrap prerequisite. Stopped inspection container удалён, endpoints/рабочие сессии не трогались.
