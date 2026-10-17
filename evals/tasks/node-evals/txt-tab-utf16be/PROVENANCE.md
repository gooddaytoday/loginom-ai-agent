# Происхождение: txt-tab-utf16be

- Базовый case ID: `tab_utf16be`. Исторический результат не переносится на LAB-58; собственный reference/cold PASS подтверждён в provenance.json.
- Исходная ревизия: `685ac7ad92ab79fcfc437295cd7f1c7d6959832c`. [Материал на фиксированном SHA](https://github.com/gooddaytoday/loginom-ai-agent/blob/685ac7ad92ab79fcfc437295cd7f1c7d6959832c/docs/node-development/nodes/text-import/acceptance/matrix/manifest.json).
- Локальный исходный репозиторий: `/Users/kartamyshev/Git/loginom-ai-agent`; данные извлечены read-only через git object, без checkout/fetch.
- История группы: [Multica LAB-15](https://mas.kartamyshev.dev/lab/issues/01a10f9c-ccb8-7d04-9447-4286d4162b32).
- Итоговый reviewer comment: `01a111f6-a3ba-7078-b68c-8004c7935ada`; [result.json](https://mas.kartamyshev.dev/api/attachments/01a111f6-a29e-7e07-a068-095ac34a6a06/download), `435749` bytes, SHA-256 `c1c6d50e516e3e3762b35ebcc674dfc38ca9873ad952ba7f497cde9e93263483`.
- OpenViking URI: `viking://user/kartamyshev/peers/-Users-kartamyshev-Git-loginom-ai-agent/memories/events/2026/10/06/lab15_independent_review_pass.md`. Память — справочная история; принятые SHA и текущие файлы имеют приоритет.
- Исторический статус этого нового кейса: `HISTORICAL_SCOPED_PASS`. Linux standalone scope; Desktop not_checked. Исторический PASS группы не переносится на новый запуск.
- Вход: `tab_utf16be.txt`, `302` bytes, SHA-256 `cc726e1b706dd86c90af4f5763fae0300a618eba43935747f82bde49fa08a72b`.



## Авторская проверка LAB-58

Оригинальные TASK и входные байты сохранены. Независимый oracle рассчитан до первого модельного вызова; метод и хэши — в oracle-provenance.json. Reference: openai/gpt-6-luna/high, warm/cold PASS, полные типы и значения; 13 отрицательных проверок отклонены. Сохранённые события и native journals, реальные модели по архивной БД, расход всех попыток и cleanup передаются отдельным evidence. Product выполняется на frozen SHA один раз через code-only runner без infra retry.
