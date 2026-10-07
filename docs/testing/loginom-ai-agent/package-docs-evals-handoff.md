# Отдельная задача: совместимость harness с локальными product skills

Статус: подготовлена для согласования владения; реализация не начата.
Это задача из этапа 7 замороженного плана package-docs isolation, не изменение
его требований. Владельцем общего harness, near-miss и judge остаётся сессия
`01a10fce-57bf-7093-bd1d-f2bae8c99772`.

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
