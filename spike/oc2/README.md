# Spike: OpenCode 2 для Loginom AI Agent (этап A3)

Одноразовый стенд для проверки критериев S1–S10 и интерфейса. Это не код продукта. Итоги и доказательства лежат
в [`docs/upstream-sync/oc2-spike-report.md`](../../docs/upstream-sync/oc2-spike-report.md) и
[`docs/upstream-sync/oc2-spike-ui-report.md`](../../docs/upstream-sync/oc2-spike-ui-report.md) (часть 2, интерфейс).

## Состав

| Путь | Что |
|---|---|
| `setup.sh [тег]` | Создаёт песочницу `opencode/` (detached worktree тега, по умолчанию `v2.3.0`), ставит зависимости, делает ссылки на плагины и накладывает `patches/*.patch` |
| `patches/` | Швы в файлах OpenCode: U1 (плагин продукта последним и под защитой), U3 (права при прямой активации навыка), U5 (своя служба на продукт и профиль), реестр страниц и пункт навигации в UI, отрисовка инструментов (`ui-tool-registry.patch`) и пример отрисовщика Loginom (`ui-tool-renderer-loginom.patch`) |
| `plugin/loginom-product/` | Прототип серверного плагина: шлюз инструментов (`context` + `execute.before`), источник навыков, допуск через RPC и `loginom.access`, имитация аренды Host |
| `plugin/impostor/`, `plugin/gui-probe/` | Самозванец для S8 и пакет с GUI-бандлом для S9 |
| `plugin/loginom-ui-demo/` | Демонстрационные инструменты Loginom для части 2: шаги, сохранение с разрешением, правка пакета с `metadata.changes`, сбой |
| `harness/` | Сценарная модель (OpenAI-совместимая заглушка), обвязка сервера, проверки `s1.ts` … `s9.ts` и сервер для веб-приложения `ui.ts` (часть 2) |
| `run-server.sh` | Запуск сервера песочницы с изолированными каталогами XDG |

Каталоги `opencode/` и `.run/` и ссылки `node_modules` в Git не входят.

## Запуск

```sh
spike/oc2/setup.sh                         # один раз
cd spike/oc2/harness
bun s1.ts   # скрытый инструмент: напрямую, CodeMode, подсессия, расписание
bun s2.ts   # аренда Host: успех, ошибка, прерывание, SIGTERM, kill -9
bun s3.ts   # источники навыков: базовый режим и U1+U3
bun s4.ts   # данные v040 → v2 (нужен `npm ci` в packages/loginom-runtime/client)
bun s5.ts   # изоляция фоновой службы: база и U5
sudo bun s6.ts 600   # аудит исходящих соединений в network namespace (strace)
bun s7.ts   # RPC, события SSE, запрос loginom.access
bun s8.ts   # подмена id плагина продукта: база и U1
bun s9.ts   # навыки Hub с id через точку, reload, KV, GUI-бандл
bun ui.ts   # часть 2: сервер :4096 для веб-приложения, сценарии в .run/ui/prompts.json
```

Веб-приложение для части 2: `cd opencode/packages/app && VITE_OPENCODE_SERVER_PORT=4096 bun dev` (порт 5173).

Каждая проверка печатает JSON с итогом `PASS`/`PARTIAL`/`FAIL` и доказательствами. Журналы лежат
в `.run/<проверка>/`. Встроенный режим плагина включает `LOGINOM_SPIKE_BUILTIN=1`, правку U3 — `LOGINOM_SPIKE_U3=1`.
Базовый режим без защиты U1 включает `LOGINOM_SPIKE_U1_GUARD=0`, а U5 задаётся через `LOGINOM_SPIKE_U5_IDENTITY`.
