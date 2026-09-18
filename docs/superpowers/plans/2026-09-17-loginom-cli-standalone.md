# План реализации самостоятельного CLI

Контракт и отметки завершения: [design, §16](../specs/2026-09-17-loginom-cli-standalone-design.md).
База `c37913ab5`, ветка `loginom-cli`. Результаты установленного Desktop из прежних
отчётов не заменяют новую приёмку. Этот план не вводит общую службу или миграцию.

1. **Основа CLI (IND-06/07/08).** Product identity/profile paths, ранний entry,
   marker/guard, изолированные Global/Auth/DB/config/tmp. Foundation source tests
   выполнены; завершить допуск всех поддерживаемых writer-команд и native entry.
2. **Общий host (IND-02/09/10/11/13).** Общая connection/recovery-фабрика,
   Electron adapter, Node private child, async codecs, proxy/CA и owner cleanup.
   Фабрика, handshake, management и Linux codec проверены исходными/процессными тестами.
   Осталось доказать crash/disconnect/cancel с настоящими runtime/browser и исправить
   все неподтверждённые cleanup paths. Не снимать guard при неизвестном исходе cleanup.
3. **Полный run (IND-02/03/04/09/12).** Подключить существующий v1 RunCommand
   после profile/proxy/host preflight, устранить обход cleanup через process.exit,
   сохранить JSON events и permissions. Подтвердить отдельную диагностику model auth
   и Loginom config. Setup уже подключён; выполнить TTY acceptance. Затем реальный
   CSV 55 → save → cold reopen/readback и эквивалентный Desktop прогон.
4. **TUI/automation (IND-04/05/07/10/11/12).** Worker bridge с явным disconnect
   (учесть ограничение Bun MessagePort), headed/headless и resume, Ctrl+C, busy/parallel
   profiles, одинаковые имена вложений с суммами 55/101, запрет скрытого auto-approve,
   корректный итоговый exit при session/tool/permission/recovery errors.
5. **Linux distribution (IND-01/13/14).** Вынести общий staging helper; собрать
   native CLI/TUI + Node host closure + pinned runtime/browser, manifests/hashes/notices;
   CLI archive/install/uninstall без startup downloads. Проверить sandbox и установленный
   артефакт без системных Node/Bun/Chrome, затем установленный Desktop regression.
6. **Windows/macOS (IND-01…14 для каждой ОС).** Нативные DPAPI/Keychain codecs,
   реальные pins/hashes ресурсов, packaging/install/uninstall и настоящая приёмка
   на целевых машинах. Без машин/ресурсов/signing использовать BLOCKED/NOT_RUN,
   не подставлять Linux evidence или hash. Подготовка исходников может идти отдельно.

Проверки выполнять из owning packages (`bun typecheck`, профильные `bun test`).
Критерии завершения всей цели: доказательства по каждому IND, target/mode/source/
artifact hashes, сохранённые fixtures/oracle, отсутствие незавершённых обязательных
gates. Текущий checkpoint и команды — [runbook](../../testing/loginom-ai-agent/standalone-cli.md).
