# Windows native candidate — 2026-09-19

## Результат

- Итог: `PARTIAL`.
- Платформа: Windows 11 Pro x64, native session, build `10.0.26200`.
- Product commit: `eedacb5ee594af7a66b6ba9b11aa7634bb8f531e`, clean detached checkout.
- Реализация сборки, упаковки и статической проверки завершена. Установленные Desktop, CLI `run` и CLI TUI прошли полный сценарий 55/101 с независимым холодным открытием; совместная работа Desktop/CLI проверена в обоих порядках закрытия.
- Release gate не объявлен `PASS`: не выполнены clean-VM/другой Windows-пользователь, OAuth callback, отдельный Xiaomi-driven Desktop-прогон, update feed и подписывание.

## Сборка и артефакты

Каталог результата:

`C:\Users\vskar\AppData\Local\loginom-ai-agent-build\outputs\final-eedacb5ee`

| Артефакт | Размер | SHA256 |
| --- | ---: | --- |
| `desktop/loginom-ai-agent-win-x64.exe` | 313274322 | `cf61530ffab1227d3a92f832aa83e7763dc8aae3898dc89d40c013f1f64f8c6c` |
| `desktop/loginom-ai-agent-eedacb5ee-source.tar.gz` | 172859525 | `e68b9f102c171b2c111bbe685413b00578d0f3f300a00d3e944df377136025ba` |
| `desktop/release-manifest.json` | 3400 | `01c0f4696e4253a39542d6662fad3fe05628c80925c24fded4b03d9f4613392d` |
| `loginom-ai-agent-cli-0.0.0-dev-202609190537-win32-x64.zip` | 316250203 | `6226972c6d9479388d3d51e02d43f7bdcf7bad721e4f2b2eb7bd41bb94c9a532` |
| `cli-payload/cli-manifest.json` | 1128896 | `43ebf5934fa49f5bc44b99ddf5c8c45014daa5edc34f19b92ec8fd48e0aaa9c6` |

Desktop development installer имеет `NotSigned`, что ожидаемо для согласованного локального candidate, но не закрывает release signing gate. `static-nsis.json` — PASS: target `win32-x64`, 4371 ресурсный файл, комплектные Node и Chromium PE/AMD64. CLI manifest — PASS, `sourceDirty: false`, source commit совпадает.

## Окружение и провайдер

- Portable Node `24.19.0`; Bun `1.3.14`; Electron `42.3.3`; Chromium revision `1243`.
- Loginom: разрешённый стенд `logi-test-plan.bg.local`, passwordless test user.
- Модельный provider для Windows: Xiaomi Token Plan, `https://token-plan-sgp.xiaomimimo.com/v1`, `mimo-v2.5`.
- Xiaomi live-проверка обнаружила модель и выполнила реальные Loginom tool calls в CLI. Полная детерминированная семантика проверена scripted provider через тот же реальный Loginom runtime.
- Значения API key, MCP token, password, cookie и Authorization headers не записывались в этот отчёт или артефакты.

## Проверки

| Граница | Статус | Фактический результат |
| --- | --- | --- |
| Clean checkout `-Product Both` | PASS | Desktop NSIS и CLI ZIP из одного commit |
| Full workspace install | PASS | Bun 1.3.14 `install --frozen-lockfile`; lockfile unchanged |
| Desktop static verifier | PASS | 4371 файлов, Node/Chromium PE AMD64, MZ NSIS |
| CLI manifest/install | PASS | ZIP checksum, clean manifest, installed native executable |
| DPAPI CurrentUser | PASS | fresh ciphertext, restart readback, tamper rejection, no plaintext fallback |
| Electron safeStorage | PASS | native encrypt/decrypt and damaged ciphertext rejection |
| Profile ACL/writer lock | PASS | native Unicode ACL and independent writer guards |
| Native proxy policy | PASS (implementation) | separate HTTP/HTTPS, suffix/wildcards, IPv4, `<local>`, loopback, fail-closed unsupported modes |
| IPC/process tests | PASS | private transport, acknowledged cleanup, disconnect rejection |
| CLI `run` CSV | PASS | A 55; B 101; save, close, cold reopen |
| CLI TUI/ConPTY CSV | PASS | A 55; B 101; save, Ctrl+C shutdown, cold reopen |
| Desktop onboarding/CSV | PASS | IPC save/readback, A 55, B 101, save/close/independent cold reopen |
| Desktop/CLI independence | PASS | simultaneous operation and both close orders |
| Native window observer | PASS | Win32 process ownership, visible `MainWindowHandle`, no remaining window after close |
| Parent/runtime/Chromium crash | PASS | force-kill each target; 11/10/10 tracked processes, zero live descendants |
| Cancel/network/recovery | PASS | ConPTY Ctrl+C; relay severed 16 sockets; 20 processes exited; `recoverable-error` then setup restored `ready` generation 2 |
| OAuth callback lifecycle | PASS (local) | IPv4 loopback, callback response, state/error handling and Windows connection teardown; 19/19 tests |
| CLI uninstall/reinstall | PASS | profile preserved; final installed version verified |
| Sources/licenses/notices | PASS | source archive and runtime/native license materials included |
| CI definition | PASS (source) | Windows workflow added; no remote GitHub run was performed |

CLI `run` evidence: `%TEMP%\loginom-linux-oracle-qKEMGa`.

CLI TUI evidence: `%TEMP%\loginom-linux-oracle-sGW7Wz`.

Desktop evidence: `C:\Git\laa-desktop-temp\loginom-linux-oracle-elvHdy`.

Desktop/CLI independence evidence: `C:\Git\laa-desktop-temp\loginom-desktop-cli-independence-aBlor3`.

Network fault evidence: `%TEMP%\loginom-cli-owner-crash-iujvX1`.

TUI observations:

- dataset A: Alpha `35`, Beta `20`, total `55`;
- independent cold readback A: total `55`, settings reapplied `false`;
- dataset B: Alpha `100`, Beta `1`, total `101`;
- independent cold readback B: total `101`, settings reapplied `false`;
- одинаково названные `sales.csv` получили разные источники; оба пакета были сохранены и независимо открыты.

## Ограничения и следующий gate

Перед release необходимо:

1. Выполнить installed Desktop/CLI на чистой Windows 11 VM и под вторым Windows-пользователем.
2. Пройти OAuth callback. Native cancel/network/recovery и parent/runtime/Chromium crash cleanup уже прошли.
3. Выполнить отдельный Xiaomi-driven Desktop-прогон; CLI live discovery и реальные Loginom tool calls уже подтверждены.
4. Подготовить подписанный installer и собственный update feed, затем выполнить update acceptance. Remove/reinstall с сохранением профиля уже прошёл.
5. Запустить добавленный workflow в GitHub; `windows-2022` подтверждает build/static границу, но не заменяет Windows 11 installed acceptance.

Секреты не включены. Временный `script/windows-oracle.acceptance.json` в передачу не входит.
