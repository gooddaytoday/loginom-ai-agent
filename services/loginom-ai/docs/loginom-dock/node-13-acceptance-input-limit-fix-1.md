> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-aafb919627a9` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 13: исправлен размер входа приёмки

Команда `node13:acceptance-input-limit-fix:1:881793e1f1d5b61f149112f3d6a29f72eb441b4e`.
Дата 2026-09-13, ветка `codex/node-13-date-time`.

Комплект теперь использует **10 строк**, совместимых с public sample ≤10.
Прежний комплект `881793e1` с 12 строками несовместим с этим API; его unit PASS
не доказывал исполнимость полного declared goal. Старый коммит,
[отчёт подготовки](node-13-acceptance-input-preparation-1.md) и pending evidence
остались историческими. Это узкое исправление подготовки, не повторный review/N13-R3.

## Изменения и покрытие

CSV: UTF-8, LF, **413 байт, 10×4**. Удалены прежние строки6 и8; Id перенумерованы.
DateB новой строки5 получает 2024-12-31 23:59:59, новой строки6 —
2024-04-30 17:45:12, чтобы сохранить даты из удалённой строки8.
Числовые суммы не были пользовательским требованием и пересчитаны независимо.

| Случай | До: строки старого CSV | После: строки нового CSV |
| --- | --- | --- |
| Две даты, все12 операций по каждой | Все ненулевые DateA/DateB | Те же24 преобразования; схема/порядок неизменны |
| Високосный день, время и полночь | A2/A11, B1/B10 | A2/A9, B1/B8 |
| Невисокосный февраль | B2 | B2 |
| Переход года, 2023/2024/2025 | A1/A5/A9/A10, B5/B8/B9 | A1/A5/A7/A8, B5/B7; годы2023/24/25 представлены в обоих полях |
| Начало/конец квартала | A3/A7, B3/B6/B12 | A3/A6, B3/B10; B7 также начало года/квартала |
| Обычный конец месяца30апреля | A8 | B6, сохранено 17:45:12 |
| Первое число месяца | A5/A6/A3 | A5/A3, B7; удалённый1февраля не был отдельным требованием |
| Повторный февраль и отрицательная сумма | A2/A6/A11, Amount11=-5 | A2/A9, Amount9=-5; два слагаемых20 и−5 |
| NULL обоих полей | 4 | 4 |
| Только DateB=NULL | 11 | 9 |
| Только DateA=NULL и30июня | 12 | 10 |
| Точные final name/label/order/excluded | RowId/SalesAmount/SavedYearA, DateB excluded | Все6 схем и excluded побайтно по JSON-значениям совпали с881793e1 |
| Пустой input | Id<0, все Id положительные | То же условие, 0×27; отвергнутый выход теперь10×4 |

Source/initial/final теперь **10×4 / 10×27 / 10×27**, empty **0×27**.
Месяцы **8×3**: NULL/NULL=42; 2023/12=10; 2024/1=50, /2=15, /3=70,
/4=30, /12=90; 2025/1=100. Кварталы **6×3**: NULL/NULL=42; 2023/4=10;
2024/1=135, /2=30, /4=90; 2025/1=100. Общая сумма **407**.
Frozen expected пересчитан прежним независимым Gregorian oracle, не по actual.

ТЗ по-прежнему естественное: исправлено число строк, а число календарных операций
**12** не менялось. Не добавлены UI/API-рецепт, fault injection, дополнительное
сохранение или reopening в нормальный путь Hermes.

## Проверки совместимости

Новый `date-time-public-fixture-schema.mjs` импортирует **настоящие**
`nodeJobResultSchema` и `nodeApplyInputSchema` клиента и проверяет SDK Ajv:

- **8/8** положительных синтетических портов внутри полного public job envelope:
  импорт, исходный/окончательный/пустой календарь, обе группировки,
  прошедший/отвергнутый filter port;
- **8/8** соответствующих read declarations проходят фактическую schema;
- **4/4** отрицательных проверки: public response и read с11 и12 строками отклонены.

Положительный fixture для full_port теперь содержит корректные typed cells,
индексы, обязательные поля public port и precision. Эти fixtures проверены схемой,
но **не являются live evidence**. Schema validity не доказывает доменный успех.

`full_port` сохраняет полное равенство total/returned/sample длине independent
expected, точную схему и отсутствие truncation. Добавлены ограничение ≤10,
обязательная свежесть и привязка к execution ID родительского checkpoint.
Отклоняются 9из10 строк, усечение, чужая метка/схема, старый execution и forged
12-строчный полный port. Проверка допуска inputs также отказывает, если хотя бы
одна frozen таблица требует более10 строк. Лимит product API **не менялся**;
дополнительный full reader не добавлялся.

Полный Python suite: **533 PASS** (531 прежний +2 новых теста). Сверка всех6 схем
и исключения с881793e1 — PASS. Inputs inventory: **249 файлов**, hashes PASS.
Артефакты проверки: `unavailable:artifact-4f7b430e3c94dc9c`,
`public-schema.json`, `schema-preservation.json`, `inputs-check.json`, `hashes.json`.

Повторяемые безмодельные команды:

```sh
python3 -m unittest discover -s unavailable:artifact-abdc500409930ca3 -p 'test_date_time_sales_preparation.py'
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_admission.py --inputs-only
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_launch.py --admission packages/loginom-runtime/tools/loginom-acceptance/fixtures/date-time/admission.pending.json
```

Последняя остаётся BLOCKED / exit1. Рабочие команды будущего запуска и direct-open
протокол из исходного отчёта сохранены, но использовать можно только новые pins.

## Открытые gates

R1 configure continuation прежнегоID с полной29строчной матрицей и его реальные
positive/negative проверки остаются OPEN. R2 terminal failure integration и новая
целевая live Date/time проверка остаются OPEN. Общий unavailable:artifact-b16792fc12242b66 не менялся.
Direct-open diagnostic protocol и полный новый goal ещё не прошли end-to-end;
это подготовка, **не live/Hermes acceptance**. Final runtime/archive/catalog,
coordinator slot и admission не назначены. Исторические4×27 не перенесены на10×27.
Hermes, stage/build/merge/cherry-pick/push/deploy/activation/shared plugin и review
не запускались. OpenViking healthy; routing не менялся.

## Обновлённые SHA-256

Пути относительно `unavailable:artifact-6c9840df3f4b6129`. Entry полного аудитора не менялся;
изменились его component, admission guard и pinned inputs. Bytes SHA `inputs.json`
и SHA canonical sorted map — разные, обе формы приведены явно.

| Файл | Байты | SHA-256 |
| --- | --- | --- |
| `goals/date-time-sales.txt` | 7001 | `a8681d5606d351b054f5d7aa9a338409d007de049997a4efdce47508bd472824` |
| `fixtures/date-time/sales.csv` | 413 | `2a74b48ca02f457c012d67db60582d1840731cf4463b8a276ad6626c6433bcf2` |
| `fixtures/date-time/expected.json` | 24318 | `428187d7a064b1f7af0c675e340a4f831078bc7d171f8a242b3b7efc4899ceca` |
| `date_time_sales_acceptance.py` | 15048 | `452f427cac8790fdb212384ded0f80b0bbc7339c0f964bda4e85d5e6de51cb32` |
| `date_time_goal_evidence.py` | 9881 | `fc6b6bb424ab6f4f360bdfc6aa2fa8dc9d37fa91ce77de33c03058dc9db35c1d` |
| `date_time_admission.py` | 8081 | `7f0e341505bdb2388887a7ec392e471586c5006c547d327b31f822291d289bc2` |
| `date-time-public-fixture-schema.mjs` | 2453 | `27c57585cd3f391ebc2ae30115f2f4bb3f8414c614f07204460bb5f1a77ba461` |
| `fixtures/date-time/inputs.json` | 25283 | `a921620b982977652b9ab9206dff1c6bc0f7a6417add2baad64d0c1364ba31ec` |

Canonical sorted `path:sha256\n` map: `5f1d5af4e799438e95d4035f28053276e982ac84cc54cc028db4fd8338cf2d0d`.
