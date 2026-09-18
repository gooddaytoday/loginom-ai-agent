# Native CLI: SIGKILL владельца после prepare

Linux x64, headless, candidate `0.1.4-cli.202609180020` из
`/tmp/loginom-cli-staging-202609180020`. Build provenance и archive hash:
[отчёт сборки](../2026-09-17-cli-staging-build/report.md).

Драйвер `packages/loginom-host/script/cli-owner-crash.ts` настроил новый приватный
CLI profile, запустил настоящий native run со scripted provider, выполнил
`dock_prepare` с open_package и проверил receipt с точным путём существующего
пакета A. Затем SIGKILL отправлен только принадлежащему тесту CLI.

Evidence: `/tmp/loginom-cli-owner-crash-sr1faG`, log
`/tmp/loginom-cli-owner-crash.log`.

- PASS: CLI exit 137, отслеживалось 24 процесса дерева владельца.
- PASS: после остановки не осталось живых отслеживаемых процессов (`alive=[]`;
  zombie не считается живым исполняющим процессом).
- PASS: `.writer` сохранён. Новый `loginom status --format json` завершился
  с кодом 3 и PROFILE_BUSY; автоматического повторного захвата не произошло.
- Секрет отсутствует в сохранённых stdout/stderr и ответе повторного запуска.
- Профиль/guard сохранены без ручного вмешательства для диагностики.

Это частичный IND-10: потеря владельца после завершённого prepare при ожидании
следующего provider ответа. Никакая внешняя мутация не была оставлена в полёте.
Проверка не доказывает recovery после неопределённого dispatch, потери сети или
отдельного crash host/runtime/browser. Host typecheck и diff check PASS.

## Штатная отмена в той же точке

Тот же native candidate и driver с дополнительным аргументом `SIGINT`;
отдельный свежий profile. Evidence `/tmp/loginom-cli-owner-crash-CMtrsH`,
log `/tmp/loginom-cli-owner-interrupt.log`.

PASS: после успешного open_package prepare и во время ожидания provider ответа
CLI получил SIGINT, завершился кодом 130; 24 отслеживаемых процесса завершились,
alive=[]. Guard снят; следующий `loginom status --format json` завершился кодом 0,
PROFILE_BUSY отсутствует. Секрет не найден в проверенных выводах.
Host typecheck и diff check PASS.

Это подтверждение штатной отмены при ожидании модели после завершённого prepare;
внешняя мутация в полёте, TUI Ctrl+C и разрыв сети этим запуском не проверялись.
