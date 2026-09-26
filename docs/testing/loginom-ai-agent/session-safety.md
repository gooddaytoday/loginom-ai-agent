# Строгий профиль и завершение собственной сессии

Изменение подготовлено от `a8ad59766dbdb4f2da0b54367a755ce00891dd71` (v0.1.17).
Это приватный продуктовый интерфейс для внешнего контроллера. Он не добавляет
инструмент модели и не запускает node/eval кампании. Локальные fixture проверки
не являются приёмкой Desktop, CLI или живого Loginom.

После первого CI дополнительно проверены полный Desktop gate (157 PASS,
3 Windows skips; документированный `draft-store` исключён) и семь CLI suites
(25 PASS, 6 platform skips). Привилегированный Electron mock перенесён в
отдельный fixture-процесс: он больше не меняет импорты соседних WSL tests.
CLI fixture теперь проверяет sticky strict после снятия env и сохранение
pending до явного восстановления. Windows workflow выбирает первый Application
из `Get-Command`; версии Node/Bun и их точная проверка сохранены. Native Windows
подтверждение ожидается от CI, локального PowerShell нет.

Desktop typecheck прошёл. Локальный Agent typecheck заблокирован конфликтом
номинальных Plugin/SDK типов из двух корней общего кеша зависимостей; код
продукта ради этого не менялся. Обе CI-проверки типов исходного PR commit
`636700656784e6072097173167d75db61afc5227` прошли. На этом же SHA парные
Chromium jobs дали разные результаты (PASS и fixture socket `ECONNRESET`);
это не объявляется успешным общим CI.

`ECONNRESET` воспроизведён на закреплённых Node 24.19.0/Chromium 1243:
ошибка приходила от raw CONNECT socket после намеренного ответа 502 и закрытия.
Fixture теперь принимает только такой reset после `writableEnded`; ранний reset,
EPIPE и остальные ошибки по-прежнему проваливают проверку. Все проверки обхода
proxy/PAC, navigation и WebSocket сохранены. Три локальных повтора headless/headed
дали по 4 PASS. Системный proxy пользовательского Mac не менялся; native
proxy-сценарии выполняются только в disposable CI.

## Политика профиля

`LOGINOM_AI_AGENT_STRICT_RECOVERY=1` включает строгий режим Desktop и CLI.
Первое включение сохраняет приватный `recovery/.strict-policy` (`strict-v1`).
Снятый флаг и явный `strictRecovery:false` не понижают уже закреплённый режим.
Прежние записи dispatch без policy также удерживают строгий режим: удаление
policy при существующем барьере не разрешает продолжение. Повреждённая policy,
symlink или небезопасные права доступа приводят к отказу запуска. Новый профиль
без policy/записей сохраняет прежний advisory default. `connection.status/read`
возвращает `recoveryMode`; зарегистрированный профиль также возвращает
`sessionCompletion: open | pending | completed`.

Регистрация контроллера включает строгий режим независимо от env. Она не
сбрасывается и не редактируется через модель или management API. Для нового
attempt нужны новый профиль и новые учётные записи.

## Граница доверия

До запуска Host доверенный launcher записывает в его **приватный root** файл
`session-registration.json` с правами 0600:

```json
{"version":1,"attemptId":"controller-issued-attempt-id"}
```

Это carrier идентификатора попытки, а не самостоятельное доказательство
Paperclip manual admission. Контроллер обязан получить ID из закреплённого
admission/provisioning descriptor и изолировать root, registration, приватный
IPC и runtime state от файловой системы/shell модели (отдельный principal или
закрытый mount). Same-UID файл без этой внешней изоляции не защищает от подделки.
Host проверяет владельца, права, отсутствие symlink у файла и точную структуру;
никаких credentials в registration нет. Модель не выбирает attemptId.

Продукт привязывает receipt к **фактически наблюдаемым** generation/chat,
Loginom session/document/account, package path и последнему save operation.
`generation` здесь — поколение продуктового connectionStore, а не P03
`executionGeneration`; внешний controller связывает оба значения явно.
Контроллер отдельно сверяет эти поля с provisioned descriptor. Идентификатор
попытки сам по себе не заменяет такую сверку.

## Приватный протокол

Node Host использует management методы:

- `connection.session-completion-options` с `{generation,chat}`. `chat` —
  существующий SHA-256 ключ runtime. Новый runtime не создаётся.
- `connection.finish-own-session` с `{completionId,binding}`.

Desktop main регистрирует соответствующие проверенные IPC handlers; preload
публикует их отдельно как `window.api.loginomSession`. Публичный backend/model
`Loginom.API` и MCP tool catalog не расширяются. Renderer должен быть доверенным
главным frame приложения, а не произвольным web frame.

`binding` включает `attemptId`, `generation`, `chat`, `sessionId`, `documentId`,
`account`, `packagePath`, `saveOperationId`, `mutationRevision`. Options доступны
только после подтверждённого сохранения, без более поздних потенциальных
мутаций. Повтор старого cached save receipt не обновляет revision. Повторный
запрос после изменения binding отклоняется до cleanup.

`finish` требует отсутствия активного владельца, проверки соединения, смены
настроек и незавершённых dispatch. Контроллер вызывает его после освобождения
модельной lease. До эффекта сохраняются recovery intent с
`purpose: session-completion` и UNKNOWN receipt. Затем существующий native guard
проверяет подготовленный документ/account/package, единственный собственный
пакет, отсутствие dirty/running/dialog/foreign state, закрывает пакет и
подтверждает logout. Никакого auto-discard или foreign logout нет.

Результат — versioned receipt:
`{version:1,completionId,binding,status,packageClosed,loggedOut,reason}`.
`SUCCEEDED` требует точной привязки, `packageClosed:true`, `loggedOut:true` и
`reason:null`. Только такой receipt снимает **свой** recovery intent.

Одинаковый completionId и binding возвращают сохранённый результат. Иной
binding конфликтует. `BLOCKED` окончателен для этого ID; `UNKNOWN` повторно
запрашивает только уже имеющийся runtime status, не повторяет жесты. Потеря
runtime/Host сохраняет UNKNOWN и запрещает новый login в этом профиле.
Generic acknowledge не стирает даже orphan completion intent, возникший до
записи receipt. После SUCCEEDED профиль остаётся terminal: новый model acquire,
новая проверка/смена соединения, readiness login и другой completionId запрещены.
Для следующей попытки контроллер создаёт отдельный профиль.

## Практические ограничения

- Transport close/ACK означает только локальное завершение ресурсов. Это не
  подтверждение Loginom logout; BLOCKED bridge shutdown не выдаёт успешный ACK.
- Receipt относится к одной runtime session. Он **не доказывает** отсутствие
  остальных сессий account: readiness/validation могли иметь отдельные сессии.
  Перед блокировкой account provisioning обязан независимо сверить серверный
  inventory и подтвердить cleanup всех принадлежащих попытке сессий.
- При потере runtime и отсутствии подтверждённого receipt автоматического
  разрешения барьера нет. Нужен отдельный controller reconciliation; TTL,
  удаление policy, новый completionId и generic acknowledge не являются им.
- Cold reopen/readback и независимое сравнение артефакта реализуются в Swarm.
  Этот интерфейс не превращает same-browser save в независимую приёмку.
- Native Desktop/CLI acceptance на целевом стенде, продуктовая сборка и
  человеческое принятие PR остаются отдельными gates. В ходе этой разработки
  Loginom, модели и реальные кампании не запускались.

## Локальные проверки

Использовать закреплённые Bun 1.3.14 и Node 24.19.0. Из `packages/loginom-host`:
`LOGINOM_AI_AGENT_TEST_NODE=/absolute/pinned/node bun test`, `bun typecheck`.
Из `packages/desktop`: `bun test src/main/loginom`, `bun typecheck`.
Из `packages/schema`: `bun typecheck`.
Из `packages/loginom-runtime`: `node --test client/test/*.test.mjs test/*.test.mjs`.

Новые тесты проверяют sticky policy, corrupt/missing policy, trusted registration,
подмену любой привязки, last-mutation/save и cached-save replay, запись намерения
до эффекта, concurrent finish и validation race, transport ACK only,
BLOCKED/UNKNOWN, observation-only reconciliation, orphan journal, terminal
profile restart без нового login. Bridge fixtures используют настоящий мост и
in-memory MCP, подменяя внешние Loginom/knowledge/browser операции.

Проверено локально 2026-09-26, без живого Loginom и моделей:

| Проверка | Фактический результат |
| --- | --- |
| Полный Host package `bun test` | 149 PASS, 8 platform skips, 0 FAIL; 26 файлов |
| Desktop `bun test src/main/loginom` | 40 PASS, 0 FAIL; включая private IPC sender/schema проверки |
| Runtime `node --test client/test/*.test.mjs test/*.test.mjs` | 2405 PASS, 10 штатных skips, 0 FAIL |
| Host, Desktop, Schema `bun typecheck` | Все три PASS |
| `git diff --check` | PASS |

Host suite также собирает настоящий Node Host bundle для process/IPC fixtures.
Полная дистрибутивная сборка Desktop/CLI и native/live acceptance **не запускались**.
Изолированный clone использовал существующий dependency cache без установки или
изменения исходного checkout/lockfile. Независимое read-only ревью проверило
поправки orphan/terminal profile, cached-save replay и validation concurrency.
