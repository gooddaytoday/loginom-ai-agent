# Очистка и сброс выделенного стенда node evals

Пакет C квалифицирован на eval-tests **16.10.2026 в 15:04 МСК**: один сброс, настоящий READY → COMPLETE → RELEASED → FREE, без вызова модели. Действующие реквизиты нового поколения — в активном runbook серии; доказательства первого испытания — в конце этого файла. local.env не открывался.

Общий контракт — [evaler-orchestration.md](evaler-orchestration.md), команды — [evaler/operations.md](evaler/operations.md). Единственный источник CLI/helper/config/checkout серии импорта — [активный блок серии](2026-10-16-text-import-integration.md#действующий-маршрут). Идентичности образов, сеть и права службы — [runtime runbook](2026-10-07-eval-tests-runtime.md). Старые документы инцидента не являются командами продолжения.

## Кто отвечает и что разрешено

Каждый исполнитель завершает и очищает собственные запуски. На один захват стенда (lease) разрешено одно штатное восстановление. Ben отвечает за итоговую свободу и исправность стенда; ожидания по кейсу он сохраняет до чтения авторских ответов и до любой живой работы. Расследовать отказ или писать новый операторский код внутри приёмки Ben не должен.

После неуспеха очистки и восстановления применяется только вся процедура ниже. Штатный исполнитель — Ben как `user` в управляемом runtime с Docker. `SupplementaryGroups=docker` подтверждён документами службы; права новой SSH-сессии надо проверить. Смена прав Docker socket, установка sudo и изменения глобальных AppArmor/VPN правил сюда не входят. Недоступный шаг выполняет назначенный оператор владельца с административным доступом к eval-tests. При первом испытании оператором был Codex текущего чата под user/UID 1000: Docker доступен, sudo не потребовался. Это разовая квалификация до карточек; штатную очистку работники и Ben выполняют сами. Для недоступного шага Evaler назначает конкретного оператора до начала такого шага.

Поручение выполнить C охватывает подготовку и одно испытание без модели на выделенном eval-tests. После успешного испытания этот же рецепт вместе с автоматическим допуском нового экземпляра используется в разрешённых node-eval сериях без отдельного согласования каждого сброса. Первое испытание завершено; процедура и автоматический допуск нового экземпляра действуют в описанных границах. При изменении образа, корней, настроек, прав или границ ресурсов — остановка и решение Evaler. Выход за выделенную среду или потеря невосстановимых данных — решение владельца/его уполномоченного координатора.

Новый контейнер не означает новый бюджет, ACCEPT или исправление прежнего ERROR. История попыток, счётчики, исходные ошибки и старый lease сохраняются. Захват не снимается по возрасту или отсутствующему PID. Неизвестное состояние не считается чистым; область kill/rm не расширяется. Неизвестных или чужих писателей эта процедура не останавливает.

## Что установлено офлайн

В [исходном отчёте Ben](2026-10-13-text-import-ben-cleanup-blocker-verification.json) причина `Writer owner identity changed during release` осталась неклассифицированной. В `src/process-supervisor.ts:84–104` эта ошибка означает: после отсутствующего owner снова наблюдался файл owner. Она не доказывает смену nonce или безопасную гонку освобождения.

`packages/agent/src/cli/profile.ts` при захвате создаёт `.writer`, затем пишет owner; при освобождении удаляет owner, затем каталог. Окно без owner возможно в обоих направлениях. Сохранённые доказательства не различают их и появление другого владельца. Штатное восстановление принимает только `Writer owner unavailable` (`src/process-supervisor.ts:204`, `src/node-eval-ops.ts:353,360`). Оснований расширить список ошибок нет; защитный код не изменён.

Локально пройдены `writer-identity.test.ts` и `writer-settlement.test.ts`: 16 PASS, 41 проверка. Они проверяют нормальное освобождение и отказы при изменении каталога/owner, symlink, недоступном owner, неизвестном или живом чужом процессе. Живого Loginom и моделей в этих тестах нет. Если позднее появится доказанная причина, исправлять отдельно по TDD и независимо проверять точный чистый исходник до установки.

## Подготовка операторского окна

1. Через `mq` прочитать все страницы задач агентов runtime серии и runs карточек. Не должно быть running, queued, dispatched, deferred, waiting или неоднозначных назначений. В отдельном комментарии/коротком checkpoint закрепить исключительное окно, причину и исполнителя. Чужие runtime не блокируют окно без доказанного пересечения ресурсов.
2. Проверить фактические hostname, UID, Docker membership и доступ к daemon. Получить из активного runbook установленные helper/config, путь Ben checkout и ожидаемый SHA. Проверить manifest helper, чистоту checkout и его SHA. До захвата убедиться, что в evals установлен компилятор TypeScript; при отсутствии установить только dev-зависимости по замку командой ниже. Установка не должна менять исходники или lockfile. Не читать реквизиты в терминал; для команд существующего helper использовать `with-env` как в operations.md.
3. Проверить все шесть профилей из config. Четыре Rich/Ben могут быть адресно сохранены по процедуре; два eval-only профиля должны быть чисты и остаются без изменений. По оригинальному допуску, учёту процессов и свежей проверке установить, что писатели и браузеры завершены. Неизвестный владелец, недоступный `/proc` или неполный учёт — STOP, а не разрешение удалить guard.
4. Если стенд FREE, захватить отдельный операторский lease `role=ben, phase=unit` штатной командой acquire; issue/task относятся к этому операторскому испытанию, не к LAB-58. Если lease уже принадлежит известному инциденту, сохранить его и работать в заранее разрешённом окне этого инцидента: новый захват поверх него не создавать. Для первоначального испытания ожидается FREE; BUSY требует отдельного разбора, а не обхода.

В следующих командах `R`, `CFG`, `OPS_SCRIPT`, `CHECKOUT`, `SHA`, `WORK`, `ISSUE`, `TASK` берутся из проверенного назначения по operations.md; секретные значения не публикуются. `WORK` принадлежит Ben и входит в workRoots config. Команды выполняет `user` на eval-tests с `umask 077` и `set -euo pipefail`. Это последовательные адресные команды, не скрипт с автоматическим повтором. Любой отказ останавливает процедуру.

До работы со стендом проверить инструменты в собственном checkout:

```sh
cd "$CHECKOUT/evals"
if ! test -x node_modules/.bin/tsc; then
  "$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" install --frozen-lockfile --ignore-scripts
fi
test -x node_modules/.bin/tsc
test -z "$(git -C "$CHECKOUT" status --porcelain)"
```

Это подготовка среды, не модельная попытка. Если установка не удалась, стенд не останавливать. При квалификации C отсутствие tsc обнаружилось после тестов; этот порядок исключает такое ожидание в следующих сбросах.

## Сохранить до удаления

Создать новый приватный каталог инцидента вне профилей, checkout и удаляемого контейнера. Не переиспользовать имя старого инцидента. В примере `E` — такой каталог в `WORK`; файлы внутри могут содержать реквизиты, поэтому их нельзя прикладывать к карточке.

```sh
umask 077
set -euo pipefail
E=$(mktemp -d "$WORK/stand-reset-XXXXXXXX")
OLD_ID=$(jq -er '.container.id' "$CFG")
SERVER=$(jq -er '.container.name' "$CFG")
docker inspect "$OLD_ID" > "$E/container-before.json"
docker inspect "$SERVER" > "$E/container-by-name.json"
cp --preserve=mode,timestamps -- "$CFG" "$E/config-before.json"
docker cp "$OLD_ID:/workdir/.loginom-evals-isolated.json" "$E/marker-before.json"
```

Сверить оба inspect: один и тот же полный ID из config; выделенное имя; `restart=no`; `Mounts=[]`, `HostConfig.Binds` пуст и нет volume mounts; допустим только сохранённый runtime tmpfs `/run/loginom:rw,mode=1777`, содержащий Unix-сокет без долговечных данных; действующая сеть/alias; исходный IP для лицензии. Маркер обязан содержать фактический ID, `kind=loginom-evals-isolated`, `version=1`, storageDir из config и ровно `/workdir/UserStorage`, `/workdir/SessionBackup`. Оба корня — настоящие каталоги, без symlink. Это те же границы, что проверяет `checkIsolatedStorage`; имя контейнера само по себе недостаточно.

Из inspect сохранить образ и сетевые параметры. Сверить образ с закреплённым ID из runtime runbook и наличие image локально. Для импорта ожидается `loginom-net`, alias `loginom-server-7.4.2-test`; IP должен совпасть с адресом узких лицензионных правил из runtime runbook. Проверить, что старый сервер не имеет неописанных port bindings, env/command/user overrides, ресурсов или подключений. Если они есть, штатную команду create нельзя считать эквивалентной: STOP и решение Evaler. Выгрузки inspect остаются приватными.

Существующие `.history`, results и исходные evidence сохранить на месте вне mounts, проверить их доступность и зафиксировать пути. В копию текущего инцидента включить только связанные с ним файлы. Не копировать всю накопленную историю на каждом сбросе и не терять старые архивы. Остановить **проверенный ID**, заморозив серверные записи:

```sh
docker stop --time 30 "$OLD_ID"
test "$(docker inspect --format '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}' "$OLD_ID")" = 'false no'
docker export "$OLD_ID" | gzip -1 > "$E/container.tar.gz"
gzip -t "$E/container.tar.gz"
tar -tzf "$E/container.tar.gz" > "$E/container-files.txt"
```

Полный export допустим, потому что host/volume mounts отсутствуют. Tmpfs `/run/loginom` не входит в export: перед остановкой подтвердить, что в нём только Unix-сокет; он создаётся заново, его параметры сохраняются. Он сохраняет удаляемый writable-слой, включая историю Loginom; восстанавливать новый сервер из него нельзя. Проверить в списке наличие обоих storage-корней и нужных данных инцидента. Если архив неполон/нечитаем, контейнер не удалять.

Для четырёх профилей Rich/Ben из config выполнить одинаковый стандартный архив. `P` — проверенный абсолютный канонический путь одного профиля, `LABEL` — его имя в инциденте. Повторить для каждого, не подставляя глобальные профили другой серии:

```sh
test -d "$P"
test ! -L "$P"
test "$(realpath -- "$P")" = "$P"
tar -czf "$E/$LABEL.tar.gz" -C "$(dirname -- "$P")" -- "$(basename -- "$P")"
gzip -t "$E/$LABEL.tar.gz"
tar -dzf "$E/$LABEL.tar.gz" -C "$(dirname -- "$P")"
```

До архива убедиться, что долговечные stores действительно находятся внутри P, без внешних symlink/mounts: иначе этот архив их не покрывает и перенос запрещён. В архив входит профиль целиком: БД, WAL, SHM, pending/recovery и `.writer`, если они остались. Нельзя копировать только основной SQLite-файл. Архивировать при живом писателе нельзя. Соседний `$P.harness-lease`, исходный `R/operations/stand.lease` и связанные receipts/evidence сохранить целиком отдельными адресными архивами теми же tar/gzip/compare. Не вызывать `archiveProfileHistory` на незавершённом профиле: он требует settled-состояния и правильно откажет.

После создания всех архивов записать один общий SHA256SUMS, проверить его и свободное место:

```sh
find "$E" -maxdepth 1 -type f ! -name SHA256SUMS -print0 |
  sort -z | xargs -0 sha256sum > "$E/SHA256SUMS"
sha256sum --check --status "$E/SHA256SUMS"
df -Pk "$E"
```

Затем повторно сравнить стабильные профили с архивами. До успешной проверки не выполнять rm контейнера, перенос профиля или старого lease. Удаление исходного контейнера не отменяет владение другими ресурсами.

## Пересоздать только выделенный сервер

`IMAGE`, `SERVER_IP`, `SERVER_HOSTNAME` и alias берутся из уже проверенных inspect/runbook, не из текущего произвольного тега. Команда сохраняет image entrypoint и фактический Cmd старого экземпляра. Для проверенного eval-tests Cmd — `["/app/loginomd", "--run", "-workdir=/workdir"]`, entrypoint такой же, эффективный cwd `/`; null в image WorkingDir и пустой WorkingDir контейнера означают этот же cwd. Сохранить эти фактические аргументы, а не молча перейти на пустой image Cmd. Runtime tmpfs ровно `/run/loginom:rw,mode=1777`; другие overrides требуют отдельного разбора. Сохраняется прежний сетевой IP, чтобы не менять лицензионные правила. Studio не пересоздаётся.

```sh
docker image inspect "$IMAGE" > "$E/image.json"
docker rm "$OLD_ID"
docker create --pull=never --name "$SERVER" --restart=no \
  --hostname "$SERVER_HOSTNAME" --network loginom-net --ip "$SERVER_IP" \
  --network-alias loginom-server-7.4.2-test --tmpfs /run/loginom:rw,mode=1777 \
  "$IMAGE" /app/loginomd --run -workdir=/workdir > "$E/new-container-id"
NEW_ID=$(cat "$E/new-container-id")
test "$NEW_ID" != "$OLD_ID"
docker inspect "$NEW_ID" > "$E/container-created.json"
jq -e --arg id "$NEW_ID" --arg image "$IMAGE" --arg name "/$SERVER" \
  --arg ip "$SERVER_IP" '
  length==1 and (.[0] |
    .Id==$id and .Name==$name and .Image==$image and
    .HostConfig.RestartPolicy.Name=="no" and (.Mounts|length)==0 and
    .HostConfig.NetworkMode=="loginom-net" and
    .HostConfig.Tmpfs=={"/run/loginom":"rw,mode=1777"} and
    .Config.Cmd==["/app/loginomd","--run","-workdir=/workdir"] and
    .NetworkSettings.Networks["loginom-net"].IPAMConfig.IPv4Address==$ip and
    (.NetworkSettings.Networks["loginom-net"].Aliases | index("loginom-server-7.4.2-test"))!=null)
' "$E/container-created.json" > /dev/null
docker container ls -a --no-trunc > "$E/containers-after.txt"
docker start "$NEW_ID"
```

До start сверить новый ID, image, restart policy, mounts и сеть с допуском. Успешный полный `docker container ls -a --no-trunc` должен подтвердить отсутствие старого ID; не считать ошибку inspect доказательством удаления. Если create/start не удалось, не повторять автоматически и не воссоздавать старый writable-слой: сохранить исходы, стенд остаётся BLOCKED. При необходимости обновить upstream существующей Studio допустим один адресный restart её подтверждённого контейнера, без изменения образа/портов/сети; повторный отказ — STOP.

На новом сервере проверить корни, отсутствие пользовательских пакетов/backups, отключённый Python в Components.cfg и network alias. Только после этого записать маркер с новым ID. Сохранить прежний `previous_container_id`, если он был: его остановка и restart=no остаются обязательны. Не записывать туда удалённый dedicated OLD_ID — существующий preflight требует inspect объявленного predecessor. Замена dedicated ID учитывается в архиве инцидента. Не удалять прежнего объявленного predecessor и не убирать его поле ради PASS.

```sh
jq --arg id "$NEW_ID" '.container_id=$id' "$E/marker-before.json" > "$E/marker-new.json"
docker cp "$E/marker-new.json" "$NEW_ID:/workdir/.loginom-evals-isolated.json"
NEW_CFG="$R/operations/$(basename -- "$E").json"
test ! -e "$NEW_CFG"
(set -o noclobber; jq --arg id "$NEW_ID" '.container.id=$id' "$CFG" > "$NEW_CFG")
chmod 600 "$NEW_CFG"
```

Сравнить config до/после: `cmp <(jq -S 'del(.container.id)' "$CFG") <(jq -S 'del(.container.id)' "$NEW_CFG")` обязан завершиться успешно. Меняется только `.container.id`; CLI, модели, роли, пути и корни неизменны. Старый config не переписывается. Сверить копию маркера из контейнера с подготовленными bytes. Новый config становится активным только после проверки готовности; до этого новые назначения запрещены.

## История профилей и старого захвата

Чистые профили оставить на месте. Если профиль незавершён, после доказанного прекращения **всех его** писателей и проверки архива адресно перенести весь старый профиль в новый приватный подкаталог `$P.history`. Сохранить inode/owner guard и его исходные bytes; не выдавать это за обычную очистку старой попытки. Новый каталог создать по прежнему каноническому пути, mode 0700. Вернуть только точные файлы настроек из allowlist `retainedProfileFiles` в `src/profile.ts`; каждый существующий файл проверить на обычный файл без symlink, копировать с родительскими каталогами и mode 0600, затем сверить bytes. Не возвращать БД, WAL/SHM, pending/recovery, логи, `.writer`, всю папку data/cache/loginom или историю модели. Новые имена/секреты не изобретать. Для одного подтверждённого профиля перенос и копирование настроек выполняются так; повторить только для нужных Rich/Ben профилей:

```sh
HISTORY="$P.history"
if test ! -e "$HISTORY"; then mkdir -m 700 -- "$HISTORY"; fi
test -d "$HISTORY" && test ! -L "$HISTORY"
test "$(realpath -- "$HISTORY")" = "$HISTORY"
test "$(stat -c '%u:%a' "$HISTORY")" = "$(id -u):700"
SAVED=$(mktemp -d "$HISTORY/reset-XXXXXXXX")
mv -T -- "$P" "$SAVED/profile"
mkdir -m 700 -- "$P"
while IFS= read -r relative; do
  original="$SAVED/profile/$relative"
  if test -e "$original" || test -L "$original"; then
    test -f "$original" && test ! -L "$original"
    test "$(realpath -- "$original")" = "$original"
    install -d -m 700 -- "$(dirname -- "$P/$relative")"
    install -m 600 -- "$original" "$P/$relative"
    cmp -- "$original" "$P/$relative"
  fi
done <<'SETTINGS'
cli-profile.json
data/auth.json
config/loginom-ai-agent.json
config/loginom-ai-agent.jsonc
config/config.json
config/.gitignore
loginom/connection/connection.json
cache/models.json
state/model.json
SETTINGS
```

Факты прекращения писателей и проверенный архив обязательны **до** блока. Не заменять его `resetProfile`: существующая функция удаляет профиль, а здесь нужно сохранить его целиком. Состав SETTINGS проверять против `retainedProfileFiles` закреплённого helper; при изменении списка — STOP и отдельная проверка процедуры.

Для оставшегося `$P.harness-lease` сначала установить его точную исходную привязку и доказанное прекращение ресурсов. Если штатный `retireRecordedHarnessLease` применим, использовать его. Иначе заранее допущенный оператор адресно переносит этот guard в тот же закрытый инцидент **после** прекращения ресурсов, проверки dev/ino/owner и архива. Чужая, изменённая или неизвестная привязка — STOP. Простое отсутствие PID не разрешает перенос. Два eval-only профиля не перемещать; их нечистое состояние решает владелец той серии.

Старый глобальный lease с исходными ERROR административно перенести целиком в закрытый инцидент только после подтверждённого завершения его host-ресурсов, остановки/замены прежнего выделенного сервера и проверки всех архивов. Сверить dev/ino/owner с сохранённой исходной привязкой непосредственно перед переносом. Не создавать для него RELEASED, не изменять completion, не переписывать исходные доказательства. Это завершение использования старого поколения ресурсов, а не PASS его очистки. До переноса сохраняется общий запрет назначения новых задач.

## Автоматический допуск нового экземпляра

Использовать существующий helper и штатный путь `status → acquire → preflight → unit → release → status`. Роль Ben, phase=unit, проверенный SHA его clean checkout. `unit` выполняет настоящие `bun test` и `bun typecheck` под supervisor с очищенным окружением; модельные ключи и настройки роли в unit не передаются. Preflight выполняет реальные headless status/check, все шесть профилей и изоляцию. Настройки роли подключаются только для preflight через существующий with-env; реквизиты не печатаются.

```sh
CFG="$NEW_CFG"
LEASE="$E/new-stand-lease.json"
cd "$CHECKOUT/evals"
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS_SCRIPT" status --config "$CFG"
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS_SCRIPT" acquire --config "$CFG" \
  --issue "$ISSUE" --task "$TASK" --role ben --phase unit --sha "$SHA" --receipt "$LEASE"
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/ben/eval.env" \
  "$R/bin/bun" "$OPS_SCRIPT" preflight --config "$CFG" --lease "$LEASE" > "$E/readiness.json"
UNIT_RESULT=$(mktemp "$E/unit-XXXXXXXX.json")
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS_SCRIPT" unit \
  --config "$CFG" --lease "$LEASE" > "$UNIT_RESULT"
COMPLETION=$(jq -er 'select(.code==0 and .status=="COMPLETE") | .evidence' "$UNIT_RESULT")
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS_SCRIPT" release \
  --config "$CFG" --lease "$LEASE" --evidence "$COMPLETION" > "$E/release.json"
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS_SCRIPT" status --config "$CFG" > "$E/status.json"
jq -e '.code==0 and .status=="READY"' "$E/readiness.json" > /dev/null
jq -e '.code==0 and .status=="RELEASED"' "$E/release.json" > /dev/null
jq -e '.code==0 and .status=="FREE"' "$E/status.json" > /dev/null
```

Проверить все результаты и process proofs helper, реальный completion и archived lease; одного FREE недостаточно. Нельзя создавать completion вручную, подставлять прежний smoke PASS, сбрасывать лимиты или повторять сброс после отказа без новой проверяемой гипотезы и решения Evaler. В активном runbook обновить только config path/hash и новое поколение контейнера, сохранив старую привязку в истории. Следующие команды работников явно используют новый config; автоматическое изменение чужих runtime env не выполняется.

Один успешный полный цикл на eval-tests закрывает испытание C. После него повторно проверить через mq пустую очередь и прежние run IDs, LAB-58–63 остаются backlog. В checkpoint — результат, config/container binding, приватное место архивов и ограничение «модельных/reference/product/cold попыток 0»; в Git нет секретов, сырых архивов или нового JSON на каждый шаг.

Перед каждой последующей карточкой достаточно `status → acquire → preflight` без модели на **том же** lease первого этапа Rich. Preflight не создаёт completion: отдельный захват ради этой короткой проверки не нужен. Каждый исполнитель затем закрывает собственный реальный этап обычным release; Ben закрывает приёмку только после подтверждённых исправности и свободы стенда.

## Доказательства первого испытания C

Это снимок квалификации 16.10.2026, а не альтернативный источник активных pins. Config и текущее поколение берутся из [активного блока](2026-10-16-text-import-integration.md#действующий-маршрут).

- Оператор user/UID 1000 на eval-tests, Docker 29.1.3, группа docker. Проверены все 1583 файла закреплённого helper по manifest. Исходник helper/guard и CLI не изменены; новый executable-код не устанавливался.
- Проверены приватные tar/gzip архивы четырёх профилей Rich/Ben, текущей истории CLI с имеющимися БД/WAL/SHM, исходного lease и полного остановленного контейнера. Накопленные архивы `.history` и results остались на хосте вне mounts. Полный архив контейнера хранится для сохранности данных и не использовался для создания нового сервера.
- Пересоздан только выделенный сервер. Образ, image entrypoint, фактический Cmd, hostname, cwd, tmpfs и IP лицензирования сохранены; root volumes/host bind mounts отсутствуют. Studio не изменялась. На свежем сервере подтверждены пустота storage/backups, маркер, отключённый Python и успешный headless native check.
- Старый служебный lease перенесён целиком в `retired-stand.lease` без поддельного RELEASED. Его dev/ino/owner и архив проверены. Это maintenance lease C, не повторная очистка завершённой LAB-57.
- Первый unit: 622 PASS, 6 SKIP, 0 FAIL, но typecheck завершился с `tsc: command not found`. Ошибка и исходный completion сохранены. В checkout Ben установлены dev-зависимости по frozen lockfile с отключёнными install scripts; source и lockfiles остались clean.
- Повторный unit после конкретного изменения среды: **622 PASS, 6 SKIP, 0 FAIL**, 3223 assertions; `bun typecheck` — exit 0. Оба process proofs подтверждены, неизвестных процессов нет, финальные проходы показывают ноль собственных процессов. Прежний ошибочный unit не переписан в PASS.
- Свежий completion принят обычным release: **RELEASED в 15:04:04 МСК, затем FREE**. Shared lease отсутствует; все шесть профилей чисты, наборы и bytes файлов настроек всех шести совпадают со снимком до сброса. Служебный указатель текущей работы удалён; приватные доказательства сохранены.
- Через mq до/после проверены пустые очереди runtime, прежние run IDs LAB-58–63, backlog/revision 14, те же тела, metadata, assignee и вложения. Инструкции и модели трёх агентов не менялись. Новых model/reference/product/cold попыток **0**. Поля model/variant в preflight — параметры конфигурации, не доказательство модельного вызова.

Приватные доказательства: `R/roles/ben/agent-work/stand-reset-C-zX0NgUf4`. `SHA256SUMS` проверен; его SHA256 — `d39d01a7f28ad6cfb42cee3b52da004eade757a5ef8e93e549462d4d63a3463a`. Completion SHA256 — `561df30ebd3ff9c18539883171cfbf7afe4f390da6fb14112e9a2928ade68dff`; обычный архив нового lease — `R/operations/completed/6f1d2bd3-b6da-4c07-9654-ae177cca0473`. Lease handles, auth, сырые логи и архивы не публикуются в Git/Multica.

Границы проверки: живое испытание выполнено на чистых исходных профилях. Ветвь адресного переноса незавершённого профиля проверена локально на SQLite/файлах, включая отказ при symlink; она не даёт права обойти неизвестного владельца. Историческая причина writer остаётся недоказанной, проверка supervisor не ослаблена. C восстанавливает среду; он не меняет смысл ERROR, бюджеты или критерии ACCEPT. До LAB-58 отдельно требуется гарантия одного физического продуктового вызова и разрешённый старт.
