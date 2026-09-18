# Linux CLI: staging и installer build acceptance

Проверка выполнена 2026-09-17; candidate version `0.1.4-cli.202609180020`, prod.
Версия является идентификатором кандидата, не временем проверки.

- Artifact: `/tmp/loginom-cli-staging-202609180020`.
- Archive: `/tmp/loginom-ai-agent-cli-0.1.4-cli.202609180020-linux-x64.tar.gz`.
- SHA256: `d6ff01d874f47904169a3f0e3447d72c529f8b1e715a412b333e8754668a763a`.
- Commit: `c37913ab5ca8f421b76286bf25c282b83cc2de56`, dirty source snapshot
  `e292b6a0338a08923e152a1272dfbd0c0643a75034b2bb6bcc53ebb4ef3e8082`.
- Build log: `/tmp/loginom-cli-staging-202609180020.log`.

PASS: native build/version smoke, общий resource staging с проверкой пересечения
лексических и canonical путей, bundled Node host и installer, полный manifest,
архивирование и повторная проверка extracted manifest под umask 077.
Source snapshot проверен сборщиком до и после сборки.

PASS: штатный `install.sh` установил payload в
`/home/kiselev/.local/share/loginom-ai-agent-cli/0.1.4-cli.202609180020-prod`
и launcher `/home/kiselev/.local/bin/loginom-ai-agent-cli` (оба отсутствовали до установки).
Установленный launcher выполнил --version и --help с ограниченным PATH
`/tmp/loginom-cli-path-1930`, исключающим Node/Bun/Chrome/Desktop.
Штатный uninstall завершился успешно; отдельная lexists проверка подтвердила
отсутствие launcher, payload и current.json после удаления.

Это проверка нового staging/installer artifact. Live CSV, TUI/run/resume,
Desktop regression и native Windows/macOS на этом кандидате не выполнялись.
Предыдущая live приёмка 19:58 остаётся отдельным историческим доказательством.
Профили до/после этой проверки не сравнивались по hashes; сообщение uninstall
само по себе не считается доказательством побайтового сохранения профилей.
Подпись/release publication и concurrent path replacement не закрыты.
