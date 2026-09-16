# Loginom AI Agent: перенос сервера и завершение миграции

**Goal:** собирать сервер знаний из нового репозитория, доказать восстановление и
совместимость, затем отдельно согласовать production cutover и retirement старого repo.
**Architecture:** source import → изолированная сборка → live inventory/backup →
репетиция на отдельных данных/сетях → проверка клиента → согласованное переключение.
**Tech Stack:** существующие Python/Rust/C++ OpenViking, Studio/Node, Docker Compose,
Caddy, Ollama, GitLab/LFS gateway, pinned image manifests и текущие API/MCP.
**Spec:** [согласованный дизайн](../specs/2026-09-16-loginom-ai-agent-desktop-design.md).
**Dependency:** [foundation F1–F3/F6](2026-09-16-loginom-foundation.md), source-map
и восстановленный архив. Desktop/runtime validation выполняется смежными планами.

## Общие ограничения

- Ни одна команда здесь не выполняется во время планирования. Production changes,
  остановка сервисов, публикация и удаление требуют отдельной явной команды пользователя.
- Текущий server SHA/image/config/catalog может отличаться от repo и клиента;
  существование deployment script не доказывает его установку или актуальность.
- Сохранить совместимые API, MCP headers, identity `loginom-dock`, `viking://` URI,
  ресурсы, данные и credentials. Внешние контракты не переименовываются механически.
- Не копировать серверную базу/ключи в Git. Redacted evidence и private backup
  существуют раздельно; не выводить `docker inspect` Env/config bodies в общий журнал.
- `backup-server.sh` делает cold backup с остановкой сервисов; это не read-only probe.
  `/ready` и поисковые проверки могут обращаться к моделям; `/health` — connectivity.
- Тесты из `services/loginom-ai` либо подкаталога; typecheck JS package — `bun typecheck`.
  Минимальные целевые проверки достаточны; не запускать произвольную переиндексацию.

## S1. Сделать эксплуатационные инструменты переносимыми и проверяемыми

**Paths:** создать `services/loginom-ai/deploy/loginom-dock/transition.py`,
`test/test_transition.py`, `docs/migration/server-transition.schema.json`;
изменить перенесённые `verify-server.py`, `restore-server.py`, `backup-server.sh`,
`docs/testing/loginom-ai-agent/server-transition.md`.
**Consumes → produces:** source tree F3 → операторский план и узкие CLI без hardcoded secrets.

- [ ] `verify-server.py` добавить `--client FILE --checks health|full --output FILE`;
  убрать неявное чтение `/opt/loginom-dock/config/client.json`. Секрет читается из
  указанного private файла, raw remote errors/headers не выводятся. `health` не вызывает ready/search.
- [ ] Схема операторского плана, значения inventory берутся с наблюдаемого сервера:
  ```ts
  type Transition = {
    version: 1; sourceCommit: string; sourceMapHash: string
    services: { name: string; image: string; dataVolumes: string[] }[]
    resourcePins: { uri: string; revision: string; hash: string }[]
    observedAt: string; rollbackImage: string; candidateImage: string
  }
  // Secret paths и credentials находятся в private operator file, вне этого JSON.
  ```
- [ ] Новый `transition.py` принимает `--plan FILE --private-config FILE --output FILE`
  и подкоманды `inventory`, `rehearse`, `verify`, `prepare-cutover`, `cutover`, `rollback`.
  Подкоманды проверяют нужные поля/пины; destructive commands требуют operator-approved
  plan hash, перечень ресурсов и проверенный rollback receipt; не берут defaults production.
- [ ] `restore-server.py` сохранить default запрет overwrite, новые names/volumes,
  loopback ports и проверку digest; добавить `--offline` для первого старта без внешнего
  ingress/refresh/model calls. Это новый флаг, реализовать до использования ниже.
- [ ] **Commands, cwd `services/loginom-ai/deploy/loginom-dock/test`:**
  `python3 -m unittest test_transition`. Fixture: wrong plan hash, existing volume,
  invalid archive path, missing image и redaction; никакого live production доступа.
- [ ] **Acceptance:** safe inventory не останавливает контейнеры и не читает сырые
  environment values; mutating command без проверенного operator plan отказывает.
- [ ] **Commit:** `refactor(server): parameterize transition and verification tools`.

## S2. Собрать сервер из нового дерева независимо от старого checkout

**Paths:** изменить `services/loginom-ai/Dockerfile`, `.dockerignore`, `pyproject.toml`,
`uv.lock`, `deploy/loginom-dock/Dockerfile.*` и build-relative scripts при необходимости;
создать `docs/migration/server-build-inputs.json`, `docs/testing/loginom-ai-agent/server-build.md`.
**Consumes → produces:** F3 source map + approved dependency pins → candidate image digest.

- [ ] Проверить Docker COPY closure: `Cargo.toml/lock`, `build_support`, `crates`,
  `openviking`, `openviking_cli`, `src`, `third_party`, `bot`, `web-studio`, Python metadata.
  Поддержать прежние relative paths в `services/loginom-ai`; не добавлять скрытых
  COPY из старого `/home/kiselev/git/loginom-dock` или installed runtime.
- [ ] Закрепить base image digests в build-inputs; сохранить `UV_LOCK_STRATEGY=locked`.
  Version извлечь из выбранного исходного release metadata, не выдумывать новую
  совместимую server version и не брать upstream Git history нового monorepo за неё.
- [ ] **Build, cwd `services/loginom-ai`:** после задания проверенного `server_version`
  из build-inputs выполнить:
  ```sh
  docker build --build-arg UV_LOCK_STRATEGY=locked \
    --build-arg OPENVIKING_VERSION="$server_version" \
    --tag loginom-ai-server:migration-candidate .
  docker image inspect loginom-ai-server:migration-candidate --format '{{.Id}}'
  ```
  Записать input hashes/digest, compiler/runtime versions и build result; не публиковать image.
- [ ] Focused Python tests нужных изменённых server modules запускать в service environment;
  `python3 -m unittest test_transition` из каталога S1. Если lock не воспроизводится,
  сначала разбор зависимости; не включать Docker auto-refresh lock ради зелёной сборки.
- [ ] **Acceptance:** изолированный build context без старого repo создаёт Studio,
  native extensions, Python service и CLI; image не содержит private config/архивов.
  Сбой/отсутствующий toolchain — FAIL/BLOCKED со стадией, а не fallback на старый image.
- [ ] **Commit:** `chore(server): reproduce server image from monorepo sources`.

## S3. Снять live inventory и подготовить отдельную резервную копию

**Paths:** изменить `docs/testing/loginom-ai-agent/server-transition.md`;
создать redacted `docs/migration/server-observed.json` и `server-backup-proof.json`.
**Consumes → produces:** разрешённый read-only доступ → фактические pins;
отдельное разрешение maintenance → private backup, пригодный для восстановления.

- [ ] `transition.py inventory` фиксирует source release/images, mounts и имена
  volumes, schema/version, health, source/catalog/skill revisions, active queues/jobs,
  timers/import locks и endpoints без secrets. Credentials references держать вне Git.
- [ ] Сопоставить live inventory с S2 candidate: no-op differences, требуемые изменения
  и обратимость схемы. Не считать HEAD сервера содержимым работающего контейнера.
- [ ] Описать maintenance window и остановку новых writes/imports; показать пользователю
  конкретный план cold backup, ожидаемый простой, место хранения и откат перед действием.
- [ ] После отдельной команды использовать проверенный установленный/новый backup script
  с recorded hash. Сохранить data/config/assets/deployment/source и **все** images из
  `image-checksums`, включая Ollama/Caddy/GitLab gateway/LFS и TLS volumes.
- [ ] **Commands, cwd фактического backup timestamp directory:**
  `sha256sum -c SHA256SUMS` и `sha256sum -c image-checksums`.
  Эти существующие manifest filenames проверены в исходном backup script.
- [ ] **Acceptance:** service restart после backup подтверждён; исходные images/data
  сохранены, archive readable и закрыт правами; missing image/archive → FAIL.
  Off-host private copy проверена независимо от диска production и source repo.
- [ ] **Commit:** `docs(server): record observed deployment and backup proof`.

## S4. Восстановить isolated стек и проверить ресурсы/клиент

**Paths:** создать `docs/testing/loginom-ai-agent/server-rehearsal.md`,
`docs/migration/server-compatibility-proof.json`; изменить `transition.py` и
`test/test_transition.py` только при выявленных дефектах.
**Consumes → produces:** S3 backup + S2 image → restore/rollback и compatibility evidence.

- [ ] Выбрать новый restore name/root и свободные loopback ports; задать `backup_path`
  и `restore_root` из private operator file. **Cwd `services/loginom-ai`:**
  ```sh
  python3 deploy/loginom-dock/restore-server.py --backup "$backup_path" \
    --name dock-restore-migration --root "$restore_root" --offline
  ```
  Команда требует предусмотренных прав на test host; flags/path проверяются до запуска.
- [ ] Первый restore использует сохранённые image digests и isolated networks/volumes.
  Проверить данные, resource IDs и непрерывность архива без production writes.
  Затем на копии применить candidate; тест rollback использует сохранённый прежний
  image и, если schema необратима, повторно восстановленную копию прежних данных.
- [ ] С `verify-server.py --checks full` проверить MCP initialization/tools,
  authentication, forbidden admin, health/ready. Разрешённый config указывает test endpoint;
  runtime клиента закреплён из новой сборки, не из установленного бывшего плагина.
- [ ] Использовать существующий `verify-source-search.py --client FILE --output FILE`
  для точного read/search трёх источников. Первый этап — доступ к восстановленному
  индексу без GitLab; затем отдельно проверить HTTPS/LFS ingestion route и dry-run
  `ov add-resource --manifest sources.yaml --args dry_run:true` в isolated assets directory.
- [ ] Не менять `to` URI и рабочие source pins; не включать auto-refresh. Реальный импорт
  новых revisions — отдельная согласованная операция, не скрытая часть healthcheck.
- [ ] **Acceptance:** old/candidate/rollback сравнивают resource hashes/counts, permissions,
  MCP/tool schemas, archive queue и read/search; настоящая клиентская задача прошла.
  Downgrade без восстановленных совместимых данных не считается доказанным rollback.
- [ ] **Commit:** `test(server): document restore and compatibility rehearsal`.

## S5. Подготовить и отдельно согласовать production cutover

**Paths:** создать `docs/migration/server-cutover.md`, `server-cutover-proof.json`;
изменить `deploy/loginom-dock/README.md` внутри service tree и testing handoff.
**Consumes → produces:** S2–S4 PASS → reviewable operator plan → отдельно approved cutover.

- [ ] `prepare-cutover` выдаёт plan hash, candidate/rollback digest, перечень сервисов,
  last backup, endpoints, порядок drain/stop/start, проверки и автоматические stop conditions.
  План не меняет DNS/ports/volumes. Сначала предъявить этот результат пользователю.
- [ ] После отдельной явной команды применить ровно approved plan через `cutover`;
  drift image/config/data schema или active imports останавливают действие до мутации.
  Сохранить старый deployment и backup до окончания согласованного периода наблюдения.
- [ ] Проверить HTTPS/auth/MCP/resources и новый клиент; failure → `rollback` по
  тому же plan, никаких повторных speculative migrations или ротации ключей.
- [ ] **Acceptance:** подтверждены реальные image/source pins, данные и восстановление
  работы; клиентский Loginom workflow использует ожидаемый server endpoint. FAIL включает
  достигнутую фазу и исход rollback, не raw remote error/credentials.
- [ ] **Commit:** `docs(server): record approved transition and rollback result`.

## S6. Проверить retirement старого репозитория последним отдельным действием

**Paths:** изменить `docs/migration/loginom-dock-inventory.md`, `source-selection.md`;
создать `docs/migration/retirement-checklist.md`, `retirement-proof.json`.
**Consumes → produces:** source restore F2 + foundation + desktop/platform evidence +
server transition → решение о конкретных путях, которые разрешено удалить.

- [ ] Повторить inventory всех refs/worktrees/stash/untracked: работа могла продолжиться.
  Новые материалы сначала архивировать и восстановить; прежний снимок не покрывает их.
- [ ] Убедиться, что archive находится вне старого repo/worktrees, его reconstruction
  проверен, pipelines/build/deploy/docs используют новый repo, внешние knowledge
  repos доступны независимо, backup production не зависит от удаляемых файлов.
- [ ] Записать точные candidate paths и назначение каждого; active tasks/processes,
  shared Git common dir и чужие данные исключить. Desktop wrapper cleanup разрешён
  отдельно пользователем, но не заменяет разрешение удалить repo/server volumes.
- [ ] Представить готовый checklist с restore evidence и запросить явную команду
  на удаление перечисленных repo/worktrees. До неё статус retirement — READY, не DONE.
- [ ] После команды удалять только согласованные объекты, проверить доступ к архиву,
  clean build source paths и работоспособность нового deployment; серверные volumes,
  external repos и backup не удалять в этой операции.
- [ ] **Acceptance:** полное восстановление остаётся возможным после удаления,
  документация содержит final paths/refs и отдельно отложенные платформенные проверки.
- [ ] **Commit:** `docs(migration): record repository retirement evidence`.
