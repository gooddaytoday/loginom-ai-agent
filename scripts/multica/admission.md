# Допуск модельного прогона

`python3 admit.py --manifest /private/admission.json --receipt /private/attempt.json`

Это локальная проверка подготовки и один вызов существующего `loginom-ai-agent-cli run`. Не запускает модель для проверки допуска, не закрывает ресурсы, не ретраит процесс. Существующая receipt, включая `launching`, запрещает запуск. После потери ответа сначала разобрать существующий процесс, журнал и UNKNOWN; новая receipt не разрешает повтор неизвестной операции. `exited` и exit 0 не являются приёмкой.

JSON готовит действующий исполнитель из назначения и свежего независимого разбора. Все пути абсолютные. Файловая ссылка имеет вид `{"path":"/absolute/file","sha256":"64 hex"}`. Квитанции и evidence хранить приватно вне business cwd. Пример структуры (значения заменить фактическими):

```json
{
  "issue": "LAB-72",
  "case": "LAB-72-enabled-prefixes",
  "task": {"path": "/business/task.md", "sha256": "..."},
  "inputs": [{"path": "/business/input.csv", "sha256": "..."}],
  "cwd": "/business",
  "profile": "/private/cli-profile",
  "shared_auth_dir": "/home/user/.local/state/loginom-cli-oauth/shared-oauth-v1",
  "profile_config": {"path": "/private/cli-profile/config/opencode.json", "sha256": "..."},
  "model": "openai/gpt-6-luna",
  "variant": "high",
  "candidate": {
    "path": "/immutable/cli", "manifest_sha256": "...", "sha": "40 hex",
    "platform": "linux", "arch": "x64", "channel": "dev"
  },
  "requirements": {"path": "/private/requirements.json", "sha256": "..."},
  "evidence": {"path": "/private/evidence.json", "sha256": "..."}
}
```

Команда закрепляет одновременно process cwd, `PWD` и `run --dir`; все три совпадают с проверенным абсолютным `cwd`.

Business cwd содержит только task и входные файлы, без вложенных каталогов. Profile и кандидат находятся снаружи. `profile_config` — фактический config данного CLI profile, не произвольный substitute. Секретное содержимое config не записывается в квитанцию. Полный manifest и каждый payload проверяются существующим `artifacts.verify_build`.

`requirements.json` содержит `case`, `task_sha256`, непустой `review_reference` на разбор задания, `required_text` (непустой массив обязательных дословных фраз в business task), `required_fixes` (массив ID всех применимых/подлежащих оценке исправлений). Для `LAB-72-enabled-prefixes` обязателен `prefixes`:

```json
{"enabled": true, "joined": "Joined_", "label": "Присоединённое: ", "enabled_text": "Точная фраза задания о включении префиксов"}
```

Для этого случая business task обязан содержать фразу: «На первом этапе и при добавлении третьего входа включите префиксы: имя Joined_, метка «Присоединённое: ».» Это проверяет оба этапа исходного назначения01a13545-d70a; упоминания префиксов только для третьего входа недостаточно.

Исходный строгий сценарий отдельно: `LAB-72-original-strict`. Проверка наличия текста не доказывает семантическую непротиворечивость задания: её подтверждает reviewer, закрепляя его хеш. Не добавлять в business task oracle или требования обойти UNKNOWN.

`evidence.json` содержит:

- `binding`: точная копия полей manifest `issue, case, candidate, task, inputs, model, variant, profile, profile_config, shared_auth_dir, cwd`.
- `reviewer`, `resource_reference`: непустые ссылки/идентичность проверяющего и актуального собственного resource/cleanup evidence.
- `checked_at`: UNIX timestamp проверки не старше 300 секунд непосредственно перед запуском; `resources: "PASS"`, `cleanup: "PASS"`, `unknown_operation_replay: false`.
- `fixes`: объект с теми же ключами, что `required_fixes`. Каждое значение: `candidate_sha`, `verdict` (`PASS` или `NOT_APPLICABLE`), непустой `explanation`, `proof` (файловая ссылка), для PASS непустой `reproducer` на независимую проверку исходного воспроизводителя.

Обвязка сверяет доказательства и привязки; она не создаёт resource authority и не доказывает истинность заявлений reviewer. Пустой список исправлений допустим только если действительно нет необходимых исправлений. После композиции LAB-73 обязательно оценить canonical-array guard против исходной потери дополнительных keys.

Перед spawn всё проверяется повторно под локальной блокировкой profile. Действующий владелец обеспечивает неизменность кандидата и входов на время использования (штатные artifact pins/use сохраняются); это не файловая песочница и не защита от злонамеренной подмены после spawn. Evidence не добавляется к argv/attachments; Multica token и прочие служебные переменные не наследуются. CLI получает только business task и inputs, назначенный profile и сетевое окружение. Общий OAuth сохраняется через явный существующий `shared_auth_dir` из настроек сквада; копировать credentials по карточкам нельзя. CLI profile должен быть уже инициализирован (`cli-profile.json`) и свободен от `.writer`; marker сверяется с channel кандидата. Обвязка не отменяет 7200-секундный предел, штатный wait и same-owner cleanup; не убивает удерживающий ресурсы процесс по собственному таймеру.

Новый original-origin producer требует private hash-pinned
`requirements.business_execution_seconds` (integer1..7200). Абсолютный bound
рождается единожды в исходном launch decision под durable claim, до spawn;
checked_at остаётся лишь свежестью evidence. Исторические receipts не меняются.
Producer проверяет тот же original claim/input/bound перед spawn, без retry/remint.
Private RunCommand reader пока UNAVAILABLE: origin не передаётся в argv/env/model
и не считается SDK authority. Exact private receiving prerequisite и offline
границы описаны в `admission-origin.md`.
