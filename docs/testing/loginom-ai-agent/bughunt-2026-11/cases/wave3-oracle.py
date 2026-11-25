"""Compute wave 3 expectations with the standard library and the input fixtures."""
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
VARIABLES = ('variables', 'variables.user', 'Переменные сценария')
SOURCE = ('sales', 'imports.text', 'sales.csv')
SORT = ('sort', 'transform.sorting', 'Сортировка')
FILTER = ('filter', 'transform.filter_data', 'Фильтр строк')
GROUP = ('group', 'transform.group_data', 'Группировка')
TOTAL = ('group', 'transform.group_data', 'Итоги')
EXCEL = ('excel', 'exports.excel', None)
SALES_COLUMNS = [('Region', 'string'), ('Revenue', 'integer')]
TOTAL_COLUMNS = [('Region', 'string'), ('Total', 'integer')]


def expected(chain, turn):
    with (ROOT / f'bh-w3{chain:02}-t1/data/sales.csv').open(encoding='utf-8', newline='') as source:
        sales = [dict(row, Revenue=int(row['Revenue'])) for row in csv.DictReader(source)]
    totals = defaultdict(int)
    for sale in sales:
        totals[sale['Region']] += sale['Revenue']
    groups = [dict(Region=region, Total=total) for region, total in sorted(totals.items())]
    sorted_sales = sorted(sales, key=lambda row: row['Revenue'], reverse=True)

    def graph(nodes=(), edges=(), retain=()):
        return dict(
            nodes=[dict(id=tag, type=kind, **({'label': label} if label is not None else {}))
                   for tag, kind, label in (VARIABLES, SOURCE, *nodes)],
            links=[dict(source=source, target=target, output=0, input=0) for source, target in edges],
            exact=True, **({'retain': list(retain)} if retain else {}))

    def output(node, rows, columns=SALES_COLUMNS, port=0):
        return dict(output_node_type=node[1], output_node_label=node[2], output_port=port,
                    columns=[dict(name=name, type=kind) for name, kind in columns],
                    column_order='exact', ordered=True, rows=rows)

    if turn == 1:
        return dict(graph=graph(), outputs=[output(SOURCE, sales)])
    retain = ('variables', 'sales')
    by_sort = (('sales', 'sort'),)
    by_filter = (('sales', 'filter'),)
    by_group = (('sales', 'group'),)
    if chain == 1:
        return dict(graph=graph((SORT,), by_sort, (*retain, 'sort')), outputs=[output(SORT, sorted_sales)])
    if chain == 2:
        if turn == 2:
            return dict(graph=graph((GROUP,), by_group, retain), outputs=[output(GROUP, groups, TOTAL_COLUMNS)])
        nodes = (TOTAL, EXCEL, SORT) if turn == 4 else (TOTAL, EXCEL)
        retain = (*retain, 'group', 'excel', 'sort') if turn == 4 else (*retain, 'group')
        result = dict(graph=graph(nodes, (*by_group, ('group', 'excel')), retain),
                      outputs=[output(TOTAL, groups, TOTAL_COLUMNS)])
        if turn == 3:
            result['excel_artifact'] = dict(filename='region-totals.xlsx', sheet_name='По регионам', header='names')
        return result
    if chain == 3:
        threshold = 100 if turn == 2 else 200
        other = turn == 4
        rows = [sale for sale in sales if (sale['Revenue'] > threshold) != other]
        return dict(graph=graph((FILTER,), by_filter, (*retain, 'filter')), outputs=[output(FILTER, rows, port=int(other))])
    if turn == 2:
        return dict(graph=graph((SORT, FILTER), by_filter, (*retain, 'sort')),
                    outputs=[output(FILTER, [sale for sale in sales if sale['Revenue'] > 100])])
    if turn == 3:
        return dict(graph=graph((SORT, FILTER), (*by_sort, *by_filter), (*retain, 'sort', 'filter')),
                    outputs=[output(SORT, sorted_sales)])
    return dict(graph=graph((SORT,), by_sort, (*retain, 'sort')), outputs=[output(SORT, sorted_sales)])


def main(case):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    chain, turn = case.name.removeprefix('bh-w3').split('-t')
    result = expected(int(chain), int(turn))
    if args.check:
        assert json.loads((case / 'expected.json').read_text(encoding='utf-8')) == result, case.name
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    for case in sorted(ROOT.glob('bh-w3??-t?')):
        main(case)
