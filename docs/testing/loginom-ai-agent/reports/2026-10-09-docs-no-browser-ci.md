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

## Проверено до повторного GitHub CI

- Agent: 250 PASS, 2 штатных SKIP, 995 assertions в семи затронутых наборах.
- HostPort: 16 PASS, 192 assertions; дополнительный strict-before-dispatch: PASS.
- CI cache-hit regression: PASS, 3 assertions, настоящий pinned Node/npm.
- Desktop artifact + HostPort: три повтора, каждый 12 PASS / 2 platform SKIP.
- resume-oracle: три повтора под отдельным Xvfb, каждый PASS / 5 assertions.
- Typecheck agent и loginom-host: PASS.

Проверка всех GitHub тестов и candidate-сборок продолжается на новом SHA.
Окончательный SHA, ссылки на runs и результаты фиксируются в PR #46 и отдельном
локальном CI evidence; этот документ не объявляет их заранее успешными.
Candidate workflow не публикует release и не устанавливает приложение пользователю.
Installed/live приёмка предыдущего Linux payload остаётся отдельной, версионной.
Модельные прогоны, evals и проверка новых установок Windows/macOS сюда не входят.
