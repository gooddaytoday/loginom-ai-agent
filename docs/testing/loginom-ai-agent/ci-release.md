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
| `macos`        | macOS 14 arm64: [check-macos.ts](../../../packages/desktop/scripts/check-macos.ts), native [build-macos.ts](../../../packages/desktop/scripts/build-macos.ts), DMG/ZIP static verify, CLI archive verification, offline Desktop/CLI smoke |
| `release`      | Только push тега, только после успеха всех jobs: provenance/hash checks, SHA256SUMS, notes, draft pre-release                                                                                                                             |

Все платформы используют Bun 1.3.14, Node 24.19.0 и Chromium 1243 из закреплённых inputs. [setup-loginom-inputs](../../../.github/actions/setup-loginom-inputs/action.yml) скачивает полную дистрибуцию Node и Playwright Chromium; staging дополнительно сверяет платформенные hashes и action catalog. Native resource pins не заменяются Linux-значениями.

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

## Оставшиеся ограничения

- Docker matrix пока использует prod install root. Теги с semver pre-release суффиксом выбирают beta и не проходят этот gate. Для 0.1.5 используется тег `v0.1.5` и отдельный флаг GitHub pre-release.
- Полный attribution/source/relinking audit, доверенные подписи и публичный update feed — отдельные работы.
- Ранние dry runs ветки `ci-release` имели необязательные Windows/macOS jobs на macos-15 и не доказывают состояние объединённой сборки. Этот контракт заменяет тот режим; результаты последующих runs фиксируются отдельно.
