import argparse
import csv
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory

from wave4b_oracle import ORDERS, PRICES, SALES, expected, raw_rows


TASKS = {
    44: (
        'Загрузите строки заказов из приложенного CSV: дату оставьте текстом, количество и скидку — целыми числами, цену — вещественным числом, пустую скидку — пропуском. Сохраните заголовки столбцов.',
        'После «Позиции к сверке» добавьте узел Python с помесячной выручкой по выполненным заказам: количество × цена × (1 − скидка / 100), пустая скидка считается нулевой. Выход: месяц `month` текстом `ГГГГ-ММ` по возрастанию и `revenue` с округлением до копеек; запустите и покажите результат.',
        'В том же узле добавьте `moving_avg`: среднее выручки текущего и двух предшествующих месяцев, в начале ряда — по доступным месяцам. Округлите до копеек, запустите и покажите результат.',
        'В том же узле измените только ширину окна скользящего среднего на 6 месяцев, запустите и покажите результат.',
    ),
    45: (
        'Загрузите из приложенного CSV список номеров заказов; `order_id` должен быть целым числом.',
        'Добавьте без подключения Калькулятор переменных с целочисленным порогом `Limit`, начальное значение 1000; запустите и проверьте значение.',
        'После импорта добавьте Фильтр строк с условием `order_id` строго больше 1000. Запустите и покажите прошедшие строки.',
        'В существующем фильтре замените число управляющей переменной `Limit` из Калькулятора переменных. Запустите и покажите прошедшие строки.',
        'Измените порог в Калькуляторе переменных на 500, не перенастраивая фильтр. Запустите фильтр и покажите прошедшие строки.',
    ),
    46: (
        'Загрузите цены товаров из приложенного CSV: `category` — текст, `list_price` — вещественное число.',
        'Добавьте после импорта Группировку по `category` с суммой `list_price` в столбце `metric`; запустите и покажите итог.',
        'Вставьте между импортом и «Свод цен для закупок» Фильтр строк: в свод должны идти только цены не ниже 500. Запустите свод и покажите итог.',
        'В «Свод цен для закупок» замените сумму на среднее арифметическое, оставив прежние вход, группы и имя `metric`. Запустите и покажите итог.',
        'Удалите фильтр и снова подключите импорт напрямую к «Свод цен для закупок», не меняя агрегат. Запустите и покажите итог.',
    ),
}
MANUAL = {
    (44, 1): {'kind': 'rename', 'node': {'type': 'imports.text'}, 'label': 'Позиции к сверке'},
    (45, 2): {'kind': 'move', 'node': {'type': 'variables.calculator'}, 'position': {'x': 320, 'y': 352}},
    (46, 2): {'kind': 'rename', 'node': {'type': 'transform.group_data'}, 'label': 'Свод цен для закупок'},
}
NEW_NODES = {44: (1, 1, 0, 0), 45: (1, 1, 1, 0, 0), 46: (1, 1, 1, 0, 0)}


def emit_csv(root, chain, table, rows):
    filename, columns = table
    folder = root / f'bh-w{chain}-t1/data'
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / filename).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(columns), extrasaction='ignore', lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def fixtures(root, seed):
    orders = raw_rows(seed / 'orders.csv')
    sales = {row['order_id']: row for row in orders if '2025-01' <= row['order_date'][:7] <= '2025-09'}
    counts = {}
    lines = []
    for item in raw_rows(seed / 'order_items.csv'):
        order = sales.get(item['order_id'])
        if not order:
            continue
        bucket = order['order_date'][:7] if order['status'] == 'Выполнен' else 'excluded'
        if counts.get(bucket, 0) < 2:
            lines.append(order | item)
            counts[bucket] = counts.get(bucket, 0) + 1
    assert len(counts) == 10 and len(lines) == 20
    completed = [row for row in lines if row['status'] == 'Выполнен']
    assert any(not row['discount_pct'] for row in completed) and any(row['discount_pct'] for row in completed)
    emit_csv(root, 44, SALES, lines)

    order_ids = {'100', '499', '500', '501', '620', '999', '1000', '1001', '1300', '1500'}
    emit_csv(root, 45, ORDERS, [row for row in orders if row['order_id'] in order_ids])

    products = raw_rows(seed / 'products.csv')[:20]
    assert any(Decimal(row['list_price']) < 500 for row in products)
    emit_csv(root, 46, PRICES, products)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(root):
    here = Path(__file__).resolve().parent
    with TemporaryDirectory() as seed:
        subprocess.run([sys.executable, str(here.parent / 'dbseed/gen.py'), seed], check=True)
        fixtures(root, Path(seed))
    oracle = here / 'wave4b_oracle.py'
    if (root / oracle.name).resolve() != oracle:
        (root / oracle.name).write_bytes(oracle.read_bytes())
    for chain, tasks in TASKS.items():
        for turn, task in enumerate(tasks, 1):
            case = f'bh-w{chain}-t{turn}'
            folder = root / case
            folder.mkdir(parents=True, exist_ok=True)
            config = {'output_mode': 'ports', 'budget': {'max_nodes': NEW_NODES[chain][turn - 1]}}
            if turn > 1:
                config.update(base=f'bh-w{chain}-t{turn - 1}', input_files=[])
            manual = MANUAL.get((chain, turn))
            if manual:
                config['manual_edit'] = manual
            (folder / 'task.md').write_text(task + '\n', encoding='utf-8')
            (folder / 'oracle.py').write_text(
                'import subprocess\nimport sys\nfrom pathlib import Path\n\n'
                'case = Path(__file__).resolve().parent\n'
                'subprocess.run([sys.executable, case.parent / "wave4b_oracle.py", case.parent, case.name], check=True)\n',
                encoding='utf-8',
            )
            write_json(folder / 'case.json', config)
            write_json(folder / 'expected.json', expected(root, case))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True, type=Path)
    generate(parser.parse_args().out)
