# Reference через текущий harness

## Окружение

Выбрать собственный уже подготовленный reference-профиль и выделенный стенд.
Не импортировать auth, не переустанавливать CLI и не менять VPN/DNS/модели соседних
экспериментов. Прочитать integrations для локального или управляемого исполнения.

Помощник получает стандартные настройки harness из окружения или `bun --env-file`.
Обязательны AGENT_REPO, EVAL_CLI_MODE, EVAL_AGENT_MODEL, EVAL_AGENT_VARIANT,
EVAL_PROFILE_DIR, EVAL_WORKSPACE_ROOT, EVAL_RESULTS_DIR, EVAL_TASK_TIMEOUT_MS.
Для live EVAL_CLI_MODE=binary и EVAL_CLI_BIN — установленный CLI.
LOGINOM_*, Dock и provider auth задаются штатным способом harness. Секреты в args,
git и evidence не переносить. Значения модели/timeout берутся из назначения,
фактическую модель подтверждать по архиву, а не по requested_* в отчёте.

Пути должны быть абсолютными, собственными и непересекающимися: draft/oracle и
results вне agent workspace и profile. Не использовать профиль другого эксперимента.
Для управляемого стенда до helper получить существующий stand lease и штатный
немодельный допуск. Сам helper использует профильный harness lease; он не заменяет
блокировку общего endpoint. Локально подтвердить эксклюзивное окно выделенного стенда.

## Существующий reference.env runtime

В установленном node runtime reference.env использует прежние имена MODEL,
VARIANT, CLI, PROFILE, WORK_ROOT, ATTEMPT_TIMEOUT_S и LOGINOM_STORAGE. Это данные
окружения, не зависимость от старого skill. Не передавать такой файл helper без
перевода. eval.env даёт параметры подключения, но его product модель/профиль
обязательно переопределяются reference overlay до dispatch.

Загрузить окружение в порядке `with-env runtime.env` → `with-env roles/<role>/eval.env`
(подключение к Loginom/Dock) → `with-env roles/<role>/reference.env` → shell overlay;
назначение также задаёт SKILL_ROOT, DRAFT, REFERENCE_TIMEOUT_MS и REFERENCE_RESULTS
(собственный отдельный каталог results этой работы). Старый ATTEMPT_TIMEOUT_S
может расходиться с текущим поручением; timeout брать явно из назначения. В этой загруженной shell-среде:

```sh
export EVAL_CLI_MODE=binary
export EVAL_CLI_BIN="$CLI"
export EVAL_AGENT_MODEL="$MODEL"
export EVAL_AGENT_VARIANT="$VARIANT"
export EVAL_PROFILE_DIR="$PROFILE"
export EVAL_WORKSPACE_ROOT="$WORK_ROOT/agent-work"
export EVAL_RESULTS_DIR="$REFERENCE_RESULTS"
export EVAL_TASK_TIMEOUT_MS="${REFERENCE_TIMEOUT_MS:?timeout from assignment required}"
export LOGINOM_STORAGE_DIR="$LOGINOM_STORAGE"
bun "$SKILL_ROOT/scripts/reference-attempt.ts" "$DRAFT" 1
```

Для прямого EVAL_* окружения этот перевод не нужен. При отсутствующих значениях
сначала установить параметры из назначения; не подставлять модель/product профиль
или timeout другого эксперимента. Новый workspace — сосед черновиков, а не их родитель.

## Одна авторская попытка

Из evals/ назначенного checkout, после допуска:

```sh
bun --env-file="$REFERENCE_ENV" "$SKILL_ROOT/scripts/reference-attempt.ts" "$DRAFT" 1
```

Не больше трёх авторских попыток на кейс. Номер 1–3 учитывает предыдущие продолжения,
а не только текущий процесс. Третья может получить сохранённый hint-файл третьим
аргументом. Исходный task.json и oracle при этом неизменны; полное переданное задание
сохраняется в prompt.txt. Повтор с тем же results/case/номером отклоняется, не затирает evidence.

Wrapper вызывает штатные preflight, изоляцию, runAttempt и afterAttempt, без судьи
и без собственного retry-loop. Он не настраивает CLI/auth и не готовит стенд.
Черновой Task не требует наличия reference.lgp; окончательную загрузку коллекции
проверить отдельно. Для min/max после cleanup вызывается существующий collector
реальных native observations из собственного архива.

Результаты: `$EVAL_RESULTS_DIR/reference-<id>-<n>/`, внутри `<id>/<n>/` — текущий
layout harness (`result.json`, `cleanup.json`, `events.jsonl`, `artifact/package.lgp`).
Рядом builder-result.json, redacted config/environment, source-hashes.json и hint,
если использован. Все попытки сохранять. Exit 0 означает completed с подтверждённой
очисткой, **не** готовность эталона. Exit 1 — измеренная неудача; exit 2 — остановка,
ошибка допуска/cleanup/целостности. При неподтверждённой очистке lease удерживается.

Дождаться терминального итога в установленном timeout; provider stream error до
завершения не даёт права запустить вторую модель параллельно или потерять исходную
попытку. Ctrl+C использует штатную отмену и cleanup; повторный Ctrl+C прекращает
процесс немедленно и требует проверки владельцем.

## Проверка попытки

```sh
bun "$AGENT_REPO/evals/script/check-node-artifacts.ts" "$DRAFT" "$ATTEMPT_DIR"
python3 "$SKILL_ROOT/scripts/check_reference.py" "$DRAFT" \
  "$ATTEMPT_DIR/artifact/package.lgp" "$RESULT_CSV"
```

RESULT_CSV — реальный текущий экспорт из artifact/storage evidence, не oracle.
Для неподдержанного узла нельзя заменять первый вызов одной статической сверкой.
Если назначение требует нового validator/негативов, реализовать эту поддержку
отдельно внутри evals/ и заморозить SHA до независимой приёмки.
