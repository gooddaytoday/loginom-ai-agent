# Локально и в Multica

Пакет самостоятельный: все его helpers внутри scripts/, старый skill и
agent-validation не нужны. Рабочая зависимость — совместимый AGENT_REPO с текущими
harness API. При несовместимости остановиться; не подменять runner/контракт.

## Локальное исполнение

Исходник — `evals/skills/loginom-node-eval-case`. Подключение Codex:
`~/.agents/skills/loginom-node-eval-case` → абсолютный каталог этого пакета.
Одинаковый skill повторно в другой discovery root не устанавливать.
Модели, CLI, окружение и пути заданы пользователем/принятым назначением;
MULTICA_TASK_ID/issue/task UUID локально не нужны.

Live требует собственного prepared CLI profile, выделенного Loginom, Linux bwrap,
чистого storage и эксклюзивного окна endpoint. Профильный lease не блокирует общий
Loginom. Если endpoint обслуживается node-eval-ops, локальный оператор пользуется
его существующим lease. Не создавать фиктивную Multica карточку ради локального
запуска. Занятое или неподготовленное окружение — конкретный BLOCKED, без перестройки
инфраструктуры в рамках создания кейса.

## Управляемый runtime

Перед работой читать назначение, применимые AGENTS.md и канонические документы своего
checkout: `evals/docs/evaler-orchestration.md`, `evals/docs/evaler/operations.md` и
`evals/docs/evaler/rich.md` либо `ben.md`. При старом frozen checkout использовать
текущий immutable operational supplement, путь которого указан в роли.

- Evaler владеет допуском, передачами, состоянием карточки и проверкой доставки.
- Rich применяет авторский workflow, сдаёт READY_FOR_BEN либо BLOCKED.
- Ben сначала фиксирует слепой независимый расчёт, затем проверяет exact frozen SHA
  и сдаёт VERDICT_BEN; исправления автора сам не делает.

Общий stand lease, native admission, recovery, единственный runtime слот и итоговый
один parent comment определены operational-контрактом. Не дублировать эти механизмы
в scripts; не вызывать Rich↔Ben и не писать evaler.state из worker.

## Поставка

Публиковать новую versioned immutable копию skill и применимых role docs в runtime
support с внутренним SHA256 manifest и внешним хэшем архива. Исторические bundles
не перепаковывать. Ссылки на документы вне supplement явно направлять в
`$AGENT_REPO/<repo-relative-path>` собственного checkout; проверять наличие целей
на обоих checkout и все оставшиеся относительные ссылки готового пакета. Такие
преобразования runtime-копий документов включать в manifest и provenance поставки.
Rich/Ben получают короткую явную ссылку на SKILL.md, а все остальные
инструкции/настройки сохраняются. Перед обновлением подтвердить отсутствие active/
queued работ и pending stand cleanup; затем readback обоих агентов.
Evaler, squad, модели и маршрутизация при этой установке не меняются.

Установка/readback не доказывают живой удалённый цикл. Его подтверждает следующее
штатное поручение, без перезапуска исторических карточек. Checkpoint сообщает
реальные SHA/version/hash, выполненные проверки, пилот и оставшиеся ограничения.
