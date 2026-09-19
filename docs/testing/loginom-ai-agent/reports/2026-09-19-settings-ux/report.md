# Настройки Loginom: Windows Desktop 0.1.5

## Результат

19 сентября 2026, native Windows 11 x64. **PASS для изменения интерфейса настроек**:
Desktop 0.1.5 установлен поверх 0.1.4, настоящее подключение Dock/Loginom проверено
через установленное приложение в отдельном профиле. Это целевая регрессия,
а не повтор всей платформенной приёмки или разрешение production release.

## Поведение

- Сохранённый ключ обозначается фиксированной маской `••••••••` и подписью
  «Ключ сохранён. Чтобы заменить его, введите новый». Настоящий секрет не
  возвращается в renderer; маска — placeholder, не значение и не новый ключ.
- «Сохранить и закрыть» проверяет введённые данные, сохраняет их и закрывает окно
  с уведомлением. При ошибке окно и введённые значения сохраняются.
- «Проверить подключение» проверяет текущий черновик без сохранения и закрытия.
  Результат проверки сбрасывается при последующем редактировании.
- Удалена постоянная кнопка «Загрузить текущие настройки». Первичная загрузка
  выполняется автоматически; «Обновить настройки» доступно только при конфликте
  версии настроек. Фоновое обновление состояния не затирает изменённый черновик.
- Кнопка «Закрыть», крестик, Escape и щелчок вне окна используют общую защиту:
  при изменениях требуется выбрать продолжение редактирования или закрытие
  без сохранения. Во время проверки/сохранения повторные действия заблокированы.
- Отложенное применение показано отдельно от готового подключения. Ошибка
  применения остаётся видимой в уведомлении после закрытия формы.

## Сборка и установка

- Product commit: `30a22ff8905ff9f3d0b2dafe3605de17b23ffda2`, чистый checkout;
  версия `0.1.5`, канал `dev`, backend v1.
- Portable Bun `1.3.14`, Node `24.19.0`, Electron `42.3.3`, Chromium revision `1243`.
- Команда: `script/build-windows.ps1 -Product Desktop -Channel dev -SkipInstall`
  с закреплёнными `-BunPath`, `-NodeSource`, `-BrowserSource` и новым output directory.
- Каталог артефактов:
  `C:\Users\vskar\AppData\Local\loginom-ai-agent-build\outputs\settings-0.1.5-30a22ff89\desktop`.
- `git archive`, `write-manifest.ts --target win32-x64` и
  `verify-artifact.ts` выполнены после commit, до последующих правок теста/отчёта.
- NSIS `/S`: exit 0. Установленный файл
  `C:\Users\vskar\AppData\Local\Programs\@loginom-ai-agentdesktop\loginom-ai-agent-dev.exe`
  сообщает ProductVersion `0.1.5.0`. SHA256 установленного `resources/app.asar`
  совпадает с `win-unpacked`. Пользовательское приложение перед установкой
  не работало; его процессы принудительно не завершались.

| Материал | Размер, bytes | SHA256 |
| --- | ---: | --- |
| `loginom-ai-agent-win-x64.exe` | 313179104 | `9c003ea3a91fc20e2bb741ecc79573886b0b53a14d8dad2de3884fbf6116c9ca` |
| `loginom-ai-agent-30a22ff89-source.tar.gz` | 172866129 | `8c49dda9169025a273341b0a4cd6b41a1672a3aedbfe1b4b19a97086504d744e` |
| `release-manifest.json` | — | `fd0c75e8be264c868930b5139c740dbe0b9aac4ab5418b1d7568e43c06e38587` |
| Установленный и packaged `app.asar` | — | `4034100c8f46c254f35fe055d9c29601fd30be31c3a114dcf37e6c72f55caa79` |

## Проверки

| Проверка | Результат |
| --- | --- |
| App: Loginom controller, keybind settings и toast lifecycle | 19 PASS, 67 assertions |
| Desktop: packaging config и release artifact tests | 7 PASS, 68 assertions |
| Package-local `bun typecheck`: app, ui, desktop, loginom-host | PASS |
| Статический verifier Windows NSIS/payload | PASS, 4371 resource files |
| Packaged GUI: сохранённая маска и отсутствие общей кнопки reload | PASS |
| Packaged GUI: Close/X/Escape/overlay и подтверждение потери черновика | PASS |
| Packaged GUI: проверка, save/close/reopen, сохранение из общих настроек | PASS |
| Packaged GUI: неверный ключ не стирается, поздняя ошибка видна после закрытия | PASS, детерминированная IPC fixture |
| Installed GUI: настоящие Dock auth и Loginom login | PASS |
| Installed GUI: проверка до сохранения не меняет revision/hasApiKey | PASS |
| Installed GUI: сохранение закрывает окно, подключение `ready` | PASS |
| Installed GUI: повторное открытие с маской и проверка сохранённого ключа | PASS |
| Форматирование acceptance driver, `git diff --check`, поиск префиксов выданных токенов в checkout | PASS; совпадений токенов 0 |

Команда App из `packages/app`:

```powershell
bun test --conditions=browser --preload ./happydom.ts ./test-browser/settings-loginom.test.ts ./test-browser/settings-keybinds.test.ts ./test-browser/toast-owner.test.ts
```

GUI-драйвер `packages/desktop/test/loginom/settings-ux.mjs` запущен pinned Node
с `LOGINOM_AI_AGENT_TEST_EXECUTABLE`, указывающим на `win-unpacked` этой сборки.
Он использует настоящие renderer/preload/dialog events и контролируемые ответы
IPC; не является доказательством доступности реальных серверов.

Первые дополнительные проверки общих настроек остановились на способе открытия
окна: горячая клавиша сразу после закрытия диалога и отсутствующая в текущем
экране кнопка sidebar. Драйвер исправлен на видимый путь меню приложения →
Файл → Настройки → Loginom; добавлен screenshot при ошибке. Production payload
не менялся. Успешный полный прогон: `%TEMP%\loginom-settings-ux-1UKBSQ`.
Предыдущие evidence сохранены: `axuwy5`, `U2urzP`, `M9i6OW` с тем же префиксом.

Реальный installed-прогон: `packages/loginom-host/script/windows-settings-live.ts`
с `LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE`, `LOGINOM_AI_AGENT_TEST_RESOURCES`
и `LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE`. Драйвер расшифровывает ранее
разрешённые DPAPI credentials в памяти и передаёт их дочернему процессу через
stdin, не через командную строку и не через исходники. Перед выводом результата
проверяет stdout/stderr на секреты. Новый тестовый профиль хранит credentials
штатным защищённым способом; пользовательский профиль не используется.

Installed evidence: `%TEMP%\loginom-settings-live-TaRQo2`, UTC запуска
`2026-09-19 10:24`, завершения `10:25`. В обоих успешных evidence-каталогах
есть `summary.json` и screenshots. Скриншоты сохранённого ключа и ошибки
проверены визуально. Приватные профили и raw logs в git не включены.

## Локализация и границы

Русские подписи сверены с [Microsoft: подтверждения](https://learn.microsoft.com/ru-ru/windows/win32/uxguide/mess-confirm)
и [Mozilla: русские общие диалоги](https://raw.githubusercontent.com/mozilla-l10n/firefox-l10n/main/ru/toolkit/toolkit/global/commonDialog.ftl).
Существующий английский словарь сохранён; новые подписи имеют отдельные ключи.
Регионально неоднозначных терминов в новых подписях не выявлено.

Изменение затрагивает только Desktop UI; установленный CLI не пересобирался и
остаётся `0.0.0-dev-202609190631`. Xiaomi/model, CSV oracle, OAuth и полная
lifecycle/platform matrix заново не запускались: их прежние результаты относятся
к сборке из `17dc05a49`, см. Windows-план. Проверка настроек не требует вызова LLM.
Linux/macOS, чистая Windows VM и другой пользователь не проверялись.
NSIS `NotSigned`, публичный update feed отключён; публикации не было.
