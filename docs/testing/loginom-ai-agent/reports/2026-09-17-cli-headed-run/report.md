# Native headed run: живой oracle A/B

Дата: 2026-09-17. PASS для Linux X11, CLI `run --no-headless`.

Candidate `/tmp/loginom-cli-candidate-20260917-headed`, version
`0.0.0-dev-202609171831`, sourceDirty=true, source commit
`c37913ab5ca8f421b76286bf25c282b83cc2de56`, sourceTreeSha256
`098baffe492401950c7a1553f9e156a5241c13d94a9741ac86956e87d1cc17f7`.
Archive SHA256 `2fdbe774dc78bdf268fb72a7d5021fc209b7251f8429bbd9fdc573b19dbbc5dd`.
Build проверил manifest извлечённого архива. После сборки исправлен stdin EOF
тестового adapter; это изменение acceptance source не входит в snapshot artifact.

Manual `runtime-acceptance.ts` с `LOGINOM_AI_AGENT_TEST_CLI_HEADED=1` использовал
scripted provider и настоящий native CLI/backend/host/runtime/Chromium с живым
Loginom. В каждом отдельном профиле исходное пользовательское sales.csv прошло
private admission с проверкой SHA256, импорт, группировку, сохранение и закрытие.

| Проверка | A | B |
| --- | --- | --- |
| Числа amount | 10, 20, 25 | 100, 1 |
| Cold readback | PASS, total=55 | PASS, total=101 |
| settingsReapplied | false | false |
| Видимое окно собственного Chromium | да | да |
| Оставшиеся окна после CLI exit | нет | нет |
| CLI exit / guard | 0 / false | 0 / false |

Observer связывал X11 Map State=IsViewable с PID браузера из каталога конкретного
профиля; чужие окна не изменялись. В каждом запуске наблюдалось 20 browser
processes (readiness и chat). Source paths CSV различаются. Независимый reader
выполнялся после выхода CLI; удалённые пакеты с уникальными именами сохранены.
Evidence `/tmp/loginom-linux-oracle-BFpxrd/summary.json`, 32 tool receipts,
`cli/*/windows.json`, `cli/*/exit.json`, `cold-*/result.json`.

На том же candidate отдельно прошли native PTY invalid Session ID (exit 2,
guard=false, alive=[], `/tmp/loginom-cli-tui-vfwv5ijv`) и TUI attachment
(exit 0, snapshot/admission/history PASS, `/tmp/loginom-cli-tui-i541x7rq`).
Проверка SQLite подтвердила равенство synthetic model text исходному CSV snapshot.
Эти PTY-проверки использовали fixture runtime/provider.

Первый headed attempt `/tmp/loginom-linux-oracle-2JX12e` не выполнял tools:
тестовый adapter оставил stdin открытым, и run ждал EOF. Adapter исправлен.
Тестовый CLI остановлен SIGINT, exit=130, guard=true; после остановки связанных
CLI/browser processes не осталось. Нельзя считать это успешной проверкой ранней
отмены: освобождение guard после подтверждённого cleanup при ожидании stdin
остаётся открытым требованием. Mutating операции этого attempt не повторялись,
поскольку до него не дошёл ни один tool call.

Полные gates Desktop/TUI/run одного source build, headed TUI, живой resume,
crash/network recovery и Windows/macOS этим отчётом не закрыты. Установленный
Desktop не изменялся; candidate не опубликован. Permission bypass задан явно,
scripted provider не является проверкой качества reasoning production-модели.
