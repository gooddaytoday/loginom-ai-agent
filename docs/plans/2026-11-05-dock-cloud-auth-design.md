# Проектирование и проверка подключения к Loginom AI

Ветка `dock-cloud-auth`, база `loginom` (`dd2f949d11`). Ход реализации — в checkpoints ниже.
Канонические решения: [спецификация](../superpowers/specs/2026-11-05-dock-cloud-auth-design.md).
Этот файл содержит план работы и свидетельства проверки, не вторую спецификацию.

## План обсуждения

- [x] Изучить Agent, канонический Dock и сайт; независимо проверить план исследования.
- [x] Согласовать пользовательские решения и визуальный макет.
- [x] Записать спецификацию.
- [x] Получить первоначальное Spec Review; оно пропустило перечисленные ниже проблемы
      и не является доказательством готовности прежней редакции.
- [x] Завершить повторное независимое ревью технически исправленной спецификации.
      Host/runtime, Dock и auth: Approved. Дополнительно устранена гонка GET
      выдачи новой пары после отзыва установки; повторная auth-проверка одобрила правку.
- [x] Зафиксировать проверенную документацию коммитом в `dock-cloud-auth`.
- [x] Подготовить [план Agent/Dock с TDD](../superpowers/plans/2026-11-06-dock-cloud-auth.md);
      отдельный план реализации сайта в этом репозитории не создавать.

## План исправления замечаний 2026-11-05

- [x] Разделить проверку на Host/runtime/consumers, Dock/backup/ACL, Better Auth.
- [x] Проверить фактические пути вызова, а не только текст прежнего дизайна.
- [x] Уточнить неизвестную topology у пользователя; подтверждено, что reserve
      ещё не существует и будет отдельным инстансом.
- [x] Независимо проверить подход правки: real issues исправить минимальными
      механизмами, не расширять logout на все браузерные сессии и не добавлять
      глобальную модель ACL/репликацию.
- [x] Исправить спецификацию; явно отделить будущие гарантии от проверенных фактов.
- [x] Перепроверить изменённые разделы тремя исследователями и проверить документ.
      Проверены структура разделов, покрытие всех замечаний и пробельные ошибки.

## Результаты проверки замечаний

| Замечание | Вывод и решение в спецификации |
| --- | --- |
| P1-1 | Подтверждено: ready/catalog одноразовые, acquire/tools блокируют повтор. §§3/7/11: connection-required, save до входа, mutable readiness прежнего поколения, retry до gates, тест обновления0.3.9 и восстановления. |
| P1-2 | Подтверждено: product Help обслуживает один child; browser user-v1 remote нужен только startup. §7: удалить его в managed-пути, оставить Host→Help request/reply; reverse IPC и browser transport replacement убраны. |
| P1-3 | Подтверждено: web session позволяет новый вход. §6 ограничивает отзыв уже выданными credentials; all-web logout не вводится. Открытая регистрация не обеспечивает блокировку человека. |
| P1-4 | Подтверждено по code paths: общие agent/resources доступны USER, default search может включать skills. §9 ограничивает все managed Help URI официальной KB, запрещает context mode; серверные ACL KB сохраняются. Общие OpenViking права не перепроектируются. |
| P1-5 | Backup действительно включает auth registry. Неизвестность topology разрешена ответом пользователя: будущий отдельный reserve. §9: независимые volume/registries, отдельная публикация KB, запрет primary full restore поверх reserve. |
| P2-6 | Подтверждено: config/installation binding, quota, errors, provisioning concurrency. §5 задаёт binding/exact disabledPaths/server revoke/явный лимит; §8 — singleflight/cooldown. Вечный запрет refresh до новой local revision отклонён как deadlock. |
| P2-7 | Подтверждено: runtime endpoint override и новые Host HTTP запросы не защищены существующим networking автоматически. §5: fixed release URLs, один build-only staging tuple, proxy/system-CA контракт и native проверка. |
| P2-8 | Подтверждено: build callers, evals, node acceptance и fixtures пропущены. §§10/12 перечисляют их, задают explicit custom setup через stdin и безопасную legacy migration. UI-01 находится в docs/testing/loginom-ai-agent/README.md, не корневом README.md. |
| P2-9 | Подтверждено: management timeout180с и model diagnostics=whole status. §§3/5: короткие start/status/cancel, expiry и guard; отдельные management/model проекции. |
| P3 | §§3–9: отмена незавершённого входа при закрытии формы, смена аккаунта на сайте, удаление revoked credentials с диска, отдельная cloud запись, Linux plaintext факт, общий deadline, реальный масштаб ADMIN. |

## Необязательные предложения

- Приняты Host-owned Help recovery без reverse IPC, redirect:error, закрепление
  reserve только после успешного ответа, сокращение ненужных client response ID.
- Постоянный seed не принят: повторный regenerate с ним не меняет ключ. Recovery
  выдачи/ротации должен учитывать потерянный ответ; детальный выбор хранения и
  повторяемого provisioning относится к отдельному плану сайта.
- Перенос полного primary volume в reserve не используется для обновления KB.
- Глобальные права всех USER OpenViking не меняются: предотвращение попадания
  чужих общих записей в Agent обеспечивается scoped Help и read ACL официальной KB.

## Основания и пределы проверки

Host: connection-service.ts, host.ts, host-port.ts; managed-entry.mjs/bridge.mjs;
knowledge-client.mjs; transport.ts; Desktop/CLI startup; перечисленные consumers.
Dock: api_keys/legacy.py и new.py, storage/acl.py и viking_fs/_access.py,
mcp_endpoint.py, backup-server.sh/restore-server.py, Assets catalog/import.
Better Auth: официальные docs и исходники v1.7.17, включая router.disabledPaths,
verifyApiKey, updateApiKey, signOut/revokeSession и deviceAuthorization.

Не выполнялись runtime-тесты, build, Better Auth/Electron интеграция, изменения
или запросы с credentials к production, исследование бинарника0.3.9.
Сайт и reserve ещё не реализованы. Неизвестны текущие production ACL,
allow_private_networks и внешняя доступность admin API; это условия развёртывания,
не уже доказанные свойства. Макет остаётся иллюстрацией во временной папке.

## План уточнений 2026-11-06

- [x] Сверить proxy с канонической system proxy v2, диагностику с текущим View,
      условие revokeSession с официальным исходником Better Auth v1.7.17.
- [x] Независимо проверить минимальный план правок до изменения спецификации.
      Approved; условие revokeSession сверено также независимым reviewer.
- [x] Уточнить §3–6 и проверки §11: proxy-вариант А, совместимая диагностика,
      raw token той же device-сессии, ротация пары при отзыве пользователя;
      отдельно определить browser check при сохранении до облачного входа.
- [x] Сохранить точки интеграции connection-required для будущего плана.
- [x] Проверить изменённые формулировки независимо, выполнить документальные
      проверки и зафиксировать только документацию.
      Diff получил Approved; `git diff --check` пройден. Проверка без runtime.

Для будущего плана: `connection-required` требует изменить обработку успешного
сохранения и завершения polling в
`packages/app/src/components/settings-loginom-state.ts`, убрать безусловное
`help: ready` из `packages/opencode/src/cli/loginom-management.ts` и распознавать
новый профиль в `evals/src/profile.ts`. Это точки интеграции нового состояния,
а не дефекты существующего кода до начала реализации функции.
В `packages/app/src/components/settings-loginom.tsx` отдельно проверить подписи
после browser check и toast сохранения: browser verified не означает Help ready.
Onboarding сохраняет критерий наличия настроек; CLI automation preflight вправе
требовать фактический Help ready перед работой.

Уточнения подтверждены чтением исходников. Proxy-вариант А не переносит системный
resolver в Host/Help и не меняет system proxy v2. Передача explicit env в Help
не признана доказательством её применения транспортом; эта проверка остаётся
в реализации. Diagnostics сохраняет прежний View в обоих форматах ответа.
Для revokeSession явно требуется raw token той же authenticated device-сессии.
Отзыв пользователя явно ротирует обе Dock credentials. Сохранение до входа
не запускает browser check автоматически; явный Check проверяет его отдельно.

## Подготовка плана реализации 2026-11-06

- [x] Сверить точные интерфейсы, тестовые helpers и команды Agent/Dock.
- [x] Записать план `docs/superpowers/plans/2026-11-06-dock-cloud-auth.md`:
      последовательные TDD-срезы, файлы, интерфейсы, проверки и зависимости выпуска.
- [x] Самостоятельно проверить покрытие спецификации, имена и отсутствие заглушек.
- [x] Получить независимое ревью готового плана и исправить замечания.
      Итог: общее ревью, Host, Dock/runtime — Approved. Документальные проверки пройдены; план зафиксирован вместе с журналом.

План подготовки до исполнения получил независимое Approved. Работа ограничена
документацией; реализация сайта остаётся отдельной задачей в его репозитории.

План содержит 15 задач; все implementation checkboxes пока не выполнены.
Исправлены замечания ревью: реальный порядок save/settled, observable Help snapshot,
write/clear races, installation-bound access_revoked, HTTP/deadline ограничения,
CLI save без browser до входа, зависимость Node integration от build tuple и
реальный двухпроцессный Dock fixture с MCP lifecycle. Публичный HttpApi не нужен.
Проверены пути, структура Markdown, отсутствие незаполненных шагов и покрытие
§§1–12 спецификации; `git diff --check` пройден. Runtime/тесты/сборки не запускались.
Следующий шаг — выбор способа выполнения плана; site/reserve/native gates остаются
отдельными условиями выпуска. Производственный rollout не выполнялся.

## Проверка замечаний к плану 2026-11-06

- [x] Подтвердить замечания по общим типам, зависимостям тестов, TUI,
      release/proxy и Dock по исходникам.
- [x] Исправить план: согласованные изменения всех consumers, ранние custom
      fixtures без legacy fallback, выполнимый порядок сетевых проверок,
      обычный чат TUI; упростить локальную Dock-проверку до одного инстанса.
- [x] Согласовать со спецификацией запрет повторного входа при уже подключённой установке.
- [x] Проверить документацию самостоятельно и независимо; результат сохраняется docs-коммитом.

План правки до исполнения получил независимое Approved. Одноразовая проба
Better Auth остаётся предложением вне текущего объёма; продуктовый код не меняется.

Повторное общее ревью, Host/CLI и Dock — Approved. API и Desktop channels собраны
в Task6 атомарно; custom setup/fixtures перенесены в3; live cloud проверки —13.
TUI cancellation явно охватывает startup/cleanup и передаёт управление обычному
чату после успеха. Проверены структура, ссылки, типы commits и git diff --check.
Runtime/сборки/production не запускались. Следующий шаг — выполнение Task1.

## Checkpoint исполнения — 2026-11-06

- SHA: `fd489f49a1`, ветка `dock-cloud-auth`; исходный worktree чистый.
- Прочитан файл цели; выполнение Task1 ещё не начато, implementation checkboxes не изменены.
- Обе разрешённые копии Node совпадают с закреплённым SHA-256 Node 24.19.0.
- Блокер: в текущей сессии Codex не зарегистрированы OpenViking search/read tools.
- `ov-memory-doctor` без proxy env: timeout; с `NODE_USE_ENV_PROXY=1`: exit 0,
  credentials приняты, status 200, MCP tools/list 24, все подсистемы ready исправны.
- Это подтверждает доступность сервера, но не доступ к памяти из Agent runtime.
- Согласно пользовательским AGENTS-инструкциям работа остановлена при недоступности памяти.
- Следующий шаг: восстановить MCP-инструменты в сессии либо получить разрешение
  владельца продолжить без памяти; затем дочитать spec/plan и выполнить Task1.

## Checkpoint Task 1 — 2026-11-06

- SHA базы: `fd489f49a1`; результат фиксируется коммитом `refactor(loginom): start managed browser without Dock`.
- OpenViking восстановлен: настоящие actor search и exact read успешны; блокер снят.
- Независимое ревью полного плана/spec и источников Task1–2: Approved.
- Pre-flight: 1→2 browser/Help разделены; 3→6 mode/check/view согласованы со всеми consumers;
  4→5→7 cloud-store/auth/recovery; 6→8→10/11 API; 9→13 proxy/tuple; 12→13 harness; 2→14 scope.
- Исполнение inline (executing-plans), ledger — этот журнал; временные материалы только в storage/tmp.
- RED→GREEN: remote startup запрещён; browser IPC/env/argv без Dock key; local prepare и диагностика без remote probe.
- Runtime: pinned Node, bundled/bridge/classic/user-profile — 20 PASS; Host prepare/knowledge/process — 16 PASS.
- `bun typecheck` Host и `git diff --check`: PASS. Зависимости установлены по frozen lock, pins не менялись.
- Ограничения: проверки source/fixtures, установленный GUI и native Windows/macOS этим не подтверждены.
- Следующий шаг: Task2, ограничить семь Help-чтений официальной KB.

## Checkpoint Task 2 — 2026-11-06

- SHA Task1: `2bf6c1e354`; результат Task2 — коммит `fix(loginom): scope Help reads to official knowledge base`.
- Все семь Help-чтений проверяются до отправки: root/descendants, search list-only,
  полный read-array, относительный glob; чужие/неоднозначные URI не нормализуются в разрешённые.
- Опубликованные схемы сужены до combineCatalogs; portable read array сохранён.
- Реальные MCP fixtures: mixed read даёт 0 remote calls; find получает KB root.
- RED→GREEN: каждый scope-сценарий, сетевой mixed read, published schemas и передача safe error через Host.
- Runtime client: 27 PASS; entry: 11 PASS; Host knowledge: 3 PASS;
  дополнительно Host knowledge+prepare: 13 PASS и `bun typecheck` PASS; `git diff --check` PASS.
- Независимая проверка scope и regex/runtime: замечаний нет; ошибочные fixture read.offset/limit удалены.
- Поправка плана: allowlist scope-error перенесён из5 в2, поскольку ошибка пересекает IPC уже сейчас.
- Ограничения: настоящий Python Dock/ACL проверяется Task14; production не затронут.
- Следующий шаг: Task3, explicit custom configuration и безопасная legacy migration.

## Checkpoint Task 3 — 2026-11-06

- SHA базы: `0a6f69ae4c`; результат — `feat(loginom): add explicit custom Dock configuration`.
- Executor с Task3: subagent-driven-development; scratch/report workspace `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl`.
- Legacy без mode → cloud без старого key; исторические файлы неизменны, Loginom credentials/URL сохранены.
- Explicit custom endpoint/key, сохранение при переключениях, Check и обязательные View/Validation fields готовы; runtime fallback удалён.
- TDD edge-ветки исправлены до commit: возврат к проверенному срезу, затем по одному RED→GREEN; mapping в scratch report.
- Host mandatory:60 PASS; final validation:20 PASS; Desktop:31 PASS; Schema:2 PASS; App:19 PASS.
- CLI cumulative:25 PASS/1 native skip; stale KB-read fixture исправлен, preflight+parser rerun:14 PASS.
- Adjacent: Desktop7 PASS, migration18 PASS; все5 `bun typecheck` и `git diff --check` PASS.
- PTY custom setup/password:code0, cancel:130; secrets скрыты, guards сняты, своих живых children нет.
- Native shutdown/oracle/oauth NOT_RUN: нужен fresh isolated Desktop artifact и private inputs; source syntax PASS.
- PTY --prompt старый provider зовёт недоступный loginom_probe; свой loop завершён, исправление fixture — Task11.
- Cloud без credentials намеренно не запускает Help; save-before-login и cloud API — Task6. Production/site/native ОС не проверены.
- Независимое ревью `f2cfcfe12b`: Spec compliant, Quality Approved; обязательных замечаний нет.
- Minor (deferred): неверный custom endpoint/key на Node IPC даёт общий безопасный код; корректный отказ сохранён.
- Следующий шаг: Task4, отдельное хранение cloud credentials.

## Checkpoint Task 4 — 2026-11-06

- SHA базы: `f2cfcfe12b`; результат — `feat(loginom): persist cloud credentials outside generations`.
- Отдельный stateless cloud.json: полный kind/schema, private permissions/owner/NOFOLLOW, temp0600, fsync/rename/directory fsync и durable clear.
- До rename выполняется decoded read-back; invalid kind/неполная пара/corrupt payload не заменяют прежнюю запись.
- После directory fsync failure новая запись остаётся фактической; rollback не обещан.
- Codec обобщён на JSON object; v1 envelope, Keychain AAD/crypto/limits сохранены; connection-store пишет только apiKey/password.
- Legacy Linux/safeStorage/CLI metadata envelopes читаются; secret pair проверяется store; четыре native script callers сузили unknown.
- TDD: roundtrip, CLI/Keychain/cloud payload, schema, permissions, read-back, fsync write/clear, fixed corrupt errors — RED→GREEN.
- Дополнительно повторены RED→GREEN safeStorage generic decode и оба connection encode payload, затем Desktop 13 PASS.
- Host mandatory 20 PASS/2 native SKIP; с adjacent migration/keychain-platform 39 PASS/2 SKIP; Desktop13 PASS.
- Host/Desktop `bun typecheck` и `git diff --check` PASS; schema/Protocol/HttpApi не менялись.
- Поправка порядка: memory/status regression требует controller; перенесён в Task5 явно, store durable semantics проверены здесь.
- Ограничения: native safeStorage/DPAPI/Keychain, installed GUI, сайт и production не проверены; используются fixtures на Linux.
- Следующий шаг: независимое ревью Task4, затем Task5 с обязательным memory/status reconciliation regression.
