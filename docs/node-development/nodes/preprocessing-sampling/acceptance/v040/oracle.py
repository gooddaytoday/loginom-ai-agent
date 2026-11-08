"""Proposal based solely on the CSV; does not reproduce a native PRNG."""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def expected():
    with (ROOT / 'fixtures/v040/rows.csv').open(newline='', encoding='utf-8') as stream:
        rows = [dict(RowID=int(r['RowID']), Class=r['Class'], Value=int(r['Value']))
                for r in csv.DictReader(stream)]
    assert len(rows) == 12 and len({r['RowID'] for r in rows}) == 12
    assert all(r['Value'] == 10 * r['RowID'] for r in rows)
    return dict(status='proposal_not_stock_expected', node_type='preprocessing.sampling',
                mode='uniform', seed=42, count=6, group_size_rows=1,
                columns=[dict(name=n, type=t, label_any=True) for n, t in
                         [('RowID', 'integer'), ('Class', 'string'), ('Value', 'integer')]],
                source=rows, ports=[0], exact_selected_rows=None,
                checks=['every complete output row belongs to source', 'no duplicate RowID',
                        'two executions match with the same source, seed and group size',
                        'saved uniform method and group size survive cold reopen',
                        'CSV equals full native output; Save and cleanup'],
                unresolved=['uniform interval guarantees and cold repeat need confirmation'])


if __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: source membership proposal and typed fixture')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
