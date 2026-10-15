# Desktop с обработчиком JavaScript — установка 2026-10-05

**Установлена локальная production-сборка `0.1.17-local.20261005.javascript.0d884d197`** в
`/opt/loginom-ai-agent`; системная команда — `/usr/bin/loginom-ai-agent`.
Debian version: `0.1.17~local.20261005.javascript.0d884d197`.
Она заменила установленный Desktop 0.1.17. Пакет имеет `install ok installed`.
Работающее пользовательское приложение не завершалось; для применения новой
сборки его нужно полностью закрыть и открыть заново. Пользовательский профиль,
настройки, авторизация и история не очищались и не переносились.

## Точные исходники и воспроизведение

Рабочая ветка `javascript-fixes`, исходный HEAD `073117b290a66d9201840e532e51bc8faf5a337c`.
Все37 незакоммиченных файлов, включая новые файлы, перенесены побайтово в
отдельную build-копию. Snapshot commit: `0d884d1977396e8dfa296291a57dffccb25647fc`.
Commit сделан только в отдельном clone, рабочая ветка и её незакоммиченные
исправления остались без изменений. После установки хеши всех37 файлов сверены
повторно. Исходный архив содержит точные build inputs snapshot, а не исходный
HEAD без исправлений. `release-manifest.json` создан штатным инструментом из
чистого snapshot; provenance5045 файлов PASS.

Сборка изолирована в `/tmp/loginom-javascript-desktop-ni9xnuy4/source`.
Воспроизводящие параметры: Bun1.3.14, `bun install --frozen-lockfile`,
`LOGINOM_AI_AGENT_CHANNEL=prod`, `LOGINOM_AI_AGENT_VERSION=0.1.17-local.20261005.javascript.0d884d197`,
полный Node24.19.0 и каталог Chromium1246 передаются через
`LOGINOM_AI_AGENT_NODE_SOURCE` и `LOGINOM_AI_AGENT_BROWSER_SOURCE`.
Из `packages/desktop`: `bun run build`, затем
`bun run package:linux --x64 --publish never --config.directories.output=<новый каталог>`.
Для основного Vite build использовался `NODE_OPTIONS=--max-old-space-size=6144`.

Node SHA-256: `24.19.0` / `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`.
Chromium SHA-256: `1e0652a37f41d22ca22066c40896398cb7acce71f2746028061064369b299ab9`.
Фактические версии: Electron42.3.3,
Playwright1.64.0-alpha-1789764292000, MCP0.0.82,
Chromium154.0.8037.0 revision1246.

## Артефакты и проверка

Артефакты, исходный архив, manifests, JSON-отчёты и логи сохранены в
`packages/desktop/dist/0.1.17-local.20261005.javascript.0d884d197/` (ignored build output).

| Артефакт | SHA-256 |
| --- | --- |
| loginom-ai-agent-0.1.17-local.20261005.javascript.0d884d197-source.tar.gz | `05048216e3b74c674115e9f754436ae097b0ead53784c161a4c06918c6a1529d` |
| loginom-ai-agent-linux-amd64.deb | `9c4f0490bd7a5b07441f5a502bd332183f6dba71c1a1a0bfd05a9c8be60d43b9` |
| loginom-ai-agent-linux-x86_64.AppImage | `647470a94262bcdcae6f9d4528910cdc800c02ec454b3bb5d64c9e7903de0b5d` |

- Desktop typecheck: PASS.
- Desktop connection/packaging tests:48 PASS,1 предусмотренный SKIP,0 FAIL.
- JavaScript:199 тестов PASS; MCP bridge wrapper дополнительно проверил все38
  Save/shutdown сценариев, включая null-ID регрессии обеих Save-команд.
- Stage:278 файлов `client/lib` и `src` побайтово совпали с build snapshot.
- DEB и AppImage: штатная static verification PASS,4455 ресурсов каждый;
  версии, install root, launcher, ссылки и публичные права проверены.
- GUI smoke собранного и установленного приложения: PASS под Xvfb в отдельном
  временном профиле;4 поля подключения, штатные defaults, пустые секреты,
  отсутствие password placeholder и доступная кнопка сохранения.
- Crash/logging probe на упакованном приложении: PASS для backend log routing,
  ошибок, отказа initialization, unexpected exit, native crash, clean exit и100MB budget.
- Установленные resources:4455/4455 PASS; ASAR совпал с проверенным unpacked
  artifact: `366b4b917dbb5efc0fb4d1e6da7b420002d5272461466dad1c9775282388496f`. Desktop entry Name/Exec и системная ссылка PASS.
- Установленный Chromium запущен headed под Xvfb с sandbox и `--no-proxy-server`;
  runtime version154.0.8037.0, локальная страница PASS. Командная строка проверена
  через `chrome://version`, без `--no-sandbox` и `--disable-setuid-sandbox`.
  Первоначальная CDP diagnostic probe не поддерживала Browser.getBrowserCommandLine
  без enable-automation; заменена наблюдением стандартной страницы версии.

## Границы результата

Это неподписанный локальный кандидат, не опубликованный release. Исправленный
обработчик JavaScript включён в установленный runtime и проверен исходниками,
ресурсами и regression fixtures. Новый автономный или ручной JavaScript-сценарий
в живом Loginom на установленном Desktop не выполнялся. Авторизованная
GUI check/save и cold execution, Docker matrix, физический GPU/Wayland,
Windows/macOS native acceptance в этой установке не проверялись.
Исторические JavaScript acceptance результаты не объявляются проверкой нового
артефакта. Пользовательская рабочая ветка не коммитилась и не отправлялась.

## Обновление каталога OpenAI — 2026-10-05

По отдельной команде пользователя обновлён OpenAI-раздел рабочего кэша
`~/.cache/loginom-ai-agent/models.json` из штатного источника
`https://models.opencode.ai/api.json`. Другие провайдеры сохранены, запись
атомарная, предыдущий файл сохранён как `models.json.backup-20261005-142624`.
На момент обновления раздел уже совпадал с источником: 53 записи OpenAI.
Повторное получение подтвердило актуальность каталога. Встроенный снимок
`packages/product/models.json` и установленный артефакт не изменялись:
backend предпочитает рабочий кэш встроенному снимку.

Проверено именно установленное приложение `/usr/bin/loginom-ai-agent` под
Xvfb, с копией обновлённого кэша в отдельном временном профиле и фиктивной
OAuth-записью. Штатный `/provider` вернул подключённый OpenAI и 23 записи
после OAuth-фильтрации, включая `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`,
`gpt-6-astra` и их fast-варианты. PASS. Реальные credentials не использованы,
генерация ответов и доступность моделей для аккаунта не проверялись.
Для уже открытого пользовательского Desktop требуется полный перезапуск,
чтобы перечитать каталог. Пользовательский процесс не завершался.
