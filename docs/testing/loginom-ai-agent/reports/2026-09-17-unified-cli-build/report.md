# Общая Linux сборка Desktop/CLI и установленный CLI

Версия `0.1.4-cli.202609171930`, channel prod, Linux x64/X11.
Dirty source commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`, tree SHA256
`ae9e8448dd7fed563b922c69d8cbb34e7e1a3f211c36bf3fc16c5531c3155c38`.
Это development candidates, не опубликованный релиз.

## Сборка и происхождение

- CLI: `/tmp/loginom-unified-cli-202609171930`.
  Archive `/tmp/loginom-ai-agent-cli-0.1.4-cli.202609171930-linux-x64.tar.gz`,
  SHA256 `521fe092193210ace773b4d29c938a741e958be93a5d7ab1dd3e977e0f96a133`.
  Полный manifest проверен до и после archive extraction под umask 077.
- Desktop: `/tmp/loginom-unified-desktop-202609171930/linux-unpacked`.
  ASAR SHA256 `5f7d01999b42c964d8cdeb50c546bd1cceb7f4f912d5940cb0d133ac57a2974b`.
  Resource manifest SHA256
  `4d0780e520276c908a96fe4a0c5c8e4b327a172aeb23b17f2193e75dbfd7ff30`;
  4365 resource hashes/ELF checks PASS.
- CLI build проверил неизменность source snapshot. После Desktop build тем же
  алгоритмом повторно получен точно тот же tree hash. Обе сборки использовали
  Bun 1.3.14, Node 24.19.0, одинаковые version/channel и pinned resources.
- Предыдущая попытка 19:24 остановилась на archive modes mismatch: обычный tar
  под umask 077 менял права. Исправлено `--same-permissions`; verifier не ослаблен.
  Regression suite: 2 tests/11 assertions PASS, Host typecheck PASS.

Логи: `/tmp/loginom-unified-cli-1930-build.log`,
`/tmp/loginom-unified-desktop-1930-build.log`,
`/tmp/loginom-unified-desktop-1930-package.log`.

## Нативная ранняя отмена: PASS в process fixture

Новый CLI binary проверен с контролируемым runtime fixture:

- Открытый stdin без EOF: `/tmp/loginom-cli-tui-hv8zcfyt/result.json`.
- SIGINT во время delayed host startup и повторный SIGINT во время cleanup:
  `/tmp/loginom-cli-tui-3toa2yrn/result.json`.

Оба exit=130, cancelled=true, guard=false, alive=[], tool_called=false.
Это подтверждает включение исправления в native binary, но не заменяет отмену
живого Chromium или активной внешней мутации.

## Install/uninstall: PASS для проверенного случая

Установщик запущен в реальном пользовательском home под umask 077. До теста
launcher и install root отсутствовали. Созданы:
`~/.local/share/loginom-ai-agent-cli/0.1.4-cli.202609171930-prod` и
`~/.local/bin/loginom-ai-agent-cli`. Версия через launcher совпала.

Run и TUI выполнялись через установленный launcher с PATH
`/tmp/loginom-cli-path-1930`, содержащим необходимые системные utilities, но
не Desktop/Node/Bun/Chrome. Сам test harness запускался по абсолютному пути Bun.
OS process audit зафиксировал 43 процесса установленного payload; исполняемые
Node, Chromium и crashpad находились внутри него, а не в глобальной установке.
Evidence `/tmp/loginom-unified-installed-processes.json`.

После завершения CLI-прогонов процессов payload не осталось. Uninstall удалил
payload, launcher и current receipt. Hashes всех 43 выбранных файлов постоянного
состояния четырёх profiles совпали до/после; recovery marker сохранён. Browser
cache/logs не включались в это сравнение. Пользовательский Desktop не изменён.
CLI по завершении теста **не оставлен установленным**; candidates в /tmp сохранены.
Логи `/tmp/loginom-unified-cli-install.log`, `/tmp/loginom-unified-cli-uninstall.log`.

## Oracle одной сборки: Desktop/TUI PASS, run FAIL

Все три прогона использовали канонические A=10/20/25 и B=40/60/1, одинаковые
prompt/model settings и общий scripted provider. Loginom/Chromium и model tool
pipeline настоящие; генерация модели детерминированно направляется harness.
Разрешения заданы явно тестом. Это не проверка качества model reasoning.

| Интерфейс | Evidence root | Результат |
| --- | --- | --- |
| Packaged Desktop через его backend API | `/tmp/loginom-linux-oracle-7pcbuP` | A/B cold readback 55/101 PASS, 32 receipts, оба exit=0 |
| Installed headless TUI | `/tmp/loginom-linux-oracle-qL1sSz` | A/B cold readback 55/101 PASS, 32 receipts, exit=0/guard=false/forced=false |
| Installed headless run | `/tmp/loginom-linux-oracle-vtSkV0` | A cold readback 55 PASS; B delivery AMBIGUOUS, exit=4/guard=false |

В успешных A/B source paths различаются, inputSha256 совпали с fixture manifest,
settingsReapplied=false. Логи `/tmp/loginom-unified-desktop-1930-oracle.log`,
`/tmp/loginom-unified-installed-tui.log`, `/tmp/loginom-unified-installed-run.log`.

Run B: `18-dock_artifact_deliver.json` сообщает ARTIFACT_DELIVERY_INCOMPLETE,
`deliver-B:nav2`, upload_submitted_or_unknown=false. В execution-events.jsonl
этот ui.act завершился NOT_APPLIED/preconditions, effect_possible=false,
cleanup_complete=true, error UI_EPOCH_CHANGED. Delivery консервативно сохранил
AMBIGUOUS из-за уже начатой навигации. Операция не повторялась, recovery не
подтверждался и не удалялся. Новый процесс `loginom status` показал
recoverable-error и recovery ID `fe3d315e-3d86-4f0a-bc9a-fa643d5c4c4b`.
Evidence `/tmp/loginom-unified-run-recovery-status.log`. Полный oracle run B
остаётся FAIL; успешные прошлые snapshots не подменяют этот результат.

## Контракты одной сборки: PASS

Шесть captures Desktop/TUI/run A/B совпали по 34 tool schemas/descriptions и
bootstrap Loginom instruction. Также совпали полные `dock_prepare.instructions`
и `knowledge` всех шести ответов, включая session manifest/actions/node types.
Manifest pins совпали по protocol/target, Node/Chromium versions/hashes,
Playwright/MCP, runtime lock, models, action manifest URI/hash и endpoint.

- Tools SHA256: `ad74cb9fc5746eeb8252a0352455c12a43ed8de7b28ab581a7ca388b644b6375`.
- Bootstrap instruction: `c335f67e2c35ccbb2e35be75cd99fa02f5f764443943b3395e1a62fa8cda64f9`.
- Prepare instructions: `72bba83e60411d0a6dce0e1184a52b62bdea174d18694dcea2800c375f633432`.
- Knowledge, canonical JSON: `a40cfb201a6c78c3d6724b197bc5357dc0bde96162b14f9d401e9e0a05a40bd6`.

## Gates в пределах этого Linux прогона

| Gate | Статус | Граница |
| --- | --- | --- |
| IND-01 | NOT_RUN | Installed TUI/run и bundled processes подтверждены; отдельный запрет startup downloads сетью не проверялся |
| IND-02 | PASS | Одна сборка, schemas, instructions/knowledge и runtime pins совпали |
| IND-03 | FAIL | Run B не дошёл до import/save/readback |
| IND-04 | NOT_RUN | Здесь headless; полный headed/resume набор не выполнен на этой сборке |
| IND-05 | NOT_RUN | Проверены fixture hashes и отдельные source paths; run B не завершён |
| IND-06 | NOT_RUN | Private profiles и сосуществование подтверждены; полный global access audit здесь отсутствует |
| IND-07 | NOT_RUN | Два CLI profiles выполнялись параллельно; busy/alias matrix здесь не повторялась |
| IND-08 | NOT_RUN | Version PASS; полная help/bootstrap matrix здесь не выполнялась |
| IND-09 | NOT_RUN | Setup/status/recovery persistence проверены; pending/cancel matrix отсутствует |
| IND-10 | NOT_RUN | Native fixture SIGINT и реальный durable ambiguity PASS; crash/network matrix отсутствует |
| IND-11 | NOT_RUN | Attachment hashes PASS; permissions явно разрешены тестом |
| IND-12 | NOT_RUN | Exit 0/4/130 наблюдаемы; полная error/JSON matrix отсутствует |
| IND-13 | NOT_RUN | Полная native/proxy/CA/sandbox matrix не выполнялась |
| IND-14 | NOT_RUN | CLI install/uninstall PASS; Desktop linux-unpacked не installed DEB/AppImage |

Windows/macOS, signatures, release publication и весь план остаются открытыми.
