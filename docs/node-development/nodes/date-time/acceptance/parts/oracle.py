"""Independent civil-calendar expectations for date parts; never supplied to the model.

Python stdlib only. Day of year, quarter and milliseconds are convention-free.
The ordinary (non-ISO) Loginom week is NOT documented (help syntax.html: %W
"номер недели в году" only), so two hypotheses are encoded and the native
probe must pick one BEFORE any model run:
  h1 - weeks start on Monday, week 1 contains January 1;
  h2 - strftime %W: weeks start on Monday, days before the first Monday are week 0.
"""
import argparse
import csv
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEEK_CONVENTIONS = ['h1', 'h2']


def week(stamp, convention):
    if convention == 'h1':
        return (stamp.timetuple().tm_yday - 1 + datetime(stamp.year, 1, 1).weekday()) // 7 + 1
    return int(stamp.strftime('%W'))


def source():
    with (ROOT / 'data/parts.csv').open(encoding='utf-8', newline='') as stream:
        for raw in csv.DictReader(stream, delimiter=';'):
            value = raw['DateA']
            stamp = None if value == 'NULL' else datetime.fromisoformat(value)
            if stamp is not None and stamp.tzinfo is not None:
                raise ValueError('Civil datetime required')
            yield (int(raw['RowID']), stamp, None if raw['Keep'] == 'NULL' else raw['Keep'])


def table(parts, convention):
    names = ['RowID', 'DateA', 'Keep'] + [name for name, _ in parts]
    rows = []
    for row_id, stamp, keep in source():
        row = {'RowID': row_id, 'DateA': stamp.isoformat(timespec='milliseconds') if stamp else None, 'Keep': keep}
        for name, part in parts:
            row[name] = None if stamp is None else {
                'day_of_year': lambda s: s.timetuple().tm_yday,
                'quarter': lambda s: (s.month - 1) // 3 + 1,
                'millisecond': lambda s: s.microsecond // 1000,
                'week': lambda s: week(s, convention)}[part](stamp)
        rows.append(row)
    types = {'RowID': 'integer', 'DateA': 'datetime', 'Keep': 'string'}
    return {'package_path': '{{PACKAGE_PATH}}', 'null_marker': 'NULL',
            'nodes': [{'type': 'imports.text'}, {'type': 'transform.date_time'}],
            'outputs': [{'output_node_type': 'transform.date_time', 'output_port': 0,
                         'ordered': False, 'column_order': 'exact',
                         'columns': [{'name': n, 'type': types.get(n, 'integer'), 'label_any': True} for n in names],
                         'rows': rows}]}


def expected_files(convention):
    return {'expected.json': table([('A_DayOfYear', 'day_of_year'), ('A_Quarter', 'quarter'), ('A_Ms', 'millisecond')], convention),
            'expected-week.json': {**table([('A_Week', 'week')], convention), 'week_convention': convention}}


def self_check():
    """Fixture must discriminate the week hypotheses and cover boundaries."""
    stamps = [s for _, s, _ in source() if s]
    assert any(week(s, 'h1') != week(s, 'h2') for s in stamps), 'week hypotheses not discriminated'
    days = {s.timetuple().tm_yday for s in stamps}
    assert {1, 60, 365, 366} <= days, 'day-of-year boundaries'
    assert {0, 1, 10, 125, 500, 999} <= {s.microsecond // 1000 for s in stamps}, 'millisecond boundaries'
    assert {(s.month - 1) // 3 + 1 for s in stamps} == {1, 3, 4}, 'quarters'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--week-convention', choices=WEEK_CONVENTIONS, default='h1')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    self_check()
    files = {name: json.dumps(value, ensure_ascii=False, indent=2) + '\n' for name, value in expected_files(args.week_convention).items()}
    if args.write:
        for name, text in files.items():
            (ROOT / name).write_text(text, encoding='utf-8')
    elif args.check:
        stale = [name for name, text in files.items() if (ROOT / name).read_text(encoding='utf-8') != text]
        if stale:
            raise SystemExit('Stale date-part expectations: ' + ', '.join(stale))
        print('OK: independent date parts; week convention ' + args.week_convention + ' (NOT_CHECKED natively)')
    else:
        print(files['expected.json'], end='')
