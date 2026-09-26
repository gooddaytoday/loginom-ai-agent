# JavaScript: checkpoint исполнения

Дата: 2026-09-26. Фаза **0A, подготовка продолжается**. Пользователь назначил
исполнение [плана](plan.md), адаптацию под Ubuntu и только headed-браузеры.
Разработка handler, discovery 0B, ревью реализации и CLI-приёмка ещё не начаты.

## Изоляция и владельцы

- campaign: `javascript-20260926-ubuntu`, mode `single`, единственный узел
  `component.programming.JavaScript`; attempt реализации/CLI ещё не создан.
- Координатор: task `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`, основной checkout
  `/home/george/git/loginom-ai-agent`, ветка `javascript`.
- Создан постоянный worktree
  `/home/george/git/loginom-ai-agent/.worktrees/node-javascript`, ветка
  `node-javascript`, чистый HEAD/base
  `a8ad59766dbdb4f2da0b54367a755ce00891dd71` (`loginom`).
- Задача разработчика/её bootstrap **не созданы**; регистрация памяти не активна.
  Это намеренно сохраняет HEAD==base для fresh-enrollment helper.
- Исходный согласованный docs source:
  `086cad12c3` (перед исполнением); дополнения Ubuntu находятся в этом checkpoint
  и соседнем плане. Перед переносом закрепить полный SHA docs-коммита этих файлов.
  Координаторские изменения memory kit — отдельный
  `01cc4dc86392cf3e8820780fc8cc68b6e9a22985`; они не меняют product base.
  Переносить только явно выбранные docs-only commits после допуска памяти.
- Приватный общий журнал:
  `~/.local/state/loginom-ai-agent/node-development/host-resources.json`, owner —
  текущая задача; создан под атомарным `registry.lock` после проверки списка задач
  приложения и процессов. Других активных Loginom-задач в полученном списке нет;
  существующие Chrome-процессы не присваивались и не изменялись.
- Кампания: `~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/campaign.json`.
  Lease `javascript-20260926-ubuntu-preparation`; CLI slot не занят,
  `acceptance.lock` не создавался. Общий lock записи освобождён.

## Проверено на Ubuntu

1. Сеть: назначенный `http://logi-test-plan.bg.local/app/` разрешается в
   `10.200.11.224`, прямой HTTP GET вернул 200.
2. Пользователь назначил выделенный аккаунт `jsteach`; он закреплён в lease.
   Секреты в документацию/Git не сохраняются.
3. Штатный `src/connection-check.mjs::loginBrowser`, отдельный профиль
   `connection-preflight-profile` внутри приватной кампании, `headless:false`,
   Chromium1243, действующий DISPLAY, sandbox и `--no-proxy-server`.
   Прочитаны фактические account=`jsteach`, Connected=true, `bg.app.Version=7.4.2`,
   PackageNodes.Count=0. Logout через UI и закрытие собственного context подтверждены;
   пакеты/узлы/файлы Loginom не создавались. Native receipt:
   `connection-preflight.json`; операторский скрипт и screenshot — рядом, вне Git.
   Screenshot был сделан до полной отрисовки рабочего интерфейса и не доказывает
   готовность палитры/мастера. Редакция и ОС сервера пока **не установлены**.
4. Отдельный toolchain в
   `~/.local/state/loginom-ai-agent/node-development/toolchains/`:
   Bun `1.3.14+0d9b296af`, полный Node `24.19.0`, npm `11.17.0`.
   PATH пользователя и системный Bun `1.3.13+bf2e2cecf` не менялись.
   Bun получен из [официального release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14);
   archive SHA256 `951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`
   сверён с GitHub release asset digest. Node archive SHA256
   `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`
   сверён с официальным SHASUMS256; executable SHA256
   `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`
   совпал с product pin. Точные пути — приватный `javascript-toolchain.json`.
5. Использованный Chromium executable SHA256
   `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`
   совпал с Linux product pin. Это ещё не проверка целого candidate/resource manifest.

## Память и переносимость подготовки

Основной checkout использует рабочий штатный OpenViking. Doctor подтвердил
авторизацию, `system/status`, чтение, MCP и `/ready`: 0 failures, 1 warning о
прошлых прерванных recall. Точное чтение памяти текущего проекта прошло.
Effective Peer выводится из Ubuntu cwd; macOS URI не копировался.

Подтверждены и исправлены в координаторском kit:

- Исходный adapter передаётся явно `--source`; больше нет исполняемого default
  `/Users/kartamyshev/...`. Старый upstream manifest/hashes сохранены.
- `review_hooks.mjs --codex <absolute executable>` вместо пути macOS app.
  Настоящий Ubuntu `/home/george/.local/bin/codex` (Desktop 0.153.4) успешно
  выполнил initialize и hooks/list; системное доверие этим чтением не менялось.
- Фактический установленный ID — `openviking-memory@loginom-dock`, версия 0.8.1.
  Он передаётся `--plugin-id`, сохраняется в manifest и отключается только в
  новом worktree. Для прежних manifest сохраняется прежний marketplace.
- До bootstrap inventory должен доказать отсутствие original memory hooks
  **любого marketplace** в worktree; helper отказывает раньше захвата данных.
- Ubuntu umask `0002` создаёт `0775`/`0664`, которые текущий ownership validator
  отвергает. В тестовых fixtures установлен приватный umask; в CURRENT описаны
  проверка прав и защищённая копия неизменённого plugin pin. Права основного
  checkout и установленного плагина ещё не менялись, validators не ослаблялись.

Локальные проверки: **11 Python preparation tests + 4 Node hook-review tests PASS**.
Первый Python запуск дал 11 setup errors из-за umask `0002`; после исправления
fixtures — 11/11. Python suite выполнялась с временным preparation fixture:
настоящий overlay и `workspace-peer.mjs`, совпавший с upstream hash;
`server.mjs` специально неработоспособен и выбрасывает ошибку при запуске.
Это проверяет Git/TOML/manifest preparation, **не собранный MCP adapter**.
Node suite использует процесс RPC fixture и не пишет реальное доверие Codex.
Проверки синтаксиса Python/Node и `git diff --check` прошли.

Отдельный исходный `integrations/codex-mcp-adapter` с 11 файлами из manifest
пока не найден в проверенных checkout, cache и подходящих локальных архивах.
Установленный официальный plugin — другой компонент и не содержит этот adapter.
Путь/репозиторий его копии запрошен у пользователя. Поэтому project runtime,
hooks manifest/install, registration ID, bootstrap, activation и actor access
новой задачи пока отсутствуют. Тестовый fixture не установлен как runtime.
Capture/extraction/read-back новой задачи ожидают её допуска и первого этапа.

## Следующий шаг

Владелец — координатор текущей задачи. Восстановить точный исходный adapter,
проверить все hashes и собрать настоящий runtime. Затем закрыть права/identity
установки по CURRENT, проверить новый worktree до bootstrap, создать настоящую
задачу, оформить свежие receipts, activation и actor health/find/read.
После допуска перенести docs-only commits и выполнить discovery 0B в headed
Loginom под выделенным аккаунтом. Отдельно установить edition/ОС сервера,
палитру JavaScript, доступный storage, action manifest и будущий CLI/OAuth profile.

Подготовительный Loginom logout/context close подтверждены; неизвестных мутаций
или pending browser operations нет. Приватный profile/evidence сохранён.
При возобновлении сверить worktree, процессы, account lease и receipts;
не создавать вторую кампанию и не сбрасывать состояние существующих задач.
