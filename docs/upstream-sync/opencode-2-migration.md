# Переезд форка на OpenCode 2 (v2.2.7): исследование для 0.5.0

Состояние на 12.11.2026. Форк `v040@9d482b7ebf2463b3a65125178a2477e316c94b06` (OpenCode v1.19.5, `810c0eba`), upstream `v2.2.7` (`fedc6f208aa2bd54c1019227214568083f6380ad`). Ссылки `путь:строка` даны по дереву `v2.2.7`, с пометкой «форк:» — по `9d482b7e`. Решение владельца `opencode2-for-050`: в 0.4.0 переезда нет. Теги получены `git fetch --filter=blob:none` из `https://github.com/anomalyco/opencode.git` в `refs/upstream/*`.

## 1. Устройство OpenCode 2

| Что | v2.2.7 | Где |
|---|---|---|
| `packages/opencode` | удалён (`44b6938b2a`, 20.07.2026): из 830 файлов 806 удалены без переименования, 23 переехали в `tui`/`core`/`cli`/`theme` | `git diff -M --name-status v1.19.5 v2.2.7 -- packages/opencode` |
| Пакеты | область `@opencode/*`: `schema` (контракты), `protocol` (HttpApi), `core` (рантайм, сессии, БД, загрузчик плагинов), `server`, `client`, `ai` (свой слой LLM вместо Vercel `ai`), `cli`, `tui`, `app`, `desktop`, `plugin` (API), `gui-plugins` (updater, browser, terminal, wsl), `plugin-browser`, `process-daemon`, `simulation`, `codemode` | `packages/*/package.json`, `packages/gui-plugins/AGENTS.md:3` |
| Сервер | Effect HttpApi под `/api/*` (SSE `/api/event`), фоновый `opencode service`; API v1 заменён (пакеты форка его не вызывают, `git grep` пусто) | `packages/protocol/src/groups/session.ts:128`, `event.ts:61-63`, `AGENTS.md:8-11` |
| Плагин | `{ id, effect(context) }` или `{ id, setup }`; домены `tool` (`transform`, `reload`, хуки `execute.before/after`), `session` (хуки `prompt`, `context` — правит `system` и **набор `tools` на каждый запрос**, `compaction`, `model.request`), `skill` (`transform`), `agent`, `command`, `mcp`, `permission`, `storage`, `rpc`. Навыки ищутся и в `.claude`, `.agents` (`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`) | `packages/plugin/src/effect/plugin.ts:27-64`, `tool.ts:8-59`, `session.ts:14-40,198-213`, `skill.ts:6-17`; `packages/core/src/plugin/module.ts:82-91`; `packages/core/src/config/plugin/skill.ts:89-90`; `packages/cli/src/server-process.ts:130` |
| Конфиг | файл прежний; ключи `plugin`, `provider`, `permission`, `agent`, `command` → во множественном числе, старые нормализуются; `write`/`patch` → `edit`, `task` → `subagent`, `bash` → `shell` | `packages/core/src/config/normalize.ts:168-190`, `packages/core/src/v1/config/migrate.ts:29-34` |
| Хранилище | SQLite `opencode.db` (drizzle), таблицы `session_v2`; миграция сессий и `auth.json` v1 — **только под Bun** (под Node заглушка) | `packages/cli/src/database-path.ts:10`, `packages/core/src/database/v1-migration.bun.ts:503,550`, `packages/core/package.json:69-70` |
| Desktop | Electron 44.9.1 (форк 42.3.3); main: `lifecycle/`, `service/` (sidecar), `storage/` (drizzle), `plugin/`, `windows/`; обновление — GUI-плагин; `verifyUpdateCodeSignature: false` | `packages/desktop/package.json:50`, `packages/gui-plugins/src/updater/platform.ts:3-8`, `packages/desktop/electron-builder.config.ts:182` |
| CLI | `Bun.build({ compile })`, по одному бинарнику на ОС; `run --format default\|json` | `packages/cli/src/commands/commands.ts:432` |
| Bun / Effect / TS | 1.4.4 (так же было в v1.19.5; форк держит 1.3.14) / 4.1.0 / TS 6.0.2 | `package.json:8,81,92`; форк: `package.json:7,69` |

Порядок запуска CLI → сервис → сессия — **не проверено**.

## 2. Карта форка → v2

| Группа | Объём в форке | В v2.2.7 | Куда ляжет |
|---|---|---|---|
| Пакеты только форка: `loginom-runtime` (130 тыс. строк), `loginom-host` (13 тыс.), `product`, `apps/loginom-site`, `evals`, `services` | 9 400 файлов | не пересекаются | **как есть**: `runtime` и `product` upstream не импортируют; у `loginom-host` 6 импортов (`@opencode-ai/schema`, `opencode`) — смена области |
| Швы `ProductHooks` (`opencode/src/product/*`) | 6 модулей, 792 строки | каталог удалён | таблица 2a |
| Новые файлы `opencode/src`: инструменты `loginom-local-file`, `loginom-file-*`, `package-docs`; CLI `profile*`, `standalone*`, `loginom-management`, `update-notifier`; `task-scope`, `browser-recovery` | 33 файла, 5 233 строки; тесты 44 / 9 300 | каталог удалён | инструменты — плагин; CLI — шов в `packages/cli` |
| Правки в файлах upstream (CAT-01…12) | 1230 файлов | 261 не тронуты, 431 изменены, 23 переехали, 515 удалены | таблица 2b |
| Desktop: подключение (`main/loginom/*`), DPAPI (`safeStorage`), прокси (`proxy-relay*`, `system-proxy`), `update-policy` (503 строки), онбординг | 20 новых файлов (1 963 строки) в исчезнувших каталогах; 90 правленых удалены | `safeStorage` не используется (`git grep` пусто); прокси только из окружения (`packages/desktop/src/main/lifecycle/environment.ts:73`); онбординг есть (`lifecycle/onboarding.ts`) | модуль форка + `ipc-handlers`; швы в `environment.ts` и `gui-plugins/src/updater`; правка `lifecycle/onboarding*` |
| App/UI: `settings-loginom*`, `package-docs-tool`, `system-proxy-notice` | 8 новых файлов; 105 правленых удалены (4 536 строк с переводами) | `app` перестроен | GUI-плагин (`CHANGELOG.md:113`) или правка `app` |
| Идентичность (`apply-identity.py`: `LOGINOM_AI_AGENT_*`, `.loginom-ai-agent`, `loginom-ai-agent.json(c)`, `.db`) | `SOURCES` — список каталогов | `OPENCODE_*` читают 406 исходных файлов (160 имён), в v1 — 329 (133) | добавить в `SOURCES` `ai`, `client`, `util`, `plugin*`, `gui-plugins`; `names.test.ts` и `flag-identity.test.ts` — на новые пути |
| Бренд (CAT-03: 669 файлов, `packages/web` — 472) | — | 251 / 325 / 92 (не тронуты / изменены / удалены) | применить заново |

### 2a. Швы `ProductHooks` и API плагинов v2

Альтернатива A ADR-0001 («всё плагином») для v1 отклонена: нет границы хода, нельзя скрыть инструмент (форк: `docs/upstream-sync/adr-0001-modular-integration.md:32-35`). В v2 эти точки есть. Сопоставление по сигнатурам, **прототипом не проверено**.

| Шов | Нужно | Точка v2 | Итог |
|---|---|---|---|
| `installationNode` | CLI не ходит в каналы upstream | `packages/cli/src/services/updater.ts:158` | шов в `cli` |
| `skillSource` | зарезервированные имена только от встроенных; чужие `.claude` не подмешивать (G6) | `skill.transform` (`effect/skill.ts:6-17`) + `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` | плагин |
| `toolPolicy` | скрыть от модели и запретить вызов | хук `context` правит `tools` (`effect/session.ts:37-40`); `execute.before` отклоняет (`effect/tool.ts:48-52`) | плагин |
| `toolContributor` | каталог Host по поколению подключения | `tool.transform` + `tool.reload` (`effect/tool.ts:54-59`) | плагин |
| `attachmentResolver` | вложения, датасет, сжатие | `prompt`, `compaction` (`effect/session.ts:14-20,50-53`) | частично плагин |
| `turnLifecycle` | аренда Host на ход с освобождением при отмене; `system` | `prompt`, `context`, `execute.after`; финализатора хода не нашлось | `system` — плагин, аренда — шов в `core` |

### 2b. Правки форка в файлах upstream

Маски `catalog.json` × `git -c diff.renameLimit=30000 diff -M --name-status v1.19.5 v2.2.7`.

| Запись | Файлов | Не тронуты | Изменены | Переехали | Удалены |
|---|---|---|---|---|---|
| CAT-01 манифесты | 10 | 0 | 8 | 0 | 2 |
| CAT-02 CI, сборка | 46 | 2 | 14 | 3 | 27 |
| CAT-03 бренд | 669 | 251 | 325 | 1 | 92 |
| CAT-04…08 агент: каналы, сессия, инструменты, навыки, провайдеры, CLI | 197 | 0 | 0 | 6 | 191 |
| CAT-09 Desktop | 96 | 1 | 9 | 2 | 84 |
| CAT-10 app, UI | 126 | 3 | 20 | 10 | 93 |
| CAT-11 TUI | 35 | 2 | 26 | 0 | 7 |
| CAT-12 ядро | 51 | 2 | 29 | 1 | 19 |
| **Итого** | **1230** | **261** | **431** | **23** | **515** |

## 3. Пробное слияние

```sh
FORK_SHA=9d482b7ebf2463b3a65125178a2477e316c94b06 UPSTREAM_TAG=v2.2.7 \
UPSTREAM_SHA=fedc6f208aa2bd54c1019227214568083f6380ad \
  scripts/upstream-sync/measure-conflicts.sh --repo . --out <каталог вне репозитория>
```

git 2.43.0, ort, `merge.directoryRenames=conflict`, без rerere. База `055d95bb7e` (09.10); коммитов только upstream — 6593, только форка — 5626.

| Группа путей | Правки | Удаление (modify/delete) | Перенос | Всего |
|---|---|---|---|---|
| `packages/opencode` (src + test) | 0 | 221 | 1 | 222 |
| `desktop` | 23 | 30 | 21 | 74 |
| `app`, `ui`, `session-ui` | 25 | 94 | 11 | 130 |
| `core`, `tui`, прочие пакеты | 56 | 27 | 33 | 116 |
| Манифесты, CI, сборка | 35 | 31 | 2 | 68 |
| Бренд, документы, переводы | 126 | 173 | 7 | 306 |
| **Итого** | **265** | **576** | **75** | **916** |

Ещё 52 новых файла форка в `packages/opencode` сливаются **без конфликта** в пакет, которого в v2 нет. Для сравнения: слияние v1.19.4 давало 69 путей при цели ≤ 34 (форк: `docs/upstream-sync/adr-0001-modular-integration.md:13-16`).

### Merge или перенос на v2.2.7

| Критерий | `git merge v2.2.7` | Перенос: дерево v2.2.7 + пакеты форка + швы |
|---|---|---|
| Механика | 916 путей: 576 закрываются принятием удаления, 75 — переносом | пакеты форка копируются без конфликтов; 261 правка повторяется без конфликтов; 431 — трёхсторонне (≈ те же 265 правок) |
| Содержательная работа | ≈ 15,4 тыс. строк кода форка в удалённых файлах и каталогах (8,4 тыс. новых + 7,1 тыс. правок), ≈ 21 тыс. строк тестов | то же |
| Другая база | `git merge-tree --merge-base=v1.19.5 v2.2.7 HEAD` даёт 820 путей (509 удалений): конфликты вызваны удалением `packages/opencode`, а не историей | — |
| Процедура LAB-198 | `verify-accepted.py` требует запись решения на каждый путь, отличный от оракула: сотни записей | оракула нет, приёмка — паритет (раздел 6) |
| История | SHA журналов приёмки сохраняются | сохраняются, если дерево переноса оформить коммитом с двумя родителями |
| Риск | в дереве остаются куски v1: 52 файла без пакета, старые импорты | дерево собирается с нуля |

**Вывод: merge не экономит работы.** 71% его конфликтов — удаления и переносы. Главная цена в обоих путях одна: переписать 15,4 тыс. строк под новое ядро. Перенос дешевле на разбор файлов без пакета и записей решений. Итог стоит оформить коммитом слияния с деревом переноса (`git commit-tree <дерево> -p <форк> -p v2.2.7`): так сохранятся SHA, а следующая синхронизация пойдёт от базы `v2.2.7`.

## 4. Что v2 даёт нам

| Возможность | Где | Польза |
|---|---|---|
| API плагинов | `packages/plugin/src/effect/*` | 4–5 из 6 швов уходят в плагин форка, меньше конфликтов при синхронизациях (не проверено) |
| Клиентские плагины и навыки (`v040-user-extensions`) | `plugin.ts:27-64`; `plugin.use`, `skill.use` (`CHANGELOG.md:331`) | богаче v1 (GUI, RPC, хранилище), но контракт другой (раздел 5) |
| GUI-плагины Desktop | `packages/gui-plugins`, `CHANGELOG.md:113` | настройки Loginom и `package-docs` можно сделать без правок `app` |
| Браузерный плагин | `packages/plugin-browser/README.md:3-6` | вкладки Desktop через CDP, только при подключённом Desktop; `loginom-runtime` (работает и из CLI) не заменяет |
| `process-daemon` | `packages/process-daemon/README.md:1-12` | PTY на Rust; нашего кода не заменяет |
| Миграция v1 → v2 | раздел 1, «Хранилище» | основа миграции 0.4 → 0.5 |

## 5. Риски

| Риск | Факт | Мера |
|---|---|---|
| Клиентские плагины 0.4 | модуль v1 отвергается: «Plugin must export a default definition…» (`packages/core/src/plugin/module.ts:180`); пакет — `@opencode/plugin` (`packages/plugin/package.json:3`), `@opencode-ai/plugin` в коде v2 нет | **решение владельца**: адаптер или разрыв в 0.5.0 |
| Имена `loginom_*`, `dock_*` | задаёт каталог `loginom-host`; в v2 у инструмента необязательное пространство имён (`effect/tool.ts:12,57`) | тест: набор имён у модели как в 0.4 |
| Правила профилей | `toolPolicy` перечисляет id инструментов, а v2 переименовал `bash`, `task`, `write`/`patch` (`v1/config/migrate.ts:29-34`) | пересобрать списки; тест G1 |
| `run --headless --format json` | на нём держатся `evals/src/cli.ts:163-170` и `run-check`; команда — `standalone` форка (форк: `packages/opencode/src/cli/standalone-command.ts:68-83`), события v2 другие | перенести `standalone`; сверить JSON офлайн |
| Конфиг `loginom-ai-agent.json(c)` | имя задаёт форк (форк: `packages/core/src/config.ts:142`); v2 нормализует старые ключи | тест чтения и записи конфига 0.4 |
| Профили и пути | форк: `packages/core/src/global.ts:12-19`; v2: `cli/src/database-path.ts:10` | шов; G2 — `flag-identity` |
| Данные 0.4 → 0.5 | миграция v1 на `loginom-ai-agent.db` не запускалась | срез 3 |
| Обновление Desktop с 0.4.x | обновление — GUI-плагин, хранилище — drizzle (`desktop/src/main/storage/migration/*`), лента — opencode.ai | сохранить `appId` и ленту форка; UPDATE-01 |
| Windows | DPAPI Desktop — `safeStorage`, в v2 его нет; `process-daemon` — новая нативная часть | Windows-чек-лист целиком |
| Версии | Bun 1.3.14 → 1.4.4 (против решения 2 ADR-0001), Effect beta.83 → 4.1.0, TS 5.8 → 6.0, Electron 42 → 44 | решение по Bun; `loginom-host` и `runtime` на Bun 1.4.4 |
| Темп upstream | 6593 коммита с 09.10 по 10.11 | зафиксировать тег, догнать одним слиянием в конце |
| Лицензии | MIT: корень, 26 пакетов, `process-daemon` (`Cargo.toml:7`) | лицензии зависимостей Rust — не проверено |

## 6. План для 0.5.0

Оценка в днях работы агентов, без прототипа. Разброс отражает непроверенные пункты 2a и 5.

| Фаза | Срез | Проверка | Дни |
|---|---|---|---|
| 0 | Прототип: `toolContributor`, `toolPolicy`, `skillSource` плагином на `v2.2.7`; `loginom-host` на Bun 1.4.4 | Dock виден модели только после `prepare`; запрещённый вызов отклонён; `bun test` `loginom-host` | 2–3 |
| 1 | База: `v2.2.7` + пакеты форка + идентичность (`apply-identity`, область `@opencode/*`) | `catalog-check.py` с новым каталогом; `names.test.ts`, `flag-identity.test.ts`; сборка CLI | 4–6 |
| 2 | Агент CLI: плагин Loginom (швы 2–6, файловые инструменты, `package-docs`, встроенные навыки); шов `installation`; профили; `standalone` | охранные тесты G1–G6; бизнес-сценарий узла PASS из CLI | 8–14 |
| 3 | Данные и конфиг 0.4 → 0.5 | профили 0.3.9 и 0.4.x: сессии и подключения на месте | 3–5 |
| 4 | Desktop: подключение и DPAPI, прокси, политика обновлений, онбординг, бренд, `appId` | `desktop/test/loginom`; UPDATE-01 с 0.4.x | 8–14 |
| 5 | App/UI: настройки Loginom, `package-docs`, уведомление о прокси | `app/test-browser/settings-loginom.test.ts` | 4–7 |
| 6 | CI и выпуск: workflows, `release.yml`, сборки Windows | CAND и REL зелёные на SHA кандидата | 3–5 |
| 7 | Паритет | сценарии узлов `scripts/node-acceptance` (≥ 2/3 PASS на SHA); полные `bun test` `loginom-host` и `node --test` клиента `loginom-runtime`; Windows-чек-лист `docs/testing/loginom-ai-agent/windows-release-coverage.md` (≈ 1 ч авто + 7,5 ч стенда) | 5–8 |
| | **Итого** | | **37–62, середина ≈ 50** |

После фазы 1 срезы 4–5 идут параллельно 2–3; критический путь (фазы 0–3, 6, 7) ≈ 25–41 день.

### Точки решения владельца

1. Путь: перенос, оформленный коммитом слияния (рекомендация), или `git merge` — до фазы 1.
2. Клиентские плагины 0.4: адаптер или разрыв контракта — до фазы 2.
3. Bun 1.4.4 вместо 1.3.14 — после фазы 0.
4. Целевой тег: `v2.2.7` или более поздний — до фазы 1.
5. `packages/web` (документация upstream): оставить или удалить — фаза 1.
6. Настройки Loginom в Desktop: GUI-плагин или правка `app` — до фазы 5.
