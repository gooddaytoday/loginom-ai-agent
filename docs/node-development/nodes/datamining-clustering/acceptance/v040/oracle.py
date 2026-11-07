"""Analytic separated groups and holdout; no native model or cluster numbering."""
import csv
import json
import math
import sys
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]


def rows(name):
    with (ROOT / 'fixtures/v040' / name).open(newline='', encoding='utf-8') as stream:
        return [dict(RowID=int(r['RowID']), X=float(r['X']), Y=float(r['Y']), Category=r['Category'])
                for r in csv.DictReader(stream)]


def expected():
    train, holdout = rows('train.csv'), rows('holdout.csv')
    centers = {c: [mean(r[k] for r in train if r['Category'] == c) for k in ('X', 'Y')]
               for c in sorted({r['Category'] for r in train})}
    assert centers == dict(A=[2, 2], B=[20, 2], C=[2, 20])
    assigned = []
    for row in holdout:
        c = min(centers, key=lambda c: math.dist([row['X'], row['Y']], centers[c]))
        assigned.append(dict(RowID=row['RowID'], center=centers[c],
                             distance=math.dist([row['X'], row['Y']], centers[c])))
    assert [r['distance'] for r in assigned] == [2, 2, 2, 80]
    return dict(status='proposal_not_stock_expected', cluster_ids='unbound labels, not ranks',
                numeric_features=['X', 'Y'], retained_fields=['RowID', 'Category'], seed=42,
                separated_centers=centers, training_distance=math.sqrt(2), raw_holdout=assigned,
                tolerance=dict(abs=1e-8, rel=1e-8),
                g_means=dict(min_clusters=2, max_clusters=4, threshold=1,
                             exact_cluster_count=None, checks=['count within configured bounds',
                             'each input row exactly once', 'centers are means of assigned features',
                             'distance independently recomputed from assigned center']),
                apply=dict(retrain=False, expected_centers='unchanged saved training centers',
                           sensitivity='holdout includes X=100, so retraining changes center B'),
                unresolved=['g-means output not observed', 'manual range and control not observed',
                            'ratio normalizer absent in continuous and discrete UI; blocked',
                            'saved-model apply and native column ordering not observed'])


if __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: analytic means, distances and holdout sensitivity')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
