import csv
import json
import sys
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


SALES = ('orders_lines.csv', {'order_date': 'string', 'status': 'string',
          'quantity': 'integer', 'unit_price': 'real', 'discount_pct': 'integer'})
ORDERS = ('order_ids.csv', {'order_id': 'integer'})
PRICES = ('product_prices.csv', {'category': 'string', 'list_price': 'real'})
TABLES = {44: SALES, 45: ORDERS, 46: PRICES}
TYPES = {'source': 'imports.text', 'monthly': 'programming.python',
         'limit': 'variables.calculator', 'filter': 'transform.filter_data',
         'group': 'transform.group_data'}


def raw_rows(path):
    with path.open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


def typed(row, columns):
    parse = {'string': str, 'integer': int, 'real': float}
    return {name: parse[kind](row[name]) if row[name] else None for name, kind in columns.items()}


def output(node, columns, rows, *, ordered=True, column_order='exact'):
    return {'output_node_type': TYPES[node], 'output_port': 0, 'ordered': ordered,
            'column_order': column_order, 'rows': rows,
            'columns': [dict(name=name, type=kind, **({'tolerance': {'abs': 0.000001}} if kind == 'real' else {}))
                        for name, kind in columns.items()]}


def monthly(rows, window):
    amounts = defaultdict(Decimal)
    for row in rows:
        if row['status'] == 'Выполнен':
            amounts[row['order_date'][:7]] += (Decimal(row['unit_price']) * int(row['quantity'])
                                                * (100 - int(row['discount_pct'] or '0')) / 100)
    cent = Decimal('0.01')
    months = sorted(amounts)
    revenues = [amounts[month].quantize(cent, rounding=ROUND_HALF_UP) for month in months]
    result = []
    for index, (month, revenue) in enumerate(zip(months, revenues)):
        row = dict(month=month, revenue=float(revenue))
        if window:
            sample = revenues[max(0, index + 1 - window):index + 1]
            row['moving_avg'] = float((sum(sample) / len(sample)).quantize(cent, rounding=ROUND_HALF_UP))
        result.append(row)
    return result


def prices(rows, *, filtered, average):
    groups = defaultdict(list)
    for row in rows:
        price = Decimal(row['list_price'])
        if not filtered or price >= 500:
            groups[row['category']].append(price)
    return [dict(category=category, metric=float(sum(values) / (len(values) if average else 1)))
            for category, values in sorted(groups.items())]


def expected(root, case):
    chain, turn = map(int, case.removeprefix('bh-w').split('-t'))
    filename, columns = TABLES[chain]
    raw = raw_rows(root / f'bh-w{chain}-t1/data' / filename)
    source = [typed(row, columns) for row in raw]
    nodes = ['source']
    links, retain, labels = [], [], {}
    outputs = [output('source', columns, source)]
    if chain == 44 and turn > 1:
        nodes += ['monthly']
        links = [('source', 'monthly')]
        retain = nodes if turn > 2 else ['source']
        labels['source'] = 'Строки заказов'
        window = {2: 0, 3: 3, 4: 6}[turn]
        result_columns = {'month': 'string', 'revenue': 'real'}
        if window:
            result_columns['moving_avg'] = 'real'
        outputs = [output('monthly', result_columns, monthly(raw, window))]
    elif chain == 45 and turn > 1:
        nodes += ['limit']
        retain = ['source']
        outputs = []
        if turn > 2:
            nodes += ['filter']
            retain = nodes if turn > 3 else nodes[:-1]
            links = [('source', 'filter')]
            if turn > 3:
                links += [('limit', 'filter')]
            threshold = 500 if turn == 5 else 1000
            outputs = [output('filter', columns, [row for row in source if row['order_id'] > threshold])]
    elif chain == 46 and turn > 1:
        nodes += ['group']
        retain = ['source'] if turn == 2 else ['source', 'group']
        if turn > 2:
            labels['group'] = 'Свод цен'
        filtered = turn in (3, 4)
        if filtered:
            nodes += ['filter']
            if turn == 4:
                retain += ['filter']
        links = [('source', 'filter'), ('filter', 'group')] if filtered else [('source', 'group')]
        outputs = [output('group', {'category': 'string', 'metric': 'real'},
                          prices(raw, filtered=filtered, average=turn > 3), ordered=False)]

    return {'graph': {'exact': True, 'retain': retain,
                      'nodes': [dict(id=node, type=TYPES[node], **({'label': labels[node]} if node in labels else {}))
                                for node in nodes],
                      'links': [dict(source=parent, target=child, output=0, input=0) for parent, child in links]},
            'outputs': outputs}


if __name__ == '__main__':
    root, case = sys.argv[1:]
    print(json.dumps(expected(Path(root), case), ensure_ascii=False, indent=2))
