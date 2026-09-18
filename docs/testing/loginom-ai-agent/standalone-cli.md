# Самостоятельный CLI: checkpoint и приёмка

## Linux-only продолжение и real provider — 2026-09-18

Текущий объём пользователя исключает Windows/macOS. Новый чистый Linux artifact
`0.1.4-cli.20260918review` из `1657a6c07` установлен отдельно от Desktop.
Xiaomi MiMo успешно вызвал Dock, доставил CSV и настроил импорт. Пользователь
явно принял этот smoke как достаточную проверку реального provider; полный
сценарий этой моделью не завершён, старые scripted 55/101 oracle не подменяются.
[Артефакт, результат и ограничения](reports/2026-09-18-cli-real-provider/report.md).

В исходниках добавлены последние три declared-license supplements: actual graph
inventory больше не имеет missing-text entries, но status остаётся incomplete
для attribution/nested/native/source/relinking audit. Полный clean archive
`0.1.4-cli.20260918linux` собран, installed inventory проверен, штатное удаление
сохранило 8093 файла профилей. Offline Ubuntu 22.04/Debian 12 startup/library
checks PASS. [Финальный Linux artifact](reports/2026-09-18-cli-final-linux/report.md).

Final native headless run и installed headed TUI прошли CSV 55/101, save/close
и независимое cold readback без перенастройки узлов. TUI: exit 0, guard=false,
forced=false, по одному видимому окну Chromium и remaining=[] после закрытия.
[Безопасное обновление observation в тестовом драйвере](reports/2026-09-18-cli-final-linux/tui-driver-diagnosis.md).

Новый чистый archive `0.1.4-cli.20260918nested` добавляет 15 вложенных npm notices:
947 installed hashes, help/version/status и install/uninstall PASS. Runtime sources
не менялись; предыдущие oracle не переименовываются в проверку этого архива.
[Архив, source и ограничения](reports/2026-09-18-cli-nested-notices/report.md).
Два чата в одном native TUI и файловая трассировка также выполнены:
[итог](reports/2026-09-18-cli-final-linux/tui-multichat-summary.json).

Последний notice/source candidate: `0.1.4-cli.20260918sources` из d391443be.
Installed manifest/source inventories PASS: 41 native/source hashes, 306 archived
entries и 947 npm notice/README hashes; штатное удаление сохранило профиль.
[Артефакт и конкретный остаток аудита](reports/2026-09-18-cli-bun-sources/report.md).

## WebKit source companion

Большой WebKit archive поставляется отдельным каталогом рядом с CLI archive.
Его точные commit/tree/size/SHA256 закреплены в
`packages/loginom-host/licenses/bun/webkit-source.json`; сборщик CLI также
включает эту запись в `licenses/bun/webkit-source.json` установленного payload.
Сборка комплекта из заранее полученного канонического архива:

```sh
# Из packages/loginom-host, закреплённым Bun 1.3.14:
bun script/build-webkit-source-companion.ts /absolute/webkit-source.tar.gz /absolute/new-source-companion
# В созданном каталоге:
sha256sum -c SHA256SUMS
```

Сборщик проверяет исходный архив и доставленную копию потоковым SHA256,
отклоняет неверный размер/hash и не заменяет существующий каталог.
Проверен `/tmp/loginom-cli-webkit-source-companion`: 1976235831 bytes,
SHA256 `19b89496c4d39570ecad80ca6ac99c37a77c95179a0463f8a1b85fc48a276df1`.
Проверки повреждения и сохранения существующего каталога PASS; host typecheck PASS.
Это комплект одного компонента: остальные external sources и фактическая
перелинковка остаются отдельными задачами. Публикация не выполнялась.

## Исправления ревью a7d812e4a — исходная проверка 2026-09-18

- Dock business failures без MCP `isError` дают ошибку tool/код 1; успешное
  исправление той же операции возвращает 0, running не снимает прежнюю ошибку.
- Ctrl+C в providers/auth/models проходит через отмену Effect и очистку профиля.
  Проверены зависший HTTP metadata request и дочерняя credential command:
  код 130, `.writer` освобождён после cleanup, следующая команда работает.
- Вложения file/data URL: полный snapshot остаётся для Dock, модель получает
  ограниченный текст (2000 строк / 50 KiB, до 2000 символов на строку).
- Неверный `run --fork` и пустой ввод дают `CLI_ARGUMENT_INVALID` / 2.
- Проверки packages/agent: 70 passed + 1 existing skip в первом проходе
  standalone/standalone-status/session-prompt; 20 passed в финальном проходе
  standalone/standalone-status/run-outcome/loginom-result/attachment-preview.
  Повторный package `bun typecheck` и `git diff --check` — PASS.
  Всего 80 разных прошедших тестов, 1 existing skip.
- Установленные артефакты не пересобирались. Live provider/OAuth и native
  Windows/macOS не проверялись; историческая приёмка ниже остаётся отдельной.

## Исторический checkpoint перед Linux-only продолжением — 2026-09-18

Полная цель **не завершена**. Ниже идут исторические checkpoint-записи: их PASS
относятся к указанным там artifacts, а не автоматически к последней сборке.

- Последний Linux notices candidate 0.1.4-cli.202609180500: native version,
  source stability, manifest/extracted archive и штатная установка/удаление PASS.
  Installed help/version и notices hashes проверены; Loginom/model run не выполнялся. Содержит
  465 npm notices, 464 README, 35 native/JS notice files и 757 секций Chromium credits.
  License audit остаётся incomplete (3 npm entries и source/native gaps).
  [Архив, хеши и ограничения](reports/2026-09-18-cli-license-inputs/report.md).
- Installed Desktop 02:25: GUI, исходные CSV 55/101, save и независимый cold
  reopen/readback PASS после shared-host extraction. Исправлена Linux упаковка
  при umask 077; проверка прав включена в artifact verifier. Стабильная 0.1.4
  восстановлена и сверена по ASAR. [Отчёт](reports/2026-09-18-desktop-host-regression/report.md).
- Linux candidate 0.1.4-cli.202609180210: исправлен вход с пустым readonly
  полем пароля; полный build/archive verification PASS. Installed network-loss
  после running import receipt PASS: code 4, recovery сохранён, 24 процесса
  завершены. Install/uninstall сохранили 4113 файлов профиля без изменений.
  [Evidence и границы проверки](reports/2026-09-18-cli-network-loss/report.md).
- Linux candidate 0.1.4-cli.202609180107: полный archive/staging/installer build,
  source snapshot, extracted manifest и 4365 runtime entries PASS.
  [Artifact и hashes](reports/2026-09-18-cli-native-build-integration/report.md).
- Installed smoke/install/uninstall, POSIX profile permissions и lifecycle
  Chromium проверены на 00:38. SIGKILL и SIGINT после running receipt реального
  импорта сохраняют неопределённость; новый run блокируется до model dispatch
  (HTTP counter: 0 requests). [Отчёт](reports/2026-09-18-cli-active-import-crash/report.md).
- CSV 55/101, TUI/run/Desktop contract comparison и resume имеют отдельные
  исторические evidence ниже. Provider там scripted: это проверяет tool pipeline
  и oracle, но **не закрывает требование настоящего model provider** из §13.
- Native CLI proxy adapters добавлены в source: ограниченный manual HTTP/HTTPS
  subset; automatic/scoped и другие неподдержанные политики отклоняются. Native
  исполнение ещё не проверено. [Ограничения и проверки](reports/2026-09-18-native-proxy-source/report.md).
- Windows/macOS codecs, installers, native staging и archive build branches
  реализованы в source; native выполнение/приёмка отсутствуют. Candidate hashes
  получены из реальных файлов, Product release pins не переведены в native PASS.

Историческая очередь по исходному контракту (актуальный scope — в начале документа):

1. Live oracle с настоящим model provider на отдельном CLI-профиле (Desktop auth
   не копировать). Пользователю задан вопрос о готовом разрешённом профиле.
2. Windows/macOS native build/install/crypto/proxy/CA/sandbox и остальные IND
   на соответствующих машинах. Доступ запрошен, подтверждённых native hosts нет.
3. Подписи/notarization и аудит notices по фактическим поставляемым ресурсам;
   отсутствие signing credentials означает dev-only, а не release PASS.

Linux IND-10 теперь имеет отдельные installed evidence для host (01:35),
network loss (02:10) и browser/runtime (04:30); последний
[отчёт](reports/2026-09-18-installed-browser-runtime-crash/report.md) фиксирует
active-import timing и ограничения. IND-14 installed Desktop 02:25 подтверждён
выше. Эти проверки не переносятся на другие платформы или произвольные timing.

Действующий контракт: [дизайн](../../superpowers/specs/2026-09-17-loginom-cli-standalone-design.md).
Ветка `loginom-cli`, исходная база `c37913ab5ca8f421b76286bf25c282b83cc2de56`.
Общая служба из старого CLI-дизайна не используется.

Desktop regression на текущей CLI-ветке: build, `linux-unpacked`, live GUI
onboarding/save/restore, package-local tests/typecheck и proxy PASS.
[Отчёт](reports/2026-09-17-cli-desktop-regression/report.md) отделяет эту проверку
от ещё не выполненной installed DEB/AppImage acceptance и общего CSV oracle.

Native headed TUI live oracle: [отчёт](reports/2026-09-17-cli-headed-tui/report.md).
После него oracle переведён на сохранённые CSV fixtures и hashes из
`packages/desktop/test/loginom/fixtures/standalone-cli`: A=10/20/25, B=40/60/1,
столбец amount для всех интерфейсов. Headless native run нового набора PASS,
evidence `/tmp/loginom-linux-oracle-lO4HVe/summary.json`: cold totals 55/101,
settingsReapplied=false, разные source paths, оба exit=0/guard=false,
inputSha256 совпадает с manifest. Candidate 0.0.0-dev-202609171831; provider
scripted. Исторический headed TUI использовал B=100/1; его evidence не изменено.

Общий provider и канонический Desktop/TUI CSV oracle:
[отчёт](reports/2026-09-17-desktop-cli-oracle/report.md). Packaged Desktop через
свой backend API и native headless TUI прошли оба fixtures с холодным readback
55/101; новые TUI bytes B=40/60/1 подтверждены. Captured 34 tool schemas и
bootstrap Loginom instruction совпали, как и manifest runtime pins.
Артефакты всё ещё имеют разные source snapshots; full IND-02/03 не закрыты.

При ручной распаковке CLI используйте `tar --same-permissions -xzf <archive.tar.gz>`
в отдельный каталог: manifest проверяет точные file modes. Обычный `tar -xzf`
под `umask 077` изменяет 0644/0755 на 0600/0700 и корректно отвергается verifier.
Build archive-check также явно сохраняет permissions; проверка не ослаблена.

Общая сборка 0.1.4-cli.202609171930:
[отчёт](reports/2026-09-17-unified-cli-build/report.md). Один source snapshot
Desktop/CLI; IND-02 Linux PASS, Desktop/TUI canonical cold oracle PASS.
Installed run B получил UI_EPOCH_CHANGED во время delivery navigation и
сохранил durable recovery; полный IND-03 этой сборки FAIL, replay не выполнен.
Install/uninstall и native fixture early SIGINT прошли. CLI после теста удалён
из пользовательского launcher; artifacts/profiles сохранены в /tmp.

Source fix stale destination-folder navigation:
[отчёт](reports/2026-09-17-cli-folder-navigation/report.md). Подтверждённый
NOT_APPLIED/UI_EPOCH_CHANGED разрешает ограниченный новый поиск с проверкой
владельца, новыми refs/IDs и подтверждённым cleanup. 90 tests и live direct-runtime
canonical cold oracle 55/101 PASS. Native 19:30 ещё не пересобран, старый recovery
сохранён; historical run B FAIL не заменён этим source-only результатом.

Последующий native checkpoint: 0.1.4-cli.202609171958 включает folder fix.
Desktop, headless run и headed TUI одного snapshot прошли canonical cold oracle
55/101; IND-02/03 Linux PASS в описанном scripted-provider сценарии.
[Отчёт, hashes и ограничения](reports/2026-09-17-native-folder-fix/report.md).
Шесть source/package paths различаются, все exits=0, CLI guards сняты и
headed окна закрыты. Старый failed delivery/recovery не переиспользовался.

## Исторический исходный checkpoint

Ниже сохранена последовательность foundation-проверок. Актуальный прогресс и
ограничения перечислены в разделе 16 дизайна; ранние пометки «пока не выполнено»
не заменяют более поздние результаты в этом документе и дизайне.

Этап 1 в работе: Product paths для трёх ОС, консервативный guard, ранний entry,
изоляция Global и inherited config/auth/DB. `help/version` доступны через
`bun run src/standalone.ts --help` из `packages/agent`. Default TUI dispatcher и private worker bridge подключены в исходниках;
Source PTY startup/exit проверен с runtime fixture; prompt/tool и native artifact
TUI acceptance пока не выполнены. `run` проходит Loginom preflight до импорта backend и вызывает
существующий v1 RunCommand. Management-команды `loginom`
setup/check/status/cancel-pending/recover подключены. `providers` (алиас `auth`) и
`models` доступны независимо от Loginom setup/bundle; live OAuth ещё не проверен.

Этап 2 начат: connection/recovery перенесены в Host; общая `createLoginomHost`
используется тонким Desktop adapter. Host-port обобщён и удерживает leases для всех
запросов до их завершения. Live uncertainty не удаляется следующей успешной операцией;
acknowledge требует idle и reset, shutdown до commit сохраняет маркеры.
Node entry/handshake и management dispatcher подключены; подтверждён штатный
close настоящего дочернего процесса. End-to-end owner-loss/Chromium cleanup ещё предстоят.
Приёмка установленного Desktop не запускалась.

Подтверждено: Product 4 теста/16 assertions; Agent profile/entry/management/run-preflight 11/94;
Desktop connection 33/100 и proxy 5/19; Host 12/55. Typecheck Product/Core/Agent/Host/Desktop PASS.
Host process test требует `LOGINOM_AI_AGENT_TEST_NODE` с абсолютным путём к
комплектному Node; использован `packages/desktop/resources/loginom/bin/node`.

Тест client disconnect выполняется на комплектном Node: Bun 1.3.11 не доставляет
MessagePort close в проверенном сценарии, несмотря на доставку сообщений.
Будущий Bun TUI bridge должен явно сообщать disconnect через worker/RPC lifecycle.

Проверки запускаются из package directories:

- `packages/product`: `bun test`, `bun typecheck`.
- `packages/agent`: `bun test test/cli/profile.test.ts test/cli/standalone.test.ts --timeout 30000`, `bun typecheck`.
- `packages/agent`: `bun test test/cli/standalone-status.test.ts --timeout 30000` — реальный entry + построенный Node host, fixture bundle с комплектным Node; это не установленный архив.
- `packages/core`: `bun typecheck`.

Для development status заранее собрать host командой из `packages/loginom-host`:
`bun script/build-node-host.ts <absolute-bundle-root>/host`. В bundle уже должен
присутствовать `bin/node` (Windows: `bin/node.exe`) из закреплённых ресурсов.
Передать абсолютный `LOGINOM_AI_AGENT_CLI_BUNDLE` и отдельный `LOGINOM_AI_AGENT_CLI_PROFILE`,
затем из `packages/agent` выполнить `bun run dev:cli loginom status --format json`.
Это ручной development путь; подписи/hashes manifest и installed auto-discovery пока не проверяются.

Автоматизация setup: `loginom setup --stdin-json --format json` принимает объект
с необязательными строковыми `url`, `username`, `apiKey`, `password` через отдельный
stdin команды. Пропущенные secrets сохраняются; `password: ""` задаёт пустой пароль;
пустой `apiKey` отклоняется. Секреты не передаются аргументами. Для первоначального
setup API key обязателен; настройки провайдера модели остаются отдельными.

`loginom recover --acknowledge --format json` подтверждает текущие маркеры после
ручной проверки внешнего состояния; без флага неинтерактивный вызов возвращает 4.
Interactive setup/recover используют stderr; TTY-маскирование и отмена ещё требуют
приёмки. Тесты management runtime не доказывают Loginom/browser/network acceptance.

Исходный `run --headless --format json --model <provider/model> <prompt>` подключён.
Без Loginom setup он возвращает 2 до создания backend DB. С fixture Loginom и
несуществующей моделью возвращает JSON error и 1, штатно закрывает host и освобождает
guard. Исправлено зависание из-за незакрытой SSE-подписки и независимого scope
HttpApiApp. Успешный standalone provider/tool prompt проверен с локальным HTTP-provider и
управляемым Loginom runtime fixture: JSON tool result, continuation, exit 0 и
освобождение guard. После cleanup и сброса stdout/stderr entry явно завершает процесс.
При явно заданном `loginom_*: ask` автоматический отказ standalone run даёт
JSON `CLI_PERMISSION_REJECTED` и exit 1; явное разрешение проверено отдельно.
SIGINT активного standalone provider turn проверен на зависшем локальном provider:
JSON `CLI_CANCELLED`, exit 130 и освобождённый guard. Отмена startup/setup, TUI и
активного Loginom effect, прямой policy deny, итоговые tool errors и живой oracle
ещё не подтверждены.

Процессные тесты отключают только собственный runtime transpiler cache Bun через
`BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`: preload создаёт его даже для пустого eval.
Они не доказывают native binary/TUI/runtime acceptance. `dist` исключён из Agent
typecheck: сохранённые build outputs другой ветки не являются исходниками.

## Очередь работ

1. Довести entry/guard до использования реальными командами; подтвердить отсутствие обращений к Desktop данным.
2. Общая фабрика host, Electron adapter, отдельный Node entry и private transport с подтверждённым cleanup.
3. Setup/run, одинаковый tool pipeline, headed/headless и реальный CSV/save/reopen oracle.
4. TUI bridge, resume, permissions, exit codes, recovery и изоляция вложений.
5. Linux archive, manifest, install/uninstall, sandbox и установленная Desktop regression.
6. Windows/macOS ресурсы, codecs и packaging; нативная приёмка на каждой ОС.

## Исходный статус IND — историческая запись

Все IND-01…14: **NOT_RUN** для установленного standalone артефакта.
Foundation tests дают лишь частичное исходное доказательство IND-06/07/08;
переименовывать его в итоговый PASS нельзя. Нативные Windows/macOS проверки
и signing/notarization не выполнялись.

После аварии `.writer` не снимается автоматически. Для продолжения использовать
другой профиль либо ручное offline-восстановление после полного завершения прежних
backend/host/runtime/browser. Команда `loginom recover` подтверждает неопределённые
операции Loginom и не является восстановлением writer guard.


### Source PTY startup/exit

Из корня проекта: `python3 packages/agent/test/cli/tui/standalone-pty.py`.
Это ручной Linux acceptance harness, а не Bun test. Он собирает host во временный
bundle, выполняет setup с fixture key, запускает настоящее TUI в PTY, закрывает
provider modal через Escape и выходит Ctrl+D. Проверяет exit 0, освобождение guard
и завершение PID host/runtime. Raw terminal output сохраняется только в указанном
в JSON временном каталоге. PASS получен; Chromium, inference и installed archive
не используются и не считаются проверенными.


`python3 packages/agent/test/cli/tui/standalone-pty.py --prompt` добавляет локальный
HTTP-provider и Loginom tool fixture. Проверяет tools schema, фактический вызов
через worker/private host, provider continuation, сохранённый tool/text в SQLite,
выход и отсутствие дочерних процессов. Это source TUI prompt acceptance;
external model auth и живой Loginom oracle не проверяются.


### Native binary checkpoint

Из `packages/agent`, Bun версии не ниже project pin:
`LOGINOM_AI_AGENT_CHANNEL=dev bun script/build.ts --standalone --single --skip-install`.
Standalone output находится в `dist-standalone/loginom-ai-agent-cli-linux-x64/bin/`;
обычный `dist` не затрагивается. Это только native CLI/TUI, не полный дистрибутив.

Передать абсолютный `LOGINOM_AI_AGENT_TEST_CLI_EXE` в PTY harness для проверки
binary вместо source entry. Native Linux x64 help/version и PTY prompt/tool/history/
cleanup прошли с fixture runtime. Installed IND gates остаются NOT_RUN.


Installed resource auto-discovery is wired in source through cli-manifest verification
next to the executable. The previously recorded native binary predates this wiring;
regenerate the binary and matching manifest before testing it. Explicit CLI_BUNDLE
continues to select the development bundle. Installer and installed IND gates remain
NOT_RUN.


### Полный development payload с manifest

Из `packages/loginom-host`: задать абсолютные pinned `LOGINOM_AI_AGENT_NODE_SOURCE`
и `LOGINOM_AI_AGENT_BROWSER_SOURCE`, затем pinned Bun 1.3.14:
`bun script/build-cli.ts <new-absolute-output>`. Каталог назначения не должен
существовать. Сборка проверяет неизменность source snapshot, включает binary/resources/
host и пишет полный manifest. Dirty snapshot явно обозначается; release требует
отдельного clean-source процесса. Native status без CLI_BUNDLE и через symlink
launcher проверен; лишний payload file отвергается. Installer пока отсутствует.


### Linux user install

Собранный payload содержит `install.sh` и `uninstall.sh`, использующие комплектный
Node. Install создаёт versioned каталог в ~/.local/share/loginom-ai-agent-cli и
launcher ~/.local/bin/loginom-ai-agent-cli. Уже существующий launcher не заменяется.
Для обновления сначала остановить все процессы старой CLI, выполнить uninstall,
затем install нового payload. Uninstall сохраняет CLI profiles и Desktop.

Реальная проверка в temporary home прошла: install → native status без override →
uninstall из installed payload → profile sentinel сохранён. Это development candidate;
live Loginom/Chromium, Desktop regression и license review не выполнены.


### Автоматический архив Linux

`build-cli.ts` теперь создаёт рядом с новым payload файлы
`loginom-ai-agent-cli-<version>-linux-x64.tar.gz` и `.tar.gz.sha256`.
Перед публикацией сборка распаковывает архив и проверяет полный manifest.
Существующие архивы/checksum не перезаписываются. Проверка checksum:
`sha256sum -c loginom-ai-agent-cli-<version>-linux-x64.tar.gz.sha256`.

Кандидат 0.0.0-dev-202609171656 проверен через отдельный temporary home: распаковка,
install, native status, uninstall, сохранённый profile. В PATH доступен только
dirname, bundled Node используется явно. Это management acceptance development
архива; TUI/run с живым Loginom, Chromium cleanup и итоговые IND gates ещё открыты.


### TUI без Loginom setup

`python3 packages/agent/test/cli/tui/standalone-pty.py --unconfigured` проверяет
предложение setup и выход из TUI без model provider. Добавить `--prompt` для
обычного чата с локальным fixture provider: Loginom tools отсутствуют, ответ
сохраняется в SQLite, runtime не запускается. Оба source сценария прошли.
Harness отправляет клавиши после появления ожидаемого экрана. Выбор полноценного
setup и его секретные поля в этих сценариях не проверяются.


### Полный startup setup в PTY

Из корня репозитория запустить
`python3 packages/agent/test/cli/tui/standalone-pty.py --setup --prompt`;
добавить `--password` для непустого пароля. Оба source сценария прошли:
замаскированные secrets, правильные значения на private runtime boundary, tool
и текст в истории, штатный cleanup. Отдельный `--cancel-setup` проверяет Ctrl+C
в поле API-ключа и код 130. Runtime/provider — fixtures, не живой Loginom.


### Настоящий Chromium с локальной страницей

Из packages/loginom-host: `bun script/browser-acceptance.ts <absolute-resources>`.
Добавить `--wrong-identity` для ошибки пользователя, либо `--cli-rejection` для
вызова соседнего native binary через временную копию resource bundle с локальным
knowledge endpoint. Последний режим использует явный development override.
Проверяются PID cleanup, renderer seccomp и отсутствие --no-sandbox. Все три
режима прошли на ресурсах кандидата 0.0.0-dev-202609171710. Это не live Loginom
приёмка, не проверка owner crash и не гарантия поддержки других Linux-систем.


### Живой runtime 55/101 и crash после readiness

На ресурсе CLI candidate 0.0.0-dev-202609171710 прошли A/B import/group/save/cold
reopen (55/101) и parent SIGKILL с 0 живых потомков из 12 отслеживаемых процессов.
[Отчёт с границами доказательства](reports/2026-09-17-cli-runtime/report.md).
Это direct runtime acceptance, не общий PASS для native CLI prompt или Desktop.


### Итоговые tool errors (source run)

Неустранённые terminal tool errors и invalid дают CLI_TOOL_FAILED/exit 1.
Успешный повтор Loginom operation_id либо точных аргументов закрывает связанную
ошибку, сохраняя её в events. Несвязанный успех ничего не снимает. Процессные
и outcome tests прошли. Изменённые generic-tool аргументы и invalid без явной
связи исправления пока консервативно оставляют неуспех; native acceptance впереди.


Дополнительная CLI-проверка: native 19:58 продолжил одну реальную сессию через
headed TUI `--session`, затем headless `run --continue`; два новых tools на запуск,
exit=0, guard=false, окна закрыты. Evidence `/tmp/loginom-live-resume-jAOvyh`;
подробности в `docs/testing/loginom-ai-agent/reports/2026-09-17-cli-live-resume/report.md`.
Это частичное покрытие resume matrix со scripted provider; общие release gates открыты.


Source installer теперь отклоняет symlink-компоненты home/`.local`/`share`/`bin`
и install base, а uninstall — также symlink receipt. В проверке отказа сохранены
чужие файлы, launcher и payload. Install/manifest tests: 3 PASS/46 assertions,
host typecheck PASS. Изменение ещё не включено в native 19:58; конкурентная
подмена каталогов другим процессом пока не закрыта этой предварительной проверкой.


Windows source codec: DPAPI CurrentUser через абсолютный путь системного Windows
PowerShell, без profile и интерактивного ввода. Секреты идут по private stdin/stdout;
ошибка защиты не разрешает plaintext fallback. Native-only test находится в
`packages/loginom-host/test/cli-credentials.test.ts`: выполнить на Windows из
package directory вместе с `bun typecheck`. На Linux: 4 PASS, 1 SKIP, 9 assertions.
Windows integration/native packaging и проверка другой учётной записи остаются NOT_RUN.


Linux resume browser modes проверены на едином native candidate 0.1.4-cli.202609180020:
TUI и run в обоих режимах, прежний Session ID, новые реальные tools, exit=0,
guard=false, видимость соответствует текущему invocation и после выхода окон нет.
Evidence `/tmp/loginom-live-resume-nPuhW5` и `/tmp/loginom-live-resume-CUx0yK`;
IND-04 PASS для описанного Linux сценария со scripted provider.


### Native macOS Keychain acceptance

Выполнять на macOS 14+ arm64 из `packages/loginom-host`, с pinned Bun:

```sh
bun script/build-keychain.ts /tmp/loginom-keychain-resources/bin
bun script/keychain-acceptance.ts /tmp/loginom-keychain-resources
```

Каталог helper output должен быть новым; сборщик не заменяет существующий helper.
Для release используется стабильная подпись helper; dev compile сам по себе
не доказывает signing/ACL compatibility при обновлении.

Драйвер проверяет read отсутствующего ключа без создания, UTF-8 roundtrip,
новый nonce, повторное чтение, canonical alias профиля, изоляцию разных profiles,
повреждение ciphertext и отсутствие helper. Он не меняет default Keychain/settings
и не удаляет ключи. Два тестовых профиля и их Keychain entries сохраняются:
service `com.loginom.aiagent.cli.profile-key.v1`, account = SHA256 canonical path
соответствующего profile. Итоговый stdout содержит только evidence path/status.

Нативный запуск пока NOT_RUN. Linux отказ `MACOS_ARM64_REQUIRED` подтверждён,
но не заменяет macOS execution. Locked Keychain, запрет доступа, повторный запуск
после обновления подписанного helper и packaged host остаются отдельными проверками.


Standalone cross-build: из packages/agent используйте pinned Bun и
`bun script/build.ts --standalone --target=win32-x64 --skip-install` с новым
абсолютным LOGINOM_AI_AGENT_BUILD_OUTPUT. Аналогично доступен darwin-arm64.
Нужны optional native packages соответствующего target из bun.lock. Эта команда
собирает только CLI/TUI binary; не заменяет полный resource/archive builder.
Windows PE x64 candidate 0.1.4-cli.202609180110 успешно собран на Linux,
но на Windows не запускался и не содержит полной нативной поставки ресурсов.


macOS cross-build 0.1.4-cli.202609180110 выполнен: Mach-O arm64 binary находится
в `/tmp/loginom-cli-darwin-202609180110/loginom-ai-agent-cli-darwin-arm64/bin/loginom-ai-agent-cli`,
SHA256 `034504a9ffb211920105599c46dba96d19f0251a2eb9c01c641b2cd0d1dcdea0`.
Сборка использовала проверенные по lock integrity native OpenTUI/fff packages.
Binary не запускался на macOS; полная поставка ресурсов/Keychain/signing остаётся NOT_RUN.


### Windows DPAPI: ручная проверка между процессами и пользователями

На Windows 11 x64 из packages/loginom-host запустить закреплённым Bun:
`bun script/dpapi-acceptance.ts create`. Скрипт использует только synthetic secrets,
проверяет roundtrip, различие ciphertext, tamper rejection и запускает отдельный
процесс `reopen`. Каталог evidence содержит encrypted test-envelope.json и summaries.

Для другой учётной записи скопировать **неизменённый** test-envelope.json в доступный
ей отдельный evidence-каталог, сверив SHA256 исходного и полученного файла. Под этой
учётной записью выполнить `bun script/dpapi-acceptance.ts reject-other-user C:\absolute\evidence`.
Скрипт требует отличный SID, сначала проверяет работоспособность DPAPI для текущего
пользователя, затем требует отказ расшифровки исходного envelope. Повторный запуск
тем же пользователем не считается проверкой изоляции. ACL production-профиля этот
сценарий не проверяет и не меняет; его проверка остаётся отдельной.

На Linux проверены typecheck и немедленный WINDOWS_X64_REQUIRED до создания
каталога. Native Windows PASS пока отсутствует.


### Active import crash driver (Linux)

`script/cli-owner-crash.ts unused SIGKILL active-import` из packages/loginom-host
с LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE и приватным LOGINOM_AI_AGENT_TEST_CONFIG
создаёт отдельный профиль и несохранённый draft с fixture CSV. Первый аргумент
в этом режиме игнорируется. Driver требует running receipt + recovery на диске,
после SIGKILL проверяет процессы и PROFILE_BUSY. Evidence и guard сохраняются;
это не разрешение автоматически снимать guard или повторять импорт.

Active-import driver также принимает SIGINT. Для этого случая требуется code4
при сохранённой неопределённости, guard=false, recovery JSON и recoverable-error
в новом status. Code130 применяется к обычной отмене без pending recovery.
