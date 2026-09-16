# Узел 14: исправлен выбор NULL в импорте — 2026-09-13

Выполнено назначение `node14:import-configure-followup:1:b79da602`.
**Подтверждённая причина исправлена в source; focused live PASS.**
Source commit `814f31467b8e93fa9bd27225edb3ec0074d4bd15`.
Полная автономная приёмка не повторялась; оба исходных FAIL сохранены.

## Причина и минимальное исправление

В оригинальном `20260913-132939-0384fe0b` import-allnull step34 ожидал `NULL`,
но в итоговом наблюдении исходное поле имело `null`. Поэтому проверка ожидала
неверный относительно фактического результата текст и завершилась
WIZARD_FIELD_NOT_CONFIRMED. Оснований увеличивать таймаут не было.

В отдельном Loginom7.4.2/test-4 исходная конфигурация сначала прошла целиком.
Затем на её диагностической копии воспроизведён конкретный переход при
вводе маркера: typed=`NULL`, beforeTab=`NULL`, change/blur=`null`.
Повтор с паузой500мс перед Tab дал то же расхождение. Записаны реальные DOM
input/change/blur/keydown события. Поле, документ и мастер оставались прежними.
Список содержит отдельные пункты «Пустая строка», `?`, `null`, `NULL`.
Выбор точного пункта `NULL` сохранил `NULL` и после последующего blur.

Pinned E2E `2cad5602158fd2e4836d821d644a2b8d92f571a2`,
`tests/acceptance/wizards/imports/txt/format_settings.ts:85` использует выбор
из списка; строки313–340 отдельно проверяют null/NULL. Selector подтверждён
`bg/sels/import/sImportTxt.ts:49`. SHA файлов сохранены в source-evidence.json.
[Loginom Help](https://help.loginom.ru/userguide/integration/import/txt/index.html)
также перечисляет эти варианты отдельно. Help прочитан13сентября; текущая страница
не считается замороженной версией7.4.2. Основа исправления — реальный UI и pinned E2E.

В `text-import-procedure.mjs` только для null_marker=`null` или `NULL`
используется наблюдаемый picker и единственный точный option с теми же owner/root.
После выбора проверяются точный регистр, owner/input refs. Дубликат, чужой
владелец/мастер, отсутствие точного варианта или несоответствие readback дают отказ;
ввода текста как резервного действия нет. Прочие маркеры сохраняют прежний путь.
Исходные проверки wizard identity, cleanup/pending и таймауты не ослаблены.

## Проверки и границы доказательств

- **16/16** focused tests, включая точный null/NULL и6 отрицательных подмен:
  duplicate, foreign_owner, foreign_root, wrong_case, bad_readback, replaced_input.
- **336/336** regression: text import, continuation и общий workspace UI.
- Свежий source live-4: исходный all-null import завершился SUCCEEDED,
  cleanup=true; execute завершён, прочитаны все3строки/15ячеек,12точных Null,
  схема5полей совпала, readback null_marker=`NULL`, output mapping сохранён.
  Проверка3×5 сопоставила все исходные CSV значения и формат/schema без
  подмены NULL; отличались только диагностические context/source-path/operationID.
- Native save и независимый reopen не входили в эту focused фазу и не выполнялись.
  Это доказательство конкретного import fix, не полной цели Missing Values.

Все четыре диагностические попытки сохранены отдельно:

1. live-1: публичный API отверг расширенный workflow_ref из нормализованного
   original evidence до node.apply; локальный оператор исправлен на workflow_id.
2. live-2: исходный import SUCCEEDED; в том же диагностическом UI воспроизведены
   NULL→null на Tab и точный выбор NULL. Первые попытки открытия мастера через
   label/body не открыли его; открытие выполнено штатным Setting с подтверждением
   деактивации. Неудачный locator hover зафиксировал overlay NodesControls.
3. live-3: первая версия исправления отказала без выбора, потому что фактические
   import-format combo refs не имеют scope. Исправление связано с реальными
   name/owner/root refs; отсутствие scope трактуется как существующий native
   формат. Иные заданные scopes не принимаются. Pending этой попытки не переписан.
4. live-4: финальный source и полный focused import PASS.

Собственные четыре сессии закрыты; process-check all_stopped=true. Процессная
очистка не превращает прежние AMBIGUOUS-квитанции в resolved.

## Отказ размещения: отдельное предложение

`import-one120` в оригинальном FAIL запрашивал точку(80,880), экранную(404,980)
при viewport1508×862. Три попытки NOT_APPLIED/effect=false имеют реальные
post-refusal graph snapshots; `import-one120b` с координатами(300,80) SUCCEEDED.
Запросы совпали после удаления только ID и координат.

Подготовлена [проверяемая import-specific схема](node14-import-placement-refusal-proposal-2026-09-13.md)
для согласования координатором: source artifact/upload proof, полный graph
before/after, строго no-effect NOT_APPLIED, semantic successor после settlement,
точная user-v1 проекция и неизменная полная цель27success/9imports/12finals/save/reopen.
**Классификатор импортов не реализован; текущий allowance не расширен.**
Полный аудитор остаётся строгим и не примет original FAIL как успешный прогон.

## Версии и следующий этап

Runtime финальной live-проверки и source preflight:
`71f73d81d758c746bd2111c93de08691c85aebddf80a411f294b8ed3f56ab4ff`.
Подтверждены156runtime/395source inputs, совпавшие с source commit.
Live использовал immutable test4.2/cadd80df; server catalog не менялся.

[Машинные pins и receipts](node14-import-configure-followup-pins-2026-09-13.json).
Приватные доказательства: `.dock/node14-import-followup/`.
Старые13/13 receipts acceptance2 и14/14 acceptance3 повторно сверены по размерам/SHA.
Goal/oracle/harness, старые frozen pins и результаты не переписаны. Перед новым
acceptance требуется отдельный свежий pinned комплект под изменённый runtime;
эта фаза его не объявляет готовым и не выдаёт слот Hermes.

Передача shared import fix другим веткам — через координатора. Hermes, review,
VPS/stage/activation, main/merge/push, общий plugin и routing не выполнялись.
