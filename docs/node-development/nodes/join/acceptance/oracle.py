"""Independent relational oracle over pinned CSV bytes; no Loginom imports.

Print stock cold-check expectations, or --check the committed expectations.
Only task.md and data/ are model inputs. This file and expected.json are private.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / 'fixtures' / 'modes'
MODES = ('right', 'full', 'difference')


def source(name):
    manifest = json.loads((FIXTURES / 'manifest.json').read_text(encoding='utf-8'))
    item = next(f for f in manifest['files'] if f['name'] == name)
    raw = (FIXTURES / name).read_bytes()
    if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
        raise ValueError('Fixture bytes changed: ' + name)
    records = list(csv.reader(io.StringIO(raw.decode('utf-8')), delimiter=';', strict=True))
    names, rows = records[0], records[1:]
    if names != [c['name'] for c in item['columns']] or len(rows) != item['rows']:
        raise ValueError('Fixture schema/count changed: ' + name)
    if any(len(r) != len(names) or any(v == '' or v == 'NULL' for v in r) for r in rows):
        raise ValueError('This bounded fixture requires nonempty string cells')
    return names, rows


def expected(mode, package='{{PACKAGE_PATH}}', include_keys=True, case_sensitive=True):
    if mode not in MODES:
        raise ValueError('Unknown mode')
    ln, left = source('left.csv')
    rn, right = source('right.csv')
    # Fixture columns 0 and 1 are the full composite key. IDs are row positions:
    # duplicate key values must never collapse matching rows.
    key = lambda row: tuple(v if case_sensitive else v.casefold() for v in row[:2])
    pairs = [(i, j) for i, l in enumerate(left) for j, r in enumerate(right) if key(l) == key(r)]
    left_hit, right_hit = {i for i, _ in pairs}, {j for _, j in pairs}
    selected = pairs if mode != 'difference' else []
    if mode in ('full', 'difference'):
        selected += [(i, None) for i in range(len(left)) if i not in left_hit]
    if mode in ('right', 'full'):
        selected += [(None, j) for j in range(len(right)) if j not in right_hit]
    right_indices = [] if mode == 'difference' else list(range(3)) if include_keys else [2]
    names = ln + [rn[k] for k in right_indices]
    rows = []
    for i, j in selected:
        values = (left[i] if i is not None else [None] * len(ln))
        values = values + [right[j][k] if j is not None else None for k in right_indices]
        rows.append(dict(zip(names, values)))
    return {
        'package_path': package,
        'nodes': [{'type': 'imports.text'}, {'type': 'imports.text'},
                  {'type': 'transform.join_data'}, {'type': 'exports.text'}],
        'outputs': [{
            'output_node_type': 'export_input', 'export_destination': '/' + mode + '-result.csv',
            'ordered': False, 'column_order': 'any',
            'columns': [{'name': n, 'type': 'string', 'label_any': True} for n in names],
            'rows': rows,
        }],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=MODES)
    parser.add_argument('--package', default='{{PACKAGE_PATH}}')
    parser.add_argument('--without-joined-keys', action='store_true')
    parser.add_argument('--ignore-case', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    mode = args.mode or (Path(__file__).absolute().parent.name
                         if Path(__file__).absolute().parent.name in MODES else None)
    if args.check:
        for case in MODES:
            actual = json.loads((ROOT / case / 'expected.json').read_text(encoding='utf-8'))
            if actual != expected(case, include_keys=case != 'difference'):
                raise ValueError('Committed expected differs: ' + case)
        print('PASS: pinned inputs and independent expectations for right/full/difference')
        return
    if mode is None:
        parser.error('--mode is required outside a case directory')
    print(json.dumps(expected(mode, args.package, not args.without_joined_keys,
                              not args.ignore_case), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
