#!/usr/bin/env python3
"""Calculate G2 expectations from the attached data without Loginom."""
import argparse
from collections import Counter, defaultdict
import csv
from decimal import Decimal
import json
from pathlib import Path

CASES = Path(__file__).resolve().parents[1]
DEPTHS = {201: 5, 202: 4, 203: 4, 204: 5, 205: 4, 206: 5}
KINDS = {
    'sales': 'imports.text',
    'returns': 'imports.text',
    'jan': 'imports.text',
    'feb': 'imports.text',
    'mar': 'imports.text',
    'filter': 'transform.filter_data',
    'group': 'transform.group_data',
    'totals': 'transform.group_data',
    'join': 'transform.join_data',
    'union': 'transform.union_data',
    'sort': 'transform.sorting',
    'js': 'programming.javascript',
    'py': 'programming.python',
    'csv': 'exports.text',
    'xlsx': 'exports.excel',
    'export': 'exports.text',
}
LABELS = {
    'sales': 'Продажи',
    'returns': 'Возвраты',
    'jan': 'Январь',
    'feb': 'Февраль',
    'mar': 'Март',
    'filter': 'Фильтр выручки',
    'group': 'Группировка',
    'totals': 'Итоги по регионам',
    'join': 'Слияние заказов',
    'union': 'Объединение месяцев',
    'sort': 'Сортировка выручки',
    'js': 'Расчёт JS',
    'py': 'Корректировка',
    'csv': 'Экспорт CSV',
    'xlsx': 'Экспорт Excel',
    'export': 'Экспорт результата',
}
SALE_TYPES = {'SaleID': 'integer', 'Region': 'string', 'Revenue': 'real'}
UNION_TYPES = {'OrderID': 'integer', 'Region': 'string', 'Revenue': 'real'}
JOIN_TYPES = {'OrderID': 'integer', 'Amount': 'real', 'RightAmount': 'real'}
GROUP_TYPES = {'Region': 'string', 'RevenueStat': 'real'}
JS_TYPES = {**SALE_TYPES, 'DoubledRevenue': 'real'}
PY_TYPES = {**JS_TYPES, 'AdjustedRevenue': 'real'}


def name(chain, turn):
    return f'bh-g{chain}-t{turn}'


def fixture(chain, turn, filename, types):
    path = CASES / name(chain, turn) / 'data' / filename
    with path.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != list(types):
            raise ValueError(f'{path}: unexpected input columns {reader.fieldnames}')
        parse = {'integer': int, 'real': Decimal, 'string': str}
        return [{key: parse[field_type](row[key]) for key, field_type in types.items()}
                for row in reader]


def group(rows, average=False):
    groups = defaultdict(list)
    for row in rows:
        groups[row['Region']].append(row['Revenue'])
    return [{'Region': region, 'RevenueStat': sum(values) / len(values) if average else sum(values)}
            for region, values in sorted(groups.items())]


def join(left, right, inner=False):
    return [
        {**row, 'RightAmount': amount}
        for row in left
        for amount in ([candidate['Amount'] for candidate in right
                        if candidate['OrderID'] == row['OrderID']] or ([] if inner else [None]))
    ]


def selector(node):
    return {'type': KINDS[node], 'label': LABELS[node]}


def graph_id(node):
    return 'group' if node == 'totals' else node


def edge(source, target, input_port=0):
    link = {'source': graph_id(source), 'target': graph_id(target), 'output': 0}
    if input_port is not None:
        link['input'] = input_port
    return link


def table(node, types, rows, *, ordered=False):
    return dict(output_node_type=KINDS[node], output_node_label=LABELS[node], output_port=0,
                ordered=ordered, column_order='exact',
                columns=[dict(name=field, type=kind, label_any=True)
                         for field, kind in types.items()],
                rows=[{field: float(value) if isinstance(value, Decimal) else value
                       for field, value in row.items()} for row in rows])


def expectation(chain, turn):
    if not 1 <= turn <= DEPTHS[chain]:
        raise ValueError(f'Invalid turn {name(chain, turn)}')
    nodes, links, outputs, review = [], [], [], {}
    if chain == 201:
        sales = fixture(chain, 1, 'sales.csv', SALE_TYPES)
        rows = sales if turn == 1 else [row for row in sales if row['Revenue'] >= 100]
        nodes = ['sales', 'group'] if turn == 1 else ['sales', 'filter', 'group']
        links = [edge(a, b) for a, b in zip(nodes, nodes[1:])]
        result = table('group', GROUP_TYPES, group(rows, average=turn >= 3))
        review['aggregate'] = 'avg' if turn >= 3 else 'sum'
        if turn <= 3:
            nodes.append('csv')
            links.append(edge('group', 'csv'))
        if turn == 1:
            outputs.append(export_output(result, 'summary.csv'))
        if turn == 5:
            nodes.append('xlsx')
            links.append(edge('group', 'xlsx'))
            review['workbook'] = {'filename': 'summary.xlsx', 'sheet': 'Итоги'}
    elif chain == 202:
        sales = fixture(chain, 1, 'sales.csv', {'OrderID': 'integer', 'Amount': 'real'})
        returns = (fixture(chain, 2, 'returns.csv', {'OrderID': 'integer', 'Amount': 'real'})
                   if turn > 1 else sales)
        nodes = ['sales', 'join'] if turn == 1 else ['sales', 'returns', 'join']
        source_a, source_b = ('sales', 'sales') if turn == 1 else ('sales', 'returns')
        left, right = sales, returns
        if turn >= 3:
            source_a, source_b, left, right = source_b, source_a, right, left
        links = [edge(source_a, 'join', 0), edge(source_b, 'join', 1)]
        result = table('join', JOIN_TYPES, join(left, right, inner=turn == 4))
        review['join_mode'] = 'inner' if turn == 4 else 'left'
    elif chain == 203:
        month = {key: fixture(chain, 1, filename, UNION_TYPES)
                 for key, filename in [('jan', 'january.csv'), ('feb', 'february.csv')]}
        if turn > 1:
            month['mar'] = fixture(chain, 2, 'march.csv', UNION_TYPES)
        nodes = [*month, 'union']
        members = [key for key in month if key != 'feb' or turn < 3]
        # A free port may remain allocated after February is disconnected.
        links = [edge(key, 'union', None if key == 'mar' and turn >= 3 else port)
                 for port, key in enumerate(members)]
        rows = [row for key in members for row in month[key]]
        result = table('union', UNION_TYPES, rows)
        if turn == 4:
            review['answer_row_count'] = len(rows)
    elif chain == 204:
        sales = fixture(chain, 1, 'sales.csv', SALE_TYPES)
        group_node = 'group' if turn == 1 else 'totals'
        nodes = ['sales', 'filter', group_node] if turn < 5 else ['sales', group_node]
        if turn < 5:
            links.append(edge('sales', 'filter'))
        if turn <= 2:
            links.append(edge('filter', group_node))
        if turn >= 4:
            links.append(edge('sales', group_node))
        rows = [row for row in sales if row['Revenue'] >= 100] if turn <= 2 else sales
        result = None if turn == 3 else table(group_node, GROUP_TYPES, group(rows))
    elif chain == 205:
        filename = 'sales.csv' if turn == 1 else 'sales-new.csv'
        sales = fixture(chain, 1 if turn == 1 else 2, filename, SALE_TYPES)
        nodes = ['sales'] if turn <= 3 else ['sales', 'sort']
        if turn == 4:
            links = [edge('sales', 'sort')]
            sales = sorted(sales, key=lambda row: row['Revenue'], reverse=True)
        result = table(nodes[-1], SALE_TYPES, sales, ordered=True)
        review['import_file'] = filename
    else:
        sales = fixture(chain, 1, 'sales.csv', SALE_TYPES)
        nodes = ['sales', 'js']
        if turn >= 2:
            links.append(edge('sales', 'js'))
        if turn <= 2:
            result = None
            review['script'] = 'unchanged'
        else:
            doubled = [{**row, 'DoubledRevenue': row['Revenue'] * 2} for row in sales]
            result = table('js', JS_TYPES, doubled)
            if turn >= 4:
                nodes.append('py')
                links.append(edge('js', 'py'))
                adjusted = [{**row, 'AdjustedRevenue': row['DoubledRevenue'] + 5}
                            for row in doubled]
                result = table('py', PY_TYPES, adjusted)
            if turn == 5:
                nodes.append('export')
                links.append(edge('py', 'export'))
                outputs.append(export_output(result, 'adjusted.csv'))
    if result is not None:
        review['table'] = result
    return dict(nodes=[selector(node) for node in nodes], outputs=outputs,
                graph=dict(nodes=[dict(id=graph_id(node), **selector(node)) for node in nodes],
                           links=links), g2_review=review)


def export_output(table_result, filename):
    return {**{key: table_result[key] for key in ('columns', 'rows', 'ordered', 'column_order')},
            'output_node_type': 'export_input', 'export_destination': '/' + filename}


def metadata(chain, turn):
    max_nodes = {
        201: [3, 1, 0, 0, 1],
        202: [2, 1, 0, 0],
        203: [3, 1, 0, 0],
        204: [3, 0, 0, 0, 0],
        205: [1, 0, 0, 1],
        206: [1, 0, 0, 1, 1],
    }
    folder = CASES / name(chain, turn)
    config = {}
    if turn > 1:
        config['base'] = name(chain, turn - 1)
        config['input_files'] = sorted(p.name for p in (folder / 'data').glob('*') if p.is_file())
    config['budget'] = dict(max_nodes=max_nodes[chain][turn - 1], max_errors=0,
                            forbid=['expected.json', 'oracle.py', 'g2_review', 'sqlite3', 'convert '])
    return config


def verify_workbook(path):
    from openpyxl import load_workbook

    review = expectation(201, 5)['g2_review']
    result = review['table']
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = review['workbook']['sheet']
        if sheet not in workbook.sheetnames:
            raise ValueError(f'Missing worksheet {sheet!r}')
        rows = iter(workbook[sheet].values)
        names = tuple(column['name'] for column in result['columns'])
        if next(rows, None) != names:
            raise ValueError(f'Unexpected header in worksheet {sheet!r}')
        actual = Counter(rows)
        wanted = Counter(tuple(row[name] for name in names) for row in result['rows'])
        if actual != wanted:
            raise ValueError(f'Unexpected workbook data. Missing {wanted - actual}. Extra {actual - wanted}.')
    finally:
        workbook.close()


def main(case=None):
    parser = argparse.ArgumentParser(description=__doc__)
    if case is None:
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument('--write', action='store_true', help='Update every generated contract')
        mode.add_argument('--check', action='store_true', help='Verify the committed contracts')
        mode.add_argument('--xlsx', type=Path, help='Check the downloaded g201 workbook')
    args = parser.parse_args()
    if case:
        chain, turn = case.removeprefix('bh-g').split('-t')
        print(render(expectation(int(chain), int(turn))), end='')
        return
    if args.xlsx:
        verify_workbook(args.xlsx)
        print('g201 workbook PASS')
        return
    count = 0
    for chain, depth in DEPTHS.items():
        for turn in range(1, depth + 1):
            folder = CASES / name(chain, turn)
            for filename, value in [('expected.json', expectation(chain, turn)),
                                    ('case.json', metadata(chain, turn))]:
                path = folder / filename
                encoded = render(value)
                if args.write:
                    path.write_text(encoded, encoding='utf-8')
                elif path.read_text(encoding='utf-8') != encoded:
                    parser.error(f'{path}: expectation differs from the fixtures')
            count += 1
    print(f'{count} G2 turns')


def render(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


if __name__ == '__main__':
    main()
