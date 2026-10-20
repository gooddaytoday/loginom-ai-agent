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
```

Manifest существующей формы `{label,path,node,expected}` содержит `label:"A"`,
сохранённый серверный path, Group node ID и `expected:{Alpha:35,Beta:20}`.
Путь передаётся единственным обязательным аргументом после сценария; fallback нет.
Скрипт печатает приватный evidence-каталог и сохраняет каждую MCP-квитанцию.
Каждый BR открывает seed, создаёт уникальную собственную SaveAs-копию с
`conflict_policy:fail`, делает fresh prepare этой копии и проверяет отсутствие
readonly marker. `ownership_verified:false` у open_package допустим.
Публичный existing Group с текущими document/workflow refs и пустым patch
выполняет сохранённые настройки и предков. До Calculator требуются свежие
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
| BR-S3 | configure ×3                     | Dock освобождает первый сбой; повторный existing configure даёт T3; найти текущий ref собственной btnExecute, click, ждать закрытия мастера, finish | completed, runtime проверяет console execution и Preview schema; node read использует recovery receipt; configure fault remaining=1 |

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

Оба сценария завершаются Dock `package.save_checkpoint` с `conflict_policy:replace`
только по точному собственному пути, созданному SaveAs, и native `modified:false`.
При modified:true сохраняются проверки runtime next_step и новый checkpoint ID.
Журнал должен содержать `acceptance_fault_injected`, `browser_recovery_handoff`,
`browser_recovery_verified`, `browser_recovery_dock_resumed`. Подтверждать отдельно
закрытие собственного пакета/logout и browser/transport cleanup. Не приписывать
текущему успешному запуску очистку ресурсов исторических неудачных попыток.

Отчёт фиксирует SHA исходников, SHA-256 resource manifest (с inventory файлов),
PASS/FAIL по сценарию, ключевые очищенные выдержки и приватные evidence-пути.
