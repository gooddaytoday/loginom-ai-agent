# LAB-16 — checkpoint автора

Авторская фаза завершена; подготовлена независимая приёмка Ben в этой же карточке. Статус остаётся in_progress до возврата Ben. Полный frozen SHA итогового clean commit фиксируется в READY_FOR_BEN и evidence manifest после ordinary push и remote readback; до verdict Ben он не меняется. Этот checkpoint входит в frozen commit, поэтому не содержит собственного SHA.

Runtime lg-pc-75-node-evals (8db60387-896d-4934-8f6c-a77d61eec028), task-local Codex 0.159.2, pinned Node24/proxy и собственные Rich profiles/env. Preflight Loginom/Dock обоих Rich profiles прошёл LOGINOM_CONNECTION_VALID, Playwright MCP доступен; storage доступен, 2.8 TiB. Глобальные configs/wrapper, prod CLI, refresh auth и чужие writer не менялись. OpenViking зарегистрированных инструментов в этой author session не дал; task context восстановлен по карточке/role runtime и разовому bundle. Оператор отдельно подтвердил исправный app-server transport.

Исходная база и CLI sourceCommit: 904f7f85bf5450cbbfd48360d7dd9c483401face, clean dev payload. Разовый bundle SHA256 a10efaa268f83b667117eb40108a60b74e3e83b43429db4906eb7be0f4f128c8, manifest 18/18. Установленный skill не менялся.

Независимый Decimal/csv oracle вычислен до builder. Три reference финализированы: fixed-sum attempt3 (ses_eee1452b0ffegxLk76SMHknm8S), sliding-average attempt2 (ses_eee099319ffeIB0g9ShurnxEOR), reconfigure attempt1 (ses_eee03d9a3ffe6WWAL9WoevzeA7). По БД подтверждён openai/gpt-6.1-sol/xhigh; input bytes, CLI graph/CSV, холодное повторное выполнение через Playwright и finalize gates успешны. Полный code validator принял все три reference. Product-модель из назначенного eval.env — openai/gpt-6-sol/default, записывается отдельно.

В первых reference attempts были F3/full-read failure и неподтверждённая native export download; CLI_PERMISSION_REJECTED относился к read/glob собственного cached runtime, а не к CrossTable настройке. Оператор разрешил только собственные runtime helper sources/skill-cache в приватных profiles, сохранив запрет auth/data/чужих profiles. Новые builder sessions использовали обновлённые permissions. Reference technical hint разрешал полный native sample с sample_complete и точными числами; oracle в hint не передавался. Quality retries продукта запрещены.

Новый code-only runner/validator создан по TDD, общий harness/parseEvents/summary/task-format не изменены. Реальные XML/CSV/ZIP и public tool protocol tests проверяют semantics/graph/input/export/save/sequence, неизвестный ID и cleanup/infra/incomplete приоритет. На неизменяемом clean коде 6254a7b9c4960c5a2e6357df1513e8a23d18078e: bun test — 344 pass / 0 fail (26 файлов), bun typecheck — exit0; выбранные negative/sensitivity tests — 21 pass / 0 fail. Collection validation — exit0, agent_inputs_hash 409cd8a70e331a8d07e5a4801da51c516f840cec74877c6207dfa79360f277bd, rubric_hash 4f381937751416ace6fb7d724461b39c839039c208e84bb87e0a798b78072db7. После этих проверок изменены только документы checkpoint/plan, исполняемый код и кейсы сохраняются.

## Авторские live измерения

По одной product attempt каждого кейса, без судьи, калибровки и quality retry. Фактические provider/model/variant всех трёх assistant sessions подтверждены по собственной БД CLI: openai/gpt-6-sol/default. CLI binary SHA256 00551b683e466d73c6b9cff45b05b375e05d8ef73dee81a084d012f35bfe26d1, clean source 904f7f85bf5450cbbfd48360d7dd9c483401face.

- fixed-sum: run 20261006-162846-3b9c47279, session ses_eedf3caeaffefmXde3pG9Euon4, completed/CLI exit0; итоговый авторский code-verdict ERROR/2 из-за cleanup `Cannot inspect process identity PID 2581348`. Исходные summary/code-verdict/cleanup сохранены побайтно. Отдельная проверка артефакта итоговым валидатором PASS не заменяет ERROR live.
- reconfigure: run 20261006-165449-6254a7b9c, session ses_eeddbf86affeU6bUR6Nru7Q8H6, no_artifact, product FAIL/1. Dock остановился на чтении sum (`F3 is restricted to an observed graph table output`), модель не сохранила LGP. Все штатные cleanup stages и process cleanup confirmed.
- sliding-average: тот же второй run, session ses_eedd8c8cfffe9Jajx401Hfi5Er, completed, все required checks PASS/0, штатный cleanup confirmed.

Второй run выполнен только с --only crosstable-sliding-average,crosstable-reconfigure после полного завершения unit и fixture cleanup. Общий code-verdict второго run FAIL/1, errors=[], stopped_reason=null, storage_leftovers=[]. Generic harness exit0/null pass/score/oracle_pass не использован как кодовый PASS. Авторский ERROR первого run остаётся ограничением измерения; Ben должен выполнить три собственных свежих live после frozen SHA.

Первый live и предыдущий full unit ошибочно выполнялись параллельно. PID 2581348 не входил в owned ledger; две штатные verification дали owned_remaining=0, последующая read-only проверка подтвердила отсутствие всех 29 owned PID и writer. Вероятная причина — конфликт /proc snapshot с process-supervisor fake Chromium fixtures. Harness/cleanup не ослаблялись. Оператор после проверки birth identities/пустой группы/отсутствия writer архивировал старый process-group marker PID 2578214. Перед новой dispatch также обнаружен старый harness lease PID 2576964: он подтверждён parent исходного owned launcher, все связанные процессы отсутствовали, writer/process-group marker отсутствовали; неизменённый собственный lease атомарно архивирован в приватную резервную копию. Отказ lease был до dispatch, дополнительной модельной попытки не было. Auth/data/profiles и чужие writer не менялись.

## Доставка и следующий этап

Секреты/env/profiles/raw diagnostic archives не коммитятся и не входят в delivery. Ben получает attachment с reference events/XML/CSV, CLI/cold checks, model confirmations, тремя product attempts, неизменённым исходным ERROR и manifest SHA256. Внешний SHA256 архива указан в READY_FOR_BEN. Команды и порядок приёмки — docs/node-evals.md. Сначала Ben сохраняет собственный расчёт до author oracle/results, затем проверяет frozen SHA, reference/negative/unit/typecheck и три fresh live в отдельном профиле; unit и live строго последовательно. Product FAIL допустим при ACCEPT качества eval; финальная независимая приёмка ещё не выполнена. После VERDICT_BEN ACCEPT Rich оформляет wrap-up и in_review, done остаётся человеку.

## Исторический BLOCKED preflight

Следующий текст относится к предыдущему запуску, восстановленные блокеры не считаются текущими:

LAB-16 — Rich, runtime preflight 2026-10-06, trigger 01a111d2-ca6b-7450-80a0-15a520fa287e.

Состояние: BLOCKED; frozen SHA = NOT_SET.
Собственный чистый checkout до checkpoint: 904f7f85bf5450cbbfd48360d7dd9c483401face; origin/evals совпадает.
Прочитаны все три актуальных thread, runtime Rich, AGENTS.md, evals/AGENTS.md, overrides и разовый skill.
Архив скачан штатным multica attachment download; SHA256 a10efaa268f83b667117eb40108a60b74e3e83b43429db4906eb7be0f4f128c8; 18/18 manifest проверены.
Bun, Python, Docker, zip/unzip/xmllint и назначенный CLI доступны.
loginom-server-7.4.2-test запущен; /workdir/UserStorage/user существует и доступен на запись; свободно 2.8 TiB.
Оба назначенных CLI профиля Rich: loginom status = recoverable-error, localhost/app/, revision=1, generation=1.
Оба назначенных CLI профиля Rich: loginom check exit=1, {"ok":false,"code":"LOGINOM_KNOWLEDGE_UNAVAILABLE"}.
Команды проверки: LOGINOM_AI_AGENT_CLI_PROFILE=<назначенный reference-profile либо eval-profile> <назначенный CLI> loginom status/check --format json.
Причина недоступности knowledge не установлена; успешный операторский smoke не заменяет текущий preflight.
Playwright MCP указан и enabled в task config; инструментов playwright/loginom-dock нет в текущем callable registry.
Назначенный npx @playwright/mcp@0.0.82 --help exit=0; браузерное подключение и холодное выполнение не подтверждены.
Модель продукта из назначенного eval.env: openai/gpt-6-sol/default; builder: openai/gpt-6.1-sol/xhigh.
Новый model smoke, oracle/reference, unit/typecheck/negative/live не запускались; кейсов нет, продуктового вердикта нет.
Recover/import_codex_auth, изменение глобальных конфигов, commit/push и handoff Ben не выполнялись.
Следующий шаг: восстановить knowledge-доступ обоих профилей в caller task env и доступный браузерный MCP; повторить preflight и author phase.
