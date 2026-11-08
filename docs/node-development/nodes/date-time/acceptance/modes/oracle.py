"""Proposed numeric date/time string formats, Python stdlib, no Loginom output.

Numeric markers avoid native locale names and platform-specific strftime flags.
No string parsing/time-zone conversion is attributed to Date/time node.
--write generates expected.json; --check verifies it against fixture bytes.
"""
import argparse
import csv
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TYPES = dict(RowID='integer', DateA='datetime', DateB='datetime', Raw='string', Keep='string',
             A_Year='string', A_Date='string', A_Time='string', A_Stamp='string', B_Markers='string')


def markers(stamp):
    return {'%Y': f'{stamp.year:04}', '%Q': str((stamp.month - 1) // 3 + 1),
            '%m': f'{stamp.month:02}', '%d': f'{stamp.day:02}', '%H': f'{stamp.hour:02}',
            '%i': f'{stamp.minute:02}', '%s': f'{stamp.second:02}', '%u': f'{stamp.microsecond // 1000:03}'}


def render(raw, template):
    if raw is None:
        return None
    tokens = markers(datetime.fromisoformat(raw))
    for token, value in tokens.items():
        template = template.replace(token, value)
    assert '%' not in template
    return template


def expected():
    rows = []
    with (ROOT / 'fixtures/formats.csv').open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        assert reader.fieldnames == list(TYPES)[:5]
        for source in reader:
            row = {n: None if v == 'NULL' else int(v) if n == 'RowID' else v for n, v in source.items()}
            for name in ['DateA', 'DateB']:
                if row[name] is not None:
                    stamp = datetime.fromisoformat(row[name])
                    assert stamp.tzinfo is None
                    row[name] = stamp.isoformat(timespec='milliseconds')
            for name, source_name, template in [
                ('A_Year', 'DateA', '%Y'), ('A_Date', 'DateA', '%Y-%m-%d'),
                ('A_Time', 'DateA', '%H:%i:%s'), ('A_Stamp', 'DateA', '%Y-%m-%d %H:%i:%s.%u'),
                ('B_Markers', 'DateB', '%Y|%Q|%m|%d|%H|%i|%s|%u')]:
                row[name] = render(row[source_name], template)
            rows.append(row)
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ['imports.text', 'transform.date_time', 'exports.text']],
            'outputs': [{'output_node_type': 'transform.date_time', 'output_node_label': 'Строковые представления',
                         'output_port': 0, 'ordered': True, 'column_order': 'exact',
                         'columns': [dict(name=n, type=t, label_any=True) for n, t in TYPES.items()], 'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = json.dumps(expected(), ensure_ascii=False, indent=2) + '\n'
    path = Path(__file__).parent / 'expected.json'
    if args.write:
        path.write_text(text, encoding='utf-8')
    elif args.check:
        assert path.read_text(encoding='utf-8') == text, path
        print('OK: independent civil date/time string proposal, 4 rows')
    else:
        print(text, end='')
