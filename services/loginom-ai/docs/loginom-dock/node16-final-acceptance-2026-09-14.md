> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-5a811d6bfe13` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16: полная независимая приёмка пройдена

**FULL PASS: 10 случаев / 470 ячеек, 10 независимых открытий / 470 ячеек,
14 групп итогового аудита.** Результат относится к неслитой ветке
`codex/node-16-collapse-columns`, source `8cd5c2811a216b45ae50a16a4ed1930e4e87fa59`,
runtime `17b0ede0035452a2e9481a3ba007b97a8d1b1b47fdd13ffd4e9153b90dc8daed`.
Production-код во время запуска и последующего аудита не менялся.

Hermes run `20260914-004604-475bb0c8`, execution harness `ef6ba6b0`:
существующий ChatGPT / openai-codex / gpt-5.6-sol / low, exit0, timed_out=false,
completed=true. Экспорт содержит74calls/9828events; runtime/harness unchanged=true.
Кандидат `0badbd69238af677d85da3ac9bc8a52fc889f303fcdd8c06bb75ff8773ee5514`
прошёл предварительную actual private user-v1 проверку и был запущен на отдельном
слоте координатора. После прерывания Codex лимитом повторная модель не запускалась.

## Исходный сбой итогового скрипта сохранён

Wrapper завершился exit2/FAILED_MODEL_OR_EXPORT уже после успешного выхода модели
и записи evidence.json. Его аудитор вызвал `.get()` для строки: Hermes заменил
два повторяющихся промежуточных ответа ссылками, а два больших ответа сохранил
в spillover-файлы. Исходный collapse-audit.json не был создан.

Request, scenario, evidence, attempt и traceback сохранены. Отдельный
`services/loginom-ai/tools/node16-model5-audit/reevaluate.py` проверяет их хеши и все272исходных файла
harness, восстанавливает только transport и запускает прежние семантические проверки.
Путь/идентичность call/arguments/session, длина и preview файлов проверены;
полный результат wide дополнительно сверяется с native journal и frozen oracle.
Точное описание дельты: [README аудитора](../../tools/node16-model5-audit/README.md).
Это **отдельный versioned full PASS**, не исправленная задним числом история wrapper.
Предыдущие четыре прогона сохраняют исходные результаты.

## Подтверждённые результаты

| Случай | Ячеек модели | Ячеек после свежего открытия |
|---|---:|---:|
| mixed | 60 | 60 |
| ignore | 44 | 44 |
| header-only | 0 | 0 |
| header-only-ignore | 0 | 0 |
| all-null | 20 | 20 |
| all-null-ignore | 0 | 0 |
| mapped | 75 | 75 |
| mapped-ignore | 55 | 55 |
| reconfigured | 24 | 24 |
| wide | 192 | 192 |
| **Итого** | **470** | **470** |

Модель сохранила все десять вариантов через package.save_checkpoint:
`/test-1/node16-20260913-a56c2488/Dock-collapse-20260914-004604-475bb0c8-<case>.lgp`.
Пять CSV и десять LGP сначала скачаны нативным readonly путём. Для каждого
повторного открытия проверены исходные байты до изменений, новый document/session,
те же GUID, настройки источника, роли, flag, оба mapping и native graph.
Повторное выполнение выполнялось без перенастройки Collapse/import.

Отрицательные conflict/missing/empty и Done/Close прошли исходные проверки.
В независимой копии wide намеренно потерян ответ после реального set_checked:
операция осталась AMBIGUOUS, повтор вернул тот же результат без новых действий
(browser sequence576→576), resume отказал NODE_WORKER_REJECTED/unresolved phase.
Нативное чтение подтвердило изменённый флаг и прежние24роли. Прямой текст ошибки
диагностической обёртки отличается от текста сырого ответа; отдельная версия
проверяет его точно и сохраняет все проверки raw resume/wait, не меняя evidence.

Четыре тестовых метода versioned verifier прошли, включая11отрицательных подмен.
Ранее source8cd5c281 прошёл1533клиентских теста /1SKIP; production не менялся,
повторный полный review и лишний клиентский прогон не выполнялись.
Все собственные сессии завершены: очереди пусты, logout=true, процессов нет.
Закрытие мастера после проверки потери ответа подтверждено через штатный диалог;
сама исходная AMBIGUOUS квитанция не заменена успешной.

## Доказательства и дальнейшие границы

- Исходный run: `unavailable:artifact-40a59ab0e7b307ab`.
- Полный отчёт: `versioned-full-audit-v1.json`; связка: `independent/bundle.json`.
- Десять результатов: `independent/fresh-batch-results.json`.
- Loss: `unavailable:artifact-e62f50c6350cd7f9`.
- [Машинный итог с хешами и точными сессиями](node16-final-acceptance-2026-09-14.json).

Node16 готов к передаче координатору после единственного review и исправлений.
Merge, main, deploy и обновление общего plugin не выполнялись и требуют отдельной
команды пользователя. Наблюдаемая стабильность native чтения не является атомарным
server snapshot; сохраняются явно возвращаемые no_server_snapshot/unobserved_aba_risk.
