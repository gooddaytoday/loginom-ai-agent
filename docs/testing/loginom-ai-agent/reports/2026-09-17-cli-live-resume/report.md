# Native Linux: продолжение сессии CLI

Проверен неизменённый CLI `0.1.4-cli.202609171958` из `/tmp/loginom-cli-folder-202609171958`.
Артефакт и исходный snapshot описаны в [отчёте сборки](../2026-09-17-native-folder-fix/report.md).
Новый acceptance driver не входит в этот ранее собранный payload.

## Результат

PASS: исходная headless run сессия A из `/tmp/loginom-linux-oracle-JyyOe1`
продолжена через headed TUI `--session`, затем headless `run --continue`.
Доказательства: `/tmp/loginom-live-resume-jAOvyh`.

- Во всех запусках один Session ID `ses_f4f0c557bffe9l3dnligk29RVt`.
- Каждый resume добавил ровно одно user message и два новых completed tool parts:
  `loginom_dock_prepare` и `loginom_dock_workspace_observe`.
- Prepare открыл ранее сохранённый пакет A: проверен точный `workspace.package_ref.path`.
  Последующее наблюдение подтвердило authenticated workspace и ту же вкладку.
- TUI: exit=0, guarded=false, forced=false, input_submitted=true;
  одно собственное mapped X11 окно, remaining=[] после выхода.
- Run: exit=0, guarded=false; Chromium наблюдался, visible=[], remaining=[].
- Restricted PATH исключал системные Node/Bun/Chromium/Desktop; использован native CLI payload.

## Изменения и проверки драйвера

Добавлен `packages/loginom-host/script/resume-oracle.ts`; CLI transport умеет
использовать существующие profile/workspace без setup и повторного вложения CSV.
PTY driver ждёт загруженную историю перед вводом resume prompt.
Scripted provider выдаёт уникальные tool-call IDs на каждый invocation, чтобы
старые tool responses из восстановленной истории не завершали новый запрос.

Package-local provider tests: 2 PASS, 10 assertions. Host `bun typecheck`: PASS.
Python AST parse и `git diff --check`: PASS.

## Неудачные попытки и границы

`/tmp/loginom-live-resume-8SdfHU`: ошибочное ожидание подсказки в driver;
input_submitted=false. Остановлен SIGINT непосредственно CLI, exit=0,
guarded=false, forced=false. Resume не засчитан.
`/tmp/loginom-live-resume-45cpP0`: новые tools выполнены, но driver проверял
несуществующее поле package_identity в roots response. Исправлена проверка
согласно фактическому контракту prepare; exit=0, guarded=false, remaining=[].
Обе попытки сохранены как диагностические evidence; итоговая последовательность
повторена полностью с исправленным driver.

Provider scripted: это функциональная приёмка продолжения истории и новых
реальных Loginom calls, не оценка production model reasoning. Пакет в resume
не изменялся и не сохранялся. Полная комбинационная mode/resume/recovery matrix,
Windows/macOS и installed Desktop release gates остаются открытыми.

## Обратная комбинация на новом кандидате

CLI `0.1.4-cli.202609180020` из `/tmp/loginom-cli-staging-202609180020`:
тот же существующий Session ID продолжен через headless TUI `--session`, затем
headed `run --continue`. Driver поддерживает дополнительный `--inverse`;
неизвестный аргумент отклоняется до запуска. Evidence `/tmp/loginom-live-resume-nPuhW5`,
log `/tmp/loginom-cli-resume-inverse.log`.

PASS для обоих: один прежний Session ID, ровно одно новое user message и два
новых completed Loginom tools на запуск; открыт прежний saved package A.
TUI exit=0, guarded=false, forced=false, input_submitted=true; Chromium наблюдался,
visible=[], remaining=[]. Run exit=0, guarded=false; одно mapped окно Chromium,
remaining=[] после завершения. Host typecheck и diff check PASS.

Это также подтверждает продолжение профиля предыдущего кандидата новым binary
в пределах совместимой схемы; общей гарантии миграции версий не заявляет.
Противоположная комбинация на 19:58 остаётся отдельным результатом. Полная
матрица browser modes/resume на одном release artifact ещё не объявляется PASS;
provider scripted, исходный пакет при resume не изменялся.

## Обе комбинации на candidate 0.1.4-cli.202609180020

Дополнительный прогон `/tmp/loginom-live-resume-CUx0yK` (log
`/tmp/loginom-cli-resume-current.log`) проверил headed TUI --session и headless
run --continue тем же новым binary. Оба PASS: прежний Session ID, по одному
новому user message и два новых completed tools, тот же saved package A,
exit=0/guard=false. TUI: одно mapped окно, remaining=[]; run: visible=[],
remaining=[]. В обоих процесс Chromium наблюдался.

Вместе с `/tmp/loginom-live-resume-nPuhW5` это закрывает Linux resume browser-mode
проверку для TUI и run на одном candidate artifact: оба интерфейса проверены
headed/headless, режим текущего invocation применяется к продолженной сессии.
IND-04 PASS в этом Linux функциональном объёме. Native Windows/macOS, release
packaging и внешние mutation/recovery сценарии остаются отдельными gates.
