# Node13: первый Hermes FAIL, причина исправлена в задании

Первый полный прогон `20260913-183818-3412861d` не принят.
Назначение `node13:hermes-full:1:c99bc9e2`, source
`c99bc9e2d07802b09c460d79eadb64f55584e3a5`, слот
`node13-hermes-20260913-c99bc9e2`, бюджет 14400s / 100 шагов модели.
Фактически запускались existing openai-codex / gpt-5.6-sol / low и user-v1.
Fresh admission/guard/tool precheck PASS.

Импорт «Продажи» SUCCEEDED, но запрос нового «Календаря»/Done передал
исключённый DateB с name=DateB и label=DateB. Последнее — метка служебного
выходного record, а не исходного поля с меткой «Дата». Обработчик корректно
отказал: `Date/time output: excluded source cannot be renamed`,
AMBIGUOUS/output_mapping. Повторные inspect не исправляли исходный запрос.
Неуспешная группа модели остановлена SIGTERM; старый pending не повторялся.
Экспорт сохранён, child exit=-15, launcher exit=0 не считался успехом.
Все известные PID модели/launcher/браузера завершились; координатор освободил слот.
Полный goal/save/reopen не выполнены; usage-файл при остановке не сформировался.
[Исходный FAIL и хэши](node13-live-preflight/hermes-full-1-failure.json).

## Адресная диагностика и уточнение

В отдельной живой сессии `466a9082-0b78-4b41-96de-4eb82f6e3258` открыт
собственный ранее проверенный пакет. Мастер выхода подтвердил source
DateB/Дата и native excluded target DateB/DateB. На реальном native mapping
тот же resolver воспроизвёл отказ ошибочного запроса; запись
`{"source":{"kind":"configured_field","name":"DateB"},"excluded":true}`
без name/label разрешилась для всех 28 записей (27 активных + исключение).
Мастер отменён, настройки/данные не менялись, дополнительного save не было,
сессия закрыта exit0. [Живое доказательство](node13-live-preflight/hermes-excluded-request-live-diagnosis.json).

В исполняемый goal добавлена эта точная запись для обоих календарей.
Frozen-v4 сохраняет семантику, prompt_revision=2 фиксирует уточнение.
CSV, expected tables, девять запросов и runtime/candidate не изменились.
Уточнение 14 сентября: исходный лог Python содержал 547 PASS и 1 FAIL
(устаревший запрет API-рецепта после prompt_revision2), а прежнее утверждение
«548 PASS» было ошибочным. Входы275 прошли проверку хешей; [проверка неизменности](node13-live-preflight/hermes-prompt-clarification.json).
Предыдущий успешный model-free сценарий/save/reopen остаётся применимым
к тем же данным и клиентскому коду; повторять его целиком ради уточнения текста
не требуется. Дефект runtime не заявляется и исправления runtime не вводились.

## Следующий запуск

Готов новый документ `.dock/node13-live-preflight/final-admission-2/admission.json`
с актуальными source/pins и ссылкой на адресную диагностику. Старый filled
admission и исходная slot assignment сохранены в каталоге первого прогона.
Новые run_id/budget/slot остаются пустыми до нового слота координатора.
Команда: `python3 tools/loginom-acceptance/date_time_launch.py --admission .dock/node13-live-preflight/final-admission-2/admission.json --run`.
После полного выполнения модели обязательны fresh reopen6/direct saved-import
и независимый итоговый аудит. Новые узлы/main/merge/push/deploy/plugin не запускались.
