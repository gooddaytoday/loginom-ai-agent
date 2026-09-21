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

Завершить проверки первого исправления, собрать локальный кандидат и повторить
исходный ABC через установленный клиент. Отдельно воспроизвести ошибочную
ссылку на колонку и проверить исправление того же узла после закрытия черновика.
Матрица B65/B02/B47/B37/B27/B18/V65/V02/V27/V37 ещё не запускалась.
