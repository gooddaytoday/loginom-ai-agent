> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-3086455625f9` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 14: автономная приёмка candidate2 — FAIL, 2026-09-13

Назначение `node14:autonomous-acceptance:3:cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad`
выполнено одним прогоном в слоте `node14-hermes-20260913-cadd80df`.
**Полная цель не достигнута; итог независимого аудитора FAIL.**
Второй запуск, ручное достраивание сценария и исправления не выполнялись.

## Фактический запуск

Run: `20260913-132939-0384fe0b`, рабочая MCP-сессия:
`7f49e39f-3752-4a75-b6ef-be8b778e4f3e`.
Новый run/session не переиспользовал закрытый preflight.

- Фактические usage identifiers: `openai-codex` / `gpt-5.6-sol`, reasoning `low`.
- **25 API-вызовов**, один модельный процесс; process exit **0**, timeout=false.
  Launcher exit 0 означает завершённый экспорт, а не успех приёмки.
- Auth guard установлен, blocked_attempts=0, исходная подписка неизменна;
  fallback не выполнялся. Pins и срок подписки >4200 секунд проверены перед запуском.
- Сохранены все **31 вызов, 31 ответ и 3396 событий**. Export complete;
  source/runtime/harness/native skill не изменились.
- Исторический launch plan с `launch_authorized:false` не менялся. Отдельная
  квитанция разрешения: `unavailable:artifact-dc7e4db001c06a7b`.

## Результаты и блокер

Подготовлено 7 запросов node.apply, все относятся к текстовому импорту.
Пять завершились SUCCEEDED: `import-base`, `import-precision`, `import-skew`,
`import-boundary`, `import-one120b`.

`import-one120` завершился NOT_APPLIED до эффекта: точка размещения недоступна,
cleanup=true, effect_possible=false, node=null. Hermes затем выполнил новый
запрос `import-one120b` успешно. Это отказ текстового импорта; исключение строгого
аудитора для доказанного терминального отказа **Missing Values** его не расширяет.

Основная остановка сценария: `import-allnull`, узел «Все пропуски».
В фазе configure шаг34 `set_wizard_field` со значением `NULL` вернул
`WIZARD_FIELD_NOT_CONFIRMED`: «Import preview did not settle in the original
wizard after input completion». Квитанция содержит применённый жест и отказ
подтверждения примерно через 6,8 секунды. Внутренняя ui.act квитанция имеет
cleanup=true; это не доказывает очистку всей node.apply, которая осталась
**AMBIGUOUS / configure, cleanup=false, effect_possible=true**.
Execution=not_requested, output=not_refreshed, pending_phase=configure.

Два публичных inspect подтвердили pending, cleanup_confirmed=false,
recovery_options=[], internal_resume_available=false. Причина незавершённого
подтверждения preview в этой фазе не воспроизводилась отдельно; это точка
последующей диагностики, а не установленный продуктовый root cause.
Начальные неоднозначные ответы artifact upload также сохранены полностью.

Полный независимый `missing_values_acceptance.py` выполнен на неизменённом
export и точных байтах candidate2. Pre-audit и final-audit: **FAIL**,
`terminal_refusal_accounting: terminal_refusal_proof_mismatch`,
`incomplete_evidence: Unproved prepared operation or refusal`.
Аудитор прекращает дальнейшие gates после недоказанного запроса; отсутствующие
проверки не объявлены успешными. Дополнительная read-only инвентаризация полного
export отдельно установила:

| Обязательство | Фактически |
| --- | --- |
| 27 успешных операций | 5 |
| 9 успешных импортов | 5 |
| 12 финальных результатов Missing Values | 0; ни одного Missing Values prepared |
| Native save | 0 квитанций |
| Независимый reopen/full values/schema | Не выполнен: нет сохранённого пакета и допуска reader |

Запуск reader без полного working-phase/save нарушил бы его замороженные условия.
Полная цель 27/9/12/save/reopen сохранена; успех процесса и частичные импорты её
не заменяют. Никаких ослаблений scoped refusal accounting не внесено.

## Pins, сохранность и завершение

Source: `83dc0db5c4d765706f9dd5271bfe5ecc46220cb4`.
Runtime: `bdddbd1b922f99b0f8db4a6fa47b7e7c89315b4f5632d914531fdd6befaea77e`.
Inventory: 156 runtime /395 source /252 harness. Harness map SHA:
`a07e20a505fbd578bf3f14f7d81f305fb13658ba6c6c3a691da789975428eea5`.
Candidate `2026.09.13-node14-test4.2-candidate`, manifest SHA:
`cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad`.

[Точные pins и 14 receipts](missing-values-autonomous-acceptance-3-pins-2026-09-13.json).
Приватный корень: `unavailable:artifact-a0b6013c9a3447cd`.
Полный evidence SHA:
`5ab0cc93d3f2dbf6bcb17c64ce529fcd8f8e33755a5c4f91fb0241a1806df5da`.
Evidence index SHA:
`0fff6fdbacad3350588ea0d6259cea4d71452f74aa35cc7690363a0a88108a4a`.

Старый FAIL `20260913-113814-1bc86af9` и его **13/13** receipts повторно сверены
по размерам/SHA и не изменены. Свежий FAIL сохранён отдельно.
После завершения подтверждено отсутствие собственных acceptance/MCP/browser
процессов: `process-check.json`, all_stopped=true. Это процессная очистка,
не ретроспективное подтверждение cleanup незавершённой node.apply.

Исходники, goal, oracle и harness не менялись. Review, main/merge/push/deploy,
plugin и memory routing не выполнялись. Продолжение диагностики и новый запуск
ожидают отдельного назначения координатора; слот этим прогоном использован.
