# Browser recovery: первый smoke на Loginom

Проверка исходников на реальном Loginom 7.4.2 через managed runtime, с одним
аутентифицированным Chromium и scripted operator. Это не приёмка установленного
Desktop и не оценка качества модели.

BR-S1 и BR-S3 прошли native smoke на сохранённой Group-заготовке.
Harness использует обязательный private saved-A manifest; оба сценария подтвердили
свежий read, final Save и собственный cleanup. [Отчёт 2026-10-20](reports/2026-10-20-browser-recovery-smoke/report.md)
сохраняет все исторические unknown upload/cleanup. Они не закрываются новым PASS.

## Окружение и запуск

Linux, обычный пользователь, доступный DISPLAY, sandbox включён. Node, Bun,
Chromium и MCP должны соответствовать product pins. Приватная JSON-конфигурация
(0600) содержит `api_key`, `loginom_url`, `workflow_profile.loginom_user` и
`workflow_profile.passwordless_login: true`. Не выводить её или сырые журналы.

Если bundled runtime изменился, перед прогоном вызвать существующий `stageResources` из
`packages/loginom-host/script/stage-resources.ts` с абсолютными `destination`,
`node`, `browsers`, `target: {platform: "linux", arch: "x64"}`, `flavor: "desktop"`.
Назначение — новый приватный каталог вне Git (0700). Старые resources Task 0
не доказывают работу текущей реализации. Уже проверенный свежий stage можно повторно
использовать при неизменных bundled runtime/Host/product skills; изменения harness
и документации сами по себе staging не требуют. Сохранять исходную идентичность
builder commit. Одноразовый staging helper не коммитить.

Из `packages/desktop`, последовательно:

```bash
DISPLAY=:1 LOGINOM_AI_AGENT_TEST_CONFIG=<private-config> \
LOGINOM_AI_AGENT_TEST_RESOURCES=<fresh-resources> \
<absolute-pinned-bun> test/loginom/browser-recovery-acceptance.ts BR-S1 <private-saved-A.json>
# Только после подтверждённого BR-S1:
DISPLAY=:1 LOGINOM_AI_AGENT_TEST_CONFIG=<private-config> \
LOGINOM_AI_AGENT_TEST_RESOURCES=<fresh-resources> \
<absolute-pinned-bun> test/loginom/browser-recovery-acceptance.ts BR-S3 <private-saved-A.json>
# После принятого обычного Export main path; результаты S1/S3 повторять не требуется:
DISPLAY=:1 LOGINOM_AI_AGENT_TEST_CONFIG=<private-config> \
LOGINOM_AI_AGENT_TEST_RESOURCES=<fresh-resources> \
<absolute-pinned-bun> test/loginom/browser-recovery-acceptance.ts BR-S2 <private-saved-A.json>
# Только после чтения и принятия квитанций BR-S2:
DISPLAY=:1 LOGINOM_AI_AGENT_TEST_CONFIG=<private-config> \
LOGINOM_AI_AGENT_TEST_RESOURCES=<fresh-resources> \
<absolute-pinned-bun> test/loginom/browser-recovery-acceptance.ts BR-S4 <private-saved-A.json>
```

Manifest существующей формы `{label,path,node,expected}` содержит `label:"A"`,
сохранённый серверный path, Group node ID и `expected:{Alpha:35,Beta:20}`.
Путь передаётся единственным обязательным аргументом после сценария; fallback нет.
Скрипт печатает приватный evidence-каталог и сохраняет каждую MCP-квитанцию.
Каждый BR открывает seed, создаёт уникальную собственную SaveAs-копию с
`conflict_policy:fail`, делает fresh prepare этой копии и проверяет отсутствие
readonly marker. `ownership_verified:false` у open_package допустим.
Публичный existing Group с текущими document/workflow refs и пустым patch
выполняет сохранённые настройки и предков. До Calculator/Export требуются свежие
Category:string/Total:real, полная точная выборка Alpha/35, Beta/20; поля сравниваются
по именам, фиксированный output layout не задаётся. Внутренние helpers подготовки
и attachment/upload/import setup в BR не используются.

При первом FAIL/unknown остановиться до следующего BR. Не повторять жест,
неизвестное выполнение или операцию под новым ID. Сначала установить причину по
сохранённым квитанциям; изменение продукта требует отдельного решения владельца.

## Сценарии и критерии

| ID    | Fault                            | Оператор                                                                                                                                            | Проверяемый результат                                                                                                               |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BR-S1 | configure ×1, release_refusal ×1 | Найти текущий ref собственной btnClose, проверить единственность/принадлежность мастеру, click, finish                                              | T1, continuable; новая existing-операция с полными настройками/пустыми inputs и mappings успешна; node read                         |
| BR-S2 | Export configure ×1 | T2 без Dock release; observed owned Cancel, finish, новая existing-операция того же узла | continuable; исходный output released_by/receipt; текущий файл/данные/bytes/SHA; Save/cleanup |
| BR-S3 | configure ×3                     | Dock освобождает первый сбой; повторный existing configure даёт T3; найти текущий ref собственной btnExecute, click, ждать закрытия мастера, finish | completed, runtime проверяет console execution и Preview schema; node read использует recovery receipt; configure fault remaining=1 |
| BR-S4 | Calculator execute ×1 | Dock release → T4 execution; start → finish actions[] без browser tools | completed, verified execution/schema, fresh node read по recovery receipt, Save/cleanup |

Calculator: `DoubleAmount = Total*2`, integer, без output mapping,
`finish: execute`, `read.ports: []`. Browser оператор использует только публичные
recovery tools; `browser_find` не имеет scope и ищет строки accessibility snapshot. Сначала
selector-target snapshot канонической собственной `btnClose`/`btnExecute` даёт
текущий ref; поиск exact ref должен дать одно совпадение, а свежий узкий snapshot
мастера текущего handoff — подтвердить принадлежность. Ref не угадывается по
позиции. Отмена может показать подтверждение: только наблюдённый точный вопрос
«Вы действительно хотите закрыть мастер настройки?» разрешает выбор собственной
«Да» через те же публичные наблюдения. Исчезновение наблюдённой страницы мастера
проверяется `browser_wait_for`; итог всё равно проверяет runtime. Запрещены private evaluate,
unsafe code и обход управления страницей. `user_action` недопустим во всех ответах.

BR-S2 создаёт новый UUID `.csv` под текущим `dock_prepare.storage_directories.exports`;
`exports.text`, overwrite replace, UTF-8, `;`, header names, без BOM, LF, decimal `.`,
пустой null_marker, qualifier `"`. Input — свежий Group/output0, mappings пустые,
finish execute, read ports[]/sample_rows0/require_exact_numbersfalse. Inspect должен
дать T2/NO_RECOVERY_OPTIONS и пустые recovery_options: Export release не вызывается.
После owned Cancel и continuable исходная операция должна содержать
`output.released_by:browser_recovery` и совпавший recovery_receipt_id. Новый ID
применяет полные настройки к тому же existing node с inputs[]/mappings[].

Текущие native destination_check/execution/download/bytes receipts связываются
с public file_artifact и retained файлом штатного artifact store. Проверяются raw
размер/SHA, UTF-8/LF и две строки Alpha35/Beta20 по именам полей текущего Group;
header order не фиксируется. Второго download, исторического Export receipt,
общего destination и дополнительных аргументов нет. При неожиданно существующем
UUID target проверка прекращается. Calls remaining учитывают browser calls и finish.
Подготовительный Export PASS и фактический статус S2 — в [source-отчёте](reports/2026-10-20-browser-recovery-source/report.md).

BR-S4 сохраняет тот же Calculator-запрос, но inject срабатывает после execute.
После штатного release требуется T4/effect execution; start сразу переходит к finish
с actions[] без browser tools. Runtime должен подтвердить completed, execution
и output schema; следующий read использует именно текущую recovery receipt и даёт
fresh output. Numeric gate70/40 не добавляется.

Все четыре сценария завершаются Dock `package.save_checkpoint` с `conflict_policy:replace`
только по точному собственному пути, созданному SaveAs, и native `modified:false`.
При modified:true сохраняются проверки runtime next_step и новый checkpoint ID.
Журнал должен содержать `acceptance_fault_injected`, `browser_recovery_handoff`,
`browser_recovery_verified`, `browser_recovery_dock_resumed`. Подтверждать отдельно
закрытие собственного пакета/logout и browser/transport cleanup. Не приписывать
текущему успешному запуску очистку ресурсов исторических неудачных попыток.

Отчёт фиксирует SHA исходников, SHA-256 resource manifest (с inventory файлов),
PASS/FAIL по сценарию, ключевые очищенные выдержки и приватные evidence-пути.
