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

## Первый локальный парный smoke: warm успешен, candidate cold не принят

Общие условия0e5ee67e…/harness0876bb32f проверены перед каждой стороной.
Оба запуска `sales-by-category` выполнены в отдельных profiles/results/workspace,
agent `openai/gpt-6.1-sol medium`, judge `gpt-6-astra high`. Это отдельный smoke;
формальная матрица15×3×2=90 попыток ещё не началась.

Baseline: `ab-smoke-v3-20261008/base/results/20261008-162053-0876bb32f`.
CLI exit0/completed, judge100/100, независимые структура и warm CSV oracle PASS.
Cold `ab-smoke-base-cold-20261008` PASS: сохранённые package/input bytes
неизменны, реальный native export destination проверен до выполнения,
settingsReapplied=false, oracle PASS, native close/logout, remaining0,
container removed и удалены только точные собственные staged files.
Итог `ab-smoke-base-accepted-20261008/review.json` принят как smoke.

Candidate: `ab-smoke-v3-20261008/candidate/results/20261008-163112-0876bb32f`.
CLI exit0/completed, judge100/100, независимые структура и warm CSV oracle PASS.
Естественная активация bundled `loginom-automation` подтверждена.
Tool calls19 против17 у baseline, Loginom calls13/13, tool errors0/0;
provider step_finish20 против17. Сам activation call не объясняет автоматически
весь рост provider turns; дополнительные ходы требуют отдельной классификации.

Cold `ab-smoke-candidate-cold-20261008` FAIL: WIZARD_OPEN_NOT_CONFIRMED после
одного begin_wizard. Prepared native GUID independently verified на graph и
wizard; мастер observed/text_export_params, owner_context unobserved.
Отказ относится к подтверждению открытия мастера, readonly guard пройден.
Export execution/oracle не выполнялись; настройки не применялись.
Native close/logout BLOCKED/NATIVE_CLOSE_UNCONFIRMED, remaining0,
container removed. Ноль процессов не заменяет native cleanup.
Свои staged package/input сохранены и после отказа повторно SHA-verified.
Причина расхождения breadcrumb observation ещё не установлена; blind retry
и основная матрица запрещены до разбора и безопасного cleanup.
Первый recovery helper не запустился до браузера из-за доступа к private
bind mount; ошибка и контейнерная очистка сохранены. Recovery v2 использовал собственную копию профиля внутри disposable container,
не меняя исходник. Exact package opened readonly, native own-view close/logout
SUCCEEDED/remaining0/container removed. Это не доказательство освобождения
прежнего writer. После guard отсутствия других own AB клиентов перезапущен
только own server027ec…; staged package/input SHA и explicit proxy unchanged.
Исходные server/client не трогались. Restart относится к диагностике; для
сопоставимого cold proof обе стороны должны пройти одинаковую процедуру.

## Cold reader: длинный breadcrumb, TDD/native RED→GREEN

При повторном native диагностическом чтении candidate точно воспроизведён
отказ: `ab-smoke-candidate-breadcrumb-diagnosis-20261008`. На1280×800
breadcrumb узла visible, а точный дочерний `…>Настройка` display:none/width0;
prepared GUID wizard verified. Это объясняет owner_context unobserved.
Мастер не исполнялся, settings не применялись. Native cleanup снова BLOCKED;
собственный сервер перезапущен после отсутствия клиентов, только точные
SHA-verified staged files архивированы/удалены. Исходные контейнеры сохранены.

Минимальное исправление только test infrastructure: после loginBrowser общий
cold-export reader устанавливает1920×1080 до preparation. Product/browser
launch policy1280×800 неизменна, оба сохранённых бинарника неизменны.
GUID, workflow chain, real saved XML/BIN destination, oracle, native close/logout
и process guards сохранены. Не заменяем отсутствующего владельца догадкой.

Native RED: прежний reader WIZARD_OPEN_NOT_CONFIRMED на том же сохранённом
candidate package. GREEN: `ab-smoke-candidate-cold-wide-v2-20261008` PASS,
реальное выполнение/свежий CSV/oracle0, destination verified, settingsReapplied
false, package/input byte-identical, native close/logout/remaining0,
container removed, exact owned staged files removed. Первый wide helper
остановился до браузера, пока reset не завершился; preflight FAIL сохранён.
Обе стороны обязаны пройти один wide reader и одинаковый fresh-server policy;
первый baseline1280 cold не подставляется вместо такой пары.

Offline cold export/binding guards20 PASS/0 FAIL, Host typecheck PASS.
Полный Host suite297 PASS/7 SKIP/0 FAIL/typecheck PASS; baseline wide cold выполняется отдельно.

Candidate raw skill records2 имеют один callID и partID: это повторная запись
того же вызова, а не два разных activation calls. Дополнительный read относится
к bundled references/workflow.md. Provider step_finish20 distinct IDs против17
у baseline; причина оставшегося роста provider turns не выводится из одного
только числа tool records. Допуск на activation не расширяется постфактум.

## Общий wide cold proof и новая фиксация перед парным smoke

`ab-smoke-base-cold-wide-20261008` PASS после такого же reset собственного
стенда, как candidate wide. Обе стороны: actual destination verified до
execution, fresh CSV/oracle0, bytes unchanged/settingsReapplied=false,
native close/logout/remaining0, container removed, exact staged cleanup.
Pair evidence `ab-smoke-wide-replay-pair-20261008/review.json` подтверждает
общий cold reader; не входит в90 и не подменяет новую live-пару.

Новые conditions `ab-conditions-wide-20261008/common.json`, SHA256
`e4a0daf2bfb3d70e02fd0c61121655dd257e7d734e45b012a940c07c5771e5ea`:
21 adapter/verifier/source pins, cold viewport1920×1080, fresh own server
перед каждой warm стороной и каждым cold replay. Остальные модели, параметры,
15 selected task IDs/281 files,658 harness hashes, judge/external pins,
allowance1activation turn+1skill call и бинарники не изменены. Fresh evals ref
b31ebe7d0… совпадает; judge ordinary usage allowed, общий window43% consumed.
Первоначальный conditions0e5ee67e… сохранён; старый smoke не подставляется
вместо v4 после изменения общих условий.

Controller `skills-ab-run-v4.ts` и reviewer v4 закреплены в manifest.
Before dispatch: frozen harness clean/hash, source/judge/binaries/adapters,
fresh external snapshot и isolated own reset guards. Separate results/profile/
workspace/artifacts каждого side; binary mode/absolute CLI bin; original
launcher/profiles/.env не изменяются. Baseline v4 smoke запущен первым.
После обоих v4 smoke нужны judge/structure/warm oracle и common cold replay;
только затем formal45+45. Судья и структура/cold каждого saved artifact обязательны.

Первая v4 baseline preparation остановилась до model dispatch: supervisor
Cannot inspect process identity PID3659485 во время ensureProfile. PID затем
исчез; историческая cleanup uncertainty не объявляется confirmed. Строгий
публичный waitProfileIdle10s подтвердил свободный own profile; весь каталог
архивирован в `ab-smoke-v4-20261008/base-preparation-failed` с receipt original
path/archive path/log SHA/modelCalls0/formalAttempts0. Файлы не очищались и
история не переиспользована. На новом профиле по тем же pins однократная fresh
preparation прошла; baseline v4 реально достиг smoke-dispatch. Все причины
proc identity refusal остаются неизвестны; это не product build verdict.

Свежий offline wrapper check pinned Node24: package-cleanup-bridge standalone
PASS, группа workspace/persistence/cleanup/bridge PASS без изменения source.
Старые3 wrapper FAIL сохраняются; сегодняшнее наблюдение не устанавливает
их причину. Предлагаемое изменение test isolation не внесено, поскольку RED
поведение сейчас не воспроизведено.

Provider growth v3 теперь классифицирован по messageID step_finish и unique
callID каждой provider turn, без чтения reasoning. Evidence
`ab-smoke-v3-provider-cost-20261008/review.json` с events SHA обеих сторон.
Baseline17 vs candidate20: +1 skill activation, +1 bundled workflow.md read,
+1 separate describe/deliver provider turns (baseline делает два tool calls
одной пачкой, candidate раздельно). Raw skill event повторяет один callID/partID;
это не повторная активация. Unique tool calls17 vs19, Loginom calls13/13.
Допуск1activation turn+1skill call неизменен; два других хода измеряются
отдельно. Причинный эффект skill на batching одним smoke не доказывается.

## Baseline v4: smoke принят полностью

Run `ab-smoke-v4-20261008/base/results/20261008-170104-0876bb32f`:
CLI completed/exit0, judge100/100, oracle PASS, cleanup confirmed.
`ab-smoke-v4-base-review-20261008`: независимая структура0/warm oracle PASS.
`ab-smoke-v4-base-cold-20261008`: общий reader1920×1080/fresh own server,
native destination verified/реальный export/oracle0/byte-identical input и
package/settingsReapplied=false/native close/logout/remaining0/container removed/
exact owned staged cleanup. Все21 adapter pins повторно проверены.
Итог `ab-smoke-v4-base-accepted-20261008/review.json`:
SMOKE_JUDGE_STRUCTURE_WARM_ORACLE_COLD_PASS, countsTowardFormal90=false,
common SHA e4a0daf2… и хэши исходных receipts сохранены.
Candidate v4 запущен следующим, сериализация соблюдена; formal90 не начат.

## Candidate v4: качество100, smoke не принят из-за writer cleanup

Run `ab-smoke-v4-20261008/candidate/results/20261008-171244-0876bb32f`:
CLI completed/exit0, judge100/100, warm oracle PASS. Итог main exit1:
Management cleanup failed: Writer owner unavailable. Native agent process,
diagnostics и writer stages подтверждены, но последующий management command
оставил исторический cleanup failed. Его receipt: capture_complete=true,
unknownProcesses=[], две проверки owned_remaining0, writer ранее захвачен.
Текущий profile строго проверен waitProfileIdle10s: idle, .writer отсутствует.
Это не превращает прошлый cleanup в confirmed. Candidate cold не запускался,
пара v4 не принята; formal90 не начат.

Судья также отметил date=dtString в candidate вместо dtDateTime из SPEC.md.
Локальное XML сравнение подтверждает baseline dtDateTime/candidate dtString.
Date не используется в расчётах, prompt/checklist не требуют этот тип;
зафиксированный verdict100 не переписывается и рубрика не дополняется после
прогона. Различие сохраняется в отчёте, а не скрывается за oracle PASS.

Причина writer refusal воспроизведена на реальном файловом IO: native CLI
release выполняет unlink(owner)→rmdir(.writer), acquisition mkdir→writeFile.
Supervisor мог прочитать промежуточное состояние. Исправление только в own
harness worktree, commit `d1b364a98`: максимум три чтения с20ms между ними;
постоянно пустой guard, подмена inode/owner, symlink/недоступность всё ещё FAIL.
Гейты происхождения процессов, complete capture и две final проверки сохранены.
Product artifacts и protected judge/near-miss/task files не изменены.

TDD/public real-filesystem removal: RED→GREEN. Negative persistent-empty и
replacement, positive publication и full native-cycle fixture проверены.
Native-cycle integration со старым кодом тоже прошла, поскольку sampling мог
пропустить короткий gap: тот запуск не выдаётся за deterministic RED.
Focused profile+supervisor **74 PASS/0 FAIL/233 assertions**,167.39s;
реальный process control подтверждает writer receipt/unknown0/remaining0×2.
Typecheck PASS. Full suite на чистом d1b364a98 завершился: **481 PASS,
2 SKIP, 0 FAIL, 2055 assertions**, 483 tests/36 files/585.37s. Лог
`harness-writer-gap-full-suite.log`. Следующий шаг — новый immutable pair
worktree и повтор обеих сторон по одному manifest; результаты087/v4 сохраняются
отдельно. Полный PASS не подменяет live-приёмку исправленного harness.

Шесть собственных устаревших CLI payloads091/239-v2/253/5a9/bd0/c50 сохранены
в полных исходных архивах: каждый распакован в отдельный own tmp и проверен
по6850 entries (байты/SHA, размеры, modes, symlinks/directories). Только после
успешной сверки и отсутствия процессов с этими payload удалены их raw-каталоги.
`obsolete-cli-preservation-summary.json` закрепляет receipts/archive hashes и
команды восстановления; helper сохранён рядом. Baselinefc/current49, upgrade
artifacts, исторические результаты/профили и чужие файлы сохранены. Свободно
около5,1GB; архивы и metadata остаются доступными для восстановления.

## Новый frozen harness и общие условия v5

Чистый managed worktree `skills-evals-writer` на полном SHA
`d1b364a9861d0c0a3acdd2394811e96bdbe51e04`; frozen lockfile установлен.
Перед фиксацией перечитан актуальный evals refb31ebe7d0…; protected diff0.
658 tracked hashes,281 task files,5389 baseline/5651 candidate payload entries
(байты и modes), судья/модели/21 адаптер повторно проверены.
`frozen-harness-d1b364a98.json`, `ab-conditions-writer-20261008`: common SHA256
`abeeb0cfa4281e46a9359d692aaa2d93861918c7674b3764835e27c0e890a86e`.
Controller/reviewer/cold parent v5 импортируют только новый frozen comparator.
Модели/судья/выбор15/90 attempts/рубрика/activation allowance/comparison policy
не изменены; оба smoke повторяются serial, новые formal ещё не начаты.
Текущий weekly usage44% consumed/ordinary usage allowed; чужих live jobs
на собственном endpoint не обнаружено, исходные контейнеры не переключались.

V5 первая baseline preparation: native profile подготовлен, но full preflight
отказал до agent/judge из-за остатков v4 candidate. Собственные CSV и
`.eval-20261008-171244-0876bb32f-sales-by-category-1.lgp.lck` сохранены вместе
с хэшами в `ab-v4-owned-storage-recovery-20261008`; CSV совпал с закреплённым
входом задачи. После свежего own-server reset штатный frozen
`cleanupIsolatedStorage` подтвердил marker/ID/roots/no bind mounts и пустоту
выделенного storage; original server/client не затронуты. Own baseline profile
проверен waitProfileIdle и полностью архивирован в `base-preflight-storage-failed`
с записью model/judge/formal0. Однократная fresh preparation выполняется по
тому же common manifest; guard не ослаблен, старый отказ сохранён.

## Baseline v5: полный smoke принят

Run `ab-smoke-v5-20261008/base/results/20261008-174713-d1b364a98`:
CLI0/completed, judge100/100/warm oracle PASS,320.85s, cleanup confirmed.
Независимая структура `ab-smoke-v5-base-review-20261008` PASS.
Общий cold reader в `ab-smoke-v5-base-cold-20261008`: actual saved destination
verified, fresh export/oracle0, input/package bytes unchanged, settings not
reapplied, native close/logout/remaining0, container removed/exact staged cleanup.
`ab-smoke-v5-base-accepted-20261008/review.json` перепроверяет658 frozen files
и21 adapter pins, общий manifest abeeb0cf…; formalAttempts0.
Candidate v5 запускается следующим по тем же условиям.

## Candidate v5 и парный функциональный smoke: PASS

Run `ab-smoke-v5-20261008/candidate/results/20261008-175606-d1b364a98`:
CLI0/completed, judge100/warm oracle PASS/323.88s, cleanup confirmed.
Независимая структура `ab-smoke-v5-candidate-review-20261008` PASS.
`ab-smoke-v5-candidate-cold-20261008`: общий reader/fresh own server,
actual destination verified/export/oracle0/bytes unchanged/settings not reapplied,
native close/logout/remaining0/container removed/exact staged cleanup PASS.
Historical v4 Writer owner unavailable сохраняется; в новом smoke он не повторился.

`ab-smoke-v5-pair-accepted-20261008/review.json` подтверждает обе полные smoke
стороны по одному common abeeb0cf… и658/21 pins. Actual evalsrefb31ebe7d0…
повторно перечитан перед formal. Это функциональный smoke одной задачи,
formalAttempts0/statisticalNoninferiorityProven=false; не подмена90 попыток.
`ab-smoke-v5-metrics-20261008/review.json`: baseline17/candidate18 provider
turns (dedup verified), unique tools17/19, Loginom13/13, errors0/0, skill0/1.
Дополнительный read workflow учитывается отдельно; allowance/рубрика неизменны.

Формальная baseline серия45 попыток запущена через controller v5; candidate45
идёт после штатного завершения baseline на тех же pins. Judge/structure/cold
каждого сохранённого артефакта и compare остаются открытыми.

Formal baseline run `20261008-180611-d1b364a98`: первая задача
`ab-revenue-per-converter#1` CLI0/completed/judge100/oracle PASS/397.837s,
cleanup confirmed. Reviewer v5 сохранил независимую структуру/warm oracle PASS
в `ab-formal-v5-base-reviews-20261008-ab-revenue-per-converter-1`; cold ещё
не выполнен. Серия продолжается, первая успешная попытка не подменяет45/90.
