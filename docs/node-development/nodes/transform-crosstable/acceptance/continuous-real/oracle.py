"""Independent pivot oracle: parsed binary64 equality, never display rounding."""
import csv
import json
from pathlib import Path


def expected():
    groups = {}
    with (Path(__file__).parent / 'data/keys.csv').open() as source:
        for row in csv.DictReader(source):
            value = None if row['R'] == '?' else float(row['R'])
            # Equality groups both signed zeros; the representative sign is not
            # a separate group identity. Keep every nonzero binary64 exact.
            key = (0.0 if value == 0 else value, row['Segment'])
            category = groups.setdefault(key, {}).setdefault(row['Category'], [])
            category.append(float(row['Amount']))
    output = {
        'output_node_type': 'transform.cross_table',
        'output_port': 0,
        'ordered': True,
        'column_order': 'exact',
        'columns': [
            {'name': 'R', 'label': 'R', 'type': 'real'},
            {'name': 'Segment', 'label': 'Segment', 'type': 'string'},
            *[{'name': f'C_{index}_Amount_{function}', 'label_any': True,
               'type': 'real' if function == 'Sum' else 'integer'}
              for index in [1, 2] for function in ['Sum', 'Count']],
        ],
        'rows': [list(key) + [value
                 for category in ['A', 'B']
                 for value in ([sum(categories[category]), len(categories[category])]
                               if category in categories else [None, None])]
                 for key, categories in sorted(groups.items(), key=lambda item:
                     (item[0][0] is not None, item[0][0] or 0, item[0][1]))],
    }
    output['rows'] = [dict(zip([c['name'] for c in output['columns']], row))
                      for row in output['rows']]
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': name} for name in
                      ['imports.text', 'transform.cross_table', 'exports.text']],
            'null_marker': '?', 'outputs': [output]}


if __name__ == '__main__':
    print(json.dumps(expected(), ensure_ascii=False, indent=2))
