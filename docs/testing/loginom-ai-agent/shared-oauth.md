# Общая OAuth-авторизация параллельных CLI

Opt-in контракт `shared-oauth-v1` поддержан только standalone Linux x64/glibc.
Общий каталог передавать только окружению конкретного CLI, а не всем Bun-тестам
или native Codex. Каждому запуску принадлежат отдельные CLI profile, DB, Host, браузеры,
Loginom-аккаунт, рабочие файлы и история. Общей является только сессия OpenAI.
Авторизация native Codex Multica хранится отдельно и этим контрактом не меняется.

## Установка и вход

`loginom-ai-agent-cli --capabilities` возвращает JSON без backend, Host,
модели или создания профиля. Executable и `metadata.capabilities` manifest
должны совпадать и содержать `shared-oauth-v1`. Opt-in проверяет установленный
manifest до профиля, включая providers login; development bundle override запрещён.
Проверка кандидата: `verify-cli-candidate.ts <artifact> <repo> --shared-oauth`. Musl, другая архитектура,
необъявленный ABI и старый executable не допускаются; serial fallback нет.

`LOGINOM_AI_AGENT_SHARED_AUTH_DIR` — canonical абсолютный каталог владельца,
0700, вне checkout и GC. Файлы 0600, без symlink/hardlink. Используется одна
постоянная `auth.json.lock`; её нельзя удалять, заменять или красть по возрасту.
В изолированное окружение подключают весь каталог, а не отдельный auth.json:
атомарная замена файла должна быть видна всем процессам. Каталог и его inode
не заменяют во время работы. Inline `LOGINOM_AI_AGENT_AUTH_CONTENT` запрещён.

На mas launcher — `~/.local/bin/loginom-ai-agent-cli`; общий каталог —
`~/.local/state/loginom-cli-oauth/shared-oauth-v1`. Постоянные файлы не относятся
к task checkout. Ожидавший вход остановлен перед обновлением кандидата; новый
вход запускают в новом onboarding profile, старую `.writer` не удаляют.

Выполнить один свежий `providers login --provider openai --method "ChatGPT Pro/Plus (headless)"` в отдельном
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

- База shared-oauth: loginom@f9bf332cc491baa784e6e04fdfda7c0f09151cb7; PR40 в loginom, draft.
- Проверенный и установленный source SHA: bd4951803532db3f51c1b5a66a864038d88865c3, clean.
- Linux x64/glibc, Bun1.3.14; версия 0.0.0-dev-202610071848, executable/manifest shared-oauth-v1.
- Archive SHA256: 61fe7a03766ca8aa406e66ca11aaf0b6ca3330a7ce9c96ee783649b5282932d2; roundtrip PASS.
- На mas exact bd4951803: Agent124 + Host6/Product3 = 133 PASS, 0 FAIL/skip; typechecks PASS.
- Fake provider: 8 concurrent requests/1 refresh, real 60/30 sec, SIGKILL/uncertainty,
  exact transaction, generic-set bypass, identity/generation, cancellation, FIFO/lock release PASS.
- Manifest guards: 4 negative fixtures PASS на ba919629f; current strict installed integrity PASS.
- Browser localhost/installed CLI rejection: sandbox=true, alive=[], rejection guard=false; cleanup PASS.
- Независимый source/runtime LAB28 PASS: legacy dconf исправлен; 17 адресных tests/installed checks PASS.
- Ожидавший ChatGPT login отменён перед пересборкой; auth.json не создан, свежий вход NOT_RUN.
- Стенды/MCP, Loginom-аккаунты и 8 реальных циклов/queue9 отложены владельцем: NOT_RUN.
- LGD/XLSX Stage0 и полная приёмка NOT_RUN; merge/release не выполнены.

Общая сессия сохраняет общую квоту, отзыв и неопределённый refresh как общие
причины отказа. Устойчивость native авторизации Multica квалифицируется отдельно.
