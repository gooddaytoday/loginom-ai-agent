# Охота на баги 0.4.x: живые сценарии Loginom AI Agent

Свой набор кейсов, отдельный от `evals/`. Каждый кейс проверяет одну
пользовательскую просьбу: построить сценарий с нуля, поправить существующий,
добавить узел, импортировать файл определённого формата и размера, REST,
JavaScript, Python. Вердикт детерминированный: штатные проверки
`run-check` (CSV против oracle, Save, cold, cleanup, refusal/execution_error)
и бюджет действий `bughunt-audit.py` по `case.json → budget`.

## Кейс

`cases/bh-<id>/`:

- `task.md` — просьба пользователя, без названий инструментов и ожидаемых значений;
- `data/` — входы любого формата (все прикладываются на первом ходе); файлы больше 1 МБ не коммитятся, их пишет `gen.py`;
- `gen.py` (необязательно) — `gen.py --out <data>`, детерминированная генерация больших или бинарных входов;
- `expected.json` — `nodes`, `outputs` или `refusal`/`execution_error`, формат `run-check --cases`;
- `oracle.py` — независимый расчёт `expected.json` из входов;
- `case.json` (необязательно) — `base`, `input_files`, `budget`, `notes` (см. `scripts/node-acceptance/run-check.md`).

Имена кейсов — без слов python и javascript (охрана кодовых имён UI).

## Запуск

```sh
python3 docs/testing/loginom-ai-agent/bughunt-2026-11/prepare.py --out ~/bh-cases bh-a01 bh-a02
RUN_CHECK_MODEL=opencode-go/deepseek-v4.1-flash RUN_CHECK_AUTH=~/.config/loginom-run-check/auth-opencode-go.json \
  python3 scripts/node-acceptance/run-check.py start --head <SHA> --cases ~/bh-cases --scenarios bh-a01,bh-a02 --pair <пара> --cold
python3 scripts/node-acceptance/run-check.py wait <каталог> --timeout 5400
python3 scripts/node-acceptance/bughunt-audit.py <каталог> --cases ~/bh-cases
```

`bughunt-audit.py` (Python 3.9+, стандартная библиотека) выводит Markdown;
`--json` включает машинный отчёт. Код выхода: 0 — бюджет соблюдён (либо
не задан), 1 — `ACTION_BUDGET_EXCEEDED`, 2 — ошибка входа. Каждый этап,
включая `base` продолжения, использует бюджет своего `case.json`.
`max_nodes` ограничивает число созданных узлов, без вычитания удалённых;
отказ без квитанции узла не считается созданием. Повторы — лишние вызовы
с тем же инструментом и каноническим JSON входа; обновления одного call ID
считаются одним вызовом. `forbid` ищется с учётом регистра в полном входе
чужих инструментов и путях из квитанций доставки, до сокращения вывода.
Ошибки сессии приводятся отдельно от ошибок инструментов. Повреждённый или
пустой журнал отклоняется с кодом 2; инструмент не устанавливает итог PASS
самого сценария — это результат `run-check`.

## Каталог

Таблица кейсов — ниже, дополняется авторами пакетов A (импорт), B (REST,
JavaScript, Python), C (правка, добавление узла, сквозные).

| Кейс | Что проверяет | Ожидание |
|---|---|---|
