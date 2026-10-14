# Группировка: наблюдения этапа 0

## 10.10.2026 — диагностика перед итоговой приёмкой

Проверяемый опубликованный source commit: `ef8dae311da8f255ba24786c786be372b6031028`, ветка `lab69-grouping`, draft PR51 в `shared-oauth`. Исходный локальный `7f70f1c167bd96d3fdd2f2d065b8b9e08151940d` сохранён в ветке истории; деревья исходников совпадают. Кандидат собран чистым на Linux x64, Bun 1.3.14, Node 24.19.0; целостность manifest проверена. Фактический Loginom — 7.4.2. Настройки внутренней модели взяты из текущих инструкций сквада, конкретные значения зафиксированы только в доказательствах попытки.

Перед самостоятельным итоговым сценарием начата отдельная диагностика all-null/пустого входа с `null-empty.csv` и `header-only.csv`. Ожидаемые результаты модели не передавались. Доставлены исходные CSV в корень личного каталога аккаунта карточки; byte/SHA verification SUCCEEDED. Создан собственный черновик `Package1`, затем узел `imports.text` для null-empty. Операция `import-null-empty-001` остановилась в фазе configure до выполнения импорта и до создания GroupData.

Точный переход из durable journal: шаг 39 — `text_import_format: complete configured columns`, SUCCEEDED. Шаг 40 — double_click по типу поля `Amount`, исходное значение `Строковый`, индекс исходного поля 1. Наблюдаемый control: `MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;1_2`. Жест вернул `AMBIGUOUS`, `UI_SCAN_LIMIT`: «Workspace scan budget exceeded; use root discovery and a narrower observation». Это ошибка обвязки наблюдения, а не прочитанная ошибка Loginom о допустимости агрегата.

Операция сохранила verified-фазы source/workflow/target/input_mapping/open и pending configure; `effect_possible=true`, `cleanup_complete=false`, выполнение `not_requested`, пакет не сохранён. operation.inspect подтвердил тот же checkpoint. Resume отклонён: unresolved phase; cancel не снял AMBIGUOUS. Новый operation_id для повторного импорта не создавался. Модель завершила диагностику сообщением о невозможности проверки; exit 0 не означает PASS.

Ручное повторное открытие собственного браузерного профиля после завершения CLI показало форму входа без аутентифицированного рабочего пространства. Контекст закрыт. Это наблюдение не доказывает успешного закрытия прежнего черновика на сервере: `package_closed` и явный logout прежнего модельного сеанса не подтверждены. История и checkpoint сохраняются; критерий cleanup не ослабляется.

Адресные тесты на source ef8dae3: 25 PASS; oracle: 4 PASS; весь client/test: 2587 PASS, 0 FAIL, 10 SKIP. All-null, header-only, GroupData, экспорт, cold-check и независимая приёмка остаются `not_checked`.

Стоп-условие подплана: дефект общего helper и неизвестный исход эффекта. Исправление открытия редактора типа импорта/наблюдения относится к `text-import-procedure.mjs`, `node-procedure.mjs` или `workspace-ui.mjs`, а не к разрешённым `grouping-*.mjs`. Общие helpers, лимиты сканирования, конфигурации обвязки и критерии не изменялись. Требуется решение владельца о разрешённом исправлении общей оболочки; итоговый прогон не начинать до устранения и проверки recovery.
