# CI ветки docs-no-browser и PR #46

Ветка отправлена на origin, создан [PR #46](https://github.com/gooddaytoday/loginom-ai-agent/pull/46)
в `loginom`. Перед повторной проверкой объединены исходные HEAD `4a4d4abe5`
и актуальная база `0ca9e75bc7bb6897f46ac1ddc880b9758e993dc9`.
Исправления соседних направлений сохранены; их рабочие деревья не изменялись.

## Диагностика и исправления

- **Установка зависимостей CI:** setup-loginom-inputs кэширует только Node/Chromium,
  но выполнял npm ci лишь при отсутствии кэша. На cache hit Node не находил yaml
  в runtime/client. Установка locked npm dependencies теперь безусловная;
  скачивание браузера остаётся условным. Регрессия проверена выполнением реального
  shell шага action и npm на локальном locked пакете: RED без установленного
  модуля → GREEN после исправления. Desktop job также получает этот setup и
  явный закреплённый Node; ограничения проверки навыков не ослаблялись.
- **Headless runner:** resume-oracle использует настоящий наблюдатель X11 даже с
  локальной CLI-фикстурой. Без DISPLAY получено 3/3 FAIL до вызовов skill/prepare;
  с отдельным Xvfb — 3/3 PASS. Unit job запускается через xvfb-run, наблюдатель
  и проверки его результатов сохранены.
- **Совмещение исправлений HostPort:** в актуальной loginom добавлена проверка
  выхода runtime во время journal.begin. Автоматический повторный запуск из её
  прежнего варианта несовместим с требованием явного dock_prepare в нашей ветке.
  После такого выхода неотправленная запись подтверждённо снимается, возвращается
  LOGINOM_SCOPE_DENIED; дальнейшая работа требует подготовки. Параметризованный
  тест с настоящим SIGKILL получил RED (CALL_UNCERTAIN), затем GREEN.
  Дополнительно проверено отсутствие ложного recovery в strict режиме и успешная
  работа после явной подготовки. Лимит двух рестартов в одном ходе сохранён.
- **Вложения:** сохранены обе доработки message-v2: исключение локального .lgp и
  безопасное описание CSV для провайдера. Приватное отложенное admission проверяет
  исходные CP1251-байты, ownership, compaction/revert и отсутствие передачи в Help.
- **Дедлайн подготовки:** PR gate на `b3b56ffdb` получил UI_BUILD_MISMATCH вместо
  DEADLINE, push gate того же SHA прошёл. `remaining()` дважды читал часы и мог
  вернуть ноль без исключения, после чего цикл завершался без результата.
  Отдельные управляемые часы VM воспроизводят этот случай детерминированно
  (RED); одно чтение часов устраняет его (GREEN). Исходный предел времени и
  проверки отсутствия мутации сохранены, глобальные часы не подменяются.
- **Нативный macOS CI:** два независимых jobs выявили неверный Linux codec в
  Node-host фикстуре, сочетание skipIf с уже пропущенным test и сравнение
  символического argv пути с каноническим module URL у executor документации.
  Фикстура теперь использует native codec и собственный Keychain helper, удаляя
  только свой ключ; условия пропуска объединены. Executor канонизирует entry path,
  сохраняя поведение импорта. Symlink regression получена RED на Linux и затем
  GREEN; полный набор документации 58 PASS / 682 assertions. Это продуктовая
  правка запуска, а не нормализация временных путей только ради тестов.
- **Канонические пути macOS:** повторный native job подтвердил, что Keychain codec
  требует уже существующий профиль; тест создаёт свой root с mode 0700 до stage.
  Ожидаемые временные пути документации берутся через realpath, как и реальный
  исполнитель. Для backend-selected output найден отдельный продуктовый отказ:
  alias родителя сравнивался с canonical directory как посторонний путь.
  Новый POSIX symlink regression получил RED с OUTPUT_ESCAPE. Исполнитель теперь
  проверяет canonical parent на точное совпадение с session directory, сохраняет
  ограничения имени/суффикса, exclusive publication и запрет внешних каталогов.
- **Windows application fixture:** полный candidate на `1cc1eb64a` получил
  timeout 5000 ms в первом вызове `where.exe`; Bun завершил dangling child,
  откуда возник вторичный false/unhandled assertion. Та же проверка ранее
  прошла за 370 ms и также прошла в PR job текущего SHA — это flaky signal.
  Фикстура наследовала весь PATH runner. Теперь поиск ограничен своим каталогом
  и каталогом настоящего where.exe; продуктовый resolver, assertions и бюджет
  времени не изменены. Native workflow проверяет пять свежих процессов на каждой
  из Windows 2022/2025 без повторной попытки при ошибке. GREEN подтверждается
  далее нативным CI, Linux skip не считается проверкой этих случаев.
- **Disconnected owner fixture:** PR unit на `1cc1eb64a` получил resolved close
  вместо ожидаемого CLEANUP_FAILED, тогда как пять узких повторов прошли.
  После process.disconnect() фикстура не имела referenced handle и могла
  естественно завершиться до close; Host корректно удалял уже вышедший runtime.
  Теперь MessagePort удерживает именно disconnected owner до аварийной очистки,
  без синхронизации на задержках. Тест подтверждает живой собственный PID перед
  close и отсутствие PID после ожидаемого отказа; продуктовая логика не менялась.

## Проверено до повторного GitHub CI

- Agent: 250 PASS, 2 штатных SKIP, 995 assertions в семи затронутых наборах.
- HostPort: 16 PASS, 192 assertions; дополнительный strict-before-dispatch: PASS.
- CI cache-hit regression: PASS, 3 assertions, настоящий pinned Node/npm.
- Desktop artifact + HostPort: три повтора, каждый 12 PASS / 2 platform SKIP.
- resume-oracle: три повтора под отдельным Xvfb, каждый PASS / 5 assertions.
- Typecheck agent и loginom-host: PASS.
- Полный loginom-host после merge: 313 PASS / 7 platform SKIP, 1982 assertions.
- Management после merge: PASS, все 111 assertions.
- Исправленный ранний Node contract gate: 173 PASS / 0 FAIL.
- Deadline regression после исправления: пять независимых PASS.
- Новые macOS-фикстуры проверяются далее native CI; Linux результаты не объявляются
  доказательством работы Keychain или нативной сборки macOS.

Проверка всех GitHub тестов и candidate-сборок продолжается на новом SHA.
Окончательный SHA, ссылки на runs и результаты фиксируются в PR #46 и отдельном
локальном CI evidence; этот документ не объявляет их заранее успешными.
Candidate workflow не публикует release и не устанавливает приложение пользователю.
Installed/live приёмка предыдущего Linux payload остаётся отдельной, версионной.
Модельные прогоны, evals и проверка новых установок Windows/macOS сюда не входят.
