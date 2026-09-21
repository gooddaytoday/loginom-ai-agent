# CI release: 2026-09-21

## Источник и запрос

Пользователь запросил test/typecheck на всех ветках и полную сборку всех платформ
с исправлением возникающих ошибок. Предыдущий merge a6048e756 не имел упавших
jobs: на push loginom запускался только успешный macOS candidate.

- Source: `ec399bdf7283f0c7e03aabf295a4db44346f4310`.
- Annotated tag: `v0.1.6`, tag object `87a716a4e76f6abc92a5d057f0814ebaa5feac28`.
- [Release run](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35584356107).
- [Branch tests](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35584355634).
- [Branch typecheck](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35584355646).
- [Windows native checks](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35584355614).

## Проверено до запуска

YAML parsing и filters: PASS. Push branches `["**"]` в test, typecheck и
Windows native checks; PR test/typecheck без ограничения base branch.
Версии root/Desktop/bun.lock: 0.1.6. `bun install --frozen-lockfile` и
`git diff --check`: PASS. Pre-push: 32 typecheck tasks PASS.
Коммит и тег отправлены атомарно; удалённые refs сверены. Старый v0.1.5 не менялся.

## Итог: PASS

Полный release run завершился `success`. Все десять обязательных jobs успешны:
verify, Linux/Windows/macOS builds, typecheck, unit, Desktop, e2e,
linux-matrix и release. `cut` штатно skipped: сборка запущена существующим тегом,
версия подготовлена и отправлена локально.

| Платформа | Desktop | CLI | Проверки |
| --- | --- | --- | --- |
| Linux x64 | DEB и AppImage | TAR.GZ | static PASS: 4668 ресурсов каждого установщика; CLI archive manifest PASS |
| Windows x64 | NSIS EXE | ZIP | static PASS: 4686 ресурсов; native host/profile и settings tests PASS |
| macOS arm64 | DMG и ZIP | TAR.GZ | static PASS: 4446 ресурсов; source checks и offline Desktop/CLI smoke PASS |

Linux Docker matrix: offline non-root запуск установленного DEB прошёл на
Ubuntu 22.04, 24.04, 26.04 и Debian 12, 13. Матрица не является проверкой CLI
на всех этих дистрибутивах.

Unit gate: 11 workspace tasks PASS, generated client check и HttpApi coverage,
auth, effect gates PASS. Отдельные branch unit/Desktop/e2e, typecheck и Windows
native checks на Windows 2022/2025 также прошли.

[Draft v0.1.6](https://github.com/gooddaytoday/loginom-ai-agent/releases/tag/untagged-b6a4114f81f3e106ee1f)
создан, `draft=true`, `prerelease=true`. Все 30 assets имеют ненулевой размер и
`state=uploaded`. GitHub SHA256 digest для 29 assets совпадает с release notes;
отдельный SHA256SUMS.txt присутствует. Все восемь Desktop/CLI установщиков и
архивов найдены. Для каждого CLI сверены версия 0.1.6, sourceCommit ec399bdf7,
sourceDirty=false и checksum из build log с опубликованными в draft metadata.

Release gate повторно проверил provenance всех трёх платформ, hashes, static
reports и связь Linux matrix с точным DEB перед созданием draft.
[Структурированные доказательства: jobs, artifacts, assets и hashes](verification.json).
Бинарные установщики повторно на локальную машину не скачивались и не запускались.
Исходные CI jobs не падали; исправление потребовалось только в branch triggers.

## Границы

Должны собраться Desktop и самостоятельный CLI: Linux x64, Windows x64,
macOS arm64. Нужны обязательные тесты, static verification, offline smoke и
Linux Docker matrix. CI не подтверждает installed live Loginom/provider
acceptance этого snapshot. Разрешён только draft-релиз; публичная публикация
и обновление пользовательских установок не выполняются.
