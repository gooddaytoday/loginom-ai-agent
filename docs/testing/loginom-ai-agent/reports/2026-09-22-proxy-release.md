# Возврат proxy environment OpenCode: выпуск 0.1.9

## Изменение

По запросу пользователя удалён автоматический импорт системного прокси
Windows/macOS/GNOME из Desktop и standalone CLI. Backend использует явные
`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`, как OpenCode; loopback bypass сохранён.
Chromium и внешний браузер авторизации используют собственные сетевые настройки.

[Причины и варианты дальнейшей реализации](../../../superpowers/specs/2026-09-22-proxy-policy.md).
[Проверка Windows startup defect](2026-09-22-windows-startup-verification.md).

Source: `5b77332ae4e65ec99c19e1330e70d097d2528e4b`, annotated tag `v0.1.9`.
Код и тег отправлены атомарно в `origin/loginom`.
[Release run](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35767862239).

## Локальные проверки

- Desktop, Agent, Host package typecheck: PASS.
- Desktop packaging/shutdown tests: 12 PASS, 2 platform skips.
- Host environment tests: 2 PASS.
- Реальный pinned Node 24.19 HTTP, fetch, HTTPS CONNECT, loopback bypass,
  отсутствие прямого fallback при отказе прокси: PASS.
- Исправленный subprocess CLI test: 1 PASS, 10 assertions на Windows
  при временном снятии Linux skip. Настоящая Linux-проверка выполняется в CI.
- В широком standalone-наборе четыре Windows-сбоя воспроизводились и с
  исходным кодом до изменения: provider management, bootstrap SIGINT,
  Ctrl+C metadata, credential-child cancellation. Они не объявлены PASS.

## Первый запуск

Тег `v0.1.8` сохранён на `975079f1d`; релиз для него не создан.
[Run](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35766268341)
выявил неверные ожидания нового CLI-теста: отсутствующий bundle возвращает
код 1 и JSON, а не код 2 и пустой stdout. Исправлены ожидания, runtime не менялся.
Отдельно Windows DPAPI roundtrip достиг существующего 15-секундного timeout;
следующий DPAPI test прошёл. macOS собрался и прошёл offline smoke, но GitHub
ArtifactService не принял загрузку после пяти сетевых таймаутов.
Проверки не отключались, DPAPI timeout не увеличивался.

## Итог CI

В первом attempt 0.1.9 прошли unit/HttpApi, typecheck, Desktop, e2e,
Linux/macOS builds и Linux Docker matrix. Новый proxy subprocess test прошёл
на Linux. Windows повторил timeout первого DPAPI-вызова; отдельный native
workflow того же source прошёл на Windows 2022 и 2025:
[native checks](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35767861348).
Повтор только упавшего Windows job и зависимого release gate завершился
успешно на неизменном source (attempt 2). DPAPI, Host/CLI, per-user profile,
NSIS static verification и загрузка Windows artifacts прошли.

**Итог: PASS.** Все обязательные release jobs успешны; `cut` штатно skipped.

| Платформа | Desktop | CLI |
| --- | --- | --- |
| Linux x64 | DEB, AppImage | TAR.GZ |
| Windows x64 | NSIS EXE | ZIP |
| macOS 14+ arm64 | DMG, ZIP | TAR.GZ |

[Draft pre-release v0.1.9](https://github.com/gooddaytoday/loginom-ai-agent/releases/tag/untagged-1a5784d779f0b23931b3)
содержит 30 uploaded assets ненулевого размера, включая восемь установщиков
и CLI-архивов. Проверены 29 SHA256 из release notes против GitHub asset digest;
затем скачаны SHA256SUMS и структурированные платформенные отчёты, их хеши
также сверены. SHA256SUMS соответствует всем остальным assets. Все три
release manifest имеют версию 0.1.9, один source commit и `dirty=false`;
описанные ими hashes совпадают с checksums. Static reports и macOS
source/build/offline reports имеют PASS. Linux matrix: Ubuntu 22.04/24.04/26.04,
Debian 12/13 — PASS для установленного DEB.

[Структурированная проверка](2026-09-22-proxy-release-verification.json).
Бинарники повторно локально не скачивались и не устанавливались. Draft
не опубликован; пользовательские установки не обновлялись.

## Границы

Native CI, static checks и offline smoke не заменяют проверку установленного
клиента на машине первоначального инцидента и live Loginom/provider acceptance.
Публикация draft и обновление пользовательских установок — отдельные действия.
Системный прокси, заданный только в ОС, больше не импортируется backend:
при необходимости proxy environment должен быть передан при запуске.
