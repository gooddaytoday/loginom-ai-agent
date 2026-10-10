# EvalRunner: операторская поставка и исполнение

## Текущая граница

Этап A выполняется локально в отдельном worktree от baseline executor 74cfb803f.
Gate LAB-55 подтверждён 2026-10-10: 144 измерения, оценки, cleanup/history/release и
проверенный скачанный архив. Этап B выполняется; перед общими изменениями повторить FREE.
Никаких изменений evidence, мониторинга или комментариев LAB-55.
Checkpoint: [evalrunner-checkpoint.md](../evalrunner-checkpoint.md).

## Gate перед любыми серверными изменениями

Сохранить private receipt со временем чтения и ссылками/хэшами доказательств:

1. LAB-55: штатный check исходного executor; 48 cases/144 measured, все обязательные
   judge/code verdict, нет UNKNOWN, pending measurements/recovery. FAIL допустим.
2. Подтверждены cleanup каждой execution, закрытые history archives, profile/storage
   проверки и действительный release с original owner/acquiredAt/config/process identity.
3. Curated archive доставлен в карточку, скачан обратно, SHA256/delivery-manifest
   проверены штатным baseline-archive.py. Проверить manifest hash и ID серии.
4. Непосредственно перед переключением повторить FREE по актуальному общему helper;
   нет active/queued задач **всех** исполнителей, процессов, harness leases, pending recovery,
   незавершённого архивирования. Проверить Multica очередь и реальные процессы/профили.

in_review/done, idle и отсутствие PID отдельно недостаточны. Если любой пункт не
подтверждён — отложить B, сохранить checkpoint. Не создавать дополнительный монитор.
Не пользоваться новым helper/config для восстановления LAB-55 и не освобождать её lease.

## Локальная поставка

Ветка eval-runner. Все изменения внутри evals. Локальный пакет содержит tracked evals
на конкретном clean Git SHA и файловый SHA256 manifest. В нём нет local.env,
node_modules, результатов, профилей, credentials или БД. Это подготовленный supplement,
его создание не активирует сервер. На B проверить source SHA, archive SHA256 и все
payload files; сохранить прежнюю поставку и private config без изменения архива.

## Этап B: отдельная операция после gate

- Повторно прочитать runtime Codex (eval-tests) и настройки EvalBaseline. Сохранить
  private backups активного config, entrypoints, AppArmor, агентских инструкций/MCP.
- Прочитать текущие baseline pins прежним executor при свободном стенде: зафиксировать
  совпадение с LAB-55. Сохранить private receipts компонентов изоляции до миграции.
- Развернуть новый supplement в R/support/evalrunner-SOURCE_SHA. Никогда не переписывать
  baseline-v2 и прежние checkout/результаты. Отдельный полный Git checkout EvalRunner
  содержит историю старого harness SHA для проверки scorer identity; HEAD чистый.
- Создать только свои directories 0700, eval-profile и judge-home; перенести одобренный
  OAuth штатным способом без вывода секретов. Product history вне mounts, `.history`.
  Не редактировать generated task CODEX_HOME Multica: его материализует runtime.
- Подготовить AppArmor для evalrunner и необходимую миграцию общих правил. Проверить
  diff разрешённых путей, bwrap/Chromium права и запрет mounts corpus/judge/results/history.
  Новые creds/proxy/Docker image/network/маркер/Components/лимиты не считать изменениями пути.
- Применить config overlay к **актуальному** v2: version=3, добавить только evalrunner;
  rich/ben/evalbaseline/offline/container/CLI сохранять по readback. Пример overlay не
  является активным config. Product version/source/manifest/binary задаются явно;
  model/variant могут отсутствовать и наследуются при prepare из accepted baseline.
- Зарегистрировать LAB-55 только после verified gate/delivery и решения владельца.
- Подготовить equivalence proof ниже после аудита изоляции и evaluator fingerprint.
  Вся разница операционного кода/путей/роли должна быть объяснена; иначе INCOMPARABLE.
- Повторить FREE/очередь/процессы/leases. Атомарно переключить config/helper. Обновить
  только entrypoints операторских инструкций Rich/Ben/Evaler/EvalBaseline/runtime.md
  на новую поставку, сохранив модели, runtime, concurrency, squads и рабочий контракт.
  Baseline использует новый общий run-baseline.ts, сохраняя своё дерево corpus/evidence.
- Создать агента по agent-settings.json и agent.md. MCP копировать из проверенного
  runtime с собственным cwd/checkout EvalRunner и автоматическим Git Peer; secrets —
  через private --mcp-config-file/--custom-env-file. Не передавать их в argv/логи.
  CLI agent create поддерживает --runtime-id, --model, --thinking-level,
  --max-concurrent-tasks, --permission-mode public_to, --public-to-workspace,
  --custom-args, --instructions. project_id/squad_memberships/instructions_file в
  settings — операторские требования, не поля agent create. Проект задаёт карточка/инструкция.
- Не добавлять агента ни в один squad. Readback: name/runtime/model/xhigh/concurrency=1,
  workspace invocation target, instruction hash, MCP own paths, все squad memberships пусты.
- Настоящий health + actor memory search, профильный check внутри обязательной bwrap,
  offline replay реальных закрытых evidence и два новых smoke на параметрах LAB-55.
  Проверить actual model/reasoning в private history, cleanup/releases/delivery.
  Только после этого среда принята. Полную 144-серию запускает отдельная назначенная карточка.

## Реестр: только оператор и решение владельца

Из evals нового checkout/поставки:

```sh
bun script/baseline-registry.ts accept --registry REGISTRY --series VERIFIED_SERIES \
  --issue ISSUE_UUID --decision OWNER_DECISION_REFERENCE --archive DOWNLOADED_ARCHIVE \
  --archive-sha256 HASH --expected-current none
bun script/baseline-registry.ts current --registry REGISTRY
```

Для следующего принятия вместо none указать прежний UUID. Exclusive guard + atomic
rename/fsync дают compare-and-swap; конфликт не повторять с изменённым указателем без
нового решения. Agent не вызывает accept. Неполная серия/доставка отклоняются.
Принятая запись фиксирует ID, issue, directory, manifest/archive hashes, decision/time.
Старые manifest/journal/raw evidence не переписываются.

## Параметры и readiness

Private eval.env задаёт binary CLI, own profile/work, Docker artifact source,
LOGINOM endpoint/container/storage, JUDGE_MODEL=gpt-6-astra, JUDGE_REASONING=high,
CODEX_HOME=own judge-home и EVAL_CORPUS_SHA=53d03a35b0ee2901b40c1a1bbb0170804d59e865.
EVAL_AGENT_MODEL/VARIANT опциональны для EvalRunner; заданные значения обязаны совпасть
с config product. При продолжении используются frozen manifest, а не новый registry pointer.
Профиль/MCP/sandbox/mounts не ослабляются ради PASS.

```sh
bun script/replay-evaluators.ts --checkout OWN_CHECKOUT --regular SAVED_CALC_RUN \
  --node SAVED_POSITIVE_FIXED_SUM_RUN --out PRIVATE_REPLAY_PROOF
bun script/run-baseline.ts smoke --role evalrunner --case calc-data-double \
  --config CONFIG --series OWN_CALC_SMOKE --issue READINESS_ISSUE --task CURRENT_RUN
bun script/run-baseline.ts smoke --role evalrunner --case crosstable-fixed-sum \
  --config CONFIG --series OWN_NODE_SMOKE --issue READINESS_ISSUE --task CURRENT_RUN
```

Replay читает настоящие summary/judge verdict/node events/package/CSV/cleanup,
пересчитывает score/oracle/node validator без model calls, проверяет исходные hashes
до/после. Fixture replay не подтверждает live readiness. Proof фиксируется приватно
и повторно пересчитывается перед допуском. Исходные evidence не редактировать.
Положительный fixed-sum может находиться в многокейсовом прогоне: проверяется весь
прогон, затем PASS выбранного кейса; ошибки инфраструктуры/cleanup блокируют replay,
а продуктовый FAIL другого кейса сохраняется в proof и не превращается в общий PASS.
Если positive node evidence недоступно, readiness остаётся BLOCKED; LAB-55 не пересудить.

## Полная серия и сравнение

```sh
bun script/run-baseline.ts prepare --role evalrunner --config CONFIG --series NEW_SERIES \
  --changes cli,model,reasoning --conditions PRIVATE_EQUIVALENCE_PROOF
bun script/run-baseline.ts start --config CONFIG --series NEW_SERIES --issue CARD_UUID --task CURRENT_RUN
bun script/run-baseline.ts resume --config CONFIG --series NEW_SERIES
bun script/run-baseline.ts check --series NEW_SERIES --export
```

--changes содержит только объявленные категории; при отсутствии изменений флаг опустить.
--role/--changes/--conditions после prepare запрещены. Последующие commands берут роль,
кандидат и baseline из manifest v2. Смена config/параметров/corpus/evidence блокирует dispatch.
Конкретный baseline закрепляется даже при дальнейшем продвижении registry.

Operational equivalence — private JSON version=1: baselineId, previous/currentIsolationSha256,
previous/currentOpsConfigSha256, previous/currentHarnessSha, evaluatorSha256, decision,
changes из role/paths/operational-harness. Decision ссылается на проверенный операторский
аудит до/после: существенные условия стенда сохранены, различия config/AppArmor/путей
объяснены. Proof не заменяет проверки фиксированных endpoint/container/image/Dock/judge/
corpus/rubric/oracle/лимитов; scoring files читаются на exact Git SHA и обязаны совпасть.
Agent не синтезирует такое решение. Без подходящего proof разница изоляции/config/harness
даёт INCOMPARABLE. Файл встраивается в immutable manifest, дальнейшее редактирование не влияет.

Comparison.json содержит coverage, метрики/переходы каждого кейса и отдельные node PASS n/3,
затраты/infra/recovery. Сопоставление номеров попыток — описание, не парный эксперимент.
regular/analytic compare сохраняет evaluation lineage и явный model/reasoning opt-in.
Обычный compare строгий по умолчанию; --experiment model,reasoning включается явно.
Analytic structure: unavailable; общий смешанный балл и заявления о значимости 3 повторов запрещены.
INCOMPARABLE сохраняет результаты серии и причины; не обещает контролируемую дельту качества.

## Ошибки, доставка и откат

Product FAIL/timeout/no_artifact окончателен и не препятствует 144 измерениям.
UNKNOWN/infra/judge error/failed cleanup останавливает executor. Recovery — только штатные
owner/process/history/storage gates и фиксированный operator admission, как в baseline-runtime.md.
Judge recovery использует прежний артефакт. Не применять исключение LAB-55 к EvalRunner.

Экспорт allow-list исключает env/auth/history/private leases/MCP logs. Скачанный архив
проверяется `python3 script/baseline-archive.py verify ARCHIVE SHA256`, результат и receipt
сохраняются. После verified полного отчёта → in_review, даже при регрессии. Принятие отдельно.
Существующие v1/v2 и manifest v1 читаются без миграции evidence. Откат helper/config допускается
только при свободном стенде и отсутствии новых активных/pending серий, с теми же gates;
никогда не переключать config под живым lease. Прежние immutable поставки и private backups сохранять.
