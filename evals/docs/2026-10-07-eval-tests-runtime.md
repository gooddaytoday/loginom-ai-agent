# Выделенный runtime eval-tests

Дата: 2026-10-07. Установка выполнена; **среда READY/PASS, доставка финального support attachment DELIVERED_VERIFIED**. Принят frozen harness `63a19e902786b1528edaab5878bb079842cad97b`: final remote suite 386/386, typecheck и Python corpus PASS. Подтверждены host, Codex `gpt-6.1-sol/xhigh`, companion, Playwright, Docker, три cold reference и auth smoke судьи. Постоянный узкий сетевой маршрут прошёл proxied catalog; четыре CLI setup/check/model smokes в mount-границе и native timeout/interrupt завершились успешно, cleanup confirmed. OpenViking в настоящей Multica задаче также PASS. Analytic live завершился измеренным product FAIL/no_artifact, node live — fixed-sum PASS/reconfigure FAIL(no_artifact)/sliding-average PASS. Все live cleanup confirmed, infrastructure errors отсутствуют; measured product FAIL сохранены отдельно от готовности среды. Этот документ — каноническое описание нового стенда; краткое продолжение работы — [checkpoint](2026-10-07-eval-tests-checkpoint.md).

## Назначение и граница

Стенд на `10.200.13.152` работает от `user`, с корнем `/home/user/.local/share/loginom-evals-runtime` (далее `R`). Rich разрабатывает node eval, Ben независимо принимает frozen SHA, Evaler координирует этапы по [контракту оркестрации](evaler-orchestration.md). Один узел — одна карточка squad; рабочая карточка Кросс-таблицы — [LAB-16](https://mas.kartamyshev.dev/lab/issues/01a11195-66d8-746f-b02e-9a968354123b), проект — [Loginom node evals](https://mas.kartamyshev.dev/lab/projects/de16c24b-4121-45c3-9f5a-e16ddabb90e8).

Внешний Multica Codex выполняет доверенную разработку и проверку harness в собственном checkout. Оцениваемый Loginom AI Agent запускается установленным CLI внутри обязательной bubblewrap-границы: ему доступны prompt, inputs текущей попытки, writable-профиль и ресурсы продукта. Checkout, Git, oracle/reference, calibration, результаты и архивы истории остаются снаружи. Общий контракт — [план изоляции](2026-10-07-analytic-evals-isolation-plan.md) и [README](../README.md).

Никакого автоматического baseline 35 задач или полной калибровки установка не назначает. Старый неизолированный и новый изолированный результаты не образуют контролируемое сравнение. Для live нужен один эксклюзивный endpoint; unit/fixture проверки и live выполняются последовательно.

## Установленные компоненты и provenance

| Компонент | Пин / расположение | Подтверждение |
| --- | --- | --- |
| Bun | 1.3.14, `R/bin/bun` | Установлен, версия проверена |
| Node | 24.19.0, `R/node-v24.19.0-linux-x64` | Full-tree manifest: 4711 записей, integrity PASSED |
| Codex | 0.159.2, `R/codex-0.159.2`, включая companion `codex-code-mode-host` | Перенесён комплектом; integrity manifest проверен |
| Loginom AI Agent CLI | `R/cli-904f7f85/bin/loginom-ai-agent-cli` | `cli-manifest.json`: 5389 файлов, integrity PASSED |
| Playwright MCP | 0.0.82, `R/playwright-mcp-0.0.82` | Runtime manifest проверен |
| OpenViking plugin | 0.10.8, `R/openviking/0.10.8` | Runtime manifest проверен |
| Runtime manifest | `R/evidence/runtime-manifest.json`, 261 entries | Integrity PASSED |
| Docker / bubblewrap | Docker 29; bubblewrap 0.11; системные Chromium-библиотеки | Установлены из apt; namespace probe PASSED |
| Multica | `/usr/local/bin/multica`, 0.6.1, commit `2ea01ae4e` | Существующая регистрация сохранена |

CLI build metadata: версия `0.0.0-dev-202610061514`, clean source commit `904f7f85bf5450cbbfd48360d7dd9c483401face`, source tree SHA-256 `f5187741465086bb94568e84c6cbbe52262b531cf1b53945143f21c838ed4818`. Это provenance установленного продукта, а не SHA текущего harness.

Remote clones Rich и Ben синхронизированы на **accepted frozen harness `63a19e902786b1528edaab5878bb079842cad97b`**, ветка `evals`, clean. Этот срез включает `c36c48158` — учёт argv packed Chromium. Код изоляции принят отдельной соседней задачей с завершающим docs commit `dfe47cce6`; её локальные suite/smoke результаты относятся к её стенду и не переносятся в этот remote отчёт. Здесь имеется собственный final remote PASS, описанный ниже; **полная приёмка runtime READY/PASS; доставка финального attachment DELIVERED_VERIFIED**. Ранее приняты `ed58396f1` — Node env proxy внутри sandbox, `fd7611ef3` — admission нового выделенного Loginom без прежнего контейнера, `4e8155a09` — stand admission, `229a637cb` — завершение standalone sandbox probes, `2bec81cea` — переносимость Docker fixtures.

Node full-tree manifest `R/evidence/node-manifest.json` имеет SHA-256 `ca1c3488853c229f2fe1029c1f3bf78e785dd45e7fab26fddf4d607c578f5639`; `node-integrity.json` подтверждает 4711 записей и пустой `failed[]`. У установленного CLI `native_file_store` и обработчик Кросс-таблицы побайтно совпали с проверенными продуктовыми срезами `fc3`/`c50`; продуктовый пин clean `904f7f85` сохраняется. Новые harness/tests сами по себе не требуют пересборки CLI.

Предыдущее support вложение имело outer SHA-256 `f4a9de28db37a0bc338a49b0f7cc1c6ae62a52fa6a2afcffe95fb662013d500c`. Финальный разовый `loginom-evals-support-full-63a19e902.tar.gz`, 87676 bytes, outer SHA-256 `067fca83da31b2ca87161b6409e676ee21e1f9690195b3d954b704717302b33b`: 41 nonsecret asset и внешний `SHA256SUMS`, обязательный `COLD-RERUN.md`, актуальные role/metadata instructions и unchanged nested skill archive. Все 42 archive members regular с безопасными относительными путями, 41 checksum проверен; manifest SHA-256 `3d561f1aa23b0a5ed88049a33c5cc6fc11962263ab03fa52276155574b150a56`.

Nested SHA-256 `340cce1347be0307d41485c549316b1930eb68329e774350b0dec28ebd1e2aeb`, 18 payload records + manifest; COLD-RERUN внутри nested отсутствует. Metadata фиксирует accepted harness `63a19e902786b1528edaab5878bb079842cad97b`, code verification PASS и overall environment READY/PASS с измеренными product FAIL. Архив содержит исходники/шаблоны, без profiles/auth/history/operator logs; nested skill сохранён byte-for-byte. **Delivery DELIVERED_VERIFIED**: серверная копия support проверена — 42 members / 41 assets, remote outer SHA256SUMS и nested 18-record manifest повторно PASS. Rich/Ben role runtime.md скопированы; операторские файлы R/support сохранены. Receipt — `R/evidence/support-delivery.json`. Snapshot metadata внутри опубликованного archive сохраняет исторический `delivery_status=PENDING`; подтверждение доставки находится в этом runbook и receipt. Immutable source/archive не меняются и не переупаковываются после доставки.

LAB-16 description обновлён с `--no-start`: опубликованы текущие eval-tests runtime/paths, accepted harness и live результаты; старые Runtime recovery блоки со старым хостом `lg-pc-75`, путями `/home/kiselev` и прежними вложениями явно отмечены как history. Project, assignee, squad и статус `in_review` сохранены, новый task не запускался. [Полный support attachment](https://mas.kartamyshev.dev/api/attachments/01a11629-6d97-7dbd-8e61-683bcd1d616a/download), ID `01a11629-6d97-7dbd-8e61-683bcd1d616a`, повторно скачан штатным CLI; SHA-256 совпал с указанным outer hash `067fca83da31b2ca87161b6409e676ee21e1f9690195b3d954b704717302b33b`. Использовать latest full support attachment и его outer README/role instructions; старые вложения сохраняются как история. Новые operational инструкции имеют приоритет над старым deployment snapshot; критерии node acceptance и исходные skill scripts не изменяются.

### Неизменность аналитического корпуса

Read-only сверка 2026-10-07: `evals/tasks/analytic` содержит 35 задач / 280 файлов и побайтно совпадает с первым импортом `55fc9edfe96250b9350220be5c3d2928b23e3c02`. Все эти файлы также совпадают с `sources/analytic-evals` в source SHA `d5fb8031356ecf17a08c73f5d15a0b2df52af8b6`; единственный дополнительный файл исходного каталога — его общий `README.md`, который не является файлом кейса.

Локальный `before-small-evals` указывает на `904f7f85bf5450cbbfd48360d7dd9c483401face` и **ещё не содержит аналитического корпуса**. Поэтому сравнение analytic с этим ref неприменимо; все 12 прежних файлов трёх задач из его `evals/tasks/` сохранены без изменения.

Метод сверки: одинаковый отсортированный список относительных путей и SHA-256 каждого файла, вычисленный по raw bytes рабочей копии и `git show <SHA>:<path>`. Дополнительный manifest SHA-256 от строк `relative_path\tfile_sha256\n` в сортированном порядке: `8b04419e38e8fa54e7be1a51d2a65720b77c4d329c1e5b5083f4f18cb82fe160`.

| Контракт | Проверенное значение |
| --- | --- |
| `agent_inputs_hash` через текущий `src/task.ts` | `d7d221ed5177a195d346f01b793b7f8c51c15998bfee660d19bb93fce4b394f8` |
| `rubric_hash` через текущий `src/task.ts` | `02a57c7cec329b8dbfd0c8db93a6e0c04e444125efe55e3891fe1bcd3f90547b` |
| `calibration_hash`, 113 мутаций | `00f59c212eb01a2e0dde4ea7441629538cc3f20e2fca904dc103ca98a32a8450` |
| SHA-256 источников в calibration manifests | 210 / 210 совпали |

`calibration_hash` пересчитан только чтением `task_id + "\n" + cases.json`, затем `mutation_id + "\n" + result_csv` в порядке loader/manifest, как в `src/calibration-cases.ts`. Значения совпадают с [пинами до переноса](2026-10-07-analytic-evals-isolation-plan.md). XML-мутации, oracle execution, судья, тяжёлая suite и live при этой сверке не запускались.

### Образы и чистый Loginom

Переданный Docker archive проверен SHA-256 `7503d2e0367f1902117aeb568c6f29c326cd813ce274d0267e392dc7723fbf6d`.

- Исходный image ID: `sha256:5e3c79877de937aae168ecdcaf70c837bbbcf04e8f4262c2a976ac283ea394c2`.
- После импорта Docker 29 использует OCI manifest identity `sha256:fe20cd4a8c922cb1a94e80e4f2fae211cd1003dbccf34a232794e00b2ccba154`. Обе идентичности сохраняются как provenance; изменение представления при импорте не заменяет проверку archive hash.
- Серверный контейнер: `loginom-evals-server`, ID `b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e`; сеть `loginom-net`, alias `loginom-server-7.4.2-test`.
- Studio: `loginom-evals-studio`, публикация на `127.0.0.1:80`, URL `http://localhost/app/`.

Derived server image ID: `sha256:282c6b2ac14668b21080af70027335fcddf8b3f2a30e996d07ba0570eaa94863`; target Studio OCI ID: `sha256:4fd59622fc27b5bda3ac44c85b5b75798a376bbba514b8c6207d9d106e80836b`. У обоих собственных контейнеров `restart=no`, `mounts=[]`; boot start/stop принадлежит `loginom-evals-stand.service`.

Производный сервер воспроизводится из `R/loginom-image/Dockerfile` и двух файлов контекста сборки:

```dockerfile
FROM loginom-server-7.4.2-test:latest
COPY libxml2.so.16.1.2 /app/libxml2.so.16.1.2
RUN ln -s libxml2.so.16.1.2 /app/libxml2.so.16
COPY Components.cfg /workdir/Components.cfg
```

Тег base при повторной сборке сначала сверяется с указанной импортированной идентичностью. `Components.cfg` сохраняет компоненты base и явно отключает Python: `Item Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"`, `Settings Disabled="true"`. Writable layer, пользовательские сценарии, backups, testdata и socket mounts старого сервера не переносятся.

Подтверждены прямой браузерный вход `user` с пустым паролем, designer UI с лицензией и рабочий WebSocket fallback `ws://localhost/app/ws`. Это **не** успешный CLI setup/check и **не** live eval. Перед dispatch harness повторно проверяет маркер `/workdir/.loginom-evals-isolated.json`, точный container ID, отсутствие host bind mounts, пустоту storage/backups, отключённый Python и network alias. На свежем выделенном хосте `previous_container_id` может отсутствовать; если он объявлен, требуется доказанный stop прежнего контейнера с restart policy `no`. Не создавать фиктивный previous ID ради прохождения проверки.

Маркер с фактическим container ID записан после завершения cold reference и проверки пустоты хранилища. Штатный production `checkIsolatedLoginom` прошёл. Это admission стенда, а не запуск оцениваемого агента.

### Cold reference Кросс-таблицы

`R/evidence/cold-reference-20261007/cold-results.json` фиксирует **3 / 3 PASS**: `crosstable-fixed-sum`, `crosstable-sliding-average`, `crosstable-reconfigure`. Для каждого подтверждены статическая проверка reference, отсутствие свежего output до запуска, точный CSV и независимый Decimal-пересчёт с `tolerance=0`.

Для reconfigure cold reference проверяет **только финальную fixed/avg конфигурацию**. Доказательство первого выполненного `sum`, чтения и изменения того же GUID на `avg` остаётся обязанностью node live validator; cold PASS его не заменяет.

Cleanup `CONFIRMED`: браузер закрыт, browser processes после проверки отсутствуют, выделенное хранилище очищено. `SHA256SUMS` содержит 34 записи, все повторно сверены; SHA-256 самого manifest — `546a1fee56465a98aaa0b483b3bb2a8c7b751aab756bc4ebd7c9a5930588d204`. Снимки, CSV, package/check receipts и подробности повтора хранятся в этой приватной evidence директории; raw MCP logs не публикуются в git.

## AppArmor и systemd

Глобальная настройка `kernel.apparmor_restrict_unprivileged_userns=1` сохранена. Для конкретных executable paths установлены scoped профили `/etc/apparmor.d/loginom-evals-bwrap` и `/etc/apparmor.d/loginom-evals-chromium` с разрешением userns. Root-owned копия bubblewrap — `/usr/local/libexec/loginom-evals/bwrap`; launcher находится в `R/bin/bwrap`. Вложенные user namespaces проверены. Chromium sandbox не отключается; глобальный запрет userns не снимается.

`loginom-evals-multica.service` установлен, enabled и active. Он запускается от `User=user`, с `SupplementaryGroups=docker`, явным PATH и приватным `R/runtime.env`. Добавлены `Wants/After=xray.service`, `Requires/After=loginom-evals-stand.service` и `Requires/After=loginom-evals-routes.service`. Параллелизм daemon ограничен одним task, auto-update и auto-reload отключены.

`loginom-evals-stand.service` — enabled/active oneshot, `RemainAfterExit=yes`: запускает и останавливает только два собственных контейнера `loginom-evals-server` и `loginom-evals-studio`; зависит от Docker и упорядочен после network/VPN. `loginom-evals-routes.service` — enabled/active oneshot, упорядочен после sing-box, VPN и network. `systemd-analyze verify` не нашёл ошибок собственных unit-файлов. Reboot-проверка отдельно **не выполнена**; enabled/active не доказывает полный цикл загрузки.

Приложения сохраняют HTTP/HTTPS proxy `http://10.200.13.152:2080`; endpoint `127.0.0.1:2080` является SOCKS. Runtime proxy env нормализован в верхнем и нижнем регистре, `NODE_USE_ENV_PROXY=1` и `NO_PROXY` для localhost/loopback. Для MCP обязательна также явная передача этих полей в `MCP.env`: Node Codex фильтрует наследуемое окружение. Путь подтверждён catalog, native CLI и фактическими Multica MCP calls. Daemon перезапущен после завершения readiness task и active. Временный tinyproxy, его bin package и scoped AppArmor rules удалены; ports 2082/2083 не слушают.

### Ограниченные сетевые разрешения

Лицензионный endpoint: `10.200.1.87`, порты 3186 и 3187. В nft добавлены два узких forward-правила от server IP `172.18.0.2` через bridge `br-881d45d77a6b` только к этому адресу и TCP/UDP портам. TCP из контейнера прошёл на обоих портах; **UDP не пробовали**. Остальные правила и policy DROP сохранены.

Для Dock/OpenViking прямой physical-route SDK и три параллельных catalog запроса прошли **4 / 4**, 258–323 ms, с default TLS 1.3/PQ. Никаких TLS/PQ ослаблений этот результат не требовал. Первоначальный постоянный Xray route: exact domains `mcp.loginom.ai`, `ov.kartamyshev.dev`, `mas.kartamyshev.dev`, port 443 → `freedom` с `UseIPv4`; остальные назначения сохраняют VLESS. Private backup — `config.json.before-loginom-evals-routing`; Xray config test прошёл, restart active.

Исходный scoped nft output разрешает TCP 443 к `62.113.108.18` и `151.244.228.56`. Дополнение ниже разрешает TCP 80/443 к `62.113.108.18` и `194.156.118.61`; внутренний адрес разрешён существующим private-network правилом. `loginom-evals-routes.service` теперь устанавливает четыре destination `/32` rules priority 8998 с `lookup main`: эти три публичных IP и `10.200.11.224`. Глобальная policy DROP и остальные VPN ограничения сохранены. DNS IP pin требует сверки; изменение разрешения имён требует обновления scoped routes/rules.

2026-10-07 11:54 UTC по запросу владельца добавлены постоянные HTTP/HTTPS исключения VPN:

| Домен | Проверенный IPv4 | Рабочий URL |
| --- | --- | --- |
| `logi-test-plan.bg.local` | `10.200.11.224` | `http://logi-test-plan.bg.local/app/` |
| `mcp.loginom.ai` | `62.113.108.18` | `https://mcp.loginom.ai/health` |
| `app.loginom.ai` | `194.156.118.61` | `https://app.loginom.ai/app/` |

Для этих exact domains добавлены direct rule в sing-box и Xray rule TCP 80/443 → `loginom-services-direct`. Приложения продолжают использовать назначенный HTTP proxy; его запросы к перечисленным доменам выходят напрямую. Прежние Dock/Multica/OpenViking исключения сохранены. DNS внутреннего `bg.local` обслуживается существующим intranet resolver `10.200.0.3`.

Проверки конфигурации Xray, sing-box, nft и systemd PASS. После restart sing-box, Xray и routes все службы, включая Multica, active/enabled. `ip route get` для всех трёх адресов показывает `enp3s0`, table `main`; curl напрямую и через HTTP proxy вернул 200 на трёх рабочих URL. Node 24.19.0 с настоящим runtime env и `NODE_USE_ENV_PROXY=1` также получил три ответа 200. HTTPS-порт внутреннего стенда не принимает соединения; его HTTP работает. Reboot по-прежнему не проверен.

Private backup исходных конфигураций — `/etc/loginom-evals-vpn-backups/20261007-115442`. На сервере сохранены `R/evidence/vpn-domain-exceptions.json` и `vpn-domain-access.json`; API keys и provider credentials в них отсутствуют. Immutable support attachment и CLI-профили при этом не менялись.

Ранее HTTP через VLESS давал TLS flakes, а короткая успешная TUN-проба не обеспечивала полный catalog. Эти исторические пробы не являются текущей приёмкой. **HTTP catalog через установленный постоянный scoped route PASS: 4 / 4**, 255–289 ms, exit 0, без timeout и TLS customizations. Evidence `probe-catalog-http-scoped-direct-summary.json` подтверждает default TLS 1.3 / HTTP 1.1 / `X25519MLKEM768`. OpenViking scope/network подтверждён новой настоящей Multica task отдельно; временные пробы 2082/2083 не являются используемым runtime путём.

Сохранены `~/.multica/config.json` и daemon ID `01a11562-4949-78b7-9ddf-15a69d670749`; runtime — `a5fa993f-2903-4997-a832-955ffbb1203c` (`Codex (eval-tests)`). Повторная регистрация или новый daemon ID для обычного restart не нужны. До service использовался manual daemon PID 30040; этот PID — исторический, при диагностике брать текущий PID из systemd/daemon status.

```bash
systemctl is-active loginom-evals-multica.service
systemctl is-enabled loginom-evals-multica.service
systemctl show loginom-evals-multica.service -p MainPID -p User -p SupplementaryGroups
```

Старая SSH master-сессия может не иметь недавно добавленной группы docker: при документировании прямой `docker inspect` в ней вернул permission denied, а `sudo -n` потребовал интерактивную аутентификацию. Это не результат проверки service task. Docker gates выполнять из управляемого task с группой docker либо новой login-сессии с проверенным membership; не менять socket permissions.

## Rich, Ben и четыре профиля

Rich и Ben **уже были привязаны к eval-tests до начала этой установки**. Исправлены xhigh, concurrency=1, MCP paths и Playwright secrets-file support; удалены устаревшие Desktop MCP entries. Оба остаются `gpt-6.1-sol/xhigh`, с собственной ролью, checkout и CLI-профилями. Git clones полные и раздельные; ordinary push dry-run прошёл для обоих. Dry-run не является push или приёмкой frozen SHA.

| Агент | Checkout | Reference-профиль | Eval-профиль |
| --- | --- | --- | --- |
| Rich (`edc52e36-a965-4f93-9118-6fa5640840b4`) | `R/checkouts/rich/loginom-ai-agent` | `R/roles/rich/reference-profile` | `R/roles/rich/eval-profile` |
| Ben (`99804e93-d241-45f2-872d-8a1e16ec7f3d`) | `R/checkouts/ben/loginom-ai-agent` | `R/roles/ben/reference-profile` | `R/roles/ben/eval-profile` |

Перенесены только выбранные свежие credentials/settings. Старая история, БД, tool outputs и приватные diagnostic logs не копировались. `R/evidence/profile-inventory.json` подтверждает **4 / 4 PASS** для структуры, auth metadata, permissions и размещения истории: profile/history `0700`, config/auth/env `0600`, history на том же filesystem без symlink, обязательные файлы не отсутствуют и не пусты. Это inventory, а не успешная авторизация сетевого провайдера.

На установленном route все четыре CLI setup завершились с exit 0. `R/evidence/four-profile-checks.json` подтверждает actual bwrap `loginom check` для Rich reference/eval и Ben reference/eval: **4 / 4 PASS**, exit 0, `LOGINOM_CONNECTION_VALID`, без timeout/sandbox error, cleanup confirmed, по два browser bindings. Ранний `LOGINOM_KNOWLEDGE_UNAVAILABLE` относится к предыдущему сетевому пути. Cold reference уже принят отдельно; actual eval ещё не принят.

`R/evidence/four-model-smokes.json` подтверждает **4 / 4 PASS по actual session DB**, exit 0, cleanup confirmed и архивирование истории каждой попытки. Это проверка фактического исполнения модели в собственных профилях, отдельно от native connection check:

| Профиль | Фактическая модель / variant | Session ID |
| --- | --- | --- |
| Rich reference | `openai/gpt-6.1-sol/xhigh` | `ses_eea00c219ffe8C016Zpj3SjJ4u` |
| Rich eval | `openai/gpt-6-sol/default` | `ses_eea0041d7ffeRP5miP1sWKp3wg` |
| Ben reference | `openai/gpt-6.1-sol/xhigh` | `ses_eea000b17ffeWXCX1Lwdl7gT3M` |
| Ben eval | `openai/gpt-6-sol/default` | `ses_ee9fe5e8dffeM1FKPp9eqFObUp` |

Reference author и оцениваемый Loginom AI используют разные модели; эти smokes не являются node quality eval.

После model smokes повторно подтверждены `auth.json`, config JSONC и `connection.json` mode `0600`, закрытые history directories `0700` у всех четырёх профилей. Значения credentials и session DB не публикуются.

Management check выполняется назначенным CLI и точным профилем; пример адресной повторной проверки:

```bash
R=/home/user/.local/share/loginom-evals-runtime
LOGINOM_AI_AGENT_CLI_PROFILE="$R/roles/rich/reference-profile" \
  "$R/cli-904f7f85/bin/loginom-ai-agent-cli" loginom status --format json
LOGINOM_AI_AGENT_CLI_PROFILE="$R/roles/rich/reference-profile" \
  "$R/cli-904f7f85/bin/loginom-ai-agent-cli" loginom check --format json
```

Для остальных трёх использовать их точные profile paths и назначенный task env. При проверке границы запускать CLI через тот же bwrap/harness launcher. Успех — штатное `LOGINOM_CONNECTION_VALID`, а не только доступность HTTP/Studio. Не подменять профиль, knowledge endpoint или модель при отказе; сохранить диагностический код без credentials.

Generated task `CODEX_HOME` создаёт Multica: config копируется из source home daemon, auth связывается с существующей регистрацией Codex, MCP materialized в managed block. Per-agent MCP выигрывает одноимённые source-home entries, поэтому все command paths должны относиться к новой установке. Model и xhigh задаются полями Multica `model`/`thinking_level` и передаются на thread/start, resume и turn/start; ручное редактирование generated home не требуется. Фактический `turn_context` двух настоящих попыток подтвердил `gpt-6.1-sol/xhigh` и работающий companion.

Полный OpenViking plugin 0.10.8 установлен в native Codex local marketplace/cache. Adapter `R/bin/memory-mcp.mjs` выводит Peer через `resolveEffectivePeerId` из Git конкретного собственного checkout; глобальный hardcoded Peer не задаётся. Scope/network подтверждены реальными health/search третьей LAB-22 попытки, описанной ниже.

## Настоящая readiness-задача

[LAB-22](https://mas.kartamyshev.dev/lab/issues/01a115ab-1a79-7ac6-aa72-9ad8261a71f9) — отдельная readiness-карточка. LAB-16 для проверки установки не перезапускался. Проверенные результаты трёх попыток:

| Multica attempt ID | Подтверждено | Не прошло |
| --- | --- | --- |
| `01a115ab-1d0d-7ec8-bb7a-1476fd7d5bdc` | HOST, Codex, Playwright, Docker; `turn_context` model `gpt-6.1-sol`, effort `xhigh`; companion работает | OpenViking scope |
| `01a115b6-9312-7b6f-bda1-474c56de1354` | Те же HOST/Codex/Playwright/Docker gates | OpenViking network fetch |
| `01a115fb-f27c-7c31-96ee-de55eb93c9b1` | PASS: реальные health + один read-only actor search, оба `isError=false`; Codex 0.159.2 / `gpt-6.1-sol/xhigh` и companion | Нет незавершённых OV gates |

Доказательства относятся к настоящим task calls/rollout, а не самоописанию модели. Третья попытка completed/PASS; оператор независимо сохранил `R/evidence/multica-third-session-proof.json`, session `01a115fc-03e3-7ac2-a6bc-c82da98b8080`. Actual task home — `/home/user/multica_workspaces/lab-6462f220cf3b/lab-22-de55eb93c9b1/codex-home`; с ним фактически работает companion `R/codex-0.159.2/codex-code-mode-host`. Actor Peer `github.com-gooddaytoday-loginom-ai-agent` вычислен из Git собственного Rich checkout, explicit/global Peer не задан. Multica component readiness **PASS**; итоговая приёмка среды также **READY/PASS**, как подтверждают live и cleanup ниже.

### Адресные boundary и judge проверки

`R/evidence/boundary.json`: установленный CLI version probe и mount canaries дали exit 0; запись в auth и текущий result прошла. `boundary-version-status.json` и `boundary-probe-status.json` содержат реальные bwrap namespace/start/exit receipts. Пробная граница **PASS**; actual `loginom check` четырёх профилей в той же границе также **4 / 4 PASS** с подтверждённым process cleanup. Проба writable auth не означает, что проверено принудительное обновление реального OAuth-токена.

`R/evidence/native-interruption.json`: timeout 2000 ms → exit 130, `timed_out=true`, cleanup confirmed, browser bindings 0; interrupt после фактического наблюдения Chrome → exit 130, `interrupted=true`, browser bindings 1, cleanup confirmed. Оба recovery ready, history archived. Это реальные проверки signal/process lifecycle, не node quality попытки.

Judge auth smoke **PASS**: действительный `gpt-6-astra/high` запуск с приватным `CODEX_HOME`, session `01a115c3-d3c7-7bf1-8e9c-e3ab69cfc9f6`; в `judge-auth-smoke.jsonl` есть `thread.started` и `turn.completed`. Это проверка авторизации судьи, без пересуживания корпуса и без quality baseline.

### Проверки harness и тестовые образы

`2bec81cea` добавляет optional `EVAL_TEST_LOGINOM_IMAGE` только для Docker fixtures. Default image `5e3c…` сохранён. Без override недоступный default допускает прежний skip; явно заданный недоступный image, отсутствие Docker executable или недоступный daemon завершают test command с exit 1, без silent skip. На новом сервере с `EVAL_TEST_LOGINOM_IMAGE=sha256:fe20cd4a8c922cb1a94e80e4f2fae211cd1003dbccf34a232794e00b2ccba154` девять `isolated-storage.test.ts` fixtures прошли через `sg docker`: **9 PASS / 0 FAIL**, 34 expect. Использовались собственные sleep/network-none containers; основной сервер и его storage не менялись.

Первый remote полный прогон: **326 PASS / 60 FAIL / 2 errors**; наблюдались ошибки чтения `/proc`. Точный errno и причина не установлены; конкуренция диагностики и flaky-поведение не доказаны. Два адресных повтора process-supervisor дали **11 / 11 PASS каждый**. Полный повтор в чистом окружении: **384 PASS / 2 FAIL**, 381.03 s; остались Ubuntu 26 fixture portability — Node через PATH вместо `/usr/bin/node`, symlink identities `true`/`sleep`.

`63a19e902786b1528edaab5878bb079842cad97b` исправил три fixture места и импорт `realpath`. Targeted sandbox после этого: **8 / 8 PASS**, 6.02 s, typecheck PASS; evidence `sandbox-fixed-targeted.log` / `typecheck-fixed.log`.

Final remote code gate на том же clean SHA: frozen install exit 0, **386 PASS / 0 FAIL**, 29 files, 1666 expects, 373.177 s; typecheck exit 0; Python corpus **35 tasks / 113 mutations PASS**, без LLM. `R/evidence/final-summary.json` фиксирует SHA и результаты. В suite входят регрессии обязательного создания и первичной настройки узла, а также фактического изменения агрегата после чтения суммы; поздний mapping/read не скрывает преждевременный avg. Этот frozen harness принят; предыдущие неудачные прогоны остаются историей диагностики. Тесты и live на стенде выполняются последовательно, после подтверждённого завершения model-bearing CLI/browser.

### Live приёмка среды

Analytic isolation smoke `20261007-110747-63a19e902` завершён: **product FAIL / no_artifact**, CLI exit 0, `errors=[]`, `failure_kind=null`. Внутри `import-sales-1` наблюдался Format dialog, затем pending operation; итоговый артефакт не создан. Штатный cleanup подтверждён для всех owned ресурсов, `leftovers=[]`; live инфраструктура завершила попытку без infrastructure ERROR.

Архивированная session DB подтверждает evaluated модель `openai/gpt-6-sol/default`. Judge `gpt-6-astra/high` был настроен, но оценивание артефакта **не выполнено**, поскольку артефакта нет. Отдельный judge auth smoke PASS подтверждает только авторизацию; его нельзя выдавать за verdict этого analytic live.

Это приёмка среды: корректно измеренный FAIL продукта с подтверждённым cleanup не блокирует readiness и не требует quality rerun ради PASS. Итоговый infrastructure ERROR, неизвестная ownership или cleanup блокируют дальнейший dispatch. Node live `20261007-111731-63a19e902` завершён: **code-verdict FAIL / exit 1**, `errors=[]`, все cleanup confirmed, `infra_retry_initial=null`, без quality повторов. Repeat 1 / code-only / skip-judge. Результаты validator:

| Case | Product verdict | Duration | Session |
| --- | --- | --- | --- |
| crosstable-fixed-sum | PASS | 248 s | `ses_ee9ea629dffe7tp5p8KdfGPtZq` |
| crosstable-reconfigure | FAIL/no_artifact | 283 s | `ses_ee9e66d22ffe4ShL5JAkDjbTV2` |
| crosstable-sliding-average | PASS | 315 s | `ses_ee9e1ef1affeI2mXwLiOjPtPa9` |

Reconfigure остановился по продуктовой/UI причине: `NODE_APPLY_STOPPED`, «F3 is restricted to an observed graph table output», затем pending operation. Ошибок лицензии, auth и network не было. Product FAIL не скрыт и не исправлен повтором ради PASS.

Final read-only production `checkIsolatedLoginom` **PASS** в 2026-10-07 11:33:03 UTC, `R/evidence/final-isolation.json`: storage/backups empty, Python disabled. Независимый static audit **PASS**: 4 services active/enabled, 2 checkout clean на frozen 63a, role env 0600 и executable wrappers; Rich/Ben online на eval-tests, gpt-6.1-sol/xhigh/max1; squad ровно 2, Rich leader. Среда **READY/PASS**; artifact judge на analytic не выполнялся, полный 35-task quality baseline, reboot и принудительный OAuth refresh не проверены.

Независимый audit всех четырёх live: **infrastructure PASS**, `issues=[]`; у каждой попытки шесть confirmed cleanup stages и две process verifications с `owned_remaining=0`, `storage_leftovers=[]`, без interruption и infra retry. Archived DB всех четырёх подтверждает `openai/gpt-6-sol/default` (20/10/20/12 assistant messages). Приватный `R/evidence/live-independent-summary.json`, mode 0600, SHA-256 `67c9fd9f4aa1abbbeaa56d6d17cd5092ac4a0a3d4be0238f8eac75098d7b0504`. Node `code-verdict.json` SHA-256 `a2e671f549ea3b375d12cd95b18b1553e3ab6ed175003cdeed50e23608674aa4`, `code-report.md` SHA-256 `80e57bd3ed49654e9c0cb814648a90305cc818b9cf8386ad2526bd47312abd61`. Симптомы UI FAIL зафиксированы в событиях; источник между моделью и handler runtime отдельно не локализован.

### Фактические live команды

На сервере установлен `R/support/run-server-acceptance.sh`; это операторский script **вне audited 41-asset bundle**, его путь прочитан и проверен. Выполненные команды:

```bash
R=/home/user/.local/share/loginom-evals-runtime
"$R/support/run-server-acceptance.sh" analytic
"$R/support/run-server-acceptance.sh" node
```

Script выполняет cwd в Rich checkout/evals; точные команды внутри script:

```bash
R=/home/user/.local/share/loginom-evals-runtime
cd "$R/checkouts/rich/loginom-ai-agent/evals"
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/rich/eval.env" env \
  EVAL_RESULTS_DIR="$R/roles/rich/results/server-acceptance-analytic" \
  EVAL_JUDGE_COMMAND="$R/bin/codex-judge" JUDGE_MODEL=gpt-6-astra JUDGE_REASONING=high \
  "$R/bin/bun" run src/run.ts --tasks tasks/analytic --only sales-by-category --repeat 1 --label eval-tests-acceptance
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/rich/eval.env" env \
  EVAL_RESULTS_DIR="$R/roles/rich/results/server-acceptance-node" \
  "$R/bin/bun" script/run-node-evals.ts --tasks tasks/node-evals --label eval-tests-acceptance
```

Node runner принудительно задаёт repeat 1 / skip-judge. Это запись выполненных команд; не повторять их автоматически. Для нового dispatch нужны exclusive endpoint, отсутствие writer/tests/browser и confirmed cleanup. Product FAIL сохраняется, quality rerun ради PASS не разрешён.

## Порядок повторной приёмки

Текущая приёмка завершена; support доставлен, LAB-16 обновлён без запуска. При новом коде или изменении окружения повторять затронутые gates по порядку. Не повторять неизменённые quality попытки ради PASS:

1. Сохранить accepted frozen harness `63a19e902786b1528edaab5878bb079842cad97b` и собственный final remote summary; code/unit gates и native timeout/interrupt уже PASS. Этот SHA использован во всех выполненных live/cleanup gates.
2. Сохранить финальные network/profile evidence: HTTP catalog 4 / 4 и четыре setup/bwrap checks уже PASS. Не смешивать их с ранним отказом старого сетевого пути или проверкой оцениваемой модели.
3. Сохранить evidence completed/PASS LAB-22: HOST, model/effort, companion, Playwright, Docker и OpenViking прошли. Без squad mentions, eval cases и изменения LAB-16; точные task/attempt/session IDs приведены выше.
4. Перед live сохранить пробную boundary и четыре CLI checks: inputs читаются, текущий output записывается; oracle/reference, task/spec, Git, calibration, старые results/history, host sockets и `/proc` чужих процессов недоступны. OAuth остаётся writable. Отказ границы — `harness_error`, без fallback/retry/судьи.
5. Выполнить согласованные четыре live gates последовательно на выделенном endpoint: один analytic isolation smoke с отдельным судьёй, затем три node cases, каждый repeat=1 и code-only/skip-judge. Analytic smoke `20261007-110747-63a19e902` завершён измеренным product FAIL/no_artifact без infrastructure ERROR, cleanup confirmed; judge artifact evaluation не выполнялось. Три node live завершены: PASS/FAIL(no_artifact)/PASS, code-verdict FAIL/errors[], cleanup confirmed для всех. Количественный baseline и калибровка требуют отдельного назначения.
6. Проверить штатный shutdown, process/recovery/profile_history cleanup, архивирование каждой попытки вне mounts, пустоту выделенного storage/backups и отсутствие live writers. Pending cleanup блокирует следующий dispatch.
7. Обновить этот runbook и checkpoint проверенными run/task IDs, frozen SHA и результатами. Действующая схема следующей назначенной карточки — Evaler → Rich → Evaler → Ben → Evaler; историческая LAB-16 при настройке оркестратора не перезапускается. ACCEPT качества eval может сопровождаться измеренным FAIL продукта; ERROR или неполный live не считается полной приёмкой. `done` и merge остаются владельцу.

При итоговом infrastructure ERROR, неизвестной ownership или неподтверждённом cleanup остановить ручной dispatch и сохранить safe evidence. Обычный `infra_error` допускает только один штатный автоматический infra retry текущего harness с initial/final evidence. `harness_error`, ошибка sandbox admission, interrupted и cleanup unknown не разрешают manual retry/fallback; после итогового ERROR не повторять quality попытки ради PASS и не ослаблять oracle/validator.

После зелёного freeze проверки выполняются из своего checkout **в `evals/`**, под общим lease и без параллельного live. Приобретение и освобождение lease описаны в [операторской инструкции](evaler/operations.md); перед командой ниже должен существовать собственный private receipt:

```bash
R=/home/user/.local/share/loginom-evals-runtime
cd "$R/checkouts/rich/loginom-ai-agent/evals"
"$R/bin/with-env" "$R/runtime.env" bun install --frozen-lockfile
"$R/bin/with-env" "$R/runtime.env" env \
  EVAL_TEST_LOGINOM_IMAGE=sha256:fe20cd4a8c922cb1a94e80e4f2fae211cd1003dbccf34a232794e00b2ccba154 \
  bun script/node-eval-ops.ts unit --config "$R/operations/node-eval-ops.json" \
  --lease '<own private receipt>'
python3 script/check-calibration-corpus.py --tasks tasks/analytic
```

Команды требуют назначенного service/task PATH и env; для установленного нового Docker image тестовый override задаётся явно. Final remote frozen install/suite/typecheck и Python corpus уже PASS на accepted SHA; повтор требуется при новом коде или новом блокере. Все четыре live/cleanup gates завершены, среда READY/PASS при измеренных product FAIL, как описано выше. Доставка финального support attachment DELIVERED_VERIFIED. Read-only hash сверка выше и Python checker — отдельные доказательства; ни один не запускает quality baseline или LLM calibration.

## Приватные ресурсы и обслуживание

`R/secrets`, `runtime.env`, role browser secrets, OAuth, profiles, `.history` и raw logs остаются приватными; в git и Multica attachments попадают только обезличенные отчёты и manifests. `R/support` содержит разовые deployment/probe scripts, `R/evidence` — локальные доказательства; наличие этих файлов не разрешает слепой повтор installer/setup. Смена пинов, proxy, sandbox rules или source home требует повторения соответствующих gates.

Для обычного restart сохранять registration/config и выполнять systemd restart только после отсутствия активного task, model-bearing CLI и pending cleanup. Не завершать `multica` по имени executable. При возврате стенда остановить собственные контейнеры после cleanup; пользовательские серверы, чужие profiles и настройки не очищать. Полные исторические отчёты LAB-16 сохраняют прежний хост и версии: их не переписывать под новый runtime.
