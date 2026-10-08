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
По указанию пользователя от 2026-10-08 занятый `10.200.13.152` исключён:
все запуски выполняются на текущей системе. Созданы собственные
`loginom-skills-ab-{server,client}-20261008` и network `loginom-skills-ab-20261008`.
Исходные server/client не переключались. На собственной сети Studio использует
обязательный alias; у сервера нет mounts, storage пуст, Python Disabled=true.
`checkIsolatedLoginom` PASS, Studio HTTP200; native CLI49 `loginom check`:
exit0, Help ready, browser verified. Это не полный A/B preflight или live пара.

В отдельном harness принят `c9f3b12b2`: TDD конфигурации собственной network и
реальная Docker-проверка alias; все прежние изоляционные guards сохранены.
Полный suite на чистом SHA: 462 PASS, 2 SKIP, 0 FAIL, 2023 assertions;
`bun typecheck` PASS. Судья/near-miss/tasks не менялись.
Выявлен следующий открытый adapter gate: отдельный native `loginom status`
возвращает `starting` нового backend; межпроцессное ожидание `ready` требует
совместимой проверки фактической квитанции `loginom check`, без подмены state.

До первого A/B live smoke закреплены **15 задач** по prompt,
checklist и acceptance, таблица покрытия и checksum списка. Evidence:
`package-docs-20261006/ab-selected-15-20261008`; SHA256 списка
`c526d8301b2ae0dfba35cf203e64e74bc5fb966ed69ac2c3d668bdcfa52108c5`.
281 файл исходного snapshot проверен. Финальная пара:
**72–90 попыток**, одна модель агента `openai/gpt-6.1-sol/medium`, неизменные
harness/судья/данные/параметры; каждому сохранённому пакету нужны структура и
cold replay. По уточнению пользователя от 2026-10-08 агент пока не умеет
строить подмодели, поэтому этот путь вне текущего A/B coverage gate.
Проверка документации существующих подмоделей остаётся обязательной.

Обязательные product/Linux/live gates этапов 0–8 остаются открыты в плане.
Полный прогон 35 задач и этап 9 отложены по решению пользователя и не входят
в условия закрытия текущей цели. Серверный skill сохраняется.

## Локальный стенд: исправление маршрута и полный cold control

Первоначальный native connection PASS не доказывал изоляцию: Studio с
`wsproxy: auto` подключалась к общему `ws://127.0.0.1:8080/ws/`, хотя HTTP
origin был собственным портом32768. Отказ открытия контрольного пакета
`PACKAGE_OPEN_REJECTED` и фактический socket URL выявили ошибку настройки.
Прежние квитанции сохранены как historical; они не принимаются за A/B.

В собственном client установлен явный `wsproxy=true`, `host=null`,
`path=app/ws/`; фактический сокет теперь `ws://127.0.0.1:32768/app/ws/`,
Apache проксирует через alias собственного private bridge. Настройка сверена
с [официальной конфигурацией Studio](https://help.loginom.ru/adminguide/studio/config.html).
В собственном server восстановлен typed Python settings с Disabled=true и
нативное представление пустого пароля только тестовой учётной записи user.
Изначальные library/configuration/login отказы сохранены. Исходные server/client
и их настройки не изменялись. Свой стенд перезапускался только при setup,
до первого model/judge прогона; earlier own dirty reference view не получила
подтверждённый native close и не записана как успешная очистка.

Полный fixed-SHA harness81619d80b: **470 PASS / 2 SKIP / 0 FAIL / 2034 assertions**,
`bun typecheck` PASS. Для будущей пары отдельный worktree временно обновлён
до этого SHA. Затем найденный direct fallback потребовал дополнительного guard.
Own harness0876bb32f требует явный same-origin proxy, отклоняет auto/direct,
внешний host и redirect до agent dispatch. TDD RED→GREEN, real HTTP tests:
18 PASS / 0 FAIL / 36 assertions, typecheck PASS. Два промежуточных отказа
были штатным запретом при свободном месте <1GB; порог сохранён. Полный suite нового SHA: **476 PASS / 2 SKIP / 0 FAIL / 2042 assertions**
(478 tests, 36 files, 613.38s), `bun typecheck` PASS. Отдельный чистый
worktree пары закреплён на **0876bb32fa4c876e6446662cfa4380ed6edbb68e**.
Manifest содержит 658 tracked evals files; protected judge/near-miss/tasks
сверены с актуальным evals ref b31ebe7d0 и не изменены. Живое A/B
сравнение пока не запускалось; окончательные условия ещё нужно закрепить.

`ab-local-cold-parent-control-v3-20261008`: **PASS**, exit0/oracle0,
сохранённый синтетический reference восстановлен из точных archived bytes.
Native export destination проверен до execution, fresh CSV собран до logout,
source/input byte-identical, settingsReapplied=false, native close/logout,
remaining0, own container removed. Только проверенные по SHA собственные
staged package/input/output удалены. Это проверка full parent adapter на
контрольном reference, не cold proof пакетов ещё не выполненной A/B пары.
Для обеих сторон закрепляется один installed cold reader49 и один controller;
пакеты baseline/candidate и их исходные настройки не переписываются.

Initial resource-verification EACCES и следующий ошибочный прямой маршрут
сохранены в control/v2; новая попытка использует установленный verified seed.
Controllers, фактический socket и новые configuration hashes сохранены в
`ab-local-stand-20261008/stand-provenance-v2.json`.
Candidate49 explicit-proxy `loginom check`: exit0, LOGINOM_CONNECTION_VALID,
Help ready, browser verified. Baselinefc explicit-proxy native check также
exit0, LOGINOM_CONNECTION_VALID; в его старой схеме нет полей Help/browser,
поэтому их наличие для baseline не заявляется. Квитанции обеих проверок
сохранены отдельно; ни одна не является model/judge A/B попыткой.

Для места старый собственный `candidate-091103ef9-desktop/linux-unpacked`
переведён в `linux-unpacked-preserved.tar.gz`, все4764 entries проверены
полным roundtrip по bytes/SHA/modes/symlinks. Restore command и hashes в
`linux-unpacked-preservation.json`. Первоначальная проверка default tar
не сохранила group permissions; исходник оставлен до повторной успешной
проверки с `--same-permissions`. DEB/AppImage091, baselinefc и candidate49,
профили, результаты и чужие файлы не изменены.

Старый собственный candidate-2396e78f2 Desktop unpacked tree также сохранён
в archive: 4764 entries, 399683018 bytes, полный roundtrip SHA/modes/symlinks
PASS; исходный unpacked удалён только после этой проверки. Сборки для
baseline/candidate пары и старые DEB/AppImage сохранены.

## Полный preflight и условия до первого A/B smoke

Обе binary сборки прошли **полный preflight** frozen harness0876bb32f:
изолированный server marker/ID/storage/Python/network, отсутствие debugger,
bubblewrap, Studio HTTP200 и explicit proxy, Docker/Dock health, agent identity,
Codex version и свободное место. Model/judge calls0. Evidence:
`ab-full-preflight-20261008/{base,candidate}/receipt.json`.
Это не readiness/model smoke: native check receipts приведены отдельно выше.

`ab-conditions-verified-20261008/common.json`: SHA256
`0e5ee67e67e38299736fa3857e327b7dc5237239fee3f0e7b2e12c7c94402df4`.
Подтверждены все658 harness files,281 snapshot files,5389 baseline и5651
candidate CLI manifest entries, включая symlink modes через lstat. Первая
проверка ошибочно сравнивала mode symlink target через stat; FAIL сохранён,
пакеты не изменялись. Common pins включают модели/variant, судью/high,
prompt/schema/code/executable dependencies, task timeouts, threshold70,
repeat3/serial,15 IDs/90 attempts, near-miss hashes, stand provenance,
external catalog/server skill и model cache. Seed не настраивается.
Допуск на активацию: один дополнительный provider-turn и один skill-вызов на
задачу; остальной рост вызовов измеряется отдельно и не ослабляет качество.
Перед каждой стороной и smoke требуется повторная проверка неизменности.
Если candidate меняется, нужна новая фиксация условий и полная новая пара.

`ab-external-snapshot-pinned-20261008`: Skills API manifest и все его files
сохранены с validation/revision/SHA; server revision
`907ff16bc39752f808b8ab6d3caf06c57f21f605f0da0fe238fff5975a41b148`.
Action catalog обеих сборок совпадает: `2026.09.14-rc6-linux-candidate`,
manifest17764f9a…, все4 remote files проверены. Production current.json на
сервере отсутствует; первоначальный запрос FAIL сохранён. Обе сборки реально
используют exact candidate pin из resource-manifest, а не production current.
Help catalog hash также сохранён. Model/browser calls0, сервер не изменён.

Упакованы own obsolete091/239/253/3ec/5a9/bd0/c50 Desktop trees: по4764 entries
каждый, полный byte/mode/symlink roundtrip. Все архивы, DEB/AppImage и manifest
восстановления сохранены; baseline/current49 и результаты не изменены.
Свободное место после сохранения —4.5GB; прежний guard1GB сохранён.

## CLI build→modify: подтверждённый отказ, причина lock открыта

`openai-49-cli-scenario-modify-v2-20261008`: все3 controller attempts exit1,
SCENARIO_CALCULATOR_NOT_VERIFIED; каждый из6 CLI ходов exit0/process remaining0.
Warm import/save подтверждён, turn2 public prepare и journal во всех3 выдают
readonly package. Attempts1/3 calculator NOT_APPLIED, effect_possiblefalse,
cleanup_completetrue из-за неактивного source output; attempt2 calculator не
вызывал. Эти отказы не принимаются за успешное изменение сценария.

Readonly owner/причина неизвестны. Ordinary runtime close и ноль local процессов
не подтверждают native close/logout. Exact shutdown bodies и основные ownership
modules fc→49 совпадают; новая регрессия продукта не доказана. CLI отдельный
run на каждый ход проверяет cold continuation; Desktop общий backend — warm.
Старые runtime refs закономерно отвергаются, активный source после reopen нужно
подтверждать заново. Private acceptance-only native cleanup не включается
глобально в продукт без отдельного решения о владении.

Evidence `cli-workspace-close-signal-20261008`: saved public/journal extraction,
source/history hashes, offline70 guards+7 inner bridge tests PASS ×3.
Исходный bridge wrapper FAIL ×3 (nested child stdout пуст); этот FAIL сохранён
и не объявляется green вследствие прямого запуска inner fixture. Без blind
retries, неизвестные блокировки/чужие процессы не трогались.

## Наш адаптер привязки eval→cold replay

Commit1d8dbd387 добавляет только test infrastructure `planEvalColdReplay`.
Из XML сохранённого пакета он берёт точные import filenames native admission,
сопоставляет их с единственным original task basename и проверяет SHA всех
snapshot attachments, включая неиспользованные. Затем общий planColdReplay
проверяет package bytes, account/export ownership и saved GUID. Узлы/настройки
не переписываются; этот код не включается в оцениваемые сохранённые бинарники.

TDD: missing export RED→positive GREEN; unused changed attachment RED→GREEN.
Шесть новых проверок: exact binding/unchanged package, unused changed bytes,
ambiguous basenames, foreign export identity, changed package и relative source.
Полный Host suite с pinned Node24.19: **297 PASS / 7 SKIP / 0 FAIL / 1924 assertions**,
304 tests/43 files,83.54s; typecheck PASS. Изначальные ошибочные commands из
неверного cwd и без обязательного TEST_NODE сохранены отдельно; они не служат
RED поведений и не считаются регрессиями продукта. Общие adapters и checksums
записаны в `ab-conditions-verified-20261008/adapters.json`.

Первые preparations smoke остановились до агента: контроллер сначала не
создал parent output, затем preseed auth/cache нарушил native profile format,
затем direct management потребовал существующий profile root. Все сохранены,
attempts/model/judge calls0. Controllerv3 использует существующий ensureProfile
до auth/cache и отдельный `ab-smoke-v3-20261008`; базовый smoke только после
этой подготовки считается фактическим запуском. Ни один из preparations не
входит в90 formal attempts. Финальный результат v3 фиксируется отдельно.
