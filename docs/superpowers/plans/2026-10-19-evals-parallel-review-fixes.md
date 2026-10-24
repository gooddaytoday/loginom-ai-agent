# Исправления после ревью evals-parallel

**Цель:** перепроверить три замечания к `3792f23b27` и исправить только подтверждённые ошибки.
**Основание:** [контракт](../../../evals/docs/parallel-users-contract.md), п.15, 23–26, 31.
**Подход:** существующие systemd, архивирование профиля и CAS reservations;
без новых механизмов восстановления, моделей, Docker и изменений удержанных ресурсов.
**Проверки:** Bun, публичные интерфейсы harness, RED → GREEN по одному поведению.

## План

- [x] Независимо проверить план: достаточность, простота и сохранность гарантий.
  Ревью одобрило план с уточнениями ниже; новые механизмы не нужны.
- [x] 1. Offline-судья (`judge-environment.ts`, `calibrate.ts`, `rejudge.ts`).
  Сначала воспроизвести отсутствие именованного юнита в публичном offline-пути
  с fake judge/systemctl. Включить существующую systemd-границу для v2 и
  передать её через настройки версии/исполнения. Проверить calibration и
  judge-only, сохранение home и его освобождение; legacy fake-путь сохранить.
  Один RED/GREEN-сценарий за раз. Коммит `fix(evals): supervise offline judges through bounded units`.
- [x] 2. Native evidence (`profile-archive.ts`, при необходимости `prepared-run.ts`,
  `node-native.ts`/`text-import.ts` и соответствующие тесты).
  Воспроизвести отказ на реальном формате prepared cleanup и настоящем
  архиве `archiveProfileHistory`, затем согласовать writer/reader минимально:
  producer записывает canonical `profileDir`, reader проверяет эту привязку
  и canonical archive внутри configured history вместе с cleanup gates.
  Проверить crosstable/text-import, отказ чужому архиву и неподтверждённому cleanup,
  сохранить legacy/durable формат. Не подключать неиспользуемые цепочки архивирования.
  Коммит `fix(evals): read prepared slot archives for native evidence`.
- [x] 3. Частичное освобождение (`slots.ts`, `slots.test.ts`).
  Воспроизвести промежуток между profile reservation released и составной
  квитанцией retained, используя реальные leases и отдельный дочерний процесс.
  Guarded admission в `requireFinalizedSlotRelease` завершает ранее
  подтверждённое освобождение после startup reconciliation;
  отсутствие/подмена proof сохраняют отказ. Проверить повторный startup и
  новый admission без сброса token/revision или чужих reservations.
  Коммит `fix(evals): finalize interrupted slot releases during admission`.
- [x] 4. Проверить общий diff другим агентом; выполнить связанные тесты,
  `bun typecheck`, `git diff --check`. Proc-denial отключён. Полный unit-набор
  повторять при непокрытых зависимостях или новых отказах.
- [x] Обновить checkpoint основного плана и результаты этого плана.

## Границы работы

Публичные статусы и требования подтверждённого cleanup не ослабляются.
Применяется уже согласованная модель владения; дополнительных согласований
не требуется. Все временные данные — `/home/kiselev/storage/tmp/`.
Чужой `docs/2026-10-15-evals-parallel-overengineering-review.md` не менять.
Root ведёт этот план и коммиты; каждому worker выделяются непересекающиеся файлы.

## Результат

- Offline-судья: оба RED подтверждены (version/исполнение), затем 48 тестов
  в шести связанных файлах прошли: 368 утверждений. Private home, unit timeout,
  завершение unit и release проверены subprocess fixtures; legacy fake сохранён.
  Production diff — три строки. Независимое ревью одобрило исправление.
- Native evidence: RED на фактическом prepared формате и настоящем архиве,
  затем 29 связанных тестов прошли: 213 утверждений, включая legacy import.
  Чужой profile/archive, path escape, неизвестные процессы и неполный cleanup
  отвергаются. Независимое ревью одобрило исправление.
- Частичное освобождение: RED — `RECOVERY_FINALIZATION_REQUIRED` при новом
  admission после startup; GREEN — 52 теста slots/startup/lease, 177 утверждений.
  Независимое ревью не нашло обязательных замечаний. При подмене cleanup,
  token или serverEpoch составная квитанция сохраняется и новый owner не появляется.
- Дополнительно node-evals/node-runner: 23 pass, 61 утверждение. Итоговые
  `bun typecheck` и `git diff --check` прошли; независимый reviewer одобрил все три diff.
  Проверки использовали private subprocess/filesystem fixtures без моделей,
  Docker, настоящих systemd units или изменений удержанных ресурсов.
  Полный unit-набор 910 тестов повторно не запускался: проверены связанные пути.
- Коммиты: partial release `d32e182da2`, offline judge `28799f2679`,
  native evidence `23962b6a1c`. Исходные N1/N2 evidence не переписывались.
