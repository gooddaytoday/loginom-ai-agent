# Node13: Hermes retry2

Назначение `node13:hermes-full:2:0787b3ab`, слот
`node13-hermes-20260913-0787b3ab-r2`, run `20260913-195531-1f2bd245`.
Source `0787b3abe6e57fee93055a6d01b81bb671352f37`, runtime2488fdaa,
candidate db38f7f2, inputs d7a56a96, frozen-v4 prompt_revision2.
Предыдущие FAIL и receipts не менялись.

Запущена существующая подписка openai-codex / gpt-5.6-sol / low.
Fresh guard/tool precheck PASS, реальные сессии user-v1.
Полный исполняемый goal подтверждён: 9 запросов, 6 узлов, один save;
excluded DateB задан без name/label. Budget14400s/max_turns100.
Фактический launcher PID85112, Hermes PID85576, PTY17731.
Рабочая сессия `fabd658c-2d23-43e7-bf4b-95174effadd6`, предварительная
`6c9dacfb-71a9-4fba-99d1-5825eface4ce`.

Лог: `.dock/node13-live-preflight/final-admission-2/hermes-launch.log`.
Run: `.dock/node13-acceptance/runs/20260913-195531-1f2bd245`.
Admission: `.dock/node13-live-preflight/final-admission-2/admission.json`,
локальная копия нового назначения slot-assignment.json; исходный пустой
admission сохранён как admission.before-slot.json.

Hermes завершён: returncode0, timed_out=false, completed=true, failed=false,
38 API-вызовов; все девять операций SUCCEEDED и один save-final-package
SUCCEEDED. Launcher/model/browser cleanup подтверждён, слот освобождён.
Это промежуточный результат, до независимого reopen полная приёмка не заявлена.

Исходный `audit-before-reopen.json` сохранён с FAIL: user-v1 нормализатор
попытался вызвать `.get()` у строки. Реальный ответ wait в row20 — точная
ссылка Hermes на running snapshot row18 (provider call_QaBNTyr0b7eCr9olvkitnjmS).
Механизм подтверждён установленным `agent/tool_guardrails.py:observe_call`:
инструмент выполняется, совпадают tool/args и hash результата, заменяется только
представление в контексте. Отдельный resolver проверяет точный marker,
единственный прежний provider ID в том же caller, порядок и непрерывность
одинаковых вызовов, полный args, operation ID и running/error=null.
Произвольные строки, другие инструменты и settled-ссылки не допускаются;
10 отрицательных вариантов отклонены. Исходные evidence, inputs и код
замороженного аудитора не изменялись. `audit-before-reopen-resolved.json`
прошёл все проверки, кроме ещё не выполненного independent_persistence.

Evidence занимает 960 МБ, что превышает предел строки Node.js. Для direct
reopen из исходного JSON извлечены только 18 node_apply_prepared/node_checkpoint
событий, необходимые неизменному диагностическому адаптеру. Выборка и исходный
файл связаны SHA-256, перед чтением проверяются оба хеша. Запрос, события,
настройки и итоговые значения не исправлялись. Полный аудит читает исходный файл.

Первая fresh-сессия `0a467033-a51c-4f22-a319-c8597fb8ef70` остановилась
до изменения настроек: toast перекрыл graph observation. При прямом наблюдении
после timeout toast исчез, пакет имел пометку «только чтение». Собственный пакет
закрыт без save, harness exit0; исходный отказ сохранён.
Новая fresh-сессия `4d6f2a50-9850-450a-80f9-b0f86eee98db`, PTY59319:
тот же runtime/candidate, Loginom7.4.2, viewport=null, inner1508×862,
outer1508×949. Direct reopen ожидает исчезновения наблюдённого toast.
Модель не запускалась. На 2026-09-14 00:24 MSK первые пять узлов
повторного прогона SUCCEEDED с cleanup=true. Независимые компонентные аудиты
Календаря, Месяцев и Кварталов PASS; проверка Нет продаж запущена.
Выполняется шестой узел `node13-reopen-5` — Пустой календарь.
Режим исходного пакета остался «только чтение»: чтение мастеров и штатное
выполнение в этом режиме доступны. Исчезновение toast не считалось снятием
read-only; смена режима/копия/дополнительное сохранение не выполнялись.

Продолжение: `.dock/node13-live-preflight/reopen-hermes-r2-projected-ready.mjs`
выполняется в новой сессии. После шести узлов — close-hermes-r2-reopen.mjs
без save, seal-reopen.mjs, закрытие harness. Финальный аудит:
`.dock/node13-live-preflight/audit-hermes-r2-resolved.py <diagnostics.json>`;
он сохраняет отдельный результат и provenance точной ссылки Hermes.

## Итог и поправка исторического допуска

Reopen остановился на шестом узле из-за скрытого breadcrumb выходного порта;
первые пять прошли. Исходный AMBIGUOUS/cleanupfalse сохранён. Узкая правка
на новом runtime d5fd1ba7 прошла живой исходный edge и независимые15/15 проверок.
Подробности: [отчёт исправления](node-13-overflow-owner-fix.md).

Полный PASS r2 не заявлен также из-за ошибочного targeted_regression gate:
лог до запуска содержит547 PASS/1 FAIL, а receipt утверждал548 PASS. Сейчас
устаревший тест уточнён и548 PASS подтверждены; исходные admission/log/FAIL
не изменены. Это отменяет прежний вывод о достаточности всех pre-reopen gates,
но не меняет наблюдаемые9 SUCCEEDED, save и результаты данных.
