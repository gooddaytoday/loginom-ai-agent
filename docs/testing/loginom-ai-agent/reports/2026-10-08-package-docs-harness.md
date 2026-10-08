# Совместимость evals harness с product skills

Изменения приняты локальными проверками: **460 PASS, 2 SKIP, 0 FAIL**,
2017 assertions; `bun typecheck` PASS. Оба запуска выполнены из `evals/`
на чистом неизменном SHA `9d7b463c48e4bfb0d55e87fd108400617afa9da3`.
Это приёмка harness, не результаты живой A/B пары или product Help.

По назначению пользователя от 2026-10-08 основная сессия package-docs владеет
этой отдельной задачей. Разработка выполнена в собственном worktree
`/home/kiselev/.codex/worktrees/skills-harness/loginom-ai-agent`, ветка
`skills-harness`, от свежей базы evals
`db8c1b93e83121c77d6a80b1e337701b00ff2779`.
Для будущей пары создан отдельный worktree `skills-evals` на принятом SHA;
его закреплённые файлы не редактируются.

## Что изменено

- Preflight сохраняет Dock `/health`, binary/storage/dedicated-stand/sandbox
  guards, но не требует опубликованного skill из Skills API. Revision и
  source записываются из фактического prepare; старый CLI остаётся поддержан.
- Parser объединяет снимки одного tool part и принимает automation activation
  только из завершённого `skill` с backend-applied metadata. Проверяет
  `loginom-automation`, profile и digest; pending/error/другие profiles не дают
  подтверждённую активацию. Legacy prepare поддержан независимо от нового grant.
- Attempt/run/summary сохраняют фактический источник, revision и activation,
  включая первую попытку штатного infra retry. Причины отсутствия пакета
  разделены на `automation_not_selected` и `package_not_created`.
  Отсутствие артефакта остаётся неуспехом построения.
- Lazy infra допускает только ограниченные prepare connection errors до
  первого успешного Loginom call и независимое наблюдение HTTP 5xx/transport
  failure. Healthy/4xx, scope/integrity/config/runtime errors, другой tool
  error или уже существующий артефакт не получают этот допуск.
- Сохраняются безопасные connection receipts без URL, credentials и body.
  Dry-run не делает новые connection probes. Число штатных infra retries
  осталось прежним: один, с сохранённым `infra_retry.initial`.

Изменены только `evals/src/{preflight,cli,report,run}.ts`, соответствующие
tests/fixtures и локальный аддитивный контракт/AGENTS. Судья, его schema/prompt,
near-miss corpus, задачи/эталоны, config, sandbox и lockfile не изменены.
Проверка manifest подтвердила 658 текущих файлов и неизменность 643 исходных
защищённых файлов; 11 исходных файлов изменены, четыре новых добавлены.
Чужие ветки, worktree, `.env`, профили, результаты и блокировки не менялись.

## TDD и сохранённые неуспехи

Каждое новое поведение реализовано отдельным RED → GREEN через публичные
preflight/CLI events/report/main. Connection/retry tests используют настоящий
локальный HTTP и fake CLI на внешней границе; судья и Loginom не вызываются.
Проверены положительные и отрицательные случаи активации, lazy infra и
предел двух launches при retry. Полный suite не менялся во время финального
прогона; два исходных environment-dependent unit skips не заменяют live gates.

Первый полный прогон был ошибочно начат до фиксации исходников. Bun закешировал
старый модуль, тест изменился во время запуска: 434 PASS, 2 SKIP, 1 FAIL/error.
Этот прогон несопоставим и не считается baseline; узкая проверка повторилась
3/3 без ошибки. Лог сохранён.

Следующий чистый прогон на `aecb121ff` обнаружил реальную dry-run регрессию:
появлялись connection probes и менялась классификация. Собственный test runner
штатно остановлен; его итог не считается PASS. Отдельный публичный тест
воспроизвёл проблему 3/3. Guard `!config.dryRun` дал GREEN вместе с исходными
dry-run тестами и outage/healthy controls: 5 PASS, 32 assertions. После коммита
`9d7b463c4` весь suite выполнен заново и прошёл. Assertions, таймауты и
обязательные условия приёмки не ослаблялись; все исходные логи сохранены.

## Закреплённые доказательства

Собственные manifests, RED/GREEN logs, signal reports и итоговая проверка:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/harness-compatibility-20261008`.
Копия 54 файлов сверена по SHA256; raw logs и credentials не помещены в Git.

| Доказательство | SHA256 |
| --- | --- |
| Final code manifest | `3d5096cad7f8ce6b0d99929ee6f0eb287251d57a701ab37370ad67f831cada3b` |
| Full test log | `319fa287ad0f298b9c8b267b46a2cbf03fdc2d1954c5cad90dc566056b43dc74` |
| Typecheck log | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| Неизменный judge prompt | `6562edddd63d38ab7e8400795c6d1f1198bf2551e2b35baffe0b464248ab6daa` |
| Неизменная judge schema | `f7341e870bf242d31fce9d8d4c1cf79a239bf34e39860496acdb9d956ba7709a` |

## Открытые gates

На текущем стенде `https://mcp.loginom.ai/health` отвечает 200, `/mcp` без
авторизации — 401. Первоначально это подтверждало только доступность сервиса.
Затем CLI669 PDF ×3 подтвердил key-only Help ready и реальные find/read без
Chromium при недоступном web login; документный gate ещё не принят из-за
[layout FAIL](2026-10-08-package-docs-live.md).
SSH к выделенному `user@10.200.13.152` отклоняет имеющиеся способы
входа. Уточнение доступа запрошено; исходные локальные Loginom server/client
не переключались. Ожидание не останавливает независимую приёмку продукта.

До первого A/B live smoke необходимо закрепить **12–15 задач** по prompt,
checklist и acceptance, таблицу покрытия и checksum списка. Финальная пара:
**72–90 попыток**, одна модель агента `openai/gpt-6.1-sol/medium`, неизменные
harness/судья/данные/параметры; каждому сохранённому пакету нужны структура и
cold replay. В исходных 35 задачах пока не найдено явное требование подмодели:
это ограничение покрытия нельзя скрывать названием задачи.

Обязательные product/Linux/live gates этапов 0–8 остаются открыты в плане.
Полный прогон 35 задач и этап 9 отложены по решению пользователя и не входят
в условия закрытия текущей цели. Серверный skill сохраняется.
