# EvalRunner на evalrun

Текущий допуск LAB-76 — **BLOCKED**: node smoke завершился recovery/ambiguous native export, без RELEASED. Оператор восстановил профиль/storage, но исходный результат не изменял. Global stand.lease и оба admission сохранены; новых продуктовых запусков не делать. Проверенный code7abcba2717 (финальный docs-only pin см. runtime.json) ограничивает writer acquisition новым каталогом после собственного подтверждённого запуска CLI; измерения выполнены на708c72ebce. Ниже сохранён исторический контракт двух уже выполненных smoke, повторять команды запрещено. Следующий допуск требует исправления продукта и отдельного операторского решения.

R=`/home/kartai/.local/share/loginom-evals-runtime`, host=`10.200.9.134`, user=`kartai`.
Приёмка: LAB-76 (`01a13f4c-c8c5-7916-9c86-9cb302d38987`).
План и результаты: [план](2026-10-15-evalrun-plan.md), [checkpoint](2026-10-15-evalrun-checkpoint.md).

## Пути и закрепления

Собственный checkout: `R/checkouts/evalrunner`; команды ниже выполняются из его `evals/`.
Конфигурация: `R/roles/evalrunner/runtime.json` (0600), приватное окружение: `eval.env.json` рядом.
`runtime.json` закрепляет чистый SHA harness, все пути, SHA256 binary/CLI manifest, container ID/image и readinessIssue.
CLI: `R/cli/v0.2.0/bin/loginom-ai-agent-cli`, официальный source `0c975a73676d9aba556085dbda97e1a9ceb23cc6`.
Release tar SHA256 `82e99934dd6dc56e5b549207c9f70e12fc207af081d56f825b6b1edced3fd42f`.
Продукт: `openai/gpt-6.1-sol/medium`; судья: standalone Codex 0.159.3, `gpt-6-sol/xhigh`.
Управляющий EvalRunner: `gpt-6.1-sol/xhigh`, concurrency=1.
Рабочий профиль `R/roles/evalrunner/eval-profile`, закрытая история — sibling `eval-profile.history`.
Workspace `agent-work`, результаты `results`, judge home `judge-home` находятся рядом и не пересекаются.
Секреты не публиковать. Не изменять auth/config прежних Codex/Cursor и generated task homes.

## Допуск

Перейти в собственный checkout; выполнить реальные OpenViking health и actor find. Автоматический Git Peer: `github.com-gooddaytoday-loginom-ai-agent`, глобальный Peer запрещён.
Вызвать `R/bin/bun script/run-evalrunner.ts prepare --config R/roles/evalrunner/runtime.json`.
Он проверяет чистый checkout, полный payload CLI (байты, ссылки, права), окружение, конкретный запущенный контейнер без mounts.
Native Loginom check и sandbox предварительно квалифицированы оператором; это не оценка качества продукта.
Внутри bwrap доступны только ресурсы CLI, inputs, writable профиль и workspace. Корпус, oracle, Git, история и Docker socket скрыты.

## Измерение

Карточка должна задавать конкретные case/collection/series/CLI/model/judge/timeout и разрешённый объём.
Исторический контракт LAB-76 разрешал ровно две команды последовательно, по одной попытке каждой. Обе попытки уже выполнены; команды ниже не запускать:

```sh
R=/home/kartai/.local/share/loginom-evals-runtime
cd "$R/checkouts/evalrunner/evals"
"$R/bin/bun" script/run-evalrunner.ts smoke --config "$R/roles/evalrunner/runtime.json" \
  --case calc-data-double --series "$R/roles/evalrunner/results/lab76-calc" \
  --issue 01a13f4c-c8c5-7916-9c86-9cb302d38987 --task "$MULTICA_TASK_ID"
"$R/bin/bun" script/run-evalrunner.ts smoke --config "$R/roles/evalrunner/runtime.json" \
  --case crosstable-fixed-sum --collection node --series "$R/roles/evalrunner/results/lab76-node" \
  --issue 01a13f4c-c8c5-7916-9c86-9cb302d38987 --task "$MULTICA_TASK_ID"
```

Вызовы pin repeat=1, infraRetries=0, product timeout 30m, judge timeout 5m, threshold70 и management timeout10m.
Строгий recovery, PURE и отключение внешних/Claude skills обязательны. Не устанавливать сборки, не менять harness/кейсы/судью, не повторять измеренный FAIL ради качества.
Admission сохраняется неизменно по issue+case; новый каталог не разрешает повтор. Каталог `R/operations/stand.lease` означает BUSY/BLOCKED; мёртвый PID не разрешает удаление.
Infra/UNKNOWN/judge error/неподтверждённый cleanup останавливают работу. Сохранить evidence и checkpoint; recovery — отдельная операторская операция с доказательствами.
Product FAIL/timeout/no_artifact допустим как измеренный исход только при подтверждённых cleanup/history/release. Полный корпус требует отдельной карточки и плана; baseline registry здесь не используется.

## Проверка и доставка

```sh
"$R/bin/bun" script/run-evalrunner.ts check --series "$SERIES"
python3 script/evalrunner-archive.py create "$SERIES" "$OUT/archive.tar.gz"
python3 script/evalrunner-archive.py verify "$OUT/archive.tar.gz" "$SHA256"
multica attachment upload "$OUT/archive.tar.gz"
multica attachment download "$ATTACHMENT_ID" -o "$OUT/download"
python3 script/evalrunner-archive.py verify "$DOWNLOADED_ARCHIVE" "$SHA256"
```

`check` проверяет сохранённые хэши всех файлов серии. Archive включает только release/pins, summary/report/code-verdict и .lgp/.csv артефакты; auth/env/history/raw tool logs остаются закрытыми.
Сохранить delivery receipt отдельно от запечатанной серии. Фактическую модель/reasoning проверять по exact Session в копии закрытой SQLite, с хэшами источника до/после чтения.
После полной доставки — in_review. Разделять product outcome, node code, judge score, инфраструктуру. Новая модель судьи ещё не калибрована; историческое сравнение INCOMPARABLE.

## Службы и обслуживание

`loginom-evalrun-stand.service` запускает только два собственных контейнера `loginom-evals-server`/`loginom-evals-studio`; без bind mounts, Studio127.0.0.1:80.
`loginom-evalrun-multica.service` использует существующий daemon ID, concurrency1, отключённые auto-update/reload и старые provider paths.
Docker29.1.3, Bun1.3.14, Node24.19.0, bwrap0.9.0. AppArmor допускает userns только точным путям bwrap/поставленного Chrome; глобальная restriction сохранена.
Сеть использует существующий proxy127.0.0.1:2080 через xray/sing-box, Node env proxy включён. Для управляющего Multica CLI/daemon задан GODEBUG=tlsmlkem=0 после подтверждённых ошибок TLS handshake. Private runtime.env0600 — окружение службы, не продукта.
Перезапуск/обновление только при пустых очередях, свободном stand и подтверждённом cleanup. Перед reboot сохранить checkpoint; после проверить enabled/active служб, оба runtime online с прежними IDs, container IDs, HTTP /app/ и отсутствие самозапущенных задач.
Старые артефакты удалять адресно после проверки очередей, процессов/FD и Git; общий prune не применять.

MCP OpenViking в агенте: request timeout60s, tool timeout120s/startup60s, после реального15s actorfind timeout. Health/auth/systemstatus/ready проверены установленным doctor; exact actorfind и новая агентская сессия подтверждены. Старый BLOCKED receipt сохранён отдельно.
