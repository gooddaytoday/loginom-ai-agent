# CI: сборка релизов и тесты GitHub Actions

[release.yml](../../../.github/workflows/release.yml) собирает Desktop и самостоятельный CLI из одного commit для Linux x64, Windows x64 и macOS arm64. Все три платформы, общие тесты и Linux Docker-матрица обязательны. Неполный релиз не создаётся.

Текущая интеграция: ветка `loginom`, версия 0.1.9. Полный выпуск прошёл CI, создан draft с 30 assets: [отчёт](reports/2026-09-22-proxy-release.md). Default branch репозитория остаётся `dev`; её настройка не меняется. С 0.1.9 удалён импорт системного прокси, как описано в [решении](../../superpowers/specs/2026-09-22-proxy-policy.md); native gates проверяют сохранение явного proxy environment, а unit gate дополнительно выполняет реальный Node HTTP/fetch/HTTPS CONNECT тест.

`test.yml` и `typecheck.yml` запускаются на push любой ветки (включая имена со слешами) и на PR в любую ветку. Отдельные Windows native checks запускаются на push любой ветки при изменении указанных в workflow путей. Push тега обслуживает `release.yml`, который включает общие тесты и typecheck как reusable gates; отдельные push-запуски тестов на тег не дублируются.

После merge `a6048e756` на GitHub был только успешный macOS candidate; полный набор не падал, а не запускался из-за прежних branch filters. Полная сборка новым annotated-тегом `v0.1.6` завершилась успешно: [CI report](reports/2026-09-21-ci-release/report.md). Создан draft с 30 assets; существующий `v0.1.5` остался на прежнем commit.

## Последний проверенный выпуск

[v0.1.14](https://github.com/gooddaytoday/loginom-ai-agent/releases/tag/v0.1.14)
опубликован как pre-release из `8b7ea1225d0ed095ea48b8816a6c80b04f0d0cdf`.
Полный [release run](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36016334443)
завершён успешно: native builds/общие проверки прошли на попытке 1, вся Linux-матрица
5/5 — на попытке 3 после восстановления Ubuntu mirror (libexpat HTTP 404).
Исходники и workflow между попытками не менялись; тег не перемещён.
Все 30 assets и SHA-256 проверены. Live-приёмка точного macOS ZIP и границы
Windows/Linux/CLI проверок описаны в [отчёте](reports/2026-09-24-endpoints-release.md).

## Запуск и публикация

- Push тега `vX.Y.Z`: версия должна совпадать с корневым и Desktop `package.json`; после успешных проверок создаётся **draft pre-release**.
- `workflow_dispatch`, `mode=candidate`: сборка выбранного ref без создания релиза. Артефакты хранятся 14 дней. Для 0.1.6 используется канал `prod`.
- `mode=cut`: только `main` или `dev`; `script/set-version.ts` синхронизирует manifests/lock, job коммитит версию и атомарно пушит ветку с annotated-тегом. Требуются GitHub App ID/secret. Альтернатива — вручную закоммитить версию, создать новый тег и отправить его; существующие теги не перемещать.
- Публикация draft — отдельное действие после проверки отчётов и явного разрешения пользователя. CI автоматически не публикует. Feed автообновления отключён.

Для workflow, уже выполнявшегося в репозитории, запуск выбранной ветки доступен через API/CLI:

```sh
gh workflow run release.yml --ref loginom -f mode=candidate -f channel=prod
gh run list --workflow release.yml --branch loginom
```

## Обязательные проверки

| Job            | Среда и проверки                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify`       | Сверка версии/канала; tag обязан соответствовать исходникам                                                                                                                                                                               |
| `tests`        | Reusable [test.yml](../../../.github/workflows/test.yml): workspace unit, Desktop и Playwright e2e на Ubuntu 24.04                                                                                                                        |
| `build`        | Ubuntu 24.04: DEB/AppImage/CLI, typecheck, source archive, release manifest, static verify обоих установщиков                                                                                                                             |
| `linux-matrix` | Установка DEB и offline non-root запуск: Ubuntu 22.04/24.04/26.04, Debian 12/13                                                                                                                                                           |
| `windows`      | Windows 2025 x64: native [build-windows.ps1](../../../script/build-windows.ps1), Desktop/App typecheck, packaging и settings tests, NSIS/unpacked verifier, проверка неподписанного установщика; CLI ZIP проверяется сборщиком            |
| `macos`        | macOS 15 arm64: [check-macos.ts](../../../packages/desktop/scripts/check-macos.ts), native [build-macos.ts](../../../packages/desktop/scripts/build-macos.ts), DMG/ZIP static verify, CLI archive verification, offline Desktop/CLI smoke |
| `release`      | Только push тега, только после успеха всех jobs: provenance/hash checks, SHA256SUMS, notes, draft pre-release                                                                                                                             |

Текущие inputs закрепляют Bun 1.3.14, Node 24.19.0 и Chromium 1246 (154.0.8037.0), Playwright MCP 0.0.82 / Playwright 1.64.0-alpha-1789764292000. [setup-loginom-inputs](../../../.github/actions/setup-loginom-inputs/action.yml) скачивает полную дистрибуцию Node и Playwright Chromium; staging дополнительно сверяет платформенные hashes и action catalog. Native resource pins не заменяются Linux-значениями. Новые Windows/macOS hashes измерены по официальным архивам; native acceptance нового комплекта ещё не выполнена. Прежняя platform/action-catalog acceptance на эти версии не переносится. См. [обновление Chromium 1246](chromium-1246.md).

Windows использует filtered hoisted install без сторонних install scripts, затем явно устанавливает Electron и настраивает node-pty. macOS использует проверенный native build entry с ограничением времени сборки CLI и очисткой дочерних процессов. Linux Docker runner снимает host AppArmor restriction для unprivileged user namespaces; sandbox Chromium внутри контейнера остаётся включённым.

Windows gate также запускает нативные DPAPI, proxy, installer/launcher, manifest и process tests. PowerShell изолирует поиск модулей внутри дочернего скрипта: задание одного `PSModulePath` в окружении не предотвращает его реконструкцию Windows PowerShell при старте. Ошибки чтения/шифрования не маскируются увеличением runtime timeout.

Проверки ACL/независимых профилей выполняются через `script/test-windows-profile.ps1` под одноразовым стандартным пользователем. GitHub Windows runners работают elevated и по умолчанию создают каталоги владельца Administrators, которые per-user профиль обязан отклонять. Скрипт разрешён только на GitHub-hosted runner, не наследует пользовательское окружение и удаляет созданную учётную запись после проверки. Рабочий CLI следует запускать от обычного пользователя; чужие или групповые владельцы существующего профиля не исправляются автоматически. Отдельный `windows-native-check.yml` повторяет нативные проверки на Windows 2022 и 2025.

## Артефакты

Каждый набор `loginom-linux`, `loginom-windows`, `loginom-macos` плоский. Имена платформенных manifests/source archives различаются и не перезаписывают друг друга при сборе релиза.

- Linux: DEB, AppImage, CLI TAR.GZ; `release-manifest.json`, `static-deb.json`, `static-appimage.json`, `linux-matrix.json`.
- Windows: NSIS EXE, CLI ZIP; `windows-release-manifest.json`, `static-nsis.json`.
- macOS: DMG, Desktop ZIP, CLI TAR.GZ; `macos-release-manifest.json`, `static-dmg.json`, `static-zip.json`, `macos-build-report.json`, `macos-source-checks.json`, `macos-offline-smoke.json`.
- Соответствующие архивы исходников и checksums. Общий `SHA256SUMS.txt` создаётся после окончательного сбора файлов.
- Raw CI logs не публикуются в GitHub Release. Рабочие токены Loginom и LLM в CI не передаются.

[release-notes.ts](../../../script/release-notes.ts) отклоняет отсутствующие обязательные ассеты, неполную/падающую Linux-матрицу, неуспешные native/static отчёты, несовпадение commit/version/clean-tree у manifests и несовпадение хешей описанных ими артефактов.

## Подпись и границы доказательств

Выпуск 0.1.5 — предварительный: Linux и Windows без подписи; собственный macOS-код ad-hoc signed, без Developer ID и notarization. Подписи комплектных vendor Node/Chromium сохраняются. Предупреждения Windows/macOS ожидаемы. Публикация не означает настройку доверенной подписи или автообновлений.

Native CI и offline smoke не заменяют установленную GUI-приёмку, DPAPI/Keychain и реальное подключение к Loginom/провайдеру на том же бинарнике. Исторические проверки закреплены за версиями/хешами в [отчётах](README.md); их нельзя переносить на новый commit автоматически.

Перед публикацией проверить успешный run, все платформенные ассеты, manifests и SHA256SUMS. Существующий release/draft не удалять автоматически: сначала проверить его принадлежность и состояние.

## Общие тесты

[test.yml](../../../.github/workflows/test.yml) запускается на push в `dev`/`main`, PR, dispatch и workflow_call. Все jobs на Ubuntu 24.04, `contents: read`.

- `unit`: frozen install, pinned inputs, `GITHUB_ACTIONS=false bun turbo test --continue --log-order=stream --concurrency=2`, generated-client check и HTTP API tests. Ограничение concurrency оставляет subprocess-тестам достаточно CPU.
- `desktop`: Bun tests, кроме `draft-store.test.ts`, использующего отсутствующий в Bun 1.3.14 `node:sqlite`.
- `e2e`: Node 24.15 и отдельный Playwright browser cache; отчёты выгружаются в workflow artifacts.
- [typecheck.yml](../../../.github/workflows/typecheck.yml): push/PR для `dev`/`main`, dispatch. Локально проверки типов и тесты запускать из каталогов пакетов.

Процессные Host-тесты требуют `LOGINOM_AI_AGENT_TEST_NODE` с абсолютным путём к pinned Node. Нативные проверки другой ОС помечаются skip, не PASS.

В HttpApi exerciser сводка сценариев выводится до закрытия ресурсов. При зависании
после `summary pass=208 fail=0` отметки `[httpapi-cleanup] BEGIN/END` показывают
закрытие приложений, каждого приложения по числовому индексу и временных путей.
`END exercise-scope` выводится после завершения всего scope, перед успешным выходом.
Ключи кеша с credentials в эти сообщения не попадают. Отметки не меняют порядок
очистки, таймауты или проверки; причина повторного зависания в PR #237 ещё не установлена.

## Оставшиеся ограничения

- Docker matrix пока использует prod install root. Теги с semver pre-release суффиксом выбирают beta и не проходят этот gate. Для 0.1.5 используется тег `v0.1.5` и отдельный флаг GitHub pre-release.
- Полный attribution/source/relinking audit и доверенные OS-подписи — отдельные работы; публикация фида v0.4.0 описана ниже.
- Ранние dry runs ветки `ci-release` имели необязательные Windows/macOS jobs на macos-15 и не доказывают состояние объединённой сборки. Этот контракт заменяет тот режим; результаты последующих runs фиксируются отдельно.

## Подписанный фид обновлений v0.4.0

Решение владельца `auto-update-design` зафиксировано в `LAB-801` (контракт в описании карточки LAB-801; общая часть LAB-801/802/803). Адрес фида задаёт **параметр сборки** `LOGINOM_AI_AGENT_UPDATE_FEED`, в Actions — одноимённая repository variable. Пустое значение отключает обновления в приложении; адреса upstream не используются. Desktop встраивает значение в main bundle, переменные окружения установленного приложения его не переопределяют. CI создаёт latest\*.yml и blockmap даже при пустом параметре: generic endpoint `updates.invalid` служит только для генерации ассетов, `--publish never` запрещает загрузку из electron-builder.

CI прикладывает `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, внешние `.blockmap` NSIS/ZIP/AppImage к GitHub release. AppImage дополнительно сохраняет встроенную blockmap electron-builder; внешний файл создаётся без изменения байтов AppImage. Эти файлы входят в `SHA256SUMS.txt` и release notes. Если macOS в CI пропущен, выпуск остаётся неполным для публикации общего трёхплатформенного фида.

Публикация — отдельная ручная операция владельца после проверки GitHub release. В CI нет приватных ключей подписи или S3 credentials. Требуются Bun 1.3.14, установленные зависимости репозитория, авторизованный `gh` и файл `~/.config/loginom-ai-agent/updates-s3.json` с правами 0600:

```json
{
  "endpoint": "https://s3.example.test",
  "bucket": "bucket-name",
  "access_key": "<access-key>",
  "secret_key": "<secret-key>"
}
```

`--feed-base` (или `LOGINOM_AI_AGENT_UPDATE_FEED`) — публичный HTTPS URL корня фида. Для path-style S3 URL каталог bucket удаляется из префикса ключа; для собственного домена оставшаяся часть URL задаёт префикс внутри bucket. Не добавляйте query, fragment или credentials в URL. Credentials и приватный Ed25519 PKCS8 PEM читаются из файлов и не выводятся. `--config` позволяет явно выбрать другой S3 config.

```sh
export LOGINOM_AI_AGENT_UPDATE_FEED=https://updates.example.test/
bun script/update-feed.ts publish --channel unstable --version 0.4.0 --from-release v0.4.0 --staging 25 --min-supported 0.3.9 --key /secure/update-key.pem
bun script/update-feed.ts status --channel unstable
bun script/update-feed.ts promote --to stable --version 0.4.0 --staging 25 --key /secure/update-key.pem
bun script/update-feed.ts stage --channel stable --percent 100 --key /secure/update-key.pem
bun script/update-feed.ts stage --channel stable --percent 0 --key /secure/update-key.pem
bun script/update-feed.ts status --channel stable
```

Успешная команда возвращает JSON, например:

```json
{
  "status": "PASS",
  "channel": "stable",
  "version": "0.4.0",
  "minSupportedVersion": "0.3.9",
  "stagingPercentage": 0,
  "signatures": 4,
  "files": 30
}
```

`publish` скачивает все ассеты GitHub release во временный каталог, требует SHA256 для каждого файла, сверяет SHA512/размеры desktop metadata, наличие blockmap и трёх архивов CLI. Затем загружает `unstable/<version>/…`, включая исходные metadata и SHA256SUMS, и только после этого — четыре указателя канала и их подписи. `--assets <directory>` вместо `--from-release` позволяет публиковать уже скачанный и проверенный комплект, в том числе тестовый. Версии строго `X.Y.Z`, без суффиксов. По умолчанию staging=100, minimum=версия выпуска; minimum задавайте явно, если поддерживается обновление более старых версий.

`promote` требует, чтобы указанная версия была текущей подписанной unstable: проверяет наличие файлов, серверно копирует каждый объект папки версии в stable без изменения байтов, затем публикует подписанные указатели stable. Minimum сохраняется; staging сохраняется, если не передан `--staging`. Существующие папки версии не перезаписываются. При неполной загрузке команда завершится ошибкой; владелец должен проверить и удалить только свой неполный префикс перед повтором. Повторный promote существующей версии запрещён; изменение rollout выполняется через `stage`.

В YAML `path` и `files[].url` относительны каналу: `<version>/<filename>`. Поля `minSupportedVersion` и `stagingPercentage` добавляются к данным electron-builder; stage=0 — стоп-кран desktop rollout. CLI сохраняет контракт `{version,minSupportedVersion,downloads:{linux-x64,win32-x64,darwin-arm64}}`, без дополнительного поля staging. `stage` переподписывает YAML и сохраняет точные байты cli.json. Подписи `<name>.sig` — base64 Ed25519 над точными байтами файла до парсинга. Общий Node-only export `@loginom-ai-agent/product/update-signature` доверяет любому из двух закреплённых ключей для ротации; потребители не должны доверять ключам из самого фида.

Metadata и `.sig` получают `Cache-Control: no-cache`; всё в папке версии — `public, max-age=31536000, immutable`. `status` проверяет подписи всех четырёх metadata, согласованность версий/minimum/staging, относительные пути, наличие всех файлов из SHA256SUMS, размеры desktop, CLI SHA256 и cache policies. Он не скачивает заново многогигабайтные бинарники: SHA256 проверяется перед публикацией. Замена metadata и подписи — последовательные S3 PUT: клиент должен отклонить временную несовпадающую пару и повторить проверку позже.

Тестирование с собственным ключом: `--public-key <test-public.pem>` явно заменяет доверенные ключи **только для административной команды**. Используйте его исключительно в `_test/<issue>/`, не для production. Приватный тестовый ключ также передаётся через `--key`. Никаких записей в корневые stable/unstable при проверке LAB-801.

```sh
(cd script && bun test ./update-feed.test.ts)
(cd packages/product && bun test test/update-signature.test.ts)
# Opt-in: создаёт synthetic транспортный выпуск, сохраняет его на S3;
# новую версию задают при повторе, immutable объект не перезаписывается.
(cd script && LOGINOM_UPDATE_S3_TEST_BASE="$TEST_FEED_BASE" LOGINOM_UPDATE_S3_TEST_VERSION=0.4.801 bun test ./update-feed.test.ts)
```

S3 integration test допускает только префикс `/_test/LAB-801/`, генерирует свой ключ, вызывает реальные команды publish/status/promote/stage, проверяет anonymous HTTPS, cache headers, Range 206 и побайтовое равенство копий. Тестовый public key лежит в `<channel>/<version>/test-public-key.pem`; приватный ключ удаляется после теста. Synthetic файлы помечены `TEST-ONLY.txt` и не являются устанавливаемыми приложениями. Это проверка транспорта и публикации; установленный updater проходит отдельную приёмку.
