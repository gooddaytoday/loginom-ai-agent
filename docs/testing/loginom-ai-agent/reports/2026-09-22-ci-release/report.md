# Выпуск 0.1.7 — 2026-09-22

Статус: **PASS, опубликован pre-release [v0.1.7](https://github.com/gooddaytoday/loginom-ai-agent/releases/tag/v0.1.7)**.
Публикация: 2026-09-22 10:10:40 UTC; 30 assets, draft=false, prerelease=true.
Пользователь разрешил push в `loginom`, новый релиз и сборки всех поддерживаемых платформ.

## История и изменения

Локальная ветка `4b8c4f51e` (36 новых коммитов) объединена с удалённой
`108803cd98bdcce93c7c9c137f1fce70ab9c7574` (5 новых коммитов)
merge-коммитом `bacf27ebf`. Переписывания истории не было. Единственный конфликт
в canonical checkpoint разрешён сохранением обеих исторических записей.
Сохранены исправления runtime/Host/recovery, CLI `recover --acknowledge ids`,
Loginom AI wordmark и новые платформенные иконки. В source-transforms добавлено
объяснение изменённого favicon импортированного сайта; upstream map сохранён.
Версии root/Desktop и lockfile согласованы на 0.1.7.

## Локальные проверки объединённых исходников

Bun 1.3.14, Node 24.19.0, macOS arm64:

- Desktop: 140 PASS / 3 platform SKIP / 0 FAIL; draft-store исключён,
  поскольку Bun не предоставляет используемый Electron `node:sqlite`.
- Product: 4 PASS; CLI status/management: 4 PASS; TUI presentation: 1 PASS;
  UI wordmark animation: 13 PASS.
- Typecheck product/agent/app/desktop/ui/tui: PASS.
- Source attribution: 5045 файлов PASS; `git diff --check`: PASS.
- Полный runtime suite: 2315 PASS / 2 Windows SKIP / 0 FAIL (136.8 s).
- Frozen install: PASS после восстановления единственной зависимости
  `@solidjs/start` с исходного HTTPS URL через независимый DNS-адрес.
  Сертификат и SHA-512 из lockfile проверены; TLS не отключался,
  lockfile/dependency versions не менялись. Причина первичного сбоя —
  ошибочный локальный DNS-ответ (`ERR_TLS_CERT_ALTNAME_INVALID`).

## Релизный CI

- Commit: `34c7bc9439d9fb6c124d46cf69266c82e667932a`.
- Annotated tag `v0.1.7` и ветка отправлены атомарно. Pre-push: 32/32 typecheck tasks PASS.
- [Release run](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35711281665).
- Linux и Windows builds/static/native checks PASS. Загруженные локально артефакты
  сверены с манифестами и checksum; source commit/version/clean tree совпадают.
- Unit/API/generated client, Desktop, e2e и typecheck PASS.
- Linux matrix: Ubuntu22/24/26, Debian12/13 PASS, offline non-root installed DEB;
  hash DEB совпадает со скачанным артефактом.
- Первая macOS-попытка зависла после `EPERM` при завершении группы процессов
  в `build-command.test.ts`. Остальные обязательные jobs к тому времени прошли.
  Попытка отменена, после изучения журнала запущены только failed/cancelled jobs.
  Тег и исходники не менялись. Во второй попытке source checks, сборка, static
  verification и offline Desktop/CLI smoke прошли. Причина нестабильности теста не исправлялась и не считается
  доказанной регрессией продукта; успешен и отдельный branch macOS run
  [35711245339](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35711245339).

## Результат и опубликованные файлы

Все десять обязательных jobs завершились success. `cut` штатно skipped.

| Платформа | Desktop | CLI | Проверки |
| --- | --- | --- | --- |
| Linux x64 | DEB, AppImage | TAR.GZ | 4668 resources каждого установщика, offline installed DEB matrix 5/5 |
| Windows x64 | NSIS EXE | ZIP | 4686 resources, native Host/CLI и settings regression |
| macOS 14+ arm64 | DMG, ZIP | TAR.GZ | 4446 resources, source checks, static и offline Desktop/CLI smoke |

Все восемь дистрибутивов и соответствующие исходники скачаны из CI.
Для 29 файлов сверены локальная SHA256, опубликованный SHA256SUMS и GitHub
asset digest; для самого SHA256SUMS отдельно проверен digest. Три platform
manifest подтвердили commit/version/clean tree, три внутренних CLI manifest —
sourceCommit/version/sourceDirty=false. Обязательные отчёты PASS, Linux matrix
привязана к точному DEB. Независимый повтор `release-notes.ts` PASS; полученные
SHA256SUMS побайтово совпали с опубликованными.

Скачанный macOS ZIP дополнительно проверен локальным `verify-artifact.ts`:
4446 ресурсов, собственная ad-hoc подпись и vendor signatures PASS. Приложение
при этой проверке не запускалось. После публикации повторно сверены все
30 assets, их размеры/digests, draft=false и prerelease=true.
[Структурированные результаты и hashes](verification.json).

## Границы приёмки

Предыдущая установленная macOS-сборка `0.1.7-local.20260922.6` из `361b13682`
прошла 10/10 description/dataset сценариев в пять клиентов. Это историческое
свидетельство исправлений, не installed live acceptance будущих CI-артефактов.
[Отчёт](../../description-dataset-debugging-results.md).

Выпуск включает Desktop и standalone CLI для Linux x64, Windows x64 и
macOS arm64, все обязательные CI gates, provenance и SHA256SUMS. Сохранён
формат pre-release предыдущих версий. Linux/Windows unsigned, собственный код
macOS ad-hoc signed без notarization; пользовательские установки не заменяются.
