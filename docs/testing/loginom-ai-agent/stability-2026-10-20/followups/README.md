## D7c: «вопросы зала»

Десять коротких продолжений к готовым результатам s1, s3, s4, s5 и s6.
Каждое q начинается в том же чате и пакете, где только что выполнен исходный
сценарий. Два q одного семейства — независимые ветви: например, q2 идёт от полного
s1, а не от отфильтрованного q1. Сначала выполнить исходный сценарий заново
в отдельном личном пакете, затем отправить выбранный `prompt.md` без повторного
прикладывания CSV. Oracle и expected модели не передавать.

| Продолжение | Основа | Что меняется | Строк | Экспорт |
|---|---|---|---:|---|
| [q1](q1/) | s1 | Только Север | 2 | revenue-north.csv |
| [q2](q2/) | s1 | Топ-3 пар регион × категория | 3 | revenue-top3.csv |
| [q3](q3/) | s3 | Долги ≥ 2500 | 5 | debts-large.csv |
| [q4](q4/) | s3 | Убывание долга | 8 | debts-ranked.csv |
| [q5](q5/) | s4 | Итоги по категориям всех филиалов | 2 | branches-categories.csv |
| [q6](q6/) | s4 | Русские подписи колонок | 6 | branches-ru.csv |
| [q7](q7/) | s5 | Total по трём категориям | 3 | pivot-total.csv |
| [q8](q8/) | s5 | Та же таблица в другом файле | 3 | pivot-for-meeting.csv |
| [q9](q9/) | s6 | Только уже рассчитанные B и C | 2 | abc-bc.csv |
| [q10](q10/) | s6 | Средняя выручка на товар класса | 3 | abc-average.csv |

В каждой папке: разговорный `prompt.md`, самостоятельный `oracle.py`, полный
`expected-demo.json` и README с исходными CSV и изменением результата. Новых
входов и копий данных нет: используются CSV из `demo-2026-10-22`.
Oracle читают эти CSV относительно `__file__`, пересчитывают исходный сценарий
и продолжение. Expected, результаты Loginom и другие oracle не читаются.
Python 3, только стандартная библиотека; денежные расчёты — `Decimal`.

## Пути пакета и экспорта

`package_path` в сохранённом expected — путь-шаблон исходного сценария, например
`/demo-2026-10-22/s1-revenue.lgp`. Продолжение сохраняет этот же пакет. Назначение
экспорта — точный полный путь-шаблон, например
`/demo-2026-10-22/revenue-north.csv`. Это конкретный путь, а не glob или поиск
по имени файла. Перед прогоном заменить его на полный личный путь с тем же именем
CSV и заменить путь пакета; пример из корня репозитория:

```sh
python3 -B docs/testing/loginom-ai-agent/stability-2026-10-20/followups/q1/oracle.py \
  '/<username>/d7c-s1-q1-<run-id>.lgp' \
  '/<username>/d7c-q1-<run-id>/revenue-north.csv' > ./q1-run-expected.json
```

Первый аргумент меняет только `package_path`, второй — только
`outputs[0].export_destination`; без аргументов oracle воспроизводит сохранённый
expected побайтно. Путь пакета здесь должен совпасть с пакетом исходного s1.
Оператор задаёт точные личные пути в окружении/контексте исходного и последующего
заданий до запуска, не передавая модели ожидаемые данные.

`export_input` с `export_destination` выбирает вход единственного экспорта
с таким назначением, как в [s8-rename](../../demo-2026-10-22/s8-rename/README.md).
Старый экспорт исходного сценария допустим. После продолжения исходный expected
может стать неприменимым: проверять нужно expected выбранного q.
`column_order: exact` фиксирует колонки. q1–q6 проверяют порядок строк;
q7–q10 допускают любой. В q6 меняются подписи, внутренние имена сохранены.
Только AverageRevenue в q10 имеет `tolerance.abs = 0.000001` для округлённых
десятичных копеек; остальные результаты представимы в binary64 точно.

## Воспроизведение без модели

Из корня репозитория проверить 10 oracle, запуск из другого текущего каталога
и независимую подстановку каждого из двух путей:

```sh
python3 -B - <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root = Path('docs/testing/loginom-ai-agent/stability-2026-10-20/followups').resolve()
for number in range(1, 11):
    case = root / f'q{number}'
    command = [sys.executable, '-B', str(case / 'oracle.py')]
    saved = (case / 'expected-demo.json').read_bytes()
    assert subprocess.check_output(command) == saved
    assert subprocess.check_output(command, cwd='/') == saved
    expected = json.loads(saved)
    package = f'/test/followup-q{number}.lgp'
    changed = subprocess.check_output([*command, package], cwd='/')
    expected['package_path'] = package
    assert json.loads(changed) == expected
    destination = f'/test/q{number}.csv'
    changed = subprocess.check_output([*command, package, destination], cwd='/')
    expected['outputs'][0]['export_destination'] = destination
    assert json.loads(changed) == expected
    print(f'q{number}: oracle / cwd / paths PASS')
PY
```

Вызвать существующий валидатор для каждого expected (нужен Bun):

```sh
bun --input-type=module - <<'JS'
import { readFileSync } from 'node:fs';
import { parseExpectedOutputs } from './scripts/node-acceptance/expected-outputs.mjs';
const root = 'docs/testing/loginom-ai-agent/stability-2026-10-20/followups';
for (let number = 1; number <= 10; number++) {
  const expected = JSON.parse(readFileSync(`${root}/q${number}/expected-demo.json`, 'utf8'));
  parseExpectedOutputs(expected);
  console.log(`q${number}: parseExpectedOutputs PASS`);
}
JS
```

Будущие прогоны и cold-check — по [инструкции D1](../../demo-2026-10-22/README.md#проведение-показа).
Проверять полный итог по личному expected выбранного q. Cold проверяет таблицу
на входе экспорта, а не байты CSV: факт выгрузки и сохранения пакета проверяется
в самом прогоне. Эта поставка содержит только документы, входы уже существуют.
Модельные прогоны, сборки, сеансы Loginom и cold-check при подготовке не запускались.
