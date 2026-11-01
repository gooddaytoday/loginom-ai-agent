"""Independent Binning proposal: exact Decimal arithmetic, Python stdlib only.

Generate expected before model runs. No Loginom/runtime imports or observed
output inputs. UI discovery fixes native naming, interval conventions and types;
the numbers below come only from authored CSV and mathematical partition rules.
Frequency cases deliberately use six non-NULL observations and three bins.
"""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = ('count', 'width', 'real', 'integer', 'frequency', 'frequency-ties',
         'apply', 'retrain', 'holdout')


def source(name):
    with (ROOT / 'fixtures' / name).open(newline='', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == ['RowID', 'X', 'Note']
        rows = [dict(RowID=int(row['RowID']),
                     X=None if row['X'] == '?' else Decimal(row['X']),
                     Note=None if row['Note'] == '?' else row['Note']) for row in reader]
    assert len({row['RowID'] for row in rows}) == len(rows)
    return rows


def linear_bins(lower, upper, count):
    assert lower < upper and count > 0
    width = (upper - lower) / count
    return [(lower + i * width, lower + (i + 1) * width, i == 0, True)
            for i in range(count)]


def frequency_bins(rows, count):
    values = sorted(row['X'] for row in rows if row['X'] is not None)
    assert values and len(values) % count == 0, 'Proposal fixtures use exact equal groups'
    # The first observation of each later group is the next lower boundary.
    # Duplicates at this boundary all enter that next interval.
    cuts = [values[len(values) * i // count] for i in range(count)] + [values[-1]]
    assert all(a < b for a, b in zip(cuts, cuts[1:])), 'Collapsed/point intervals are a later slice'
    return [(a, b, True, i == count - 1) for i, (a, b) in enumerate(zip(cuts, cuts[1:]))]


def assign(value, intervals):
    if value is None:
        return None
    matches = [i for i, (lo, hi, inc_lo, inc_hi) in enumerate(intervals)
               if (value > lo or inc_lo and value == lo)
               and (value < hi or inc_hi and value == hi)]
    assert len(matches) <= 1
    return matches[0] if matches else None


def decimal_text(value):
    return format(value, 'f').rstrip('0').rstrip('.') if value % 1 else str(int(value))


def label(interval):
    lo, hi, inc_lo, inc_hi = interval
    return ('[' if inc_lo else '(') + decimal_text(lo) + '..' + decimal_text(hi) + (']' if inc_hi else ')')


def expected(case='count', package_path='{{PACKAGE_PATH}}'):
    assert case in CASES
    filename = {'width': 'real.csv', 'real': 'real.csv', 'frequency': 'frequency.csv',
                'frequency-ties': 'frequency-ties.csv', 'apply': 'update.csv',
                'retrain': 'update.csv', 'holdout': 'holdout.csv'}.get(case, 'values.csv')
    rows = source(filename)
    numeric = 'integer' if case == 'integer' else 'real'
    assert numeric != 'integer' or all(row['X'] is None or row['X'] % 1 == 0 for row in rows)
    number = int if numeric == 'integer' else float
    if case in ('frequency', 'frequency-ties', 'retrain'):
        intervals = frequency_bins(rows, 3)
    elif case == 'apply':
        intervals = frequency_bins(source('frequency.csv'), 3)
    else:
        # width=10 and count=2 are intentionally independent equivalent inputs.
        count = int((Decimal(20) - Decimal(0)) / Decimal(10)) if case == 'width' else 2
        intervals = linear_bins(Decimal(0), Decimal(20), count)
    computed = []
    for row in rows:
        x, i = row['X'], assign(row['X'], intervals)
        bound = intervals[i] if i is not None else None
        outside = None if x is None else -1 if x < intervals[0][0] else 1 if x > intervals[-1][1] else 0
        computed.append(dict(RowID=row['RowID'], X=None if x is None else number(x),
                             X_BinsID='X', X_Number=i, X_Label=None if bound is None else label(bound),
                             X_LowBound=None if bound is None else number(bound[0]),
                             X_UppBound=None if bound is None else number(bound[1]),
                             X_LowBoundIncl=None if bound is None else bound[2],
                             X_UppBoundIncl=None if bound is None else bound[3],
                             X_LowLimOpen=False, X_UppLimOpen=False, X_OutOfBins=outside, Note=row['Note']))
    ranges = [dict(BinsID='X', BoundsDataType=4 if numeric == 'integer' else 3, Number=i,
                   LowBound=number(lo), UppBound=number(hi), Label=label(intervals[i]),
                   LowBoundQuota=float(inc_lo), UppBoundQuota=float(inc_hi), BinQuota=None,
                   LowDev=number(lo), UppDev=number(hi), LowLimitOpen=False, UppLimitOpen=False)
              for i, (lo, hi, inc_lo, inc_hi) in enumerate(intervals)]
    columns = [('RowID', 'integer'), ('X', numeric), ('X_BinsID', 'string'), ('X_Number', 'integer'),
               ('X_Label', 'string'), ('X_LowBound', numeric), ('X_UppBound', numeric),
               ('X_LowBoundIncl', 'boolean'), ('X_UppBoundIncl', 'boolean'),
               ('X_LowLimOpen', 'boolean'), ('X_UppLimOpen', 'boolean'),
               ('X_OutOfBins', 'integer'), ('Note', 'string')]
    range_columns = [('BinsID', 'string'), ('BoundsDataType', 'integer'), ('Number', 'integer'),
                     ('LowBound', numeric), ('UppBound', numeric), ('Label', 'string'),
                     ('LowBoundQuota', 'real'), ('UppBoundQuota', 'real'), ('BinQuota', 'real'),
                     ('LowDev', numeric), ('UppDev', numeric),
                     ('LowLimitOpen', 'boolean'), ('UppLimitOpen', 'boolean')]

    def output(port, schema, data):
        return dict(output_node_type='preprocessing.binning', output_port=port,
                    ordered=True, column_order='exact',
                    columns=[dict(name=name, type=kind, label_any=True,
                                  **({'tolerance': {'abs': 1e-12, 'rel': 1e-12}} if kind == 'real' else {}))
                             for name, kind in schema], rows=data)
    return dict(package_path=package_path, nodes=[{'type': 'imports.text'}, {'type': 'preprocessing.binning'}],
                outputs=[output(0, columns, computed), output(1, range_columns, ranges)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=CASES, default='count')
    parser.add_argument('--package-path', default='{{PACKAGE_PATH}}')
    args = parser.parse_args()
    print(json.dumps(expected(args.case, args.package_path), ensure_ascii=False, indent=2))
