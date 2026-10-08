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

На mas свежий вход 08.10 завершён в onboarding-20261008-direct; auth.json
сохранён в постоянном общем каталоге (0700/0600, regular/nonlinked), marker
неопределённого refresh отсутствует. Для внешнего provider используется штатный
HTTP CONNECT proxy 127.0.0.1:2080, HTTPS-сертификаты проверяются. NO_PROXY содержит
localhost,127.0.0.1,::1,app.loginom.ai,mcp.loginom.ai,mas.kartamyshev.dev; последние
три адреса имеют прямые правила VPN, описанные в [mas runbook](multica-mas.md).
Loginom-аккаунт и CLI profile по-прежнему выбираются отдельно для каждой карточки.

На mas для квалификации использовать `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false`.
С source 66f0956bc явное значение false отключает экспериментальный транспорт
также в dev-сборке; отсутствие переменной сохраняет прежний default. В round2
наблюдались повторные 15-секундные WebSocket connect timeout и последующий HTTP
fallback. Это основание для выбора штатного HTTP, а не доказательство исправления
WebSocket-прокси или неисправности OAuth-lock. Модель и аккаунт не меняются.

Для адресной диагностики `NODE_DEBUG=loginom-codex` включает только отметки
`auth.begin`, `auth.ready`, выбранный transport/размер body в байтах и HTTP status
после получения headers. Значения токенов, заголовков, body и ответов не выводятся.
По умолчанию отметки выключены; CLI-прогоны и отдельные диагностические API/SDK
пробы учитываются раздельно. Успех короткой пробы не заменяет приёмку CLI.

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

## Проверка и текущий checkpoint — 08.10.2026

- Base loginom@f9bf332cc491baa784e6e04fdfda7c0f09151cb7; PR40 draft в loginom, без merge/release.
- Installed clean source66f0956bc9f16ee580b20f3cf98e368857048f27, version0.0.0-dev-202610081319, Linux x64/glibc/Bun1.3.14.
- Archive SHA256 b9eeaecd52e2b1094127d5430408fd466b2694a50db755b33190f7e3c04304b7; manifest/capability/roundtrip/installed candidate PASS.
- Exact bd4951803: Agent124 + Host6/Product3 = 133 PASS, 0 FAIL/skip; package typechecks PASS.
- Fake provider 8 concurrent/1 refresh, 60/30 sec, cancellation, SIGKILL/uncertainty/transaction/Auth.set/identity/generation/lock PASS.
- Manifest guards: 4 negative fixtures PASS ba919629f; strict current installed integrity PASS.
- Independent source/runtime LAB28: 17 tests/installed checks PASS; browser sandbox/cleanup PASS.
- Fresh separate ChatGPT login 08.10 PASS; auth.json regular/nonlinked0600, directory0700, uncertainty absent; native Codex separate.
- HTTPS app/MCP and direct VPN exceptions PASS; TLS/sandbox enabled; VPN-down after changes NOT_RUN.
- Generator LAB33: пары LAB29/30 ready; LAB43: 16 fixture identities ready/nonadmin/login/logout/Dispatcher zero PASS.
- Первый fixture preflight остановлен до модели; password focus3bcf645a7: 5 tests/32 typechecks и live login/logout PASS.
- Round2 real8 FAILED: только три полных positive-usage ответа, общего пересечения даже трёх streams нет; история immutable.
- Independent LAB44 queue9 PASS: eight Workers running + Reviewer queued/null; старт после первого освобождённого слота.
- Independent LAB44 installed setup/check и SIGKILL inherited account/profile guard PASS; сомнительные writer retired, не удалялись.
- Round2 exact own process/server cleanup independently calibrated; forward reuse допускает только новый профиль.
- 66f0956bc: explicit WebSocket opt-out 39 tests/32 typechecks PASS; round3 live8 FAILED по180sec без завершённых ответов; общая готовность не объявлена.
- LGD/XLSX Backlog/0 runs, Stage0/full node acceptance NOT_RUN; общая квота/OAuth failure остаются общими.

Общая сессия сохраняет общую квоту, отзыв и неопределённый refresh как общие
причины отказа. Устойчивость native авторизации Multica квалифицируется отдельно.
