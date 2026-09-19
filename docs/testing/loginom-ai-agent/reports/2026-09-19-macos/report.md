# macOS candidate — 2026-09-19

Статус: **LOCAL ACCEPTANCE PASS; CI IN PROGRESS**. Локальные установленные
продукты приняты в описанном ниже объёме; общий план остаётся открыт до успешного
macOS14 CI и проверки его скачанных артефактов.
Канонический список обязательных проверок: [план](../../../../../plan.md).

| Область | Кандидат / исходники | Результат |
| --- | --- | --- |
| macOS27 arm64, source checks | `6650b6d01` | PASS, восемь package-local групп |
| macOS27 arm64, DMG/ZIP/CLI archives | `0.1.4-macos.20260919.2`, `6650b6d01` | Build/static/offline PASS |
| macOS27, установленные Desktop/CLI | тот же candidate02 | Onboarding/model, CSV/cold readback, Unicode/chats, lifecycle, upgrade PASS |
| macOS14 arm64, CI | run `35406024508` отменён; готовится диагностический повтор | Общий PASS ещё не получен |

Локальные артефакты: `~/.cache/loginom-macos-build/candidate-02`.
[Манифест](candidate-02-manifest.json), [контрольные суммы](candidate-02-SHA256SUMS).
Ad-hoc подпись не подтверждает Gatekeeper trust; Developer ID, notarization,
публичный релиз и auto-update исключены планом. Полная GUI-приёмка macOS14
не выполнялась. Детальные ограничения методов указаны в JSON и разделах ниже.

## Исходная точка и окружение

- Ветка `macos-build` создана от актуальной `loginom` / `origin/loginom`, commit
  `697cc2e5addff232f2faeb9be8c4790100995f18`. Отслеживаемых изменений не было;
  единственный неотслеживаемый `plan.md` совпадал с переданным планом.
- Локальная машина: macOS 27.0 (26A428), arm64; Xcode Command Line Tools доступны.
- Изолированные инструменты находятся в `~/.cache/loginom-macos-build/tools`.
  Bun 1.3.14 (`0d9b296a`), Node 24.19.0 arm64, npm 11.17.0 и LICENSE из полного
  официального Node-дистрибутива. Инструменты пользователя не заменялись.
- Node SHA256: `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1`.
  Chromium 1243 SHA256:
  `8319963f6625accf51c0dd4f55091ceaf9f09ed39e7a52fed4fae12b2a6b668a`.
  Оба соответствуют существующим macOS pins; оба Mach-O arm64.
- Полная установка всех workspace остановилась на TLS hostname mismatch
  `pkg.pr.new` (Solid Start, не входит в Desktop/CLI). Установка по тому же
  `bun.lock` с фильтрами Desktop/Agent/Host/Product прошла; lock не менялся.
  Runtime установлен через `npm ci --ignore-scripts --omit=dev --workspaces=false`.

## Исходные сбои и source-проверки

- Product: typecheck и 4 теста PASS.
- Host: исходные два recovery-теста предполагали Linux plaintext codec.
  После явного выбора codec в этих fixtures: typecheck PASS,
  49 PASS / 4 platform skip / 0 FAIL, 354 assertions.
- Desktop: исходные lifecycle fixtures также предполагали plaintext.
  После исправления fixtures и добавления shutdown/storage/proxy-проверок:
  47 PASS / 0 FAIL, 137 assertions. Повторный typecheck после интеграции — PASS.
- Agent: исходный typecheck PASS; первый целевой набор 10 PASS / 1 SKIP / 4 FAIL.
  Причины: canonical `/private/var` paths, зависимость fixtures от staged Desktop Node,
  отсутствие Keychain helper и plaintext assumptions. После исправления двух fixture-файлов совместный прогон: 11 PASS / 0 FAIL, 165 assertions.
- Packaging/manifest: 8 PASS / 0 FAIL, включая совместимость исторического Linux manifest.
- Реальная проверка Node proxy: HTTP, HTTPS CONNECT, node:http, loopback bypass,
  отсутствие direct fallback — PASS.
- Синтетический подписанный Mach-O arm64 app проверен после упаковки в DMG и ZIP.
  Это проверка verifier, **не** доказательство готовности Electron-продукта.

## Нативный Keychain helper

Helper собран clang с minimum macOS 14.0 и подписан ad-hoc.
`codesign --verify --strict`, Mach-O arm64 и minimumOS подтверждены.
11 проверок нативного Keychain прошли: шифрование и повторное чтение, nonce,
изоляция профилей, alias, повреждённый ciphertext, отсутствующий helper,
копия в отдельный установочный путь, замена идентичными signed bytes,
недоступный helper без plaintext fallback.

Настройки пользовательского Keychain не изменялись. Созданы две отдельные
тестовые записи. Проверка идентичной копии не доказывает доступ после изменения
ad-hoc identity; смена helper identity не проверялась и остаётся ограничением.
Helper01/02 имеет одинаковый SHA256 `8e26e17ed159272dee6e715c068f9e0ed646f99167373698859c96177572ee4f`.
Локальное доказательство: `/tmp/loginom-keychain-acceptance-AIXteb/summary.json`.

## Граница приёмки

Приведённые ниже source, artifact и installed проверки учитываются отдельно.
Полная приёмка CSV, совместного lifecycle и CI остаётся незавершённой до появления
явных результатов в соответствующих разделах.
Gatekeeper trust, Developer ID, notarization, public release и auto-update
исключены согласованным планом. Полная GUI-приёмка на чистой macOS14 не входит в этап.

## Кандидат 01: промежуточная проверка

`0.1.4-macos.20260919.1`, чистый commit `dcf1b0410192dc7fcfec71b89e0240c709a19c51`.
Desktop DMG/ZIP и CLI TAR.GZ собраны. Статические verifier после исправления
проверки Chromium: PASS; автономный smoke после исправления loopback/timeout
cleanup: PASS. Эти scripts новее исходников кандидата, поэтому итоговый
после этого кандидат02 пересобран из единого commit.

Исходный Playwright Chromium имеет linker-signed ad-hoc подпись без resource seal.
Это подтверждено на исходном и упакованном browser. Проверяется подпись кода,
полный SHA256 inventory и строгая deep-подпись внешнего Desktop .app; Node/Chromium
не переподписываются. Ограничение отражено в static reports.

Установленный CLI01 прошёл автономные install/uninstall/reinstall, busy-payload
refusal, сохранение профилей и Keychain read-back. GUI01 прошёл onboarding,
реальное подключение, encrypted storage и восстановление после restart.
Xiaomi Token Plan Singapore, `mimo-v2.5`, вернул `OK` через backend кандидата;
никакие provider secrets не включены в доказательства.

CSV01 остановился до UI-изменений: resource manifest унаследовал Linux-каталог.
Найден существующий immutable macOS catalog `2026.09.14-rc6-macos-candidate`,
SHA256 `d26ce18ab9ef3285d5bac7aff1d17d4968defb1d41ebd7cbbda8d9cbede07255`.
Нативный `pinActionCatalog` проверил manifest и все связанные files; compatibility
`loginom-7.4.2-macos-chromium-ru`, platform `macos`, browser `chromium`.
Выбор платформенного каталога добавлен в shared staging; gate не обходился.

CI01 не создал jobs из-за недопустимого runner context в job.env; исправлено.
CI02 подтвердил arm64/macOS14 и provisioning, но Agent typecheck выявил пропуск
root workspace SDK/@types при filtered install. Добавление `--filter loginom-ai-agent`
подтверждено на чистом локальном архиве: frozen install и четыре typecheck PASS,
lock unchanged, неиспользуемый Solid Start не установлен.

Локальный pre-push hook запускал общий typecheck всех upstream workspaces и
остановился на отсутствующем Solid Start в console-support. После успешных
package-local проверок push выполнен без этого hook; сам hook не изменялся.

## Кандидат 02: единая локальная сборка

Версия `0.1.4-macos.20260919.2`, чистый commit
`6650b6d017ce805eb4e6b2e250e612ac55856f16`, macOS27 arm64.
Общий build завершился PASS: DMG/ZIP, CLI TAR.GZ, source archive, manifest,
финальные SHA256, статическая проверка обоих Desktop архивов и автономный smoke.
Доказательства: [build](candidate-02-build.json), [manifest](candidate-02-manifest.json),
[SHA256](candidate-02-SHA256SUMS), [offline](candidate-02-offline.json).
[Package-local source checks](source-checks-02.json) — PASS для всех восьми групп.
Локальный каталог артефактов: `~/.cache/loginom-macos-build/candidate-02`.

Desktop02 скопирован целым bundle из readonly DMG в изолированный
`~/.cache/loginom-macos-build/installed-02/Applications`. Runtime не скачивается
при установке. Полная локальная установленная приёмка завершена; результаты ниже.

CI03 (`35404061216`) прошёл provisioning и source checks, но electron-vite
исчерпал стандартный Node heap около 2 GiB. В CI build step установлен лимит
4096 MiB; повторный run `35404497837` собрал артефакты, но не прошёл Desktop smoke (подробности ниже).

Установленный Desktop02: onboarding, реальное подключение Loginom, safe IPC,
safeStorage и повторный запуск без мастера — PASS. Реальный Xiaomi Token Plan
Singapore `mimo-v2.5` вернул `OK` без вызовов инструментов
([sanitized model evidence](candidate-02-model.json)).

Первый Desktop CSV02 остановился на import A со статусом `AMBIGUOUS`,
`NODE_APPLY_STOPPED: Graph changed after refused gesture`, cleanup incomplete.
Данные восстановления сохранены; результат CSV не считается успешным.
Приёмка повторяется в свежем черновике после завершения других live-прогонов.

Установленный CLI02: три active-import сценария прошли на macOS27
([recovery evidence](candidate-02-cli-recovery.json)). При SIGINT и потере browser
сохранена recovery-запись, состояние `recoverable-error`, guard снят. При SIGKILL
владельца recovery и guard сохранены, повторный доступ закрыт с `PROFILE_BUSY`
(автоматическое продолжение опасной операции не выполняется). В каждом случае
18 отслеживаемых процессов завершились; дополнительный поиск по уникальному
install root не обнаружил reparented crashpad или другие остаточные процессы.

CLI02 CSV55/101 — PASS: A=35+20, B=100+1; оба пакета сохранены
и независимо открыты заново без повторной настройки
([CSV and cold-readback evidence](candidate-02-cli-csv.json)).
Первый cold A обнаружил hardcoded Linux в тестовом reader; исправлена только
проверка platform по реальной ОС. Затем cold A повторён, B выполнен отдельным
продолжением теми же операциями. Runtime артефакта не изменялся.
[Upgrade evidence](candidate-02-cli-upgrade.json): старый payload удалён штатным
uninstall, новый установлен по прежнему пути профиля; ciphertext прочитан новым
helper. История отдельно прочитана через SQLite readonly: session/message/part IDs и полное содержимое шести частей совпали с сохранёнными событиями candidate01 ([exact history evidence](candidate-02-cli-history.json)). Это подтверждает сохранённую историю; продолжение модельного диалога после upgrade не проверялось.

Desktop02 two-chat Unicode admission — PASS
([live receipts verification](candidate-02-multichat.json)): один Desktop process,
два независимых чата, реальные файлы `Данные продаж/Продажи А.csv` и
`Продажи Б.csv`, разные session/artifact/upload пути и проверенные исходные SHA256.
Возврат в A сохранил его исходный artifact, hash, destination и document epoch.
Файлы прочитаны с диска и переданы через backend API; native picker не проверялся.
Первичный combined harness остановился после успешного multichat на неверном
предположении о отдельном Host PID (в Desktop Host встроен в main).
Оригинальный FAIL не переписан: независимая проверка восьми сохранённых live receipts
подтвердила только multichat-область, а window lifecycle учитывается отдельно.

Desktop02 полный повторный CSV-прогон — PASS: 55 и 101, сохранение обоих
пакетов, завершение процесса и независимое холодное открытие без повторной
настройки узлов ([Desktop CSV evidence](candidate-02-desktop-csv.json)).
Первый AMBIGUOUS прогон не повторял незавершённую операцию: созданы новые
изолированные черновики. Приёмочный scripted provider выбирает инструменты;
Desktop/backend/Host и Loginom выполняют реальные операции.

Desktop01→02 upgrade — PASS
([persistence evidence](candidate-02-desktop-upgrade.json)): один isolated userData,
дисковая SQLite, совпавшие session/user-message IDs и содержимое, настройки через
штатный IPC, прежний safeStorage ciphertext. Для этого теста обычный onboarding
test mode не использовался (он включает in-memory DB). До старта main через
Inspector задан отдельный appData, все XDG paths изолированы; настоящий HOME
сохранён только для доступного пользовательского Keychain. Production-код и
подписанные bundles не менялись. Содержимое тестового диалога синтетическое,
модель/сеть Loginom в upgrade-прогоне не вызывались.

Нативный Finder/window/Cmd+Q — PASS
([evidence](candidate-02-finder-lifecycle.json)): Desktop02 действительно открыт
двойным щелчком в Finder из установленного каталога. PATH системный
`/usr/bin:/bin:/usr/sbin:/sbin`, TEST_ROOT изолированный. Две временные
app-specific launchctl-переменные восстановлены сразу после запуска.
Закрытие последнего окна оставило тот же main PID без renderer; активация
восстановила окно в том же процессе. Настоящий Cmd+Q через native UI завершил
все процессы установленного пути. Этот прогон использовал onboarding без Loginom.

Совместная работа Desktop/CLI — PASS
([process evidence](candidate-02-independence.json)): одновременно наблюдались
разные runtime/browser trees; после закрытия Desktop CLI выполнил новое
authenticated observation, и наоборот. По окончании в обоих installed paths
осталось 0 процессов, включая reparented crashpad.

CI04 (`35404497837`, source `870356d33`) после увеличения heap прошёл
source checks, сборку обоих продуктов и static DMG/ZIP verification. Offline
smoke подтвердил встроенные Node/Chromium обоих продуктов и CLI help/version,
но Desktop probe завершился ошибкой. Старый probe скрывал stderr; добавлены
ограниченные diagnostics (`949c30414`); CI05 `35405764130` впоследствии отменён до сборки.
Полный CI PASS пока не заявляется. Downloaded CI04 artifacts отделены от
локального candidate02: исходники отличаются CI memory setting; побайтовое
равенство независимых сборок не предполагается.

CI05 отменён до сборки после обнаружения различия Playwright launch flags:
при explicit packaged executable Desktop не получает `--use-mock-keychain`,
а Chromium probe получает. При пустом HOME native Electron Keychain init
может вызвать системный диалог (такой stack отдельно наблюдался в локальном
upgrade harness). Точная причина предыдущего CI timeout без stderr не установлена.
Только no-credentials offline Desktop probe теперь явно получает mock-keychain;
это не production-настройка. Настоящие safeStorage/Keychain проверки выше
выполнялись без этого флага. Локальный повтор исправленного smoke прошёл. CI06 `35406024508` из `670ee6c57` остановлен диагностически до достижения smoke; причина ниже.
[Downloaded CI04 hashes](ci-35404497837-download.json) совпали; это PASS_HASHES_ONLY,
не замена успешному CI smoke.

Нативное чтение системных CA на macOS27 — PASS
([CA evidence](candidate-02-native-system-ca.json)): bundled Node24.19.0 прочитал
2 системных CA, их X509 SHA256 identities присутствуют в объединённом default
наборе из122 сертификатов; прежние120 roots сохранены. Штатный `--use-system-ca`
также включает обе системные identities. HTTPS с объединённым trust store
прошёл hostname/chain validation и вернул200. Системные trust settings не менялись.
Это проверка чтения/объединения macOS trust store; private-CA-only endpoint,
корпоративная TLS interception и установка новых CA не тестировались.
Node объединяет system CA с bundled roots: [официальная документация](https://nodejs.org/api/cli.html#--use-system-ca).

CI06 остановлен обычной отменой после25мин общего build step
(предыдущий занимал10мин23с). Журнал после отмены показал: Desktop DMG/ZIP
созданы, CLI native version `0.1.4-macos.6` подтверждена, последний вывод
23:39:38 UTC — codesign Keychain helper. Далее до отмены вывода не было.
Без отметок между операциями это не доказывает зависание именно codesign:
впереди также resource inventory, Bun node-host/installer build, notices,
manifest и archive roundtrip. CLI archive/static/offline этапы не достигнуты.
В build-time scripts добавляются phase diagnostics и ограниченный watchdog
для собственных процессов; production runtime не меняется.
