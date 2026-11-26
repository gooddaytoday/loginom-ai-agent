#!/usr/bin/env python3
"""Materialize the small interruption fixtures and independent CSV oracle."""
import argparse
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
CASES = HERE.parent / 'cases'
FILTER = 'transform.filter_data'
SORT = 'transform.sorting'
IMPORT = 'imports.text'
DATA = 'Revenue\n75\n290\n100\n195\n410\n200\n'
ORACLE = """import csv
import json
from pathlib import Path

case = Path(__file__).resolve().parent
expected = json.loads((case / 'expected.json').read_text())
for output in expected['outputs']:
    declaration = case / 'intervention.json'
    intervention = json.loads(declaration.read_text()) if declaration.is_file() else {}
    threshold = intervention.get('edit', {}).get('value', 100)
    seed = 'bh-x06-t1' if case.name.startswith('bh-x06') else 'bh-x00-t1'
    with (case.parent / seed / 'data/sales.csv').open(newline='') as file:
        values = [int(row['Revenue']) for row in csv.DictReader(file)]
    output['rows'] = [{'Revenue': value} for value in values if value > threshold]
print(json.dumps(expected, ensure_ascii=False))
"""


def graph(*nodes, links=(), retain=()):
    result = dict(nodes=[dict(id=key, type=kind) for key, kind in nodes],
                  links=[dict(source=source, target=target, output=0, input=0) for source, target in links])
    if retain:
        result['retain'] = list(retain)
    return result


def contracts():
    sales = ('sales', IMPORT)
    row_filter = ('filter', FILTER)
    sorting = ('sort', SORT)
    input_graph = graph(sales)
    filter_graph = graph(sales, row_filter, links=(('sales', 'filter'),), retain=('sales',))
    seed = 'Импортируй приложенный sales.csv. Первая строка содержит имя столбца Revenue, его тип — целый.'
    add_filter = 'Добавь после импорта «Фильтр строк», оставь строки с Revenue > 100. Настрой фильтр и запусти его.'
    final = 'Продолжи. Проверь настройку фильтра, выполни его и покажи все подходящие строки.'
    yield 'bh-x00-t1', seed, input_graph, dict(budget=dict(max_nodes=1)), None
    yield 'bh-x00-t2', add_filter, filter_graph, dict(base='bh-x00-t1', budget=dict(max_nodes=1)), None
    show_filter = add_filter + ' Покажи подходящие строки.'
    yield 'bh-x03-t2', show_filter, filter_graph, dict(
        base='bh-x00-t1', output_mode='ports', budget=dict(max_nodes=1),
        manual_edit=dict(kind='move', node=dict(type=FILTER), position=dict(x=480, y=224))), 100
    yield 'bh-x06-t1', seed, input_graph, dict(
        budget=dict(max_nodes=1), manual_edit=dict(kind='create', type=SORT)), None
    yield ('bh-x06-t2', show_filter,
           graph(sales, row_filter, sorting, links=(('sales', 'filter'),), retain=('sales', 'sort')),
           dict(base='bh-x06-t1', output_mode='ports', budget=dict(max_nodes=1),
                manual_edit=dict(kind='connect', source=dict(type=FILTER), target=dict(type=SORT),
                                 output=0, input=0)), 100)
    # The unconnected sort is present before the user's gesture.
    final_sort = graph(sales, row_filter, sorting, links=(('sales', 'filter'), ('filter', 'sort')),
                       retain=('sales', 'filter', 'sort'))
    browser_gestures = {1: 'close-wizard', 2: 'reload', 4: 'switch-tab', 5: 'kill-cli', 7: 'foreign-dialog'}
    manual_threshold = dict(kind='filter_threshold', node=dict(type=FILTER), field='Revenue', value=200)
    for number in range(1, 8):
        name = f'bh-x{number:02d}'
        case_graph = filter_graph
        task = final
        base = 'bh-x00-t2'
        if number == 3:
            base = 'bh-x03-t2'
            case_graph = {**filter_graph, 'retain': ['sales', 'filter']}
        if number == 6:
            base = 'bh-x06-t2'
            case_graph = final_sort
            task = 'Продолжи. Запусти фильтр с текущим условием и покажи все подходящие строки. Сохрани внесённые вручную настройки и связи.'
        if number in (3, 6):
            case_graph = {**case_graph, 'exact': True, 'nodes': [
                *case_graph['nodes'], dict(id='variables', type='variables.user')
            ]}
        config = dict(base=base, output_mode='ports', budget=dict(max_nodes=int(number not in (3, 6))))
        if number in browser_gestures:
            config['intervention'] = dict(turn=base, kind=browser_gestures[number])
        if number == 6:
            config['intervention'] = dict(turn=base, kind='manual-edit', edit=manual_threshold)
        yield name, task, case_graph, config, manual_threshold['value'] if number == 6 else 100


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=CASES)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()

    def materialize(path, content):
        if args.check:
            assert path.read_text() == content, f'{path} differs from the oracle fixture'
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)

    def dump(value):
        return json.dumps(value, ensure_ascii=False, indent=2) + '\n'

    for seed in ('bh-x00-t1', 'bh-x06-t1'):
        materialize(args.out / seed / 'data/sales.csv', DATA)
    rows = [int(value) for value in DATA.splitlines()[1:]]
    for name, prompt, graph, config, threshold in contracts():
        case = args.out / name
        outputs = []
        if threshold is not None:
            outputs.append(dict(output_node_type=FILTER, output_port=0, ordered=True,
                                columns=[dict(name='Revenue', type='integer')],
                                rows=[dict(Revenue=value) for value in rows if value > threshold]))
        expected = dict(nodes=[dict(type=node['type']) for node in graph['nodes']], graph=graph, outputs=outputs)
        materialize(case / 'task.md', prompt + '\n')
        if intervention := config.pop('intervention', None):
            materialize(case / 'intervention.json', dump(intervention))
        materialize(case / 'case.json', dump(config))
        materialize(case / 'expected.json', dump(expected))
        materialize(case / 'oracle.py', ORACLE)


if __name__ == '__main__':
    main()
