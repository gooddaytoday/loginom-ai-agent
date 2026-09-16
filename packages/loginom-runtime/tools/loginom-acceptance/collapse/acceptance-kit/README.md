# Node16 acceptance kit — подготовлен, НЕ ГОТОВ К ЗАПУСКУ

Назначение `node16:acceptance-preparation:1:77385e36`. Handler не изменялся.
Источник77385e36a969e61ade03ab072678b8fb6f00a27d; runtime
`db6d957169c50bcd5cb169db80d744fd846b8ffa4eee683178619c001fb22bab`.
`manifest.json` закрепляет goal, fixtures, expected, auditor, harness и source packet.
`goal.json` сохраняет полные требования подплана16 и OPEN gates.
Это комплект подготовки, а не attestation и не доказательство полной приёмки.

## Состав и проверка

- `hermes-goal.md` — замороженное пользовательское задание без selectors/JS/старых
  receipts. Оператор добавит только свежий run ID, account/storage и проверенные
  пути доставленных fixtures. Содержательные изменения ТЗ требуют новой freeze.
- `fixtures/` — пять маленьких самостоятельных CSV; `expected.json` — десять
  полных ожидаемых native-таблиц. Нативные числа/даты заданы независимым oracle,
  не получены из handler/decoder. Новые mapped/wide ожидания остаются OPEN live.
  Смешанный файл скопирован из локальных проверенных134байтов, не с fault-path.
- `import-profile.json` закрепляет проверенные формат и типы mixed. Для mapped
  типы связываются по именам, S/I получают одинаковую метку; wide — все integer.
- `audit.py CASE USER_RESULT.json` сравнивает все клетки/типы/bytes, схему,
  coverage, bindings, роли, порядок и исключения. Он выдаёт только CASE_PASS.
  Для итогового аудита дополнительно обязательны настоящие public-api.jsonl,
  execution-events.jsonl, source/runtime pins, lifecycle и persistence — по
  review-fix/verify.py. Нельзя подать вручную составленный CASE_PASS как acceptance.
- Отдельные no-effect negatives, Done/Close, partial-loss, topology/save/reopen
  требуют существующих аудиторов и новой привязки к окончательному run. Старые
  audit_diagnostic/audit_loss/audit_persistence не становятся final от копирования.

Локальный `check.py` проверяет freeze, source hashes, fixtures и replay трёх
имеющихся итоговых результатов плюс отрицательные подмены. Он не меняет gates.
Память healthy/actor доступна; её ошибочное резюме «acceptance complete» не принято
за факт. Канонические отчёты оставляют Hermes/subplan false.

## После восстановления ресурса: bounded Codex диагностика

1. Координатор подтверждает ресурс и исключительное владение test-1. До каждого
   запуска проверить free; создать новый каталог `/test-1/node16-acceptance-<RUN>`
   и отдельный пакет/профиль/сессию. Подставляемый RUN генерируется только тогда.
   Стенд `http://logi-test-plan.bg.local/app/?testable=true`, окно максимизировано,
   viewport=null. Старые uncertain операции, IDs и server CSV не использовать.
2. Один свежий header-only.csv: до admission проверить local bytes/SHA из manifest,
   после новой доставки — server verification bytes/SHA и завершённый private
   upload. Проверить единственную активную Files вкладку и точный каталог.
   Не закрывать вкладки вслепую. При UI_ROOT_STALE сохранить контекст и остановить
   именно эту операцию; не выдавать ей новый ID. Другая диагностика — только после
   наблюдаемого завершения/безопасного закрытия отдельной сессии.
3. Выполнить импорт и убедиться в completed execution и полной схеме. В одной
   свёртке получить header-only false, в другой true; оба выхода0×4, exact_table=[],
   полная схема и coverage с cells/rows/columns_read=0. Читать через public API;
   проверить loaded53pins, source lineage и отсутствие незавершённых RPC.
4. В другой свежей сессии/пакете — новый all-null.csv. false должен дать5×4/20cells,
   true0×4. До запуска наблюдать process panel, owner, visibility/show-completed,
   wizard/graph и настройки. Если снова console_not_ready после finish, сохранять
   exact native state и process ownership без повторного Done/Execute. Это точка
   решения о конкретном исправлении координатором, а не повод ещё раз запустить
   тот же путь. Максимум один проход каждого режима в этой диагностической фазе.
5. Для обоих успешных пакетов save/newsession/reexecute и полный независимый audit.
   Затем mapped/mapped-ignore/reconfigured/wide и требования Done/Close/negative
   requests/partial loss по goal.json. Wide24поля×2строки=48×4, в native bound50×8;
   исторический52строчный опыт не является exact-pass текущего runtime.
6. При любом неподтверждённом эффекте — сохранить original outcome и прекратить
   зависимые мутации. Новый handler fix не разрешён этой подготовкой: сообщить
   конкретный воспроизведённый blocker, не запускать повторный full review.

## Что доказывает независимое открытие

Имеющееся correction доказательство: saved checkpoint success, другой document ID,
те же node IDs, import settings={}, Collapse parameters={}, mappings=[]; совпали
source path/format/columns/output mappings, роли, флаг, схема и60cells. Старые
receipts не вводились в новый executor: новый upload был реально проверен.

Ограничение: перед импортом повторно доставлялись134байта по тому же пути.
Это может скрыть изменение server CSV между сессиями. Поэтому OPEN
`new-session-readonly-source-proof`: до ЛЮБОЙ записи в новой сессии независимо
скачать сохранённый пакет и его CSV через наблюдаемый штатный файловый UI;
сверить bytes/SHA с первоначальной сохранённой доставкой, сохранить артефакты.
Выполнить независимое UI-readback сохранных настроек ДО node.apply, не Apply/Done
с новыми значениями. Затем, если source runtime требует нового upload proof,
доставить уже проверенные идентичные байты в тот же path и явно записать этот факт;
settings={}, parameters={}, mappings=[] и отсутствие фактических field-change
жестов проверяются по browser/journal, а не только по входному JSON.

Не внедрять старые upload receipts и не подменять private history. Если readonly
скачивание или начальный readback недоступны, gate остаётся OPEN; нужен отдельный
диагностический план. Сохранность настроек, неизменность CSV и новое исполнение —
три разные утверждения. Сейчас подтверждено только ограниченное correction equality.

## Candidate и единственный будущий Hermes

Локально createCandidateNodeSupport содержит transform.collapse_columns/unpivot,
node API проверяется адресными tests. Это source compatibility, не admission.
Default executor/catalog/compatibility.json —7.5alpha; для текущего7.4.2 подготовлен
явный compatibility-7.4.2.json. `source-packet.json` содержит paths/SHA/size, без
credentials, профилей и больших evidence. Координатор собирает на VPS из точного
source, выбирает новую candidate version, явный package-root свежего RUN и этот
compatibility; publisher только `--stage`, затем exact manifest URI/SHA/readback.
Ни current.json activation, ни общий plugin не переключаются. Существующий
candidate нельзя объявить совместимым по названию; нужны актуальные E2E/source
manifest, stale-actions и fresh source rehearsal.

Обнаружен OPEN runner gate: tools/loginom-acceptance/run.py не содержит Collapse
в --goal choices и не подключает этот goal/auditor. Нельзя подставить basic-graph
или union для формального PASS. Нужна отдельная согласованная интеграция
`collapse-node-complete` (имя предложено), data admission и full-goal auditor.
Она не выполнена и handler не менялся.

После ВСЕХ gates координатор даёт единственный Sol-slot. Предлагаемые пределы:
один run, openai-codex/gpt-5.6-sol/low, existing ChatGPT connection, fallback=false,
timeout3600s/max_turns100, isolated Hermes HOME/source/browser/capture. Сначала
безмодельный preflight; effective model identifiers сверить без credentials.
Run.py получает --model-profile chatgpt-sol, --fault none, явные account test-1,
URL/storage и фактические candidate URI/SHA. До интеграции goal корректной команды
--run не существует. Один запуск выполняет всё ТЗ, сохраняет пакеты; Codex затем
в отдельной сессии делает независимый аудит. Hermes summary/exit0 не являются
приёмкой. Failed run возвращает задачу к диагнозу; автоматический повтор запрещён.

## Место и границы этой подготовки

На старте free2.4GiB. Новых browser/model/VPS запусков и больших копий нет.
Kit+manifest — менее1MiB (фактический размер в preparation-result.json). Source
packet — только перечень; архив не собран. По существующим сессиям один public
диагностический проход занимал сотни MiB; полный goal может дать несколько GiB.
Рекомендуемый резерв перед live — не менее6GiB свободно, перед полным Hermes+
независимым reopen —10GiB. Это плановый запас, не измеренный максимум и не новая
политика очистки. При free<3GiB новые большие фазы не начинать; согласовать ресурс
с координатором. Старые evidence/uncertain/browser caches самостоятельно не удалять.

Completion этой подготовки не закрывает ни одного live/resource/admission gate.
