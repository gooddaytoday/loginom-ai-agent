# Происхождение: csv-semicolon-cp1251-decimal

- Базовый case ID: `semicolon_cp1251_decimal`. Исторический результат не переносится на LAB-58; собственный reference/cold PASS подтверждён в provenance.json.
- Исходная ревизия: `5cd74d8ee5d6125692d953eb327b4d4f833c27a1`. [Материал на фиксированном SHA](https://github.com/gooddaytoday/loginom-ai-agent/blob/5cd74d8ee5d6125692d953eb327b4d4f833c27a1/docs/node-development/nodes/text-import/acceptance/csv-matrix/manifest.json).
- Локальный исходный репозиторий: `/Users/kartamyshev/Git/loginom-ai-agent`; данные извлечены read-only через git object, без checkout/fetch.
- История группы: [Multica LAB-18](https://mas.kartamyshev.dev/lab/issues/01a11298-d56a-70cf-82c0-f88e65913899).
- Итоговый reviewer comment: `01a11563-d937-7e2f-be87-62a7cf298d08`; [result.json](https://mas.kartamyshev.dev/api/attachments/01a11563-d389-716a-afc8-d664fe9a39d0/download), `1854039` bytes, SHA-256 `519d990e9fea6bdb041dad7f77d3aa0ac6ea31a3e7429c7b5e5de9671e501549`.
- OpenViking URI: `viking://user/kartamyshev/peers/-Users-kartamyshev-Git-loginom-ai-agent/memories/events/2026/10/06/lab18_csv_fix_verified.md`. Память — справочная история; принятые SHA и текущие файлы имеют приоритет.
- Исторический статус этого нового кейса: `HISTORICAL_SCOPED_PASS`. Linux standalone scope; Desktop not_checked. Исторический PASS группы не переносится на новый запуск.
- Вход: `semicolon_cp1251_decimal.csv`, `150` bytes, SHA-256 `94821af546f6454601f5338d6fe32b8bf7a85bf7208b34df2bc522e55e2ab4dd`.



## Авторская проверка LAB-58

Оригинальные TASK и входные байты сохранены. Независимый oracle рассчитан до первого модельного вызова; метод и хэши — в oracle-provenance.json. Reference: openai/gpt-6-luna/high, warm/cold PASS, полные типы и значения; 13 отрицательных проверок отклонены. Сохранённые события и native journals, реальные модели по архивной БД, расход всех попыток и cleanup передаются отдельным evidence. Product выполняется на frozen SHA один раз через code-only runner без infra retry.
