"""Proposed scalar aggregate cases; CSV + existing independent Python oracle.

No Loginom/runtime imports or captured output. Only task and CSV reach the model.
--check regenerates all expectations in memory and detects stale files.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cross_scalar_oracle', ROOT / 'acceptance/stage2/oracle.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
SUFFIXES = dict(zip(oracle.FUNCTIONS, ['Sum', 'Count', 'Min', 'Max', 'Avg', 'StdDev',
                                     'SumSq', 'UniqueCount', 'NullCount', 'First', 'Last']))
COUNT = {'count', 'unique_count', 'null_count'}


def result_type(field, function):
    if function in COUNT:
        return 'integer'
    if function in {'sum', 'stddev', 'sum_squares'}:
        return 'real'
    if function == 'avg':
        return 'datetime' if oracle.TYPES[field] == 'datetime' else 'real'
    return oracle.TYPES[field]


def report(rows, field, functions, label, categories=(None,)):
    columns = [dict(name='Region', type='string', label_any=True)]
    for index, category in enumerate(categories, 1):
        for function in functions:
            name = (f'C_{index}_' if category is not None else '') + field + '_' + SUFFIXES[function]
            kind = result_type(field, function)
            columns.append(dict(name=name, type=kind, label_any=True,
                                **({'tolerance': {'abs': 0, 'rel': 0}} if kind == 'real' else {})))
    result = []
    for key in sorted({r['Region'] for r in rows}, key=lambda v: (v is not None, v or '')):
        values = [key]
        for category in categories:
            group = [r[field] for r in rows if r['Region'] == key
                     and (category is None or r['Category'] == category)]
            for function in functions:
                value = oracle.aggregate(group, function)
                if value is not None and result_type(field, function) == 'datetime':
                    value = value.isoformat(timespec='milliseconds')
                values.append(value)
        result.append(dict(zip([c['name'] for c in columns], values)))
    return dict(output_node_type='transform.cross_table', output_node_label=label,
                output_port=0, ordered=False, column_order='exact', columns=columns, rows=result)


def proposals():
    rows = oracle.read(ROOT / 'fixtures/aggregate-values.csv')
    numeric = [report(rows, field, functions, f'{field} {part}')
               for field in ['Amount', 'Units']
               for part, functions in enumerate([oracle.FUNCTIONS[:6], oracle.FUNCTIONS[6:]], 1)]
    scalar = [f for f in oracle.FUNCTIONS if f not in {'sum', 'avg', 'stddev', 'sum_squares'}]
    dates = [f for f in oracle.FUNCTIONS if f not in {'sum', 'sum_squares'}]
    cases = {'numeric': numeric,
             'scalar': [report(rows, field, scalar, label) for field, label in [('Text', 'Текст'), ('Flag', 'Логика')]],
             'datetime': [report(rows, 'When', functions, f'Даты {part}')
                          for part, functions in enumerate([dates[:5], dates[5:]], 1)],
             'null-cells': [report(rows, 'Amount', ['sum', 'count', 'null_count'], 'Пустые пересечения', ['A', 'B'])]}
    assert sum(map(len, cases.values())) == 9
    assert all(len(o['columns']) <= 8 and len(o['rows']) == 2 for outputs in cases.values() for o in outputs)
    # Distinguish no observations from an observed all-NULL group before serializing.
    assert oracle.aggregate([], 'count') is None
    assert oracle.aggregate([None], 'count') == 1
    return {name: dict(package_path='{{PACKAGE_PATH}}', null_marker='?',
                       nodes=[dict(type=t) for t in ['imports.text', 'transform.cross_table', 'exports.text']],
                       outputs=outputs) for name, outputs in cases.items()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, expected in proposals().items():
        text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        path = Path(__file__).with_name(f'expected-{name}.json')
        if args.write:
            path.write_text(text, encoding='utf-8')
        else:
            assert path.read_text(encoding='utf-8') == text, path
    print('OK: 4 proposals / 9 complete scalar tables, each within 50 x 8')
