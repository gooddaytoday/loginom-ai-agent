# Native headed TUI: живой CSV oracle

2026-09-17, Linux x64/X11. Candidate `0.0.0-dev-202609171831`,
`/tmp/loginom-cli-candidate-20260917-headed/bin/loginom-ai-agent-cli`.
Source tree SHA256:
`098baffe492401950c7a1553f9e156a5241c13d94a9741ac86956e87d1cc17f7` (dirty).
Archive SHA256:
`2fdbe774dc78bdf268fb72a7d5021fc209b7251f8429bbd9fdc573b19dbbc5dd`.

## Результат: PASS для перечисленных случаев

- Реальный native TUI в PTY, `--no-headless`, отдельные profiles/workspaces A/B.
  Attachment `sales.csv` введён через TUI autocomplete и отправлен как исходное
  пользовательское вложение. Loginom/Chromium/MCP настоящие; local scripted
  OpenAI-compatible provider направляет сценарий через реальные model tool calls.
  Это проверка интеграции, не качества рассуждений модели.
- Оба CSV импортированы, сгруппированы, выполнены, сохранены в отдельных удалённых
  пакетах и закрыты. Независимый cold readback подтвердил суммы 55/101;
  settingsReapplied=false, source paths различаются.
- X11 observer подтвердил по одному видимому окну собственного Chromium в каждом
  профиле; после выхода этих окон не осталось.
- Оба TUI exit=0, forced=false, input_submitted=true; оба profile guard сняты.
  Проверка окон не является полной инвентаризацией всех оставшихся OS processes.

Evidence: `/tmp/loginom-linux-oracle-6EjG1G/summary.json`, receipts, cold readback,
`cli/*/exit.json`, `tui-exit.json`, `windows.json`. Log:
`/tmp/loginom-cli-headed-tui-oracle.log`. Credentials не включены в отчёт.

## Ограничения и полные gates

Этот прогон стартовал до исправления fixtures: A=10/20/25, B=100/1, столбец
amount. Новые канонические fixtures требуют B=40/60/1. Исторические bytes и
evidence сохранены; этот результат не подтверждает новый B fixture.
Установленный Desktop не изменялся. Артефакт не содержит более поздний source
controller раннего SIGINT.

| Gate | Полный статус в этом отчёте | Наблюдаемая часть / недостающее |
| --- | --- | --- |
| IND-01 | NOT_RUN | Candidate executable; isolated installed distribution не проверялся |
| IND-02 | NOT_RUN | Нет сравнения Desktop/TUI/run одного snapshot |
| IND-03 | NOT_RUN | TUI cold oracle PASS; нет Desktop comparison и нового B fixture |
| IND-04 | NOT_RUN | Headed TUI/window PASS; live resume не проверен |
| IND-05 | NOT_RUN | Разные source paths и суммы PASS; полная isolation matrix не проверена |
| IND-06 | NOT_RUN | Взаимная независимость CLI/Desktop не проверялась |
| IND-07 | NOT_RUN | Нет busy/alias matrix в этом прогоне |
| IND-08 | NOT_RUN | Help/version здесь не проверялись |
| IND-09 | NOT_RUN | Setup выполнен; pending/recover matrix не проверена |
| IND-10 | NOT_RUN | Штатный выход PASS; crash/network/cancel не проверены |
| IND-11 | NOT_RUN | Attachment SHA проверен; использован явный skip permissions |
| IND-12 | NOT_RUN | PTY exit проверен; полная JSON/error matrix не проверена |
| IND-13 | NOT_RUN | Видимость X11 проверена; полная native/proxy/CA matrix отсутствует |
| IND-14 | NOT_RUN | Install/uninstall и installed Desktop здесь не проверены |
