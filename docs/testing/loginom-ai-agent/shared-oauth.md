# Общая OAuth-авторизация параллельных CLI

Opt-in контракт `shared-oauth-v1` поддержан только standalone Linux x64/glibc.
Каждому запуску принадлежат отдельные CLI profile, DB, Host, браузеры,
Loginom-аккаунт, рабочие файлы и история. Общей является только сессия OpenAI.
Авторизация native Codex Multica хранится отдельно и этим контрактом не меняется.

## Установка и вход

`loginom-ai-agent-cli --capabilities` возвращает JSON без backend, Host,
модели или создания профиля. Executable и `metadata.capabilities` manifest
должны совпадать и содержать `shared-oauth-v1`. Musl, другая архитектура,
необъявленный ABI и старый executable не допускаются; serial fallback нет.

`LOGINOM_AI_AGENT_SHARED_AUTH_DIR` — canonical абсолютный каталог владельца,
0700, вне checkout и GC. Файлы 0600, без symlink/hardlink. Используется одна
постоянная `auth.json.lock`; её нельзя удалять, заменять или красть по возрасту.
В изолированное окружение подключают весь каталог, а не отдельный auth.json:
атомарная замена файла должна быть видна всем процессам. Каталог и его inode
не заменяют во время работы. Inline `LOGINOM_AI_AGENT_AUTH_CONTENT` запрещён.

Выполнить один свежий `providers login openai` с методом headless в отдельном
профиле и этом каталоге. OAuth callback сохраняет новый login generation;
авторизации Desktop/native Codex/старых карточек не импортировать. Каждый
последующий запуск задаёт собственный `LOGINOM_AI_AGENT_CLI_PROFILE` и тот же
shared directory. Вход/выход и обслуживание проводить после остановки всех
внутренних прогонов, без пересылки токенов в чат или Git.

## Refresh и отмена

OS flock охватывает чтение, повторную проверку срока и refresh. Ожидание
ограничено 60 секундами и отменяется; удалённый refresh ограничен 30 секундами.
Новый токен сохраняется через temporary + fsync + rename + fsync(directory).
Lock освобождается до модельного запроса, поэтому запросы идут параллельно.
Ожидание и dispatch учитывают init.signal, Request.signal и отмену standalone.
После уже отправленного refresh результат ограниченно сохраняется либо
остаётся неопределённость; отменённая попытка модель не вызывает.

При загрузке закрепляются user ID, account/workspace ID и login generation.
Каждый dispatch перечитывает store и проверяет эту привязку. Новый вход или
неожиданная личность запрещает продолжение старой попытки. Refresh под другой
личностью сохраняет полученные токены, оставляя uncertainty, без dispatch.

## Неопределённый исход

Перед exchange атомарно сохраняется `refresh-pending.json` с уникальным ID
транзакции и generation, без токенов. Успешный результат сохраняется вместе
с тем же ID во внутреннем `$sharedOAuth` metadata auth.json. После обрыва
остаточный marker согласуется только с точным committed ID/generation и
проверенной личностью. Изменение fingerprint или обычный Auth.set не означает
успех и не снимает marker. Generic writer не изменяет shared OpenAI OAuth.

Неопределённый refresh прежним токеном не повторяется. После остановки потоков
нужен новый успешный OAuth login либо явный logout. Не удалять marker вручную.
Удалённая ротация и локальный commit не являются одной транзакцией; потеря
процесса между ними может потребовать нового входа. Повреждённый JSON/права
не считаются пустым store. Другие provider-записи сохраняются.

Внутренние metadata не входят в публичную OAuth-схему/HttpApi. Диагностика
не публикует auth payload, HTTP OAuth body или заголовки Authorization.

## Проверка и текущий checkpoint — 07.10.2026

- База отдельной ветки shared-oauth: loginom@f9bf332cc491baa784e6e04fdfda7c0f09151cb7.
- Реальные subprocess + fake provider проверяют 8 overlapping requests/1 refresh,
  SIGKILL/uncertainty, exact commit, generic-set обход, identity/generation и cancellation.
- Локально Bun1.3.14: 95 целевых тестов PASS; 6 Linux plugin tests SKIP на macOS.
- Agent/Host/Product typecheck PASS на Bun1.3.14.
- Установленная Linux сборка, настоящий OAuth и восемь реальных циклов: NOT_RUN.
- Полная приёмка LGD/XLSX: NOT_RUN; Stage 0 не объявляет принятым обработчик.

Общая сессия сохраняет общую квоту, отзыв и неопределённый refresh как общие
причины отказа. Устойчивость native авторизации Multica квалифицируется отдельно.
