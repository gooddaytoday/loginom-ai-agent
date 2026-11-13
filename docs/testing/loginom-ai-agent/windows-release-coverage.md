# Покрытие Desktop на Windows для выпуска 0.4.0

База: `v040@46067973515d`, 12.11.2026. Только функции Loginom AI Agent; TUI, общие инструменты, LSP и провайдеры моделей opencode не входят. Сценарии стенда — по [README](README.md) и [windows.md](windows.md).

## Где запускается

| Код | Workflow, job | Когда | Runner |
| --- | --- | --- | --- |
| PR | `test.yml` chromium-direct | каждый PR и push v0NN; шлюз `release.yml` | windows-2022 |
| NAT | `windows-native-check.yml` | push в любую ветку при изменении `loginom-host`, `apps.ts`, profile-windows | windows-2022 и 2025 |
| CAND | `loginom-windows.yml` | dispatch; PR только из `v040-batch-*` или в `dev`/`loginom`; обычный PR в v040 — skipped | windows-2022 |
| REL | `release.yml` job windows | тег и dispatch candidate | windows-2025 |
| SMK | установленный smoke `windows-installed-smoke.ps1`, #1023 (включает #1025) | шаг CAND и шаг REL после verify-artifact (гейт выпуска) | windows-2022 (CAND), windows-2025 (REL) |
| L | `test.yml` unit/desktop/e2e и `turbo test` | только Linux | ubuntu-24.04 |
| Стенд | ручная приёмка по `windows.md` | Windows 11 x64 | — |

Все Windows-runner — Windows Server, не Windows 11. Ветка `win32` на Linux — тест с подставленным `platform: "win32"`, исполняется на ubuntu.

## 1–2. Функции × автотесты

| Функция | Автотесты (пути) | На Windows | Только стенд |
| --- | --- | --- | --- |
| Сборка NSIS и CLI ZIP | `script/build-windows.ps1`; `desktop/electron-builder.config.test.ts`, `scripts/release/artifact.test.ts` | CAND, REL | подпись, SmartScreen |
| Установка/удаление NSIS (`oneClick`, `/currentuser`) | статично `scripts/release/verify-artifact.ts` (MZ, хеш ресурсов, exe не запускается); SMK: тихая установка, запись «Установленные приложения», ярлык, удаление с сохранением данных | REL статично и SMK; CAND SMK | PKG-01/02, REMOVE-01, переустановка |
| Обновление (feed, политика, 0.3.x → 0.4.0) | `desktop/src/main/update-*.test.ts`, `updater-*.test.ts`; `test/loginom/updater/` — только AppImage | нет (L) | UPDATE-01 с 0.3.6/0.3.8/0.3.9 |
| Первый запуск, онбординг | SMK: запуск в профиле онбординга, версия в `main.log`, server ready, окно, выход 0 | SMK | UI-01 (три поля, пустой пароль) |
| Настройки Loginom | `app/test-browser/settings-loginom.test.ts`, `settings-keybinds`, `toast-owner` | REL | UI-02 |
| Подключение: поколения, восстановление | `desktop/src/main/loginom/*.test.ts`, `loginom-host/test/connection-*.test.ts`, `host.test.ts` | нет (L) | CON-01…08, REC-01 |
| Учётные данные Desktop (Electron safeStorage = DPAPI) | `desktop/src/main/loginom/credentials.test.ts`; CAND: `test/loginom/safe-storage-smoke.cjs` с production-кодеком Desktop в установленном pinned Electron | CAND: запись шифротекста на диск, чтение новым процессом Electron, отказ при повреждении; недоступный адаптер отклоняет encode/decode без plaintext | SEC-01 в установленном NSIS Desktop, другой пользователь |
| Учётные данные CLI (DPAPI) | `loginom-host/test/cli-credentials.test.ts` (нативные тесты `skipIf !win32`); `script/dpapi-acceptance.ts` не подключён | NAT, CAND, REL | чужой пользователь (`reject-other-user`) |
| Профиль и ACL на Windows | `opencode/test/cli/profile-windows.test.ts` через `script/test-windows-profile.ps1` (обычный пользователь) | NAT, CAND, REL | — |
| Процессы host/runtime, PowerShell | `loginom-host/test/process.test.ts`, `windows-powershell.test.ts`, `environment.test.ts` | NAT, REL (CAND — без powershell) | — |
| Завершение, поиск приложений | `desktop/src/main/shutdown.test.ts` (REL), `apps.test.ts` (NAT ×5, CAND, REL) | частично | LIFE-01 |
| Браузерный runtime (Chromium) | `loginom-runtime/client/test/browser-proxy.integration`, `browser-downloads.integration`, `windows-crypto-probe` | PR | REC-02, видимое окно в установленном |
| Обработчики узлов | `loginom-runtime/client/test/*.test.mjs` (≈560 файлов), `scenario-*.test.ts` | нет (L) | FLOW-01, ISO-01 на живом Loginom |
| Локальная справка `loginom_*` | `loginom-host/test/package-docs.test.ts`, `knowledge.test.ts`; SMK: наличие и разбор `help-manifest.json` | SMK — только манифест | вызов справки из чата |
| Поставляемые навыки | `loginom-host/test/bundled-skills.test.ts`, `skill-publication.test.ts`; `product-skills-smoke.mjs` не подключён | нет; в SMK не проверено | вызов навыка в чате |
| Системный прокси | `loginom-host/test/system-proxy*.test.ts` (ветка `win32` на Linux); `script/system-proxy-smoke.ts` только печатает; `browser-proxy.integration` через WinINET | PR (Chromium), NAT (чтение без утверждения) | прокси для модели/OAuth в sidecar, PAC |
| Журналы и диагностика | `desktop/src/main/logging.test.ts`, `log-retention.test.ts`; SMK: нет ERROR/FATAL, `crash.log`, minidump | SMK | LOG-01, экспорт диагностики |
| CLI `loginom-ai-agent-cli` | `cli-install-windows.test.ts` (синтетический артефакт), `cli-manifest.test.ts`; CAND: распаковка ZIP, `install.cmd`, установленный launcher `--version`, `verify-cli-candidate.ts`, `uninstall.cmd` | CAND запускает собранный CLI; версия = manifest; проверяет установленный payload, SHA/дерево исходников и pinned inputs; после удаления нет payload/файлов/receipt/lock, записи установленных приложений и PATH не изменены. NAT/REL — прежние проверки | вход, задача, TUI (`tui-oracle-windows.ts` не подключён) |
| Брендинг | `copy-icons.test.ts`, `electron-builder.config.test.ts`; SMK: имя записи, ярлык, отсутствие `mcp.loginom.ai` в файлах | CAND, REL; SMK | BRAND-01: About, URI scheme, иконки |
| Внешние ссылки, вложения | `external-url.test.ts`, `attachment-picker.test.ts` | нет (L) | путь с кириллицей и пробелами |

`windows-installed-oauth.ts`, `windows-settings-live.ts`, `window-observer-smoke.ts` и `test/loginom/*.mjs` (gui-smoke, settings-live, recovery-ui, crash-logging и др.) — ручные инструменты, ни один workflow их не запускает.

Состояние на 12.11: CAND на SHA #1023 (run 43238438278) идёт; результат SMK на Windows Server не проверен.

## 3. Пробелы

| # | Пробел | Где закрыть | Объём |
| --- | --- | --- | --- |
| 1 | Обновление NSIS с 0.3.6/0.3.8/0.3.9 до 0.4.0: настройки, учётные данные, чаты | стенд Win 11; затем SMK-режим «установить N, обновить до N+1» по образцу AppImage | стенд 1 ч на версию; автомат 2–3 дня |
| 2 | Закрыт: REL запускает SMK на собранном установщике после verify-artifact, режим как в CAND (`-AllowServer -KeepProxy`, канал и версия сборки); FAIL валит job windows и выпуск, WARN — нет; `report.json` и `logs.zip` — артефакт `windows-installed-smoke` (не попадает в Release) | `release.yml` job windows | — |
| 3 | CAND автоматизирует DPAPI: сохранение, выход и чтение новым процессом; повреждение и отказ без plaintext | `loginom-windows.yml`, шаг `Desktop safeStorage DPAPI across Electron restarts`: установленный через сборку `node_modules/electron` (тот же pin, что у Desktop), production-кодек; недоступность адаптера задана явно для проверки отказа. Реальная недоступность safeStorage завершает шаг ошибкой. Evidence: `safe-storage-{write,read,unavailable}.json` | Осталось: SEC-01 в NSIS Desktop и другой пользователь на стенде; REL пока без этого шага |
| 4 | CAND запускает собранный CLI из ZIP по документированному пути | `loginom-windows.yml`, шаг `Install, execute and remove the CLI ZIP candidate`: чистая распаковка, отдельный `LOCALAPPDATA`, `install.cmd` → launcher `--version` → `verify-cli-candidate.ts` на установленном payload → исходный `uninstall.cmd`. Проверяет удаление файлов/receipt/lock и неизменность uninstall-реестра и PATH; два пустых каталога installer сохраняет штатно. Evidence: `cli-installed-smoke.json` | Осталось: вход/задача/TUI на стенде; REL пока без этого шага |
| 5 | Поколения подключения, восстановление, узлы, справка, навыки проверяются только на Linux (пути, rename/fsync NTFS, процессы) | Windows CI: `desktop` `src/main/loginom` и `loginom-host` connection/package-docs/bundled-skills в NAT; клиентские тесты узлов оставить на L | 1–2 дня (часть может упасть на путях) |
| 6 | Системный прокси в sidecar для модели и OAuth: smoke ничего не утверждает | Windows CI: заданный WinINET-прокси + утверждение результата `system-proxy-smoke`; PAC/аутентификация — стенд | 0,5 дня + 30 мин стенда |
| 7 | Живой Loginom: FLOW-01, ISO-01, REC-01/02 | стенд Win 11 (нужна пара аккаунтов) | 1,5 ч |
| 8 | Справка и навыки в установленном приложении — проверяется только манифест | SMK: проверить каталог навыков и один `loginom_*` через sidecar | 0,5–1 день |
| 9 | Брендинг UI: About, URI scheme, иконки, имя процесса | стенд (визуально); URI scheme — SMK по реестру | 20 мин стенда; 0,5 дня |
| 10 | Подпись и SmartScreen подписанного релиза | стенд, только для подписанного артефакта | 15 мин |

## 4. Проект чек-листа выпуска на Windows

| Шаг | Что | Тип | Время |
| --- | --- | --- | --- |
| 1 | Зелёные PR и NAT на SHA выпуска | авто | 3–4 мин |
| 2 | CAND dispatch на SHA: сборка, тесты пакетов, SMK (после #1023) | авто | ≈13 мин без SMK; с SMK — не проверено |
| 3 | `release.yml` candidate: REL + шлюз `test.yml`; сверить SHA256 EXE/ZIP с manifest | авто | ≈40 мин (dispatch release-v040, 07.11) |
| 4 | Чистая Win 11 x64, обычный пользователь: подпись, PKG-01/02, UI-01, BRAND-01 | стенд | 30 мин |
| 5 | UI-02, CON-01…08, SEC-01 (DPAPI), перезапуск | стенд | 45 мин |
| 6 | MODEL-01, FLOW-01, ISO-01, REC-01/02, LOG-01 на живом Loginom | стенд | 1,5 ч |
| 7 | Системный прокси: WinINET-прокси, модель и OAuth через прокси | стенд | 30 мин |
| 8 | CLI: установка из ZIP, вход, одна задача, удаление | стенд | 30 мин |
| 9 | UPDATE-01 с 0.3.6, 0.3.8, 0.3.9 на снимках VM, затем FLOW-01 | стенд | 3 ч |
| 10 | REMOVE-01 и переустановка: данные сохранены по политике | стенд | 20 мин |

Порядок: 1→3 автоматически; стенд начинается только с артефактом шага 3. Шаг 9 можно вести параллельно 5–8 на второй VM. Итого: авто ≈1 ч, стенд ≈7,5 ч (оценка) на одной VM, ≈5 ч на двух. Закрытие пробелов 2–6 переносит шаги 4, 5, 8 и часть 7 в автомат и сокращает стенд примерно до 5 ч на одной VM.
