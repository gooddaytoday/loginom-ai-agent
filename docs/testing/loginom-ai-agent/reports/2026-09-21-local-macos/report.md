# Локальная установка macOS — 2026-09-21

**Установлена и запущена `0.1.7-local.20260921.1`**, prod identity,
macOS 27.0 arm64. Исходники: `60325968262c8eb7a37c2bd2979c797bc085a94a`.
В сборку вошло [исправление параллельных команд](../../parallel-calls.md).
Публикация, push, теги и CI не выполнялись.

## Сборка и проверки

Сборка выполнена штатным `packages/desktop/scripts/build-macos.ts` из чистого
зафиксированного дерева с Bun 1.3.14, Node 24.19.0 и Chromium 1243.
Версия передана через `--version`, package.json и release pins не менялись.
Prod identity выбрана для сохранения существующего пользовательского профиля;
это локальный кандидат, не публичный релиз.

- `check-macos.ts`: все восемь групп PASS; 142 теста PASS, 9 SKIP, 0 FAIL.
  Typecheck Product/Host/Desktop/Agent PASS.
- DMG и ZIP: static verification PASS, 4446 ресурсов, подписи и хеши проверены.
- Offline smoke Desktop/CLI: PASS, bundled Node/Chromium, версия CLI,
  первый запуск и штатный выход Desktop.
- Установленный Desktop: отдельный GUI-профиль, реальная проверка/сохранение
  подключения Loginom, безопасный IPC, encrypted credential storage и повторный
  запуск без мастера — PASS.
- Обычный пользовательский профиль запущен: main.log подтвердил новую версию,
  `packaged: true`, `onboardingTest: false`, backend v1 ready. В интерфейсе
  наблюдались прежняя вкладка ABC-задачи и вкладка нового чата.

Первый установленный GUI-прогон завершился `CONNECTION_READINESS_TIMEOUT`:
стек процесса подтвердил ожидание macOS Keychain (`SecItemCopyMatching`,
`SecKeychainItemCopyContent`, SecurityServer decrypt). Пользователь ввёл пароль
в системном окне. Повторный прогон прошёл. Для повторения использовалась внешняя
копия штатного `gui-smoke.mjs`, дополненная ранним сообщением об alert формы;
производственный код и критерии успешности не менялись.

## Замена приложения и сохранность данных

Установка: `/Applications/Loginom AI Agent.app`, из readonly DMG.
Старая 0.1.6 штатно остановлена через обработчик SIGTERM → stopSidecars/app.quit;
подтверждён выход всех 22 отслеживаемых процессов. Принудительное завершение
не применялось. Bundle сначала скопирован в staging и проверен, затем заменён.
Installed `app.asar`, executable и Info.plist совпали с собранным кандидатом;
`codesign --verify --deep --strict` прошёл.

Резервные копии находятся в приватном каталоге
`~/.cache/loginom-macos-build/local-20260921-backup/`:

- `Loginom-AI-Agent-0.1.6.zip` и `previous-bundle` — прежнее приложение;
- `profiles-before.zip` — Desktop profile, data и config;
- `shutdown.json`, `installed.json`, `profile-before.json`, `profile-after.json` —
  локальные доказательства установки и сохранности.

После запуска совпали хеши сохранённого подключения, auth и recovery-записей.
История сохранилась: 5 сессий, 86 сообщений, 378 частей сообщений. Старые
recovery-записи не подтверждались и не удалялись автоматически. В настройках
Loginom они разрешаются отдельным действием «Результат проверен — завершить
восстановление» после проверки прежней операции.

## Артефакты

Каталог: `~/.cache/loginom-macos-build/local-20260921-1/`.
Там сохранены DMG/ZIP, source archive, CLI archive, release manifest,
`build-report.json`, `static-dmg.json`, `static-zip.json`, `offline-smoke.json`
и `SHA256SUMS`. CLI собран штатным общим pipeline, но не устанавливался.

| Артефакт | SHA-256 |
| --- | --- |
| DMG | `89174f4fdad35c047a971a29cdf0fc2db41a0fd331e78649b2ea0790914cce3c` |
| ZIP | `ace4ad306d41620a93f75e281c5c80ac051d4039f545c7accc0fb10ede2d9e9f` |
| Installed app.asar | `5d07fdc8c8a10d731b848b01a1cb71a89e2482a4dde2332db70d901ea9dcece5` |

Предсборочные доказательства: `~/.cache/loginom-macos-build/local-20260921-source-checks.json`.
Установленный GUI: `~/.cache/loginom-macos-build/local-20260921-installed-gui-retry.log`.
Секреты, профили и raw logs в Git не включены.

## Границы проверки

Новая локальная сборка подписана ad-hoc, не нотариализована. Developer ID,
Gatekeeper trust, Windows/Linux и полная macOS14-приёмка не проверялись.
Регрессия одновременной загрузки/describe проверена на исходниках с реальным
runtime в отдельном отчёте; полный ABC-анализ моделью на новом установленном
Desktop не запускался. Пользовательский старый recovery остаётся сохранённым.
