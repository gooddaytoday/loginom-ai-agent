"""Independent source sets and priority boundaries; no Loginom or PRNG."""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def expected():
    with (ROOT / 'fixtures/v040/rows.csv').open(newline='', encoding='utf-8') as stream:
        rows = [dict(RowID=int(r['RowID']), Class=r['Class'], Value=int(r['Value']))
                for r in csv.DictReader(stream)]
    assert len(rows) == 12 and [r['RowID'] for r in rows] == list(range(1, 13))
    assert all(r['Value'] == 10 * r['RowID'] for r in rows)
    return dict(status='proposal_not_stock_expected', node_type='preprocessing.data_partition',
                mode='uniform', seed=42, train_count=6, test_count=4,
                group_size_rows=dict(train=1, test=1), source=rows, ports=[0, 1, 2],
                columns=[dict(name=n, type=t, label_any=True) for n, t in
                         [('RowID', 'integer'), ('Class', 'string'), ('Value', 'integer')]],
                combined_extra_column=dict(name='IsTestSet', type='boolean', position=0),
                priority_proposal=dict(beginning=rows[:4], end=rows[-4:], algorithm=None),
                exact_train_rows=None,
                checks=['complete typed source membership; no duplicate RowID per subset',
                        'train and test are disjoint; train never uses priority test rows',
                        'combined is train then test with false/true IsTestSet',
                        'two identical executions and cold preserve settings and results',
                        'three CSVs equal full native outputs; Save and cleanup'],
                unresolved=['end/algorithm priority and cold repeat need confirmation'])


if __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: typed source, disjoint priority boundary proposals')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
