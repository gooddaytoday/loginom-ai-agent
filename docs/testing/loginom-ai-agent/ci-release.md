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

Desktop проверяет GitHub Releases, затем запасной S3 cloud.ru. Stable выбирает обычный опубликованный GitHub release (`releases/latest`), unstable — более новая версия из последнего stable и последнего опубликованного pre-release. Для списка pre-release используются страницы по 5 выпусков (не больше 10 страниц); stable читается через `releases/latest`. API URL нормализуется без завершающего `/`, включая запросы с query. Флаг pre-release относится к GitHub Release; версия метаданных остаётся `X.Y.Z`, тег — `vX.Y.Z`. Semver-теги с суффиксом пока ограничены существующим beta/Docker gate.

Используется `provider: "custom"` через поддерживаемый electron-updater `updateProvider` hook: проверенный снимок метаданных передаётся GenericProvider без повторного чтения unsigned YAML. GitHub хранит ассеты плоско, закрытый S3 — по версии. Для S3 provider формирует presigned SigV4 GET отдельно для channel metadata, `.sig` и каждого артефакта; артефакт подписывается при разрешении URL перед загрузкой, срок ссылки — 1 час. В режиме уведомления в состояние передаётся URL без подписи; новая presigned ссылка создаётся при нажатии «Скачать» как в native dialog, так и через renderer open-external. Используются только virtual-hosted URL `updates-loginom.s3.cloud.ru`, region `ru-central-1` и read-only ключ. Подпись запроса реализована Node crypto по [AWS SigV4 query authentication](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html), сверена с опубликованным test vector и независимой проверкой canonical request на локальном сервере. Секретная часть ключа не входит в URL; query с credential/signature удаляется из updater logs и сообщений ошибок. Все запросы выполняются текущей Electron session, поэтому proxy сохраняется. Подпись Ed25519 над точными байтами YAML и SHA-512 бинарников одинаковы для обоих источников. Доверие остаётся в `UPDATE_PUBLIC_KEYS`; ключ из фида не принимается. Дифференциальная загрузка отключена, `allowDowngrade=false` устанавливается при каждой конфигурации и загрузке.

Fallback разрешён только для DNS/соединения/тайм-аута, HTTP 5xx, 403 и 429. GitHub с версией не выше установленной, отсутствующим latest release или отсутствующими платформенными `latest*.yml`/`.sig` (404) возвращает «обновлений нет» без S3. Ошибка подписи, YAML, путей, сертификата, несогласованная версия и 401 остаются ошибками без S3. Транспортные ошибки прокси `ERR_TUNNEL_CONNECTION_FAILED`, `ERR_PROXY_CONNECTION_FAILED`, `ERR_SOCKS_CONNECTION_FAILED` разрешают fallback с сохранением proxy-session. На один источник отводится 30 секунд на API, metadata и signature вместе; при недоступности обоих возвращается `LOGINOM_UPDATE_SOURCES_UNAVAILABLE`. Версия ниже установленной отклоняется с `LOGINOM_UPDATE_VERSION_OLDER`. Если отказал сам GitHub download, перед повтором на S3 проверяются подпись и полное совпадение подписанного target. Повреждённый SHA-512 не разрешает fallback.

Артефакт скачивается из источника проверенных метаданных. Смена источника требует новой проверки; смешивать YAML одного источника с бинарником другого нельзя. Проверка identity и подписанных полей сохраняется на границе download. Proxy/session и credentials прокси применяются, как прежде. Системный `policy.json` не меняет формат: `feedUrl` полностью заменяет оба встроенных источника, `updates=off` отключает проверку, `channel` фиксирует stable/unstable. Старый подписанный путь `<version>/<filename>` поддержан для административного feedUrl.

### Настройка владельцем

Repository variables (адреса — параметры сборки, runtime environment их не заменяет):

| Variable                                  | Значение                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `LOGINOM_AI_AGENT_UPDATE_GITHUB_API`      | `https://api.github.com/repos/gooddaytoday/loginom-ai-agent/releases` |
| `LOGINOM_AI_AGENT_UPDATE_GITHUB_DOWNLOAD` | `https://github.com/gooddaytoday/loginom-ai-agent/releases/download/` |
| `LOGINOM_AI_AGENT_UPDATE_FEED`            | `https://updates-loginom.s3.cloud.ru/`                                |
| `LOGINOM_UPDATES_S3_ENDPOINT`             | `https://s3.cloud.ru`                                                 |
| `LOGINOM_UPDATES_S3_REGION`               | `ru-central-1`                                                        |
| `LOGINOM_UPDATES_S3_BUCKET`               | `updates-loginom`                                                     |
| `LOGINOM_UPDATES_MIN_SUPPORTED_VERSION`   | Минимальная поддерживаемая `X.Y.Z`; если пусто, версия выпуска        |
| `LOGINOM_UPDATES_FEEDS_OFF`               | Только строка `true` явно отключает фиды в сборке тега                |
| `LOGINOM_UPDATES_VERIFIED_SHA`            | Полный SHA финальной головы после приёмки подписи                     |

`LOGINOM_UPDATES_VERIFIED_SHA` задаёт принятый исходный commit. Фид включается на нём или на теге единственного дочернего коммита повышения версии: diff допускает только `package.json`, `packages/desktop/package.json`, `bun.lock`; в manifests меняется только `version`, в lock — только версия workspace Desktop. Версии должны совпадать с тегом. Изменение scripts/dependencies, посторонний файл, merge commit или непрямой предок права включить фид не дают. Это поддерживает штатный `cut` после приёмки родительской головы.

`vars.LOGINOM_UPDATES_FEEDS_OFF=true` — единственный явный способ собрать тег с выключенными фидами. Без него непроверенный тег, отсутствующие или некорректные GitHub endpoints завершают `verify` ошибкой; тихой успешной сборки тега без фида нет. Endpoints проверяются после удаления пробелов по краям: только HTTPS, без credentials, query и fragment; это относится и к заданному `LOGINOM_AI_AGENT_UPDATE_FEED`. Непроверенные branch/candidate сборки остаются с отключённым фидом. Окончательное разрешение вычисляет шаг `release-config` после проверки версии; все три native build job берут его output. Если разрешён GitHub, а `LOGINOM_AI_AGENT_UPDATE_FEED` не задан, адрес S3 выводится из встроенных endpoint/bucket. `--publish never` сохраняется; `updates.invalid` нужен только для генерации metadata.

Задачи `release` (подпись YAML) и `mirror-updates` (запись S3) используют **Environment `release`**. Владелец настраивает для него обязательного ревьюера и хранит ключ подписи и ключ записи S3 только в секретах окружения. Если окружения ещё нет, GitHub создаст его при первом запуске; обязательного ревьюера нужно настроить до выдачи ключа подписи. Ключ чтения остаётся на уровне репозитория для каждой сборки Desktop.

| Secret                                | Где хранить                  | Назначение                                                                              |
| ------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `LOGINOM_UPDATES_SIGNING_KEY`         | Только Environment `release` | Ed25519 PKCS8 PEM, соответствующий одному из `UPDATE_PUBLIC_KEYS`; только подпись draft |
| `LOGINOM_UPDATES_S3_WRITE_ACCESS_KEY` | Только Environment `release` | Ключ записи в формате `<tenant_id>:<key_id>`, только шаг mirror                         |
| `LOGINOM_UPDATES_S3_WRITE_SECRET_KEY` | Только Environment `release` | Секрет ключа записи, только шаг mirror                                                  |
| `LOGINOM_UPDATES_S3_READ_ACCESS_KEY`  | Repository secrets           | Access Key чтения в формате `<tenant_id>:<key_id>`; ресурсы Desktop и проверка зеркала  |
| `LOGINOM_UPDATES_S3_READ_SECRET_KEY`  | Repository secrets           | Secret Key чтения; ресурсы Desktop и проверка зеркала                                   |

Новые имена WRITE намеренно не совпадают с прежними repository-секретами. Все три критичных секрета должны существовать **только в Environment `release`**; при отсутствии любого из них шаг подписи/записи завершается с сообщением, называющим недостающий секрет. Одноимённые repository-копии не создавать; прежние repository write-секреты больше не читаются кодом и должны быть удалены владельцем.

До помещения ключей владелец настраивает в GitHub:

1. Tag ruleset для `v*`: ограничить создание доверенными release-акторами, запретить обновление и удаление тега; право `cut` дать только доверенному release App/владельцу.
2. Environment `release` → Deployment branches and tags → **Selected branches and tags**, правило типа **tag** с шаблоном `v*`; branch deployment rules не добавлять.
3. Required reviewers окружения: обязательный доверенный ревьюер, Prevent self-review; перед одобрением сверять SHA, источник workflow и разрешённый version-only diff. Приватный Ed25519 ключ и WRITE-пара размещаются только после настройки защиты.

Документация: [tag rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [deployment policies и reviewers](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

`bundle-loginom.ts` сохраняет endpoint/region/bucket и **только ключ чтения** в `resources/updates-s3.json`; electron-builder переносит его в корень resources приложения. Ресурс исключён из git и исходного архива. Ключ записи и Ed25519 private key в приложение не попадают. При сборке без read credentials предыдущий ресурс удаляется; неполная пара — ошибка. Main process читает ресурс, runtime environment не заменяет его. `policy.json feedUrl` сохраняет прежний generic override без доступа к встроенному S3 ключу.

Рабочих ключей нет в git или выводе команд; ключ чтения намеренно присутствует в устанавливаемом Desktop, как MCP key. Бакет остаётся **закрытым**: анонимный GET возвращает 403. Публичный доступ не требуется. SDK загрузки тоже использует virtual-hosted адресацию (`forcePathStyle=false`); path-style для этого бакета непригоден. Регион и формат ключа соответствуют [настройке cloud.ru](https://cloud.ru/docs/s3e/ug/topics/tools__aws-cli). У ключа чтения нет права записи; mirror не меняет bucket policy и не удаляет объекты. Secrets маскируются, `set -x` отсутствует. Timeweb не используется.

### Порядок CI и публикации

1. Tag-run выполняет все существующие platform/static/unit/typecheck/Docker gates. Job `release` сначала проверяет provenance и SHA256SUMS. `sign-release` проверяет SHA-512/size, добавляет minimum/staging=100 и пути `releases/<version>/<filename>`, подписывает exact bytes. Проверка ключа выполняется до изменения файлов. Подпись выполняется отдельным шагом без release-notes; AWS/S3 SDK импортируется динамически только при обращении к S3. SHA256SUMS и release notes пересоздаются следующим шагом без приватного ключа в его окружении. Подписанные YAML и `.sig` входят в GitHub draft вместе с исходными бинарниками и отчётами.
2. Владелец проверяет draft и публикует его с нужным флагом pre-release. CI не публикует draft автоматически. События [published/released](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release) запускают отдельный `mirror-updates`; это покрывает публикацию и перевод pre-release в обычный release.
3. Mirror работает только на tag ref. До обращения к S3 он требует успешный `release.yml` push-run на том же полном SHA и том же теге. Проверяет скачанный комплект, SHA256SUMS, подписи всех Desktop YAML и SHA-512/size каждого desktop asset. Загружает те же байты в immutable `releases/<version>/…`, затем серверно копирует YAML/`.sig` в канал, соответствующий текущему флагу release. Повтор разрешён только при побайтовом совпадении существующих immutable объектов; несовпадение — ошибка. Удалений нет. Workflow и mirror используют группу на тег с `cancel-in-progress=false`, `queue: max`: ожидающие запуски не заменяют друг друга (лимит GitHub — 100 pending). [GitHub concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).
4. `verify-public` заново скачивает metadata, подписи и desktop binaries: GitHub — публично, S3 — через presigned SigV4 GET ключом чтения (отдельным от writer). Название команды сохранено для совместимости; анонимного доступа к S3 она не требует. Проверяет подпись, равенство YAML опубликованному комплекту и SHA-512. Ошибка делает job красным; не включать фид и не считать выпуск принятым до разбора.

Раскладка cloud.ru:

```text
releases/0.4.0/<все ассеты GitHub release>
releases/0.4.0/latest.yml + .sig
releases/0.4.0/latest-linux.yml + .sig
releases/0.4.0/latest-mac.yml + .sig  # если macOS собран
releases/0.4.0/SHA256SUMS.txt
unstable/latest*.yml + .sig         # опубликованный pre-release
stable/latest*.yml + .sig           # обычный release
```

В подписанном YAML `path` и `files[].url` — `releases/<version>/<filename>`. На S3 разрешение идёт от корня бакета, на GitHub — имя файла в ассетах выбранного тега. Каталог версии имеет `Cache-Control: public, max-age=31536000, immutable`; указатели канала — `no-cache`. При переводе в stable бинарники остаются на месте, metadata копируются на сервере из immutable выпуска без переподписи. До записи и повторно перед copy проверяется подписанная текущая версия: меньшая версия отклоняется. CopyObject получает precondition назначения `If-Match`/`If-None-Match` для YAML и `.sig`; конкурентная смена ETag завершает job отказом, не затирая новый указатель. Поддержка conditional CopyObject входит в отдельную живую приёмку cloud.ru. Только явный `mirror-release --allow-rollback` в отдельно одобренном административном запуске разрешает откат; штатный CI его не передаёт. Прерванный copy той же самой проверенной metadata можно возобновить. YAML и `.sig` копируются последовательно: временно несовпадающая пара отклоняется клиентом.

Команды для повторной проверки опубликованного комплекта (без записи, после задания перечисленных S3 vars и read secrets в окружении; значения не выводить):

```sh
gh release download v0.4.0 --dir ./release-assets
bun script/update-feed.ts verify-public --assets ./release-assets --version 0.4.0 --channel stable --feed-base https://updates-loginom.s3.cloud.ru/ --github-base https://github.com/gooddaytoday/loginom-ai-agent/releases/download/v0.4.0/
```

`sign-release` вызывается только при подготовке draft; `mirror-release --assets … --version … --channel stable|unstable` читает S3 endpoint/bucket/credentials из перечисленных env или явного `--config`. Старые `publish/promote/stage/status` изолированы обязательным флагом `--legacy` и сохранены для отдельного legacy-фида `<channel>/<version>/…`; к новой раскладке Desktop их не применять. CLI updater остаётся на своём прежнем контракте; CLI-архивы зеркалируются как release assets, новый CLI channel pointer не создаётся.

### Проверки и границы приёмки

```sh
(cd packages/desktop && nice -n 19 bun test src/main/update-sources.test.ts src/main/update-policy.test.ts src/main/updater-controller.test.ts)
(cd packages/desktop && nice -n 19 bun test --path-ignore-patterns=src/main/draft-store.test.ts)
(cd packages/script && bun run typecheck:update-feed)
(cd packages/desktop && nice -n 19 bun typecheck)
(cd packages/product && nice -n 19 bun test)
(cd script && nice -n 19 bun test ./update-feed.test.ts)
```

Тестовый HTTP-сервер исполняет оба транспорта без внешних credentials; test-only Ed25519 key передаётся только тестовым вызовам. Проверяются fallback при timeout/5xx/429/403, отказ fallback при плохой подписи/metadata/старой версии, недоступность обоих источников, pin артефакта, download failover, policy override, byte-identical mirror и server-side promotion. Закрытый локальный S3 проверяет SigV4 canonical request/host/region/expiry, отклоняет anonymous/tampered/wrong-key GET и принимает подписанные metadata/артефакт после отказа GitHub. Дополнительно проверяются AWS test vector, virtual-hosted SDK, read-only build resource и очистка stale credentials. Локальные тесты не доказывают доступ к реальному cloud.ru и установленный AppImage/NSIS upgrade: после выдачи отдельного тестового ключа нужна приёмка на изолированном префиксе и финальном SHA, затем проверка установленного приложения.

`queue: max` поддерживается GitHub, но ещё отсутствует в schema actionlint 1.7.12 (проверена также upstream main `011a6d15e749bb3f2d771eed9c7aa0e7e3e10ee7`). Для этой версии применяется только узкое исключение: `actionlint -ignore 'unexpected key "queue" for "concurrency" section' .github/workflows/release.yml`; значение `max` и запрет отмены отдельно проверяются unit-тестом workflow. Другие ошибки lint не исключаются.
