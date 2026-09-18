# Нативная приёмка исправления folder navigation

Linux x64/X11, версия `0.1.4-cli.202609171958`, channel prod.
CLI и Desktop собраны из одного dirty snapshot:
`d3a636f78ca43f38c0ceda330c4af34836622de398a668b33bae501e94a54f3d`,
commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`.
После Desktop build tree hash повторно совпал с CLI manifest.

## Артефакты

- CLI `/tmp/loginom-cli-folder-202609171958`; archive
  `/tmp/loginom-ai-agent-cli-0.1.4-cli.202609171958-linux-x64.tar.gz`, SHA256
  `c2fa343095512d46803f82ec04baa1352e77374c41f442d71d35dd9cb26c56ef`.
  Native version smoke и полный archive manifest/extraction check PASS.
- Desktop `/tmp/loginom-desktop-folder-202609171958/linux-unpacked`;
  ASAR SHA256 `fd08ec880a970d76baa065e43618f719cded2ce1d3e0cc6fb3b7f85983e36f3f`.
  Resource manifest SHA256
  `b11e232ce966fadaa58aac13e6f7178d1e88d88944525aa1f689eca533024c47`;
  4365 resource hashes/ELF checks PASS.
- Исправленный artifact-delivery.mjs входит в CLI payload с SHA256
  `35aff53d345de3b29eb7f8212f66342a129afdae63dfcb4c24fdcb3f594e7c80`,
  совпадающим с проверенным source module. Это уже не source-only запуск.

Build logs: `/tmp/loginom-cli-folder-build.log`,
`/tmp/loginom-desktop-folder-build.log`, `/tmp/loginom-desktop-folder-package.log`.

## Функциональный oracle: PASS во всех трёх интерфейсах

Одинаковые канонические CSV A=10/20/25 и B=40/60/1, prompt, model configuration,
connection и runtime pins. Общий scripted provider направляет реальные model
tool calls; фактические Loginom/Chromium, import/group/save/close и независимое
cold readback настоящие. Model reasoning/inference этим harness не проверяется.
Все permissions заданы явно тестом. Desktop attachment отправлен через его
backend API; TUI — через реальный PTY и file autocomplete; run — через --file.

| Интерфейс | Evidence root | Результат |
| --- | --- | --- |
| Native headless run | `/tmp/loginom-linux-oracle-JyyOe1` | 34 receipts, cold totals 55/101, оба exit=0/guard=false |
| Native headed TUI | `/tmp/loginom-linux-oracle-DcYBqy` | 32 receipts, cold totals 55/101, exit=0/guard=false/forced=false |
| Packaged Desktop | `/tmp/loginom-linux-oracle-S977oJ` | 32 receipts, cold totals 55/101, оба exit=0 |

Во всех summary inputSha256 совпал с fixtures, settingsReapplied=false;
между всеми шестью cases различаются и source paths, и package paths.
Для обоих TUI profiles X11 observer подтвердил одно собственное видимое окно
Chromium и remaining=[] после закрытия. После завершения не осталось процессов,
чьи executable находятся внутри двух candidate payloads.
CLI запускался с PATH без глобальных Desktop/Node/Bun/Chrome; harness использовал
абсолютный путь к Bun. В пользовательский launcher этот candidate не устанавливался.

Логи: `/tmp/loginom-cli-folder-oracle.log`,
`/tmp/loginom-cli-folder-tui-oracle.log`, `/tmp/loginom-desktop-folder-oracle.log`.
Profiles, receipts, model captures и cold readback находятся в evidence roots.
Секреты не включены в git или отчёт. Пользовательский Desktop не изменён.

## Контракты: PASS

Шесть captures совпали по 34 schemas/descriptions и bootstrap instruction.
Все шесть prepare replies совпали по полным instructions и knowledge.
Manifest pins CLI/Desktop совпали, включая Node/Chromium hashes, Playwright/MCP,
runtime lock, models snapshot, action manifest и endpoint.
Tools SHA256: `ad74cb9fc5746eeb8252a0352455c12a43ed8de7b28ab581a7ca388b644b6375`.
Bootstrap SHA256: `c335f67e2c35ccbb2e35be75cd99fa02f5f764443943b3395e1a62fa8cda64f9`.

## Статусы полных gates

| Gate | Статус этого отчёта | Граница |
| --- | --- | --- |
| IND-01 | NOT_RUN | Native payload/PATH проверены; эта версия не устанавливалась |
| IND-02 | PASS | Одна сборка, фактические schemas/instructions/knowledge/pins |
| IND-03 | PASS | Одинаковые fixtures/prompt/model configuration; сценарии и независимые результаты совпали во всех интерфейсах, с указанным scripted provider |
| IND-04 | NOT_RUN | Headless run и headed TUI PASS; полная mode/resume matrix открыта |
| IND-05 | NOT_RUN | Six-way bytes/source/package separation PASS; полная isolation matrix не закрыта |
| IND-06 | NOT_RUN | Private profiles, пользовательский Desktop не изменён; полный access audit отсутствует |
| IND-07 | NOT_RUN | Параллельные profiles работали; busy/alias matrix здесь не выполнялась |
| IND-08 | NOT_RUN | Native version PASS; полная bootstrap matrix здесь не выполнялась |
| IND-09 | NOT_RUN | Setup выполнен; pending/cancel/recover matrix здесь не выполнялась |
| IND-10 | NOT_RUN | Штатный cleanup PASS; crash/network/active cancellation отсутствуют |
| IND-11 | NOT_RUN | Attachment bytes PASS; permissions явно разрешены harness |
| IND-12 | NOT_RUN | Exit=0 и JSON/PTY результаты проверены; полная error matrix отсутствует |
| IND-13 | NOT_RUN | Видимость headed окна PASS; полная native/proxy/CA/sandbox matrix отсутствует |
| IND-14 | NOT_RUN | Archive/package verification PASS; installed Desktop и release gates открыты |

Исторический failed run B версии 19:30 и его recovery не переписываются.
Новый run прошёл на новых profiles/packages; старый delivery не повторялся.
Детерминированный stale-folder fault проверен локальными tests из
[source fix report](../2026-09-17-cli-folder-navigation/report.md); этот live прогон
не является намеренной инъекцией такого fault в браузер. Windows/macOS,
signatures и завершение всего плана не объявляются готовыми.
