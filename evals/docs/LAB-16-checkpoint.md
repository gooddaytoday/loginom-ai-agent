# LAB-16 — checkpoint автора

Текущая фаза: author, in_progress. Frozen SHA пока не установлен; полный SHA итогового clean commit будет зафиксирован в READY_FOR_BEN этой же карточки и evidence manifest. До независимого verdict Ben он не меняется.

Runtime lg-pc-75-node-evals (8db60387-896d-4934-8f6c-a77d61eec028), task-local Codex 0.159.2, pinned Node24/proxy и собственные Rich profiles/env. Preflight Loginom/Dock обоих Rich profiles прошёл LOGINOM_CONNECTION_VALID, Playwright MCP доступен; storage доступен, 2.8 TiB. Глобальные configs/wrapper, prod CLI, refresh auth и чужие writer не менялись. OpenViking зарегистрированных инструментов в этой author session не дал; task context восстановлен по карточке/role runtime и разовому bundle. Оператор отдельно подтвердил исправный app-server transport.

Исходная база и CLI sourceCommit: 904f7f85bf5450cbbfd48360d7dd9c483401face, clean dev payload. Разовый bundle SHA256 a10efaa268f83b667117eb40108a60b74e3e83b43429db4906eb7be0f4f128c8, manifest 18/18. Установленный skill не менялся.

Независимый Decimal/csv oracle вычислен до builder. Три reference финализированы: fixed-sum attempt3 (ses_eee1452b0ffegxLk76SMHknm8S), sliding-average attempt2 (ses_eee099319ffeIB0g9ShurnxEOR), reconfigure attempt1 (ses_eee03d9a3ffe6WWAL9WoevzeA7). По БД подтверждён openai/gpt-6.1-sol/xhigh; input bytes, CLI graph/CSV, холодное повторное выполнение через Playwright и finalize gates успешны. Полный code validator принял все три reference. Product-модель из назначенного eval.env — openai/gpt-6-sol/default, записывается отдельно.

В первых reference attempts были F3/full-read failure и неподтверждённая native export download; CLI_PERMISSION_REJECTED относился к read/glob собственного cached runtime, а не к CrossTable настройке. Оператор разрешил только собственные runtime helper sources/skill-cache в приватных profiles, сохранив запрет auth/data/чужих profiles. Новые builder sessions использовали обновлённые permissions. Reference technical hint разрешал полный native sample с sample_complete и точными числами; oracle в hint не передавался. Quality retries продукта запрещены.

Новый code-only runner/validator создан по TDD, общий harness/parseEvents/summary/task-format не изменены. Реальные XML/CSV/ZIP и public tool protocol tests проверяют semantics/graph/input/export/save/sequence, неизвестный ID и cleanup/infra/incomplete приоритет. Полный bun test повторяется после завершения TDD на стабильном коде; typecheck и три live продукта — следующие gates. Секреты/env/profiles/raw diagnostics не коммитятся. Доставка Ben — только frozen SHA, commands и sanitized attachment с manifest/hash.

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
