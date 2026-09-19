# Windows native candidate — 2026-09-19

## Результат

- Итог: `PARTIAL`.
- Платформа: Windows 11 Pro x64, native session, build `10.0.26200`.
- Product commit: `a1ea6990ba83edbb4e5d87f90cab9db99639356f`, clean detached checkout.
- Реализация сборки, упаковки, статической проверки и установленного CLI завершена. CLI `run` и TUI прошли полный сценарий 55/101 с независимым холодным открытием.
- Release gate не объявлен `PASS`: Desktop onboarding не завершил проверку подключения, не выполнены clean-VM/другой Windows-пользователь, Windows crash matrix, OAuth callback, update feed и подписывание.

## Сборка и артефакты

Каталог результата:

`C:\Users\vskar\AppData\Local\loginom-ai-agent-build\outputs\final-a1ea6990b`

| Артефакт | Размер | SHA256 |
| --- | ---: | --- |
| `desktop/loginom-ai-agent-win-x64.exe` | 313273432 | `795f5ea9c355312441d4216a2e2dede51c74972239c10c7d53d467124434287b` |
| `desktop/loginom-ai-agent-a1ea6990b-source.tar.gz` | — | `7f7e4a17e15a1de4247255603570b98c1a9b700fd7af6170096f97a0b67bfc0b` |
| `desktop/release-manifest.json` | — | `6c47d915afa768bd17ff176b8809e50d2be430d73e3d176b3fbb22b8d001ff5b` |
| `loginom-ai-agent-cli-0.0.0-dev-202609190024-win32-x64.zip` | 316249147 | `3c570b3285f549016d1632f7e78650582f0206b5add62e8dcdbaa0034797e2a2` |
| `cli-payload/cli-manifest.json` | — | `7b8cdfb58aa72e26c8d92319bb4789039c96bb6f712854ddec15380e8d4857dc` |

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
| Desktop static verifier | PASS | 4371 файлов, Node/Chromium PE AMD64, MZ NSIS |
| CLI manifest/install | PASS | ZIP checksum, clean manifest, installed native executable |
| DPAPI CurrentUser | PASS | fresh ciphertext, restart readback, tamper rejection, no plaintext fallback |
| Electron safeStorage | PASS | native encrypt/decrypt and damaged ciphertext rejection |
| Profile ACL/writer lock | PASS | native Unicode ACL and independent writer guards |
| Native proxy policy | PASS (implementation) | separate HTTP/HTTPS, suffix/wildcards, IPv4, `<local>`, loopback, fail-closed unsupported modes |
| IPC/process tests | PASS | private transport, acknowledged cleanup, disconnect rejection |
| CLI `run` CSV | PASS | A 55; B 101; save, close, cold reopen |
| CLI TUI/ConPTY CSV | PASS | A 55; B 101; save, Ctrl+C shutdown, cold reopen |
| Desktop CSV | BLOCKED | onboarding remained at «Проверка подключения…»; scenario not counted |
| CI definition | PASS (source) | Windows workflow added; no remote GitHub run was performed |

CLI `run` evidence: `%TEMP%\loginom-linux-oracle-qKEMGa`.

CLI TUI evidence: `%TEMP%\loginom-linux-oracle-sGW7Wz`.

TUI observations:

- dataset A: Alpha `35`, Beta `20`, total `55`;
- independent cold readback A: total `55`, settings reapplied `false`;
- dataset B: Alpha `100`, Beta `1`, total `101`;
- independent cold readback B: total `101`, settings reapplied `false`;
- одинаково названные `sales.csv` получили разные источники; оба пакета были сохранены и независимо открыты.

## Ограничения и следующий gate

Перед release необходимо:

1. Исправить или диагностически классифицировать зависание Desktop connection check и повторить Desktop 55/101 на этом же новом hash.
2. Выполнить installed Desktop/CLI на чистой Windows 11 VM и под вторым Windows-пользователем.
3. Пройти native parent/runtime/Chromium crash, network interruption/recovery, OAuth callback и оба порядка одновременного закрытия Desktop/CLI.
4. Подготовить подписанный installer и собственный update feed, затем выполнить update/remove/reinstall acceptance.
5. Запустить добавленный workflow в GitHub; `windows-2022` подтверждает build/static границу, но не заменяет Windows 11 installed acceptance.

Секреты не включены. Временный `script/windows-oracle.acceptance.json` в передачу не входит.
