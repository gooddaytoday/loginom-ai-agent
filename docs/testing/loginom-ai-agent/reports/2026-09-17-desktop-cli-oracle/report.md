# Desktop CSV oracle и сравнение model contracts с TUI

2026-09-17, Linux x64/X11. Desktop candidate:
`/tmp/loginom-desktop-cli-regression-20260917/linux-unpacked/loginom-ai-agent`.
Это dirty development package 0.1.4, не установленный релиз.
ASAR SHA256 `f91a86d1ba25d76f23036cda3277b192e912016e18bc55b20652d598c7cdce9d`;
source tree `32f6cb7f85a17db7b220131191af74e1212a7a64d82871794801fc37deeeb961`.
Полное происхождение в [Desktop regression report](../2026-09-17-cli-desktop-regression/report.md).

## PASS: Desktop backend oracle

Новый `desktop-oracle.mjs` запускает настоящее упакованное приложение,
настраивает Loginom через GUI в отдельном профиле и отправляет исходное сообщение
с CSV через backend этого Desktop. Это не прямой вызов Host. File part содержит
исходные bytes в data URL; диалог выбора файла в renderer этим тестом не проверен.
Сессия явно разрешает tools, эквивалентно CLI oracle с skip-permissions;
интерактивный permission flow здесь не проверяется.

Использован общий `oracle-provider.ts`: одинаковые prompt, test/test-model и
настройки scripted OpenAI-compatible provider. Provider только направляет
model tool calls; Loginom, Chromium, tool pipeline и сохранённые данные настоящие.
Качество рассуждений модели этим способом не измеряется.

Для обоих канонических `sales.csv` выполнены import → group sum → execute →
save → close → независимый cold reopen/readback. Итоги 55 и 101;
settingsReapplied=false. Source paths различаются, оба Desktop driver exit=0.
32 receipts. Summary input hashes совпали с сохранёнными fixtures:

- A, amount=10/20/25:
  `98aa522befcb544089edf626c2713e1cf69aaf54f93a0a92a0df7e3e4a10fcd5`.
- B, amount=40/60/1:
  `71566126acfc907717a41ba31ef83d8867ca6080979f62948bd906a811492f4c`.

Evidence: `/tmp/loginom-linux-oracle-XSttMQ/summary.json`, 32 receipts,
`cold-A`, `cold-B`, `desktop/*/{exit.json,stdout.txt,stderr.txt,model-contract.json}`.
Log: `/tmp/loginom-desktop-oracle.log`. Credentials остаются в private IPC/profile;
в git и отчёт не включены. Установленный пользовательский Desktop не изменялся.

## PASS: наблюдаемая часть model contract

Общий provider сохраняет переданные модели Loginom schemas и system messages.
`compare-oracle-contracts.ts` сравнил четыре captures: Desktop A/B и TUI A/B
из `/tmp/loginom-linux-oracle-rvmxcr`. Совпали все 34 tools, включая описания и
полные JSON schemas, а также стартовая строка Loginom instructions.

- Tools SHA256 после канонической сортировки:
  `ad74cb9fc5746eeb8252a0352455c12a43ed8de7b28ab581a7ca388b644b6375`.
- Bootstrap instruction SHA256:
  `c335f67e2c35ccbb2e35be75cd99fa02f5f764443943b3395e1a62fa8cda64f9`.
- Negative check: изменение description одной schema отвергнуто с
  ORACLE_CONTRACT_MISMATCH. Общий provider: 2 HTTP/lifecycle tests, 9 assertions PASS;
  Host typecheck PASS.

Повторение: из `packages/loginom-host` выполнить `bun script/compare-oracle-contracts.ts`
с двумя или более абсолютными путями `model-contract.json`.
Сравнивается стартовая Loginom-инструкция; dynamic instructions из дальнейших
tool results и общий environment context этим comparator не сертифицируются.

## Полные gates

| Gate | Статус в этом отчёте | Граница доказательства |
| --- | --- | --- |
| IND-01 | NOT_RUN | CLI installation/PATH isolation не проверялись |
| IND-02 | NOT_RUN | Captured schemas/bootstrap совпали; snapshots Desktop и CLI различаются |
| IND-03 | NOT_RUN | Desktop canonical cold oracle PASS; единая сборка трёх интерфейсов ещё не проверена |
| IND-04 | NOT_RUN | Полная mode/resume matrix отсутствует |
| IND-05 | NOT_RUN | CSV bytes/source separation PASS; полная isolation matrix отсутствует |
| IND-06 | NOT_RUN | Пользовательский Desktop не изменён; независимость активных интерфейсов не сертифицирована |
| IND-07 | NOT_RUN | Busy/alias/parallel benchmark matrix здесь не проверялась |
| IND-08 | NOT_RUN | Help/version здесь не проверялись |
| IND-09 | NOT_RUN | GUI setup выполнен; pending/recover matrix отсутствует |
| IND-10 | NOT_RUN | Штатный shutdown PASS; crash/network/cancel не проверены |
| IND-11 | NOT_RUN | Original attachment hashes PASS; разрешения заданы явно тестом |
| IND-12 | NOT_RUN | Desktop driver exit проверен; полная CLI JSON/error matrix отсутствует |
| IND-13 | NOT_RUN | Native/proxy/CA/sandbox matrix здесь не выполнялась |
| IND-14 | NOT_RUN | linux-unpacked не установлен через dpkg; install/uninstall gate открыт |

Native CLI comparison использует candidate 0.0.0-dev-202609171831 из source
`098baffe492401950c7a1553f9e156a5241c13d94a9741ac86956e87d1cc17f7`;
его archive SHA256 `2fdbe774dc78bdf268fb72a7d5021fc209b7251f8429bbd9fdc573b19dbbc5dd`.
Acceptance adapters добавлены позднее и исполнялись из рабочего дерева.

## Канонический TUI regression общего provider: PASS

`/tmp/loginom-linux-oracle-rvmxcr/summary.json`: оба CSV A=10/20/25,
B=40/60/1 прошли native headless TUI → import/group/save/close → независимый
cold readback 55/101, settingsReapplied=false. 32 receipts, source paths различны,
inputSha256 совпадает с fixture manifest. Оба exit=0, guard=false, forced=false,
input_submitted=true. Log `/tmp/loginom-cli-shared-provider-tui.log`.
Этот прогон закрывает расхождение прежнего TUI fixture B=100/1; исторический
headed TUI report остаётся без изменения своего набора данных.

Сравнение manifest двух кандидатов также подтвердило совпадение protocol/target,
Node version/hash, Playwright/MCP pins, Chromium revision/hash, runtime lock,
models snapshot, action manifest URI/hash и endpoint. Это совпадение закреплённых
ресурсов, а не доказательство единого source snapshot всего приложения.
