# Доверенный канал входа Desktop

## Контракт исходников — 2026-09-28

Desktop может передать существующему Loginom Host приватный `loginBarrier`
через унаследованный Unix socket. Это необязательный интерфейс доверенного
launcher/controller для регистрации каждого входа в управляемой приёмке.
Renderer и model tools не получают канал, не выбирают идентичность входа
и не могут создать registration. Без переменной ниже Desktop работает прежним
образом; управляемый канал на Windows отклоняется до запуска Host.

Launcher создаёт собственные изолированные профиль, UID/process group и канал,
оставляет себе противоположный конец socket и передаёт Desktop дескриптор 5…63:

```text
LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD=5
```

Дескрипторы 3 и 4 зарезервированы Electron/Playwright. Этот контракт не добавляет
путь к публичному socket или новую renderer IPC-команду. Номер удаляется из
окружения первым импортом Electron main и повторно после чтения login shell.
Передача дескриптора через фактический installed Electron launcher остаётся
отдельной квалификацией; готового серверного launcher этот patch не создаёт.

До запуска доверенный controller записывает в собственный профиль
`<app.userData>/loginom/session-registration.json`:

```json
{"version":2,"attemptId":"fixture-attempt-001","loginBarrier":2}
```

Файл должен удовлетворять существующему `readSessionRegistration`: обычный
файл текущего UID, приватные права, no-follow, ограниченный размер и точные поля.
Пример идентификатора не является разрешением native admission. Его настоящую
связь с попыткой и свежей учётной записью устанавливает controller.

## Wire и отказ

Host формирует фактический `LoginBinding` из текущего поколения/чата/аккаунта.
Канал принимает только binding того же зарегистрированного attempt, последовательно
один вход за другим, максимум 32 входа за жизнь экземпляра. Для каждого входа
отправляются компактные JSON-строки существующего CLI v2 протокола:

```text
{"version":2,"type":"login","phase":"begin","binding":{...}}
{"version":2,"type":"login","phase":"authenticated","binding":{...}}
```

`binding` имеет точные поля `attemptId`, `loginId`, `generation`, `purpose`,
`chat`, `account`, проверенные общим `validateLoginBinding`. Controller отвечает
только после своей текущей authority/inventory-проверки, строго одной компактной
строкой с тем же `loginId` и фазой:

```text
{"version":2,"method":"login-ack","loginId":"<actual-login-id>","phase":"begin"}
```

На каждый ACK даётся 60 секунд. Входной frame ограничен 256 байтами; исходный —
32768. Лишние поля/строки, неверный порядок, чужой binding, потеря канала,
параллельные callbacks и timeout навсегда закрывают этот экземпляр. Повтора,
переподключения, adoption и автоматического разрешения неизвестного исхода нет.
Ошибки содержат только `DESKTOP_CONTROL_INVALID`,
`LOGINOM_LOGIN_BARRIER_REQUIRED` или `LOGINOM_LOGIN_BARRIER_UNKNOWN`.
Host сохраняет существующий durable pending barrier при неизвестном результате.

Остановка сначала запрещает новые callbacks, затем ожидает существующий
`Host.close()` и закрывает канал. Потеря ACK инициирует эту же остановку.
Нормальный выход приложения не вызывает `finishOwnSession`: остаётся существующий
явный typed UI/Host путь. Receipt завершения сессии и выход Desktop сами по себе
не доказывают отсутствие всех процессов/сессий: controller отдельно подтверждает
quiescence и применяет own-session cleanup перед блокировкой аккаунта.

## Проверено и что остаётся

Из `packages/desktop` выполнены package-local проверки:

```sh
LOGINOM_AI_AGENT_TEST_NODE=/path/to/pinned/node bun test src/main/loginom src/main/index.test.ts src/main/shutdown.test.ts
bun typecheck
```

75 тестов / 189 assertions прошли, typecheck прошёл. Тесты используют настоящий
Node 24.19.0 child, Unix socket, existing Desktop service → Host → synthetic
runtime IPC; отдельный Bun bundle подставляет только Electron metadata/safeStorage.
Проверены обе фазы, утрата/искажение ACK, durable pending, неизменный обычный запуск,
stop во время bind/ACK, неизменность captured event и отсутствие исходного socket
(dev/inode) и selector в настоящих Node/Host-runtime descendants. Проверка последнего
не опирается на занятость одного номера FD после его повторного использования.

Electron utilityProcess/packaged sidecar, реальная Linux изоляция, Loginom,
OAuth/модель, свежие серверные аккаунты и холодное переоткрытие не запускались.
Cold-reader не менялся. Это source-only результат ветки `desktop-managed-login`;
существующие EF артефакты не содержат patch. Новая сборка/установка и технический
Desktop PASS этим результатом не заявляются.
