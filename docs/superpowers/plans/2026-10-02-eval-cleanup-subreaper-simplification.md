# Упрощение eval cleanup с Linux subreaper — план реализации

> Для исполнителя: выполнять последовательно, по TDD из `evals/`, с checkpoint
> после каждого законченного среза. Продолжение реализации и Linux-приёмка
> относятся к goal в основном чате. Создание этого документа не запускает
> реализацию и не меняет состояние существующего goal.

**Цель:** сократить число способов установления принадлежности процессов,
сохранив все гарантии безопасного перехода между eval-попытками.

**Архитектура:** каждый agent/setup/status/recover запускается через отдельный
Linux subreaper launcher. Принадлежность подтверждается наблюдаемой цепочкой
живых родителей либо усыновлением этим launcher. Один ledger хранит это
происхождение, идентичность процессов и разрешение на сигнал; PGID/SID остаются
сведениями для проверки, но не альтернативным способом присвоить процесс.

**Стек:** существующие Bun, TypeScript, Linux `/proc`, встроенный Bun FFI,
libc `prctl(PR_SET_CHILD_SUBREAPER)`. Без новых зависимостей и systemd.

**Спецификация:** [каноническая спецификация evals](/home/kiselev/git/loginom-ai-agent/docs/superpowers/specs/2026-09-18-evals-design.md),
раздел «Изоляция неудачной попытки — 2026-10-02».
**Исходный checkpoint:** [реализация cleanup](/home/kiselev/git/loginom-ai-agent/docs/superpowers/plans/2026-10-02-eval-attempt-cleanup.md).

## Границы и исходное состояние

План уточняет устройство supervisor, а не снижает требования к cleanup.
Ни точная привязка Chromium к browser profile, ни остановка при неопределённости
не становятся необязательными. Усыновление subreaper само по себе не разрешает
сигнал неподтверждённому корневому Chromium.

При подготовке документа наблюдалась ветка `evals`, HEAD `55904e191`.
Основной чат продолжает работу: при исполнении сначала прочитать свежий
checkpoint, текущий diff и применимые `AGENTS.md`, а не возвращать код к этому SHA.
Subreaper уже есть в `evals/src/process-launcher.ts`; повторно создавать его
или заново реализовывать готовые lease, архивирование и отчётность не нужно.
В supervisor одновременно остаются parent, live-session и subreaper origins —
именно это дублирование устраняется.

Записанный в исходном checkpoint native control подтвердил `no_artifact`,
затем следующий Session создал пакет `group-sum-qty`. Последующая проверка idle
отказала: `completed` сохранён, прогон остановлен. Это частичная приёмка,
не доказательство закрытия всех критериев. Свежие результаты имеют приоритет.

Код меняется только в `evals/`. Установленный CLI не пересобирать. Из документации
при исполнении обновляются owning spec, README, пункт 9 remaining-work,
checkpoint и отдельный отчёт приёмки. Существующие незавершённые изменения
пользователя и основного чата сохраняются; не использовать `git add .`.

## Неизменные требования

1. Частный Linux eval-профиль не используется параллельно ручным CLI/Desktop.
   До dispatch берётся отдельный эксклюзивный harness lease; продуктовый
   `.writer` не используется как lease и stale harness lease не крадётся автоматически.
2. Перед каждым запуском сохраняются baseline runtime-каталогов и релевантных
   процессов, фиксируются executable выбранного CLI/bundle и launcher identity.
   Ledger содержит UID, PID/starttime, PPID, PGID/SID, executable identity,
   способ происхождения и время наблюдения. Полные argv/environment не сохраняются.
3. Обычный scanner работает не реже одного прохода за 100 мс. Существующее
   ускоренное наблюдение запуска Chromium сохраняется, если необходимо для
   короткоживущих argv; устаревшие scans не накапливаются в очереди.
4. Корневой Chromium требует совпадения executable, точного `--user-data-dir`
   нового собственного runtime и подтверждённой цепочки launcher. У helpers
   проверяются executable и происхождение; неизвестный helper не присваивается.
5. Перед каждым сигналом заново проверяются идентичность адресата и состав
   наблюдаемой группы. Сигнал отправляется отдельному проверенному PID.
   Числовой исторический PGID/SID, имя, cwd и argv по отдельности не дают права kill.
6. Timeout/Ctrl+C: прежнее окно SIGINT 30 с, затем SIGTERM с ожиданием 5 с,
   затем SIGKILL. Подтверждение завершения после исхода ограничено 60 с,
   включая эти этапы. Launcher закрывается последним. EOF не доказывает exit.
7. Два финальных прохода `/proc` должны подтвердить отсутствие живых собственных
   процессов, владельцев профиля и новых необъяснённых процессов выбранного
   Chromium/helpers. Неизвестное владение, недоступные необходимые сведения,
   смена идентичности или остаток означают failed cleanup. Чужие процессы не убиваются.
8. Stale `.writer` снимается только после процессного proof и повторного
   совпадения inode/device и owner. При отказе не снимать оставшиеся guards,
   не удалять ledger/runtime; harness lease сохраняется до разбирательства.
9. До acknowledge/pruning архивируются только журналы собственных runtime:
   очищенные события, manifest файлов, SHA-256 и проверка чтением. Auth, config,
   browser profile и секреты исключены. Ошибка архива запрещает ack, prune
   и следующий кейс; исходные журналы сохраняются. Принудительное закрытие pipe
   помечает capture неполным.
10. Затем используются существующие recovery и проверка `ready`. Все management
    команды проходят тот же supervisor и архивирование. Pruning удаляет только
    предусмотренные временные каталоги с подтверждённой принадлежностью и архивом;
    настройки, авторизация и БД сохраняются.
11. Следующий кейс получает новый CLI, Session и runtime. Не продолжать прежнюю
    Session. `AMBIGUOUS` не сокращает бюджет и не запускает автоматический повтор.
12. Cleanup не меняет исход, session ID, события, tokens/cost/counters, score
    или failure_kind. Exit 0 без пакета остаётся `no_artifact`; timeout остаётся
    `timeout`. Ошибка cleanup не создаёт вместо измеренного исхода пустой
    `harness_error` или `infra_error`. Exit 2/3 и исключения также проходят cleanup.
13. Любой отказ cleanup/архива/readiness сохраняет доступные `run.json`,
    `result.json`, summary и report, устанавливает `stopped_reason`, возвращает
    код 1 и запрещает второй кейс. Отказ записи одного файла не стирает
    измеренный исход из памяти и доступных остальных файлов.
14. Публичное поле результата остаётся совместимым:

    ```ts
    environment_cleanup?: {
      status: "confirmed" | "failed" | "not_run"
      evidence: string | null
      error: string | null
    }
    ```

    Подробности живут в `cleanup.json`. `cleanup_error` относится только к storage.
    Legacy без поля означает «не проверялось». Счётчики cleanup независимы от
    метрик качества, включая interrupted; пересудейство сохраняет cleanup.
15. Локальный proof не доказывает отмену серверной операции или освобождение
    Session Loginom. Lease не даёт атомарного handoff с произвольным внешним CLI.
    Если серверный остаток мешает, фиксировать отдельный отказ стенда/продукта;
    не объявлять локальный cleanup доказательством серверного восстановления.

## Одна модель принадлежности

### Admission launcher

Launcher включает subreaper **до** запуска CLI, подтверждает готовность через
существующий частный capsule/receipt и запускает только выбранную команду.
Не создавать общий долгоживущий reaper на все попытки. Не включать subreaper
в самом harness: иначе в его границу попадут посторонние subprocesses harness.

Receipt сверяется с nonce и свежей identity launcher. CLI exit receipt хранится
отдельно от exit launcher: рабочий CLI может закончиться, пока launcher ещё
держит orphan descendants. Отказ `prctl`, повреждение receipt или отсутствие
подтверждения запрещают dispatch либо подтверждение cleanup соответственно.
Командный capsule удаляется до dispatch; setup secrets передаются stdin.

### Один ledger, два способа доказать descendant

Для нового процесса разрешены только:

- `parent`: в согласованном свежем snapshot виден живой parent с уже подтверждённой
  birth identity и происхождением от launcher;
- `subreaper`: после ready receipt свежий PPID указывает на тот же живой launcher
  с подтверждённой birth identity. Это подтверждённое ядром усыновление потомка.

Сам launcher и запущенный им CLI обозначаются отдельно как `launcher` и `cli`.
PID CLI сверяется с receipt и `/proc`, а не принимается без проверки.
PPID, PGID/SID сохраняются для аудита и свежих проверок, но `live_session` не
используется как третий источник владения. После `setsid`/double-fork связь
восстанавливается усыновлением, без предположения «тот же SID — значит наш».

Изменение внутреннего `origins.via` не требует переоценки исторических результатов:
новый код не интерпретирует старые cleanup proofs как разрешение отправить сигнал.

### Разрешение на сигнал отдельно от происхождения

У записи ledger есть наблюдённое происхождение и один admission outcome:
`pending`, `allowed`, `refused`. Не держать несколько конкурирующих Map/Set
со способами присвоить процесс. Отдельные массивы evidence допустимы как журнал,
но не как второй источник разрешений.

- Обычный descendant допускается после подтверждения происхождения и identity.
- Корневой Chromium остаётся `pending`, пока нет точного browser binding.
- Binding содержит birth identity, pinned executable, свой новый runtime и время
  наблюдения точного `--user-data-dir`. После замены argv этот proof сохраняется
  только для той же birth/executable identity. Новое противоречащее значение
  profile или смена identity дают отказ, а не молчаливое обновление receipt.
- Helper допускается по проверенному executable и подтверждённой parent либо
  subreaper цепочке в этом запуске при подтверждённом собственном browser launch.
  Усыновление launcher не выдумывает потерянную связь с конкретным Chromium PID.
  Если процесс нельзя отличить от неподтверждённого корневого Chromium или
  неизвестного helper, разрешение не выдаётся.
- Новый внешний Chromium с доказанным другим profile остаётся чужим и живым.
  Новый необъяснённый helper блокирует финальное подтверждение. Процесс, возникший
  между fork и усыновлением, может оставаться `pending` до следующего наблюдения;
  исчезновение само по себе не доказывает его принадлежность и не снимает сомнение.

Такое разделение заменяет переплетение parent/session эвристик, но не удаляет
обязательную browser binding проверку. Если argv не удалось наблюдать, результат
— failed cleanup; выбирать менее строгую проверку запрещено.

### Один цикл и один порядок завершения

Оставить один последовательный цикл `observe → update ledger → evaluate`.
За один проход формируется согласованный snapshot; signals/final verification
используют тот же механизм. Не запускать независимо scanner, scanner для SID
и scanner для adopted helpers. При долгом чтении не ставить новые scans в очередь;
фиксировать длительность наблюдения и недоступность обязательных сведений.

Рабочий режим опрашивается каждые 100 мс. Уже необходимое 10-мс окно Chromium
использует этот же цикл, без второго ownership алгоритма. После proof запуска
возвращаться к обычному интервалу; новый runtime/browser launch снова требует
наблюдения. Если такой переход теряет binding на установленном CLI, сначала
исправить наблюдение и доказать native-тестом, а не ослаблять admission.

Порядок конвейера остаётся линейным:

```text
lease → baseline → launcher ready → CLI → measured outcome
→ INT/TERM/KILL при необходимости → два process/profile passes
→ capture/evidence → redacted archive → exact writer release
→ supervised recovery/status ready → targeted prune
→ result/summary/report → новый запуск следующего кейса
```

Все отказные пути используют этот порядок до допустимой точки и затем сохраняют
исход/причину остановки. Закрывать launcher после рабочей группы, сохраняя
границу усыновления до проверки её потомков. После закрытия launcher повторно
проверить отсутствие собственных живых процессов. При отказе завершать только
уже допущенные собственные процессы, в пределах того же 60-секундного deadline.

## Файлы и интерфейсы

| Файл | Изменение |
| --- | --- |
| `evals/src/process-launcher.ts` | Сохранить выделенный launcher, readiness/CLI exit receipts; закрепить порядок startup/shutdown. |
| `evals/src/process-supervisor.ts` | Один ledger и observer; убрать admission по SID/PGID; сохранить identity, browser binding, signals и evidence. |
| `evals/src/cli.ts` | Сохранить накопленный `AgentRun`, включая persistence failures. |
| `evals/src/profile.ts` | Единый management supervisor, bounded idle, exact writer, archive-before-ack и pruning. |
| `evals/src/run.ts` | Проверить все stop/exception пути; адаптация только к изменённому внутреннему proof. |
| `evals/src/lease.ts`, `diagnostics.ts`, `report.ts`, `rejudge.ts` | Сохранить готовые контракты; менять лишь при обнаруженном тестом нарушении. |
| `evals/fixtures/fake-cli.ts`, `fake-browser.ts` | Реальные дочерние процессы для origin/admission/lifecycle сценариев. |
| `evals/test/process-supervisor.test.ts`, `cli.test.ts`, `profile.test.ts`, `run.test.ts`, `rejudge.test.ts`, `report.test.ts`, `diagnostics.test.ts`, `lease.test.ts` | Проверки поведения через существующие публичные интерфейсы. |

Не добавлять framework, платформенные adapters, новые CLI-флаги, background
service, общий process registry или универсальный recovery engine. Не дробить
код на набор одноразовых модулей. Две существующие границы — launcher и supervisor —
достаточны; синхронное правило admission допустимо вынести в локальную функцию.

Публичные функции остаются прежними:

```ts
superviseProcess(input: {
  cmd: string[]; cwd: string; env: Record<string, string>; timeoutMs: number
  profileDir?: string; outDir?: string; stdin?: string; signal?: AbortSignal
})
// Возвращает stdout, stderr, exitCode, timedOut, interrupted,
// startedAt, durationMs, processCleanup.

signalProcess(saved: ProcessIdentity, signal: NodeJS.Signals)
writerIdentity(profile: string): Promise<WriterIdentity | null>
management(command: AgentCommand, args: string[], stdin?: string, timeoutMs?: number)
```

`runAgent`, `afterAttempt` и `main` также сохраняют интерфейсы.
`ProcessCleanup` остаётся внутренним подробным доказательством; не добавлять
новые обязательные поля историческим summary/result.

## Последовательность TDD и рефакторинга

Для каждого нового поведения: один падающий тест → запуск с подтверждённым
красным результатом → минимальная правка → зелёный результат → коммит.
Зелёное уже закреплённое поведение переносить рефакторингом, без искусственного
ломания реализации ради красного теста. Не писать весь набор новых тестов заранее.
Все команды ниже выполняются из `/home/kiselev/git/loginom-ai-agent/evals`.

### 1. Закрепить выбранную границу, не переписывая готовое

**Файлы:** owning spec, исходный checkpoint, `test/process-supervisor.test.ts`.

- [ ] Прочитать свежий checkpoint/diff; выписать уже зелёные тесты и незакрытые
  native критерии. Продуктовые/user changes не включать в этот срез.
- [ ] Уточнить spec: origin только launcher/CLI/parent/subreaper; PGID/SID —
  evidence и проверки; точный browser profile остаётся обязательным.
- [ ] Запустить существующие процессные и профильные тесты:

  ```bash
  bun test test/process-supervisor.test.ts test/cli.test.ts test/profile.test.ts
  ```

- [ ] Если исходная проверка красная, сначала документировать и устранить
  конкретный отказ отдельным TDD-срезом. Не совмещать неизвестную регрессию
  с удалением ownership веток.

### 2. Единственный origin ledger

**Файлы:** `src/process-supervisor.ts`, `test/process-supervisor.test.ts`;
существующие `fixtures/fake-cli.ts`, `fixtures/fake-browser.ts` при необходимости.
**Вход:** launcher/CLI receipt и snapshot. **Выход:** ledger с доказанным origin;
ни одна запись не присваивается через PGID/SID.

- [ ] Усилить existing double-fork тест через публичный `runAgent`:

  ```ts
  expect(run.processCleanup.status).toBe("confirmed")
  expect(run.processCleanup.origins?.some((origin) =>
    origin.pid === run.processCleanup.launcher?.cli_pid && origin.via === "cli"
  )).toBe(true)
  expect(run.processCleanup.origins?.map((origin) => origin.via))
    .not.toContain("live_session")
  ```

  Добавить отдельным циклом вариант helper с новым SID и выходом промежуточного
  родителя до scan. Проверить его завершение и origin `subreaper`; post-cleanup
  проверка PID использует сохранённый starttime, не один числовой PID.
- [ ] Запустить целевой тест, подтвердить отказ нового origin-контракта.
- [ ] Свести запись provenance к одному ledger. Удалить обе ветки присвоения
  через совпадение live launcher group/session и через живого browser SID leader.
  Оставить свежие parent/subreaper проверки и pinned CLI receipt.
- [ ] Прогнать весь `test/process-supervisor.test.ts`, затем `cli.test.ts` и
  `profile.test.ts`; commit только после зелёного результата.

### 3. Browser binding остаётся обязательным

**Файлы:** `src/process-supervisor.ts`, `test/process-supervisor.test.ts`;
`fixtures/fake-browser.ts`. **Вход:** origin ledger, pinned bundle и новые runtime.
**Выход:** `pending/allowed/refused` у той же записи ledger и отдельный binding receipt.

- [ ] Сначала прогнать existing tests чужого browser profile, неизвестного
  helper и утраты argv после binding. Затем добавить по одному недостающему
  поведению: известный adopted helper с binding; тот же helper без binding;
  точный executable с чужим profile; новое противоречащее profile после binding.
- [ ] Основные assertions для положительного и отрицательного сценариев:

  ```ts
  expect(run.processCleanup.browserBindings?.length).toBeGreaterThan(0)
  expect(run.processCleanup.status).toBe("confirmed")
  // В отдельном отрицательном тесте:
  expect(run.processCleanup.status).toBe("failed")
  expect(foreign.exitCode).toBeNull()
  process.kill(foreign.pid!, 0)
  ```

  `foreign` создаётся самим тестом как отдельный реальный process; finally
  закрывает только этого fixture после проверки. Supervisor не получает права
  завершить его через совпадение executable или группы.
- [ ] Перенести разрешения из разрозненных Set/Map в одну запись ledger.
  Не удалять pinned browser/runtime/argv проверки. Не считать каждый adopted
  native process корневым браузером и не считать его автоматически helper.
- [ ] Сохранить наблюдение binding до замены argv: один цикл без queued scans,
  обычные 100 мс и ускоренное окно Chromium. Отдельным тестом закрепить
  короткое окно argv, используя настоящий child с `process.title`.
- [ ] Проверить неизвестный helper и relevant `/proc` EACCES: failed cleanup,
  foreign process жив, исход/guards сохранены. Прогнать процессный набор и commit.

### 4. Один shutdown и достоверное evidence

**Файлы:** `src/process-launcher.ts`, `src/process-supervisor.ts`,
`src/cli.ts`, `test/cli.test.ts`, `test/profile.test.ts`.
**Вход:** измеренный exit/timeout/abort. **Выход:** неизменный measured outcome
и отдельный `ProcessCleanup` с двумя финальными passes.

- [ ] Проверить существующие реальные timeout/abort и management timeout тесты.
  Недостающий сценарий добавить одним красным циклом: CLI exit 0, helper
  игнорирует INT/TERM, launcher жив до завершения helper.
- [ ] Проверить исход отдельно от cleanup:

  ```ts
  expect(run.timedOut).toBe(true)
  expect(run.sessionId).toBe("ses_fixture03")
  expect(run.processCleanup.verification).toHaveLength(2)
  expect(run.processCleanup.verification?.every((pass) =>
    pass.owned_remaining === 0
  )).toBe(true)
  ```

  Для сохранённого CLI exit 0 с долгим cleanup отдельный тест требует
  `timedOut === false`: cleanup не расходует бюджет уже завершившегося CLI.
- [ ] Свести timeout/abort/ordinary exit/error к одной последовательности
  signals и verification с одним deadline. Каждый сигнал делает свежий
  identity/group pass и выбирает только `allowed` записи.
- [ ] Проверить mismatch starttime, executable identity, relevant read failure
  и замену writer. Не отправлять signal отказанному PID, сохранять guard/evidence.
- [ ] Сохранить накопленный capture при отказе записи proof/run; принудительное
  закрытие pipe — `capture_complete: false`, никогда не proof process exit.
- [ ] Прогнать `cli.test.ts`, `profile.test.ts`, `process-supervisor.test.ts`,
  `bun typecheck`; commit зелёный срез.

### 5. Переход профиля и stop не разрастаются

**Файлы:** `src/profile.ts`, `src/run.ts`, при нарушении — `src/diagnostics.ts`;
`test/profile.test.ts`, `test/run.test.ts`, `test/diagnostics.test.ts`.
**Вход:** confirmed process proof и measured result. **Выход:** confirmed
environment cleanup либо stop с прежним качественным исходом.

- [ ] Прогнать existing archive-before-ack, exact writer и targeted pruning
  tests. Новый код нужен только для обнаруженного тестом нарушения.
- [ ] По одному проверить отказ process cleanup, архива и readiness для
  `no_artifact`, `failed`, `timeout`, `completed`. Сквозные assertions:

  ```ts
  expect(run.code).toBe(1)
  expect(summary.stopped_reason).not.toBeNull()
  expect(summary.tasks[0]!.attempts[0]!.status).toBe(originalStatus)
  expect(summary.tasks[0]!.attempts[0]!.environment_cleanup?.status).toBe("failed")
  expect(summary.tasks[1]!.attempts).toEqual([])
  ```

  Каждый тест задаёт один `originalStatus` настоящей fake-CLI фикстурой либо
  исходом budget; не копировать production классификацию в тест.
- [ ] Проверить тот же порядок на exit 2/3 и исключениях сохранения файлов.
  Отдельно проверить, что archive failure оставляет журнал и pending recovery
  неизменными, а не только возвращает ошибку.
- [ ] Сохранить один pipeline в `afterAttempt`; не добавлять альтернативный
  recovery controller для AMBIGUOUS. Idle wait остаётся bounded и завершается
  двумя проверками; кратковременный процесс может исчезнуть внутри установленного
  окна, но после его окончания uncertainty означает stop.
- [ ] Прогнать profile/run/diagnostics tests и commit только требуемые правки.

### 6. Совместимость и полный gate

**Файлы:** существующие report/rejudge/lease/diagnostics tests;
source-правки только по обнаруженным регрессиям.

- [ ] Проверить legacy без `environment_cleanup`, пересудейство с failed cleanup,
  независимые counters и прежнюю классификацию `infra_error`:

  ```ts
  expect(rejudged.environment_cleanup).toEqual(original.environment_cleanup)
  expect(summary.metrics.environment_cleanup_error_count).toBe(1)
  expect(summary.metrics.environment_cleanup_checked_count).toBe(1)
  ```

  Конкретный fixture для counters содержит одну failed проверенную попытку
  и одну историческую без поля; quality assertions берутся из исходного fixture.
- [ ] Проверить evidence/архив на seeded secrets и наличие manifest/SHA-256,
  отсутствие auth/config/browser-profile файлов. Отказ read-back запрещает prune.
- [ ] Полный gate из `evals/`:

  ```bash
  bun test
  bun typecheck
  git diff --check
  ```

- [ ] Зафиксировать числа тестов и SHA. Повторять gate после новых изменений,
  а не объявлять ранее зелёную suite доказательством новой реализации.

### 7. Linux-приёмка на неизменном установленном CLI

**Файлы:** отдельный отчёт в `docs/testing/loginom-ai-agent/reports/`,
результаты — gitignored `evals/results/`, checkpoint.

- [ ] Выбрать фактический установленный CLI из текущей конфигурации. Сохранить
  realpath/version, SHA-256 бинарника, source commit, bundle/runtime/browser
  версии и хеши; model/variant, задачи и фактические budgets. Не печатать `.env`
  или auth. Ранее выбран 0.1.17-prod/openai/gpt-6-sol/default; это reference,
  окончательные значения подтверждаются свежим preflight.
- [ ] Перед запуском исключить параллельный ручной CLI/Desktop на private profile.
  При существующем failed guard не удалять его по числовому PID. Сначала
  прочитать конкретное evidence и проверить неизменность owner/inode и два
  пустых process/profile passes; reconciliation документировать отдельно,
  не переписывать failed попытку как confirmed.
- [ ] Выполнить readiness probe через тот же supervisor, включая adopted helpers.
  Только после confirmed proof переходить к кейсам.
- [ ] Создать отдельный acceptance tasks directory: первый кейс выполняет
  browser prepare/workspace read и явно завершает работу без сохранения пакета;
  второй — исходный `group-sum-qty`. Сохранить prompts/task hashes. Запустить
  одним прогоном, без уменьшения обычного бюджета:

  ```bash
  bun run src/run.ts --tasks /tmp/eval-subreaper-acceptance/tasks --skip-judge --label subreaper-transition
  ```

  `--skip-judge` здесь проверяет lifecycle и пакет; не объявлять такой запуск
  полноценной оценкой качества или новым baseline.
- [ ] Подтвердить первый `no_artifact`/exit 0 и confirmed cleanup; второй
  completed, независимую проверку пакета/данных и confirmed cleanup. Для
  `group-sum-qty` проверить expected A=15, B=25 по исходному task/reference,
  структуру графа и выполнение; наличие `.lgp` само по себе недостаточно.
- [ ] Проверить разные CLI/launcher birth identities, Session ID и runtime
  directories; process proof предыдущего кейса и archive/readiness предшествуют
  dispatch следующего. Два passes пусты; own alive processes не остаются.
- [ ] Адресный run внешних кейсов с обычными task budgets и текущей моделью:

  ```bash
  bun run src/run.ts --tasks /home/kiselev/git/agent-validation/sources/analytic-evals --only budget-variance-by-category,low-liquidity-companies --label subreaper-addressed
  ```

  Текущий `--only` принимает список через запятую. Не менять task budgets,
  model/variant или продукт ради получения успешного пакета.
  Сохранить честные исходы обоих кейсов и доказательства local cleanup.
- [ ] Если cleanup отказал, проверить сохранение результата/summary/report,
  exit 1 и отсутствие второго dispatch. Это успешная отрицательная проверка,
  но не замена требуемой положительной приёмки control → completed.

### 8. Закрытие документации и goal

**Файлы:** owning spec, `evals/README.md`, remaining-work пункт 9,
исходный checkpoint и новый отчёт приёмки.

- [ ] Описать одну модель происхождения и сохранившиеся проверки identity/binding;
  удалить описание admission через live-session, не удаляя PGID/SID evidence.
- [ ] В пункте 9 разделить: защита перехода eval реализована и проверена;
  восстановление AMBIGUOUS внутри прежней Session остаётся дефектом продукта.
- [ ] В checkpoint указать коммиты, тесты, native run IDs, verified package,
  версии/хеши, исходы budget/low-liquidity и реальные ограничения стенда.
- [ ] Повторить full gate, если native-приёмка потребовала новых правок.
  Goal завершается только после всех критериев, включая Linux-приёмку;
  зелёная suite без native evidence недостаточна.

## Проверка полноты требований

| Требование | Срез / доказательство |
| --- | --- |
| Только evals; без rebuild/dependencies; сохранить чужие changes | Границы, срезы 1 и 7 |
| Lease, baseline, pinned executable, UID/PID/starttime/PPID/PGID/SID | Срезы 1–2, existing lease tests |
| Detached/double-fork и subreaper; чужой browser остаётся жив | Срезы 2–3, native readiness |
| Точный новый browser profile; потеря argv не отменяет ранее доказанный binding | Срез 3, native control |
| Unknown helper, identity mismatch, relevant EACCES, writer replacement | Срезы 3–5 |
| INT 30 с, TERM 5 с, KILL, deadline 60 с, два финальных passes | Срез 4 |
| Таймаут management без own остатка; EOF отдельно от exit | Срез 4, profile tests |
| Исход/telemetry сохранены; AMBIGUOUS не ускоряет stop и не вызывает retry | Срезы 4–5, native control/addressed |
| Process/archive/readiness failure для всех измеренных статусов; exit 2/3/exceptions | Срез 5 |
| Archive before ack/prune, SHA/read-back, секреты исключены, runtime сохранён при отказе | Срезы 5–6 |
| Durable profile сохранён, pruning адресный, новый CLI/Session/runtime | Срезы 5 и 7 |
| Legacy/rejudge/infra_error/quality metrics/cleanup counters | Срез 6 |
| Native control → проверенный пакет, budget/low-liquidity без override бюджета | Срез 7 |
| Spec/README/item 9/checkpoint; не приписывать серверный rollback | Срез 8, неизменное требование 15 |

**Критерий упрощения:** нет admission по SID/PGID, нет нескольких источников
signal authority, нет второго observer для recovery; все callers используют
один supervisor. Размер diff и число строк — дополнительная информация,
не замена сохранению гарантий и проверок.

**Критерий остановки рефакторинга:** если для прохождения native запуска
требуется убрать точный browser binding, предположить ownership, увеличить
бюджет или менять установленный продукт, этот план не разрешает такой шаг.
Зафиксировать конкретное ограничение и предложить отдельное изменение требований.
