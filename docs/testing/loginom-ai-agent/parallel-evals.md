# Runbook параллельных evals

Редакция 2026-10-16. Инструкция оператора; правила — в
[контракте](../../../evals/docs/parallel-users-contract.md), порядок реализации —
в [коротком плане](../../superpowers/plans/2026-10-16-evals-parallel.md).
Старые наблюдения и команды — в [архиве](../../archive/2026-10-16-evals-parallel-history.md).

## Текущая доступность

Production run с `EVAL_SLOTS_FILE` подключён и требует записанный ресурсный бюджет.
Native prepare/verify двух пользователей на новом стенде прошли. Отдельный
установленный CLIc8a85da728 на OAuth-базе eb85403ce4 квалифицирован локальным HTTP429→200: JSON содержит
retry, exit0/cleanup confirmed. Harness учитывает session retries и отдельно
подписывает обязательные источники provider/judge; Dock transport остаётся
unavailable в диагностике, наблюдаемый Dock429 исключает успешную приёмку.
Судья использует evals-openai с прежней OpenAI auth и нулевыми HTTP/stream retries;
VPN/local429 квалификация дала ровно1 запрос и закрытый unit без вызовов модели.
Четыре native A/B прошли без skip29.13s, cleanup/release подтверждены;
модельный N=1/N=2 ещё не выполнен. Урегулированный admin c21 перенесён по
разрешению владельца в private evidence с неизменным содержимым; штатный startup
разобрал прежний карантин. Оба профиля после штатного models refresh видят точную
`openai/gpt-6-luna/high`, cache SHA256
`59bcb39e34656fe40d3007de30361919dcbaff738a342f1f30f763e8cf4617bc`.
Доказательства закрытых отказов — [единый архив](../../archive/2026-10-16-evals-parallel-history.md).
Не запускать старый `recover` для новой
процедуры: адресный recover и цепочка эпох больше не входят в рабочий путь.
[Перечень удержанных стендов и инцидентов](2026-10-16-evals-parallel-retained.md)
нужно проверить перед работой. Старые research pairs не использовать для run.

## Перед подготовкой

1. Работать на lg-pc-75 в ветке `evals-parallel`, команды harness из `evals/`.
   Временные данные — только `/home/kiselev/storage/tmp/`.
2. Использовать отдельную acceptance pair из private config; не трогать dev,
   legacy, research incidents и ресурсы других агентов. Проверить точные container
   IDs, loopback URL, network и marker v2. Общий сервер для слота не перезапускать.
3. Установленный CLI задать абсолютным путём и закрепить SHA. Не брать меняющийся
   PATH binary. Закрепить три task IDs, inputs, rubrics и версии моделей.
4. Admin credentials, OAuth и judge auth подготовить в private controller/runtime
   вне mounts/results/env дочерних процессов. Не выводить содержимое auth-файлов.
5. Использовать `/home/kiselev/.local/state/loginom-evals/parallel/judge-codex`.
   Разрешено снять только бронь команды585940be-5c1b-4bff-a7c6-00459a4f7fa3,
   сохранив A00yuH. Проверить lockdown-конфиг и `codex login status` через
   исправленный VPN launcher без model calls. Нет действительного входа —
   остановиться и попросить владельца войти, не использовать глобальный home.
6. Старые стенды/инциденты не трогать до успешного N=2 и решения одним списком.
   Harness автоматически удаляет только своё на новом стенде после проверок;
   созданное не им требует разрешения. Правила — контракт п.20.

## Настройки controller и подготовка

До prepare/verify и запуска задать несекретные параметры в доверенном controller:

```bash
export EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/acceptance-20261016/slots.json
export EVAL_CLI_MODE=binary
export EVAL_CLI_BIN=/home/kiselev/.local/state/loginom-evals/acceptance-20261016/candidate-home-oauth-retry/.local/share/loginom-ai-agent-cli/0.0.0-dev-202610190559-dev/bin/loginom-ai-agent-cli
export EVAL_AGENT_MODEL=openai/gpt-6-luna
export EVAL_AGENT_VARIANT=high
export EVAL_JUDGE_COMMAND=/home/kiselev/git/codex-vpn-lockdown/bin/codex
export JUDGE_MODEL=gpt-6-sol
export JUDGE_REASONING=xhigh
```

После реализации использовать команды из `evals/`, передавая config явно:

```bash
bun --no-env-file run script/parallel-env.ts status --config /home/kiselev/.local/state/loginom-evals/acceptance-20261016/slots.json
bun --no-env-file run script/parallel-env.ts prepare --config /home/kiselev/.local/state/loginom-evals/acceptance-20261016/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/prepare-20261016
bun --no-env-file run script/parallel-env.ts verify --config /home/kiselev/.local/state/loginom-evals/acceptance-20261016/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/verify-20261016
```

Output directories новые, parent private0700; существующий out не перезаписывать.
`prepare` создаёт недостающее и проверяет ACL, roots, profiles, Pool=0.
`verify` и run проверяют без исправлений пользователей/политики.
В начале run одна повторяемая процедура разбирает прежние остатки под server
lock. Нет доказанного владения — карантин без удаления и запрос владельцу.
Непустой/нечитаемый SessionBackup — остановка; его harness не очищает.

## Обязательная проверка A/B

До модельного N=1 выполнить только четыре live-сценария после их реализации:

```bash
EVAL_ADMIN_LIVE_CONFIG=/home/kiselev/.local/state/loginom-evals/acceptance-20261016/slots.json bun run test test/parallel-slots-live.test.ts
```

Сценарии: взаимная невидимость файлов; закрытие A сохраняет B;
удаление A после закрытия/повторного чтения его сессий; неизвестное владение
не меняет файлы. Проверять реальные операции и canary B. Любой skip не равен PASS.
Остальные native/research tests — только явным флагом. Unit suites, меняющие
proc permissions/dumpability, не совмещать с native/browser проверками.

## N=1 замер и утверждение порогов

До запуска выбрать private JSON-файл с массивом ResourceBound: scope, metric,
minimum/maximum (одна из границ может быть null). Указать все обязательные scopes
из существующего requireResourceBudgetScopes; container scopes содержат полный
container ID и startedAt. Это исходный бюджет, run сохраняет его фиксированную копию
до dispatch. Для N=2 файл содержит только утверждённые владельцем пороги.

```bash
export EVAL_RESOURCE_BUDGET_FILE=/home/kiselev/.local/state/loginom-evals/acceptance-20261016/n1-budget.json
```

Controller получает требуемые credentials через существующий private способ;
эти команды их не печатают. До dispatch записываются бюджет и условия измерений,
включая CPU/RAM хоста и контейнеров, диск, OOM, лицензии и provider errors.
Run сам запускает script/sample-parallel-resources.ts перед N=1/N=2 dispatch
с чистым env, interval=1000ms, и останавливает/дожидается collector в finally;
JSONL/summary лежат в private evidence. Перед N=1 проверить MemAvailable хоста
против бюджета: при нехватке остановиться и сообщить владельцу.
Для N=1 не объявлять неутверждённые пороги допуском N=2.

```bash
bun run src/run.ts --parallel 1 --only filter-active-rows,calc-data-double,group-sum-qty --repeat 1 --label baseline-resources
```

Сохранить summary, результаты, архивы и замеры. Предложить числовые пороги с
запасом на N=2 и запросить утверждение владельца. До ответа N=2 не запускать.
Модели, задачи, rubrics, timeouts и CLI между замером и N=2 не менять.

## N=2 и завершение

После утверждения записать бюджет N=2 до dispatch и запустить:

```bash
bun run src/run.ts --parallel 2 --only filter-active-rows,calc-data-double,group-sum-qty --repeat 1 --label acceptance-two
```

Убедиться по фактическим интервалам, что работают оба слота с перекрытием, судья
использовал заданные model/reasoning и выделенный home, summary содержит все
выданные задания и честные ошибки. Качество с N=1 в этой задаче не сравнивать.
Проверить результаты и закрытые архивы каждого слота, отсутствие собственных
сессий и рабочих остатков, сохранность соседа и освобождение чистых reservations.

Закрытие выполняет controller по точным native именам сессий выбранного
пользователя через admin, открытый до слотов. Перед удалением — перечитать
сессии, непосредственно проверить отсутствие открытых файлов в своём root,
server identity, marker v2 и владение. Ошибка — сохранить данные/карантин.
Своё удаляется автоматически только после обязательных проверок.
SESSION_NOT_IDLE у нового admin после аварии оставляет слот в карантине до
решения владельца; общий сервер ради этого не перезапускать.

Отказ лицензии останавливает run; OOM, ENOSPC, rate/quota исключают успешную
инфраструктурную приёмку. При падении A не восстанавливать его внутри run:
сохранить данные, здоровый B продолжает очередь. На блокере сквозного пути
остановиться и спросить владельца, не переключаться на развитие инфраструктуры.

После успешного N=2 убрать неиспользуемые код/тесты одним проходом по шагу7,
выполнить из `evals/` unit checks и `bun typecheck`. Старые стенды/инциденты
согласовать одним отдельным списком; повторённые правила свести к контракту.
Архивные evidence/стенды не удалять без отдельного разрешения.
