# Локальное окружение разработки узлов — 2026-09-24

Статус: общая подготовка на macOS arm64 выполнена. CLI, OAuth, Loginom и
реальный запрос GPT-6 Sol / low проверены. Конкретный узел и очередь не назначались;
это проверка окружения, не аналитическая приёмка обработчика.

## Исходники и установленный CLI

- Рабочая ветка `loginom`, чистый исходный HEAD перед подготовкой:
  `182710b579b74c34d4387e8c0fce2ca6bfddecc0`. Изменения общей памяти и регламента
  уже входят в этот commit.
- Установлен standalone CLI `0.1.14`, prod, darwin-arm64 из сохранённого
  релизного архива. SHA-256 архива проверен перед извлечением:
  `40b59e2b7c94280c5f4e95347291bc9173384e17046ba83236fdf44b8cba73c6`.
- Штатный `install.sh` завершился успешно; установка проверяет CLI manifest.
  Payload: `~/.local/share/loginom-ai-agent-cli/0.1.14-prod`, launcher:
  `~/.local/bin/loginom-ai-agent-cli`, команда доступна в PATH.
- Manifest содержит 5440 записей и чистый source commit
  `8b7ea1225d0ed095ea48b8816a6c80b04f0d0cdf`. Между ним и указанным HEAD нет
  diff в `packages/loginom-runtime`, `packages/loginom-host`, `packages/agent`
  и `packages/product`. Версия этого CLI не выдаётся за сборку нового узла:
  после изменения обработчика потребуется отдельный candidate с новыми pins.
- Подготовлены локальные Bun `1.3.14` и Node `24.19.0`; глобальные версии не
  заменены. Bun скопирован из ранее полученного закреплённого инструмента,
  Node ссылается на bundled binary установленного CLI. Manifest также закрепляет
  Playwright `1.63.0-alpha-2026-08-31`, MCP `0.0.80`, Chromium `1243`.

## Использование на этой машине

Из основной рабочей папки:

```sh
source /Users/kartamyshev/Git/loginom-ai-agent/.local/node-development/env.sh
bun --version
node --version
loginom-ai-agent-cli --version
loginom-ai-agent-cli providers list
loginom-ai-agent-cli models openai
loginom-ai-agent-cli loginom status --format json
```

`env.sh` выбирает инструменты и отдельный CLI profile:
`/Users/kartamyshev/Git/loginom-ai-agent/.local/node-development/profiles/preflight`.
Это профиль проверки окружения, не общий профиль для параллельных разработчиков.
Все приватные материалы `.local/node-development/` исключены локально через
`.git/info/exclude`; env/checkpoint/evidence имеют права 0600, профиль — 0700.
Не переносить приватную папку в Git или документационный архив.

## Фактические проверки

Текущая модель приёмки по указанию пользователя — `openai/gpt-6-sol`, вариант
`low`. После первоначальной проверки GPT-5.6 Sol выполнен отдельный реальный
запуск GPT-6 Sol: ответ `CLI_MODEL_OK`, exit 0, без вызовов инструментов.
В metadata собственной сессии `ses_f2b28181ffferv3946ycOf17X6` подтверждены
`providerID=openai`, `modelID=gpt-6-sol`, `variant=low`. Процессы завершены,
`.writer` отсутствует, слот приёмки освобождён после проверки cleanup.
Приватные доказательства актуального запуска:
`.local/node-development/evidence/environment-smoke-1790277303347/`.
`readiness.json` и команда повторной пробы обновлены на GPT-6 Sol.
Ниже сохранены первоначальные результаты подготовки; прежняя модель в них
описывает только уже состоявшуюся историческую пробу.

- Пользователь завершил штатный `providers login --provider openai`, способ
  ChatGPT Pro/Plus (browser). CLI сообщил `Login successful`;
  `providers list` подтвердил OpenAI OAuth в отдельном профиле.
- `models openai` содержит `openai/gpt-5.6-sol`.
- Пользователь выделил свободный аккаунт `user` для обработки узлов.
  Через приватный stdin выполнен `loginom setup`: URL `https://app.loginom.ai`,
  вход без пароля, каталог `/user`; API-ключ не выводился и не сохранялся
  в аргументах команд. macOS CLI использует собственное Keychain-хранилище.
- Setup: generation 1, revision 1, `state=ready`, `hasApiKey=true`.
  Дополнительный `loginom check`: `LOGINOM_CONNECTION_VALID`;
  последующий status: `ready`.
- Реальный CLI run с `--model openai/gpt-5.6-sol --variant low --no-headless`
  вернул `CLI_MODEL_OK`, exit 0, без вызовов инструментов и без изменения
  сценария Loginom. Модель и вариант подтверждены read-only чтением metadata
  user/assistant сообщений собственной сессии `ses_f2b2bc4d3ffei3R3LHE5QsvGxM`.
- Публичные события модели отфильтрованы и очищены штатным redactor до записи;
  reasoning и system/developer сообщения не экспортировались.
  Приватные результаты: `.local/node-development/readiness.json` и
  `.local/node-development/evidence/environment-smoke-1790277063325/`.
- После завершения нет процессов данного CLI/профиля, `.writer` отсутствует.
  Единственный слот приёмки освобождён после этой проверки.
- OpenViking health: PASS. Read-only проверка project hooks: generation
  `20260924.1`, пять project hooks trusted, пять original memory hooks сохранены
  у основного checkout. Новый worktree по-прежнему требует отдельной регистрации.
- Валидатор документации и реестра до подготовки: PASS, 78 компонентов,
  14 implemented / 61 backlog / 3 conditional reserve.

Общий приватный журнал ресурсов создан по штатному шаблону:
`~/.local/state/loginom-ai-agent/node-development/host-resources.json`.
Владелец подготовки — задача `01a0d4bf-8d00-71a1-907e-fb65121b8fd4`.
Свобода аккаунта подтверждена пользователем; модельный smoke завершён и
`acceptance_lease=null`. Отсутствие lease впоследствии не заменяет проверку
текущей занятости аккаунта и процессов перед очередным запуском.

## Следующий шаг

Выбрать компонент и режимы; оформить подплан/назначение, закрепить базу,
изолированные пути и ресурсы. Подготовить постоянный worktree и его собственный
допуск к общей памяти по [CURRENT.md](../../services/loginom-ai/tools/project-memory/CURRENT.md).
Для параллельной работы нужны отдельные аккаунты и профили; здесь проверен один
аккаунт и один профиль. Разработка, ревью и приёмка идут по
[жизненному циклу](workflow/lifecycle.md).

Полный прогон узла, сохранение/переоткрытие пакета, oracle и сборка candidate
в эту подготовку не входили. Предыдущий [аудит](readiness-audit-2026-09-24.md)
сохранён как снимок состояния до установки.
