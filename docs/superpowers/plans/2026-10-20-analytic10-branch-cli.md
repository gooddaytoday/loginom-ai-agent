# Прогон десяти analytic evals на CLI ветки evals-parallel

План утверждён владельцем 2026-10-20; независимое ревью выполнено.
Правила — [контракт](../../../evals/docs/parallel-users-contract.md).
Цель — полный рабочий цикл общей очереди двух слотов: перекрытие работы,
изоляция, reuse, судейство и cleanup. Качество решений оценивается отдельно.
Исходная база harness/CLI: `dca5e33d22`.

## Условия

- Агент `openai/gpt-6.1-sol/medium`, судья `gpt-6-sol/xhigh` через прежний VPN
  launcher, выделенный home и последовательный gate.
- `parallel=2`, `repeat=1`, задача 1800000 мс, judge call 300000 мс, порог 70.
- Общее модельное окно 8 часов от первого dispatch, включая повторные серии.
  По истечении один SIGINT контроллеру и ожидание штатного cleanup без повторного
  SIGINT. Supervisor CLI слота сохраняет бюджеты 90/120 секунд.
- Пара `acceptance-20261016`, существующие слоты a/b. Старые стенды, инциденты,
  чужие процессы и данные не трогать. Общий сервер для слота не перезапускать.
- Private config без `auth.sharedDir`, две независимые local OpenAI auth copies
  с запасом срока >=8 ч. Исходный auth-store сохраняется; shared refresh не измеряется.
- Новый private root 0700 под `/home/kiselev/storage/tmp/`; секреты и raw evidence
  вне Git. Незавершённые staged/untracked документы сохраняются; свои коммиты
  только по явным путям. Во время build и candidate verification дерево не менять.
- Прежний бюджет N2 копируется до dispatch; CPU host maximum=100 вместо 95
  согласно разрешению владельца. Исторические frozen budgets не менять.
  Остальные bounds: MemAvailable >=8 GiB, FS available >=5 GiB и >=10000 inode,
  Server <=2 cores/256 MiB, Studio <=6 cores/1 GiB; без OOM/ENOSPC/license/provider limits.

## Выборка

Seed `1eae361e4a4d60271a861c641b3a7151`; прежняя фиксированная десятка,
без повторного выбора после результатов:

```text
abc-pareto-groups
articles-by-author
basket-category-width
budget-variance-by-category
category-promo-demand
cohort-spend-activity
defect-rate-line-shift
loan-term-risk
support-by-priority
trial-dosage-outcomes
```

## Подготовка и CLI

- [x] Сохранить план отдельным коммитом; private backup чужих изменений и baseline.
- [ ] По TDD перенести минимальное поведение focus password из `694c1d3a4c`:
  воспроизвести readonly password до username blur, исправить, проверить пустой
  пароль/чужую identity. Отдельный fix commit, связанные tests/typecheck.
- [x] Создать новый private root: `/home/kiselev/storage/tmp/analytic10-branch-20261020-w6kidhm4`.
- [ ] Из `packages/loginom-host` собрать полный payload командой
  `bun script/build-cli.ts <root>/cli-payload --no-archive`, pinned Bun1.3.14
  revision0d9b296, Node24.19.0 из `/opt/loginom-ai-agent/resources/loginom/bin/node`,
  Chromium1246 из `/opt/loginom-ai-agent/resources/loginom/browsers`.
  `LOGINOM_AI_AGENT_CHANNEL=prod`, уникальная версия
  `0.0.0-evals-parallel-20261020-<source-sha>`. Это development candidate, без публикации;
  prod нужен для существующих profile markers, миграция markers не нужна.
- [ ] Штатно установить в новый private HOME, сохранив sandbox; проверить
  `verify-cli-candidate.ts <installed-payload> <repo>`. Глобальные установки не менять.
- [ ] Закрепить actual SHA/tree/dirty harness/CLI, binary/manifests/dependency pins,
  выборку/inputs/rubric hashes, модели, параметры и бюджет в private manifest.
  Незакоммиченная чужая документация честно отражается в sourceDirty.

## Gates перед dispatch

- [ ] Проверить pair/container IDs/startedAt/network/markers/reservations,
  отсутствие внешних клиентов, ACL, Pool=0, пустой SessionBackup.
- [ ] Подготовить private slots config и local OAuth, подтвердить validity >=8ч,
  модель/variant и версию нового binary.
- [ ] Проверить lockdown и login judge через прежний launcher без model calls;
  invalid login — stop и вход владельца. Home прежний: parallel/judge-codex.
- [ ] Штатный verify --parallel2, отдельно cold loginom check обоих слотов под
  guards/supervisor: ok=true/code=LOGINOM_CONNECTION_VALID/help.ready/**browser.verified**,
  правильные username/URL, подтверждённый process/server cleanup. Verify сам по себе
  может пропустить browser.failed.
- [ ] Все четыре существующих немодельных A/B с runtime нового binary: mutual file
  denial, peer survival, deletion after session close/readback, unknown refuses delete.
- [ ] Сохранить budget copy до dispatch и после build непосредственно перед run
  подтвердить MemAvailable >=8GiB. Недостаток — stop/сообщение владельцу.

## Серия и наблюдение

- [ ] Единый штатный `src/run.ts --tasks tasks/analytic --only <10 IDs через запятую>
  --parallel 2 --repeat 1 --timeout-ms 1800000 --label analytic10-branch-61-medium`.
  Явные абсолютные binary/config/budget/results paths, controlled controller env,
  без случайного dotenv. Только binary из новой private installation.
- [ ] Оставаться в активной сессии до завершения, читать новые данные каждые
  30–60 секунд и сообщать краткий статус не реже минуты; admissions/completions,
  judge/score/oracle, cleanup/reuse и любые инциденты сообщать сразу.
- [ ] Каждые пять минут развёрнутый snapshot: completed/10/queued; a/b task+stage,
  elapsed/timeout/last event; provider/tool counts/errors/tokens/reported cost;
  artifacts/oracle/judge calls/scores/gate; cleanup/quarantine/reservations;
  host/container CPU/RAM/swap/FS/inodes/OOM/throttling/sample completeness и limits.
- [ ] Run сам собирает resources.jsonl каждую секунду и завершает collector в finally;
  второго collector нет. Используются events/stderr/admission journal/run/result/cleanup.
  Первые две задачи — контрольная точка входа/provider coverage этой же серии.
- [ ] Судья через systemd буферизует вывод до конца вызова; live state/serialization
  наблюдать по именованным units/journal. Не обещать live judge text/стоимость или
  per-agent CPU/RAM: штатный collector измеряет host/containers. Нулевой reported
  OAuth cost не доказывает бесплатность. Unknown всегда обозначать явно.
- [ ] Ошибки качества без повторов; штатные judge retries сохранить, infra retry нет.
  Quarantine оставляет здоровый слот работать; общие ошибки останавливают admission.
  OOM/ENOSPC, strict budget violation, identity drift/collector loss требуют одного
  SIGINT, если harness ещё не abort. CPU>95 только информация. Возраст события
  не доказывает hang; соблюдать timeout. Resource checks автоматические в конце,
  поэтому во время run пробы читает исполнитель.

## Приёмка и завершение

- [ ] Ровно 10 итоговых attempts без пропусков/дублей/подмен; реальное перекрытие
  CLI launcher chains при max concurrency2 (не доказательство overlap HTTP LLM).
- [ ] Reuse только после своего judge/cleanup, без искусственного барьера/баланса5/5.
  duration_ms — agent duration; полный cycle восстанавливается admissions/cleanup/next admission.
- [ ] Сверить slot_id/profile/history/workspace/inputs/archives/artifacts;
  предыдущая история недоступна следующей попытке.
- [ ] Verdict/oracle либо явная ошибка для каждого artifact, все judge units завершены,
  home released. Ноль artifacts/judge calls означает неполный рабочий цикл.
- [ ] Фактическая полная provider/judge coverage; новая session.status позволяет
  проверить busy→idle, но наличие кода само по себе не PASS.
- [ ] 10 cleanup confirmed, slots closed, 4 reservations released, своих server sessions
  и work leftovers нет, архивы сохранены. Полные resource probes и bounds без инцидентов.
- [ ] После серии штатный немодельный verify --parallel2 без ручного ремонта.
- [ ] Причины отклонений: harness/CLI/provider/environment/solution quality.
  Defects автономно TDD/малый commit; после measured-code change полная rebuild/pins
  и новая полная та же десятка в оставшемся8ч окне. Старые серии сохранить без склеивания.
  Unknown ownership/SESSION_NOT_IDLE/invalid login/нехватка RAM — сохранить evidence
  и точное условие продолжения; старые инциденты не очищать.
- [ ] Итоговый report (technical/slot timeline/overlap/reuse/judge/cleanup/resources/limits,
  отдельно quality), актуальные checkbox/checkpoint <=20 строк, отдельный docs commit.

## Checkpoint

1. Base dca5e33d22, план утверждён владельцем и независимо проверен.
2. Private root выше, исходный index/worktree и пять чужих файлов сохранены.
3. Следующий шаг — RED для username blur/password fill, минимальный fix и build.
4. Модельные вызовы не начаты; общий8ч дедлайн ещё не установлен.
5. Run проверяет обычный N2/reuse, не аварийное восстановление/SIGINT/shared refresh.
