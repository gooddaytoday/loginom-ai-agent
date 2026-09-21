# Windows native candidate — 2026-09-19

## Результат

- Итог: `PASS` в согласованном объёме локального unsigned Windows candidate.
- Платформа: Windows 11 Pro x64, native session, build `10.0.26200`.
- Product commit: `17dc05a49ea3f1318c65f4e712116bd1a437b47f`, clean checkout (`sourceDirty: false`).
- Реализация сборки, упаковки и статической проверки завершена. Установленные Desktop, CLI `run` и CLI TUI прошли полный сценарий 55/101 с независимым холодным открытием; совместная работа Desktop/CLI проверена в обоих порядках закрытия.
- Все обязательные gate согласованного объёма пройдены, включая installed Desktop OAuth и Xiaomi-driven Loginom tool call. Clean-VM/другой Windows-пользователь остаются явно зафиксированным ограничением окружения; update feed и подписывание исключены из согласованного локального candidate.

## Сборка и артефакты

Каталог результата:

`C:\Users\vskar\AppData\Local\loginom-ai-agent-build\outputs\final-17dc05a49`

| Артефакт | Размер | SHA256 |
| --- | ---: | --- |
| `desktop/loginom-ai-agent-win-x64.exe` | 313163606 | `5617c7794d5dbabfb0822aaebaecd1c25405d24cf497bf61247a1999467e7f99` |
| `desktop/loginom-ai-agent-17dc05a49-source.tar.gz` | 11486308 | `8ec49329af29103c0b06c9f05ec0fea7bfdb5543813538d9c7634acee662857e` |
| `desktop/release-manifest.json` | 3401 | `1a7962423723da35989f26083c700c334c29530e838485dd613121badcaab53b` |
| `loginom-ai-agent-cli-0.0.0-dev-202609190631-win32-x64.zip` | 315876127 | `9e0da471d69c9c085fd743eac50905bcf82f746a3d90252b625609cf3834f6f9` |
| `cli-payload/cli-manifest.json` | 1111897 | `3d1a0dc053361b9eff35dd7e0fc840e3453016a042dcf9ff8aeeb201f0528030` |

Desktop development installer имеет `NotSigned`, что ожидаемо для согласованного локального candidate, но не закрывает release signing gate. `static-nsis.json` — PASS: target `win32-x64`, 4371 ресурсный файл, комплектные Node и Chromium PE/AMD64. CLI manifest — PASS, `sourceDirty: false`, source commit совпадает.

Полные installed 55/101 и independence acceptance были выполнены на непосредственном предшественнике `eedacb5ee`. Между ним и финальным product commit изменены Windows acceptance-драйверы и OAuth callback teardown; Loginom runtime, Desktop onboarding и CLI execution path не менялись. Финальный hash повторно прошёл build, native CLI version smoke и статическую проверку всего Desktop resource tree.

Финальный NSIS установлен поверх локального Desktop: installed product version `0.1.4.0`. CLI обновлён через штатные `uninstall.cmd`/`install.cmd`: `profilesPreserved: true`, установленная версия и launcher возвращают `0.0.0-dev-202609190631`.

## Окружение и провайдер

- Portable Node `24.19.0`; Bun `1.3.14`; Electron `42.3.3`; Chromium revision `1243`.
- Loginom: разрешённый стенд `logi-test-plan.bg.local`, passwordless test user.
- Модельный provider для Windows: Xiaomi Token Plan, `https://token-plan-sgp.xiaomimimo.com/v1`; discovery проверен для `mimo-v2.5`, tool-call acceptance — для `mimo-v2.5-pro`.
- Xiaomi live-проверка выполнила реальные Loginom tool calls в CLI и установленном Desktop. Полная детерминированная семантика проверена scripted provider через тот же реальный Loginom runtime.
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
| Installed Desktop OAuth | PASS | protected-resource discovery, dynamic registration, system authorize → loopback callback, token exchange, authorized MCP connect |
| Installed Desktop Xiaomi tool call | PASS | `xiaomi-token-plan-sgp/mimo-v2.5-pro`; `loginom_dock_prepare` completed in the OAuth acceptance session |
| CLI uninstall/reinstall | PASS | profile preserved; final installed version verified |
| Sources/licenses/notices | PASS | source archive and runtime/native license materials included |
| CI definition | PASS (source) | Windows workflow added; no remote GitHub run was performed |

CLI `run` evidence: `%TEMP%\loginom-linux-oracle-qKEMGa`.

CLI TUI evidence: `%TEMP%\loginom-linux-oracle-sGW7Wz`.

Desktop evidence: `C:\Git\laa-desktop-temp\loginom-linux-oracle-elvHdy`.

Desktop/CLI independence evidence: `C:\Git\laa-desktop-temp\loginom-desktop-cli-independence-aBlor3`.

Network fault evidence: `%TEMP%\loginom-cli-owner-crash-iujvX1`.

Installed Desktop OAuth + Xiaomi evidence: `%TEMP%\loginom-installed-oauth-PsWsKS`.

TUI observations:

- dataset A: Alpha `35`, Beta `20`, total `55`;
- independent cold readback A: total `55`, settings reapplied `false`;
- dataset B: Alpha `100`, Beta `1`, total `101`;
- independent cold readback B: total `101`, settings reapplied `false`;
- одинаково названные `sales.csv` получили разные источники; оба пакета были сохранены и независимо открыты.

## Ограничения вне согласованного gate

Перед release необходимо:

1. Выполнить installed Desktop/CLI на чистой Windows 11 VM и под вторым Windows-пользователем.
2. Для будущего публичного release, вне согласованного локального candidate, подготовить подписанный installer и собственный update feed. Remove/reinstall с сохранением профиля уже прошёл.
3. Запустить добавленный workflow в GitHub; `windows-2022` подтверждает build/static границу, но не заменяет Windows 11 installed acceptance.

Секреты не включены. Временный `script/windows-oracle.acceptance.json` в передачу не входит.
