# Windows: hotfix установки npm Codex

7 сентября 2026 опубликован **`0.1.0-rc.2-fix`**:
[GitHub Release](https://github.com/kartamyshev-dev/loginom-dock/releases/tag/loginom-dock%400.1.0-rc.2-fix).
Исходный commit: `487ada8e3bdfe99d827033a519d6be610c707d91`.
Ветка выпуска: `release/windows-npm-codex-rc2-fix`.

Выпуск основан на опубликованном `rc.2` (`a00ea54642bda9f2f8bbbe1a60a2a1054656fd69`).
Незавершённые изменения основного checkout не включены. Созданные этой задачей
временные GitHub Release, tag и ветка `rc.5` удалены после проверки замены
по явному запросу пользователя не занимать следующий номер RC. Старые `rc.1`
и `rc.2` сохранены. Опубликованные файлы `rc.2` не заменялись.

## Исправление

Прямой `spawnSync('codex', ['--version'])` не запускал npm `codex.cmd` на Windows
без отдельного EXE, а установщик выдавал ошибку несовместимой версии.
`codex-cli 0.153.2` удовлетворяет прежнему минимуму `0.149.1`; он не изменён.
Исходная Windows-сессия в этой задаче не воспроизводилась.

`client/lib/agent-command.mjs` выбирает абсолютный путь по PATH/PATHEXT/cwd
переданного окружения и сохраняет его для preflight, snapshot, регистрации,
удаления и восстановления. EXE/COM запускаются напрямую, CMD — через
`cross-spawn@7.0.6`; `which@2.0.2` разрешает путь. Эти версии уже присутствовали
в поставке транзитивно и теперь закреплены как прямые зависимости.
На POSIX прямой запуск сохранён. После отказа другой агент не выбирается.
Ошибки запуска ОС, exit/signal и неподдерживаемой версии разделены.
Окружение и аргументы регистрации в диагностике не печатаются.

## Выпуск и проверка

- Все три платформенных архива собраны на VPS с Node.js 24.19.0.
- 132 исходных файла сверены побайтно с чистым коммитом и после передачи на VPS.
- Все комплекты прошли `verifyBundle()`; 3948 записей на комплект.
- Архивы, INSTALL.md и SHA256SUMS скачаны из GitHub и сверены с отправленными.
- В Windows ZIP согласованы версии клиента, обоих плагинов и регистрации MCP.
- Живая Windows-приёмка и повтор полного набора **пропущены по явному решению
  пользователя**. Полная установка/переустановка/откат этого выпуска не проверены.

До выпуска целевые проверки патча на macOS/Node24.19.0 дали 10 PASS и
1 Windows-only SKIP. В полном наборе основного рабочего checkout были
371 PASS, 2 FAIL, 1 SKIP; оба отказа UI-тестов прошли отдельно. Изолированная
упаковка основного checkout дала 9 PASS и 1 FAIL в тесте native Table/journal.
Это результаты основного checkout, а не ветки hotfix; они не являются
успешной полной приёмкой выпуска. Windows SSH `192.168.1.48:22` был недоступен.

| Архив | Размер, байт | SHA-256 |
| --- | ---: | --- |
| `loginom-dock-0.1.0-rc.2-fix-darwin-arm64.tar.gz` | 46935092 | `872e8c25a0108635a4f9408b454bf252a28e5b80dacf22462ce8bfdd8d4c0f80` |
| `loginom-dock-0.1.0-rc.2-fix-linux-x64.tar.gz` | 52074209 | `c6df87bc7abaf546fb6e0e92bd221e9f640f5f51e44aafa44fad88d6b86956d3` |
| `loginom-dock-0.1.0-rc.2-fix-win32-x64.zip` | 44300908 | `f26ff67e2f8a29bdd7ba3459e59e85ba21f710edf9dcddd2b7c55c6b94dad906` |

## Развёрнутый лендинг

Публичный сайт `https://loginom-dock.duckdns.org/` показывает `0.1.0-rc.2-fix`.
Source commit лендинга: `f954967097832960863dd858185cb9c99972a762`.
Образ: `loginom-dock:landing-rc2-fix-f9549670`.
Image ID: `sha256:7718912a50c5975bb5d99e48e2af7ccce82338bda8b6fb0e9509386ebc84dcb1`.
SHA-256 HTML: `a80e9322aa1ae3f5d2f9da0dc139ac106186f0d7d978d381ca2b377a246d590b`.
HTTPS HTML и release.js сверены с этой сборкой и метаданными архивов.
Caddy config validated с production domain; пересоздан только Caddy.
Идентификатор и время старта API/MCP-контейнера до/после совпали.

Build/evidence на VPS: `/opt/loginom-dock/client-build/rc2-fix-487ada8e/`.
В `landing/` сохранены `image.name`, `image.id`, снимки API до/после,
`deploy.env.before` (временный rc.5) и `deploy.env.rc2-baseline` (исходный rc.2).
Для отката публичного сайта использовать **rc2-baseline**, поскольку публичный
выпуск rc.5 удалён; восстановить deploy.env и пересоздать только Caddy точным
Compose из operations.md. API, модели, credentials и TLS-тома не менялись.

`/opt/loginom-dock/current` остаётся на `20260904-landing-7b711846`; его исходные
caddy-image.* описывают старое развёртывание. Актуальный образ определяется
production deploy.env/контейнером и новым `client-build/.../landing/image.*`.
Локальные доказательства: `.dock/releases/windows-hotfix/rc2-fix/`.
