# Отдельная задача: совместимость harness с локальными product skills

Статус на 2026-10-08: пользователь назначил основную сессию package-docs
владельцем этой отдельной задачи совместимости harness. Собственный worktree:
`/home/kiselev/.codex/worktrees/skills-harness/loginom-ai-agent`, ветка
`skills-harness`, исходный SHA `db8c1b93e83121c77d6a80b1e337701b00ff2779`.
Это задача из этапа 7 замороженного плана, его требования не пересматриваются.
Корпус near-miss, задачи/эталоны, judge prompt/schema и код судьи остаются вне
изменений. Чужой worktree, ветка, незавершённые изменения и ресурсы не меняются.

Совместимость реализована отдельными TDD-циклами на чистом code SHA
`9d7b463c48e4bfb0d55e87fd108400617afa9da3`; пакетный typecheck прошёл,
финальный полный `bun test`: 460 PASS, 2 SKIP, 0 FAIL, 2017 assertions,
без изменения worktree во время проверки. Судья/корпус/изоляция сохранены;
[результаты и сохранённые неуспехи](reports/2026-10-08-package-docs-harness.md).
Для будущей пары создан отдельный неизменяемый worktree `skills-evals`
на этом полном SHA. До первого live smoke закрепить 12–15 задач; финальная
пара содержит 72–90 попыток, судью, структуру и cold replay. Полный набор
35 задач и этап 9 отложены вне текущей цели; серверный skill сохраняется.
Health сохранён, Skills API исключён из preflight; фактические applied
grant/source/revision и build failure сохраняются в run/result/summary.
Lazy infra требует prepare error из ограниченного allowlist и независимо
измеренного HTTP 5xx/transport failure; сохраняется один штатный infra retry.
Локальный аддитивный контракт — `evals/docs/2026-10-08-product-skills-compatibility.md`
в указанном worktree. Исторические read-only сверки ниже сохраняют исходные даты.

`https://mcp.loginom.ai/health` отвечает 200, `/mcp` без авторизации — 401;
Первоначально это была только проверка доступности. Последующие три CLI669
`docs-attached-pdf` на OpenAI6.1-sol/medium подтвердили authenticated key-only
Help ready и настоящие find/read при недоступном web login, без Chromium.
Документный gate ещё не принят: в третьем PDF обнаружен orphaned module heading.
Изолированная A/B пара
ещё не запускалась: к удалённому стенду `user@10.200.13.152` пока нет SSH-доступа,
исходные локальные сервер/client не переключались. Запрошен профиль доступа
к выделенному стенду; это ожидание не останавливает локальную проверку harness.

## Проверенная исходная версия

На 2026-10-07 `evals` указывает на
`904f7f85bf5450cbbfd48360d7dd9c483401face`; калибровочная ветка — на
`64d6340870671306ad51989c42d92e8181b912a8`. Содержимое `evals/` на этих SHA
совпадает (git diff пуст). Последний отчёт владельца: 323 теста, typecheck,
XML validation прошли; живой judge после XML guard повторно не запускался.
Эти SHA — проверенная база предложения, не автоматический pin будущей A/B пары.

Повторная read-only проверка после возобновления 2026-10-07: `evals` находится
на `dfe47cce65c9186aaae8e7d4e0d8de68e09972bb`. Принята изоляция установленного
CLI через bubblewrap и перенос 35 задач в `evals/tasks/analytic`; отчёт
`evals/docs/2026-10-07-analytic-evals-isolation-plan.md` на этом SHA фиксирует
386 PASS, сохранённые hashes калибровки и один live smoke baseline
`fc3d97dbf` на `openai/gpt-6-sol/default` (score/oracle PASS).
Это не A/B и не приёмка нашей основной модели `openai/gpt-6.1-sol/medium`.
Исходный Loginom восстановлен; harness требует отдельного подготовленного
изолированного стенда и отсутствия внешних debugger endpoints. Переключение
общего исходного сервера этой задачей не выполнялось.

В проверенном `dfe47cce6` безусловный `dockSkillRevision` и разбор legacy
`skillRevision` сохранены. Предложенные ниже изменения совместимости по-прежнему
не реализованы. Новые isolation guards сохранять; запускать A/B только на
свежем принятом SHA после отдельного согласования владения изменениями harness.

Наблюдаемые несовместимости:

- `evals/src/preflight.ts` безусловно вызывает `dockSkillRevision`, включая
  Skills API. Локальный product skill кандидата этого сервиса не требует.
- `evals/src/cli.ts` читает только legacy `skillRevision` из prepare; источник,
  revision нового prepare и applied activation не сохраняются.
- `evals/src/report.ts:statusFor` относит connection failure к infra только
  при отсутствии session/model tokens/tool calls. Отложенный prepare происходит
  после model turn, поэтому текущий критерий не покрывает новый порядок.
- `run.json`/attempt result не различают отсутствие выбора automation и
  отсутствие построенного пакета после успешного выбора.

## Границы и результат задачи

После назначения владельца выполнить изменения отдельными TDD-циклами в
собственном worktree направления evals. Не изменять исходный checkout,
незавершённые изменения соседней сессии, near-miss корпус и промпт judge.
Согласовать точный набор файлов до редактирования; ожидаемый набор:
`evals/src/{preflight,cli,report,run}.ts` и их tests/fixtures.

1. Сохранить проверку Dock `/health`; убрать обязательную серверную revision
   как условие допуска. Revision/source читать из фактического prepare.
   Сохранённый baseline с legacy prepare и remote source остаётся поддержан.
   Отсутствие у него нового skill call не считать ошибкой инфраструктуры.
2. Из публичных CLI events сохранить backend-applied automation activation
   (имя/profile/digest) и наблюдаемые source/revision prepare. Не приписывать
   pending/error skill call успешную активацию; объединять повторные события
   одного tool part. Поля для baseline могут быть отсутствующими.
3. Различать «automation не выбран» и «automation выбран, пакет не построен»
   в результатах попытки. Обе причины остаются неуспехом построения; наличие
   текста об успехе или exit0 не заменяет `.lgp`/oracle.
4. Согласовать ограниченный набор connection errors и доказательства внешней
   причины для lazy infra после model turn. Одного отсутствия успешного
   Loginom call или общего error code недостаточно. Scope, integrity, config
   и runtime defects продукта не переводить в infra. Сохранить один штатный
   infra retry и `infra_retry.initial`, без дополнительных выборочных повторов.

## Проверки до принятия SHA

- Preflight с доступным `/health` и отсутствующей серверной skill записью;
  недоступный health; binary/source modes без ослабления остальных проверок.
- Разбор actual baseline prepare, нового prepare/activation, pending/error
  activation и дублированных tool events; сохранение полей в run/attempt/summary.
- Отдельные результаты no-selection/no-artifact; успешный baseline без новой
  активации; отсутствие регрессии existing artifact/compare/oracle контрактов.
- Lazy подтверждённый внешний connection failure после model turn и
  отрицательные случаи scope/integrity/config/runtime; один infra retry.
- Полный `bun test` и `bun typecheck` из `evals`; hashes judge prompt/schema
  и кода его формирования. Если они изменились, до A/B требуется подтверждение
  калибровки новой версии. Изменять judge в рамках этой задачи не предполагается.

После принятия зафиксировать полный SHA и создать отдельный неизменяемый
worktree для пары. Baseline и candidate запускать одним harness/судьёй на
одном snapshot, с отдельными EVAL_RESULTS_DIR/EVAL_PROFILE_DIR/
EVAL_WORKSPACE_ROOT и абсолютными EVAL_CLI_BIN при EVAL_CLI_MODE=binary.
Структурную сверку и повторное выполнение пакетов вести в адаптерах нашего
направления, отдельно от общего harness. Продуктовые тесты и Linux приёмка
продолжаются независимо от согласования этой задачи.

## Свежая read-only сверка 2026-10-07

Перед разработкой адаптеров `refs/heads/evals` повторно прочитан: текущий SHA
`222649f8eca91f3aae381bd43ebeac18a2c506d8`. Он отличается от предыдущих
проверенных `404886f1e` и `24ec36d0f`; поэтому автоматический pin старого SHA
недопустим. В checkpoint владельца удалённый frozen harness закреплён на
`63a19e902786b1528edaab5878bb079842cad97b`;386 tests/typecheck, cold refs3/3 и
cleanup приняты,35-case baseline не запускался. Эти проверки и четыре live
smoke на `gpt-6-sol/default` не заменяют нашу пару6.1-sol/medium. Безусловный
`dockSkillRevision` в текущем preflight сохранён. Общие файлы harness/judge и
near-miss этим направлением не менялись; отдельная задача совместимости
по-прежнему требует назначения владельца. Перед парой заново сверить SHA,
стенд и отсутствие debugger endpoints, сохранить все hashes условий.

## Повторная read-only сверка после candidate669

На 2026-10-07 `evals` всё ещё указывает на
`cd592244485cb892a0c1f13fd7b60dcbbf7f32ca`. В этой версии preflight безусловно
читает `dockSkillRevision`, а parser сохраняет legacy `skillRevision`; новая
совместимость не реализована. Отчёт isolation фиксирует386 PASS/35 tasks/
113 mutations/280 одинаковых файлов и прежний gpt-6-sol/default smoke;
это не наша gpt-6.1-sol/medium пара. Эти данные получены через `git show`,
чужое рабочее дерево не использовалось для исполнения или редактирования.
Назначение владельца отдельной задачи ещё требуется; принятый SHA и чистый
изолированный стенд перед A/B нужно сверить заново. Candidate669 и cold SUM
проверены собственной инфраструктурой без изменений harness/near-miss/judge.

## Повторная сверка после установленной локальной приёмки

2026-10-07T20:05Z: `refs/heads/evals` по-прежнему
`cd592244485cb892a0c1f13fd7b60dcbbf7f32ca`. Preflight44/158 безусловно
читает Dock Skills API, CLI parser50/61 сохраняет legacy skillRevision;
предлагаемая совместимость не реализована. Калибровочная сессия завершена
со323 tests/typecheck/XML guard; её последний turn не запускал live judge.
Эти read-only сведения не назначают владельца общих файлов и не закрепляют
SHA финальной пары. Help health: proxy TLS EOF/exit35, direct refused/exit7.
Локальная Desktop/CLI/TUI приёмка продукта завершена для отдельных доказанных
случаев; живые gates ждут доступного Help и отдельно принятой совместимости
harness/изолированного стенда. Чужие файлы, процессы и серверы не менялись.
