# Отладка сценариев: ход выполнения

План: [2026-09-21-loginom-scenario-debugging](../../superpowers/plans/2026-09-21-loginom-scenario-debugging.md).

## Исходный ABC — 2026-09-21

Прогон начат через интерфейс установленного Desktop
`/Applications/Loginom AI Agent.app`, версия `0.1.7-local.20260921.2`.
Отдельный профиль; рабочий профиль и его чаты не изменялись.
Провайдер/модель: `openai/gpt-5.6-sol`, вариант `low`.
Loginom: `7.4.2` по manifest фактического prepare.

- Чат: `ses_f3c22ad07ffeKNe97BcbzJ5ipQ`.
- Вход: `/Users/kartamyshev/Downloads/loginom-ai-sales (2).csv`, 10531 байт.
- SHA-256: `b55154fe32bf32b18146f12f1e9ef5ab135537df2210c7461d2bf229afb7711a`.
- Файл прикреплён через GUI; доставка `deliver-abc-csv-001` подтверждена
  квитанцией `SUCCEEDED`, `upload_completion_verified: true`.
- Запрошенный выход: `/user/scenario-debug-abc-baseline-20260921.lgp`;
  сохранение пока не подтверждено.
- Локальные доказательства вне Git:
  `/Users/kartamyshev/Library/Logs/loginom-scenario-debugging/20260921/`:
  `baseline-prompt.txt`, `baseline-chat.json`, `baseline-profile/`.

Статус: `BLOCKED`. Повторены F01 и F02: `node-import-abc-001` дошёл
до `configure` и получил `Requested source field is missing or ambiguous`.
Фактическое наблюдение Loginom показывает открытый мастер «Настройка форматов
импорта», шаг `text_import_format`. Модель вызвала inspect/observe/recover/resume,
затем отправила исправленный запрос к существующему узлу; восстановление
отвергнуто из-за незавершённой старой операции. После повторяющихся отказов
исследователь остановил модель кнопкой Desktop. Loginom вручную не изменялся.
Зачётного результата и покрытия узлов пока нет.
`analytical_correctness: not_checked`.

## Первое исправление (исходники, до установленной приёмки)

- Новые импорты и patches разрешают однозначные наблюдаемые CSV-метки,
  сохраняя техническую идентичность и нативный порядок полей. Неоднозначность
  не разрешается по позиции или придуманной транслитерации.
- Известная ошибка сопоставления закрывает собственный черновик мастера.
  Только подтверждённый возврат того же узла без применения/исполнения
  позволяет очистить pending configure и рекомендовать новый исправленный
  запрос к существующему узлу. Transport uncertainty не получает этого пути.
- Узкие тесты импорта, node apply, API, close и public results прошли.
  Полный runtime suite (`node --test test/*.test.mjs`, pinned Node 24.19.0)
  завершился с exit 0. Обязательные macOS source checks: 8/8 команд PASS
  (Bun 1.3.14; Product/Host/Desktop/Agent typecheck и тесты).
  Source transforms: 5045 файлов PASS; migration source tests: 2 PASS.
  Журналы: `runtime-tests.log`, `source-checks.json`, `source-checks.log`
  в локальном каталоге доказательств. Проверки выполнены на рабочем дереве
  поверх `6beba9a6043f1bba415747649ed991b4e1a633b0` до фиксации исправления.
- Полноценный повтор в новой установленной сборке ещё не выполнен.

## Точка продолжения

Разрешить системный запрос Keychain для установленного тестового кандидата,
затем повторить исходный ABC через его GUI. Отдельно воспроизвести ошибочную
ссылку на колонку и проверить исправление того же узла после закрытия черновика.
Матрица B65/B02/B47/B37/B27/B18/V65/V02/V27/V37 ещё не запускалась.

## Первый кандидат

Commit `6dc261bd2f30e9626ba478705b5ea65e780b4c37`, версия
`0.1.7-local.20260921.3`, канал prod, macOS arm64.
Сборка по штатному runbook завершилась PASS: DMG/ZIP, статическая проверка
4446 ресурсов и автономный artifact smoke. Это не живая приёмка сценария.

- Артефакты: `/Users/kartamyshev/.cache/loginom-macos-build/scenario-20260921-1/`.
- `build-report.json`, `release-manifest.json`, `static-dmg.json`,
  `static-zip.json`, `offline-smoke.json`, `SHA256SUMS` находятся рядом.
- Установлен из readonly DMG в
  `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.3/Loginom AI Agent.app`.
  `codesign --verify --deep --strict` PASS. Пользовательская установка
  `/Applications/Loginom AI Agent.app` не заменялась.
- Отдельный профиль: `candidate-1-profile/` в локальном каталоге доказательств.
  Первый запуск ожидает системного доступа Keychain. Computer Use запретил
  управление SecurityAgent; обход не применялся, пользователю отправлен запрос.
  Первая попытка запуска истекла через 120 секунд; повторная ожидает разрешения.

## Второй набор исходных исправлений

Не входит в установленный первый кандидат; живая приёмка остаётся pending.

| ID | Изменение и границы |
| --- | --- |
| F04 | Сообщение native step и ограниченная причина с кодом сохраняются, включая ранее не перечисленные коды Loginom. Неизвестный эффект не считается исправленным. |
| F05 | Подтверждённый отказ с cleanup и известная ошибка исполнения предлагают исправленный запрос к тому же existing node с новым operation ID. |
| F08 | Отвергнутый resume сохраняет исходный outcome, node, ошибку и unsettled; worker rejection больше не стирает checkpoint. Воспроизведено до правки. |
| F09 | acquire/catalog/admission не скрываются: модель получает этап и безопасный код ошибки; ложное сообщение о доступности инструментов исключено. Ошибка каталога не запускает admission. Занятый чат и recovery различаются. |
| F10 | Лимит обычного preview считается в UTF-8 байтах. Кириллический пример превышал 50 KiB до правки, после — сохраняет целые строки, status/error/next_step и укладывается в лимит. Native exact-table не урезается; его большие ответы и общая backend truncation требуют отдельного аудита. |

F03 (ошибка чтения после исполнения), F06 (допустимость Unicode technical names)
и F07 (возобновление после deadline) требуют живых воспроизведений.
Не отмечены исправленными. Общий аудит 14 драйверов и UI-пути не завершён.

Проверки второго набора: полный runtime suite — exit 0 (`runtime-tests-2.log`);
прицельные SessionTools/LoginomResult — 6 PASS; HostPort/Transport — 8 PASS;
Agent и Host typecheck PASS. Повтор полного macOS source-check pipeline —
8/8 команд PASS (`source-checks-2.json`, `source-checks-2.log`).
Source transforms — 5045 PASS, `git diff --check` — PASS.
Сборку с этим вторым набором предстоит выполнить после исходного повтора;
результаты первого кандидата на него автоматически не переносятся.

## Производные входы

Подготовлены [scenario-cases](scenario-cases/manifest.json), по отдельному ТЗ,
описанию преобразования и hashes файлов:

- V65: 200 строк, 13 русских заголовков; значения совпали с B65.
- V02: 510 строк; очищены region у ID 1–5 и добавлены точные копии ID 1–10
  после очистки; в CSV 10 пустых region с учётом копий.
- V27: 181 строка до 2025-07-01 и 184 начиная с этой даты; конкатенация
  воспроизводит исходные строки без потерь и перестановок.
- V37: 500 исходных строк; отдельное задание на длинную таблицу касаний.

Исходный `analitic-tasks` не изменялся; `result.txt` не использовался.
