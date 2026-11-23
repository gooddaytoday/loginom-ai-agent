#!/usr/bin/env python3
"""Stdlib-only feature transforms and Lloyd k-means, independent of Loginom.

Farthest-point deterministic initialization is used only for these separated
fixtures. Cluster labels are free bijections; linked means/distances are not.
No native output, native PRNG or production handler is imported.
"""
import csv
import json
import math
import sys
from pathlib import Path

METHODS = {'minus-one-one': 'scale_minus_one_one', 'zero-one': 'scale_zero_one',
           'absolute': 'absolute_scale'}


def kmeans(points):
    centers = [points[0]]
    while len(centers) < 3:
        centers.append(max(points, key=lambda p: min(math.dist(p, c) for c in centers)))
    previous = None
    for _ in range(100):
        labels = [min(range(3), key=lambda i: math.dist(p, centers[i])) for p in points]
        assert set(labels) == {0, 1, 2}
        if labels == previous:
            return labels, centers
        centers = [tuple(sum(p[j] for p, label in zip(points, labels) if label == i) / labels.count(i)
                         for j in range(2)) for i in range(3)]
        previous = labels
    raise AssertionError('Lloyd iterations did not converge')


def expected(kind):
    with (Path(__file__).parent / 'data/scaling.csv').open() as stream:
        source = [{k: int(v) if k == 'RowID' else float(v) for k, v in r.items()}
                  for r in csv.DictReader(stream)]
    def transform(r):
        result = []
        for k in ['X', 'Y']:
            values = [p[k] for p in source]
            low, high = min(values), max(values)
            result.append(r[k] / max(map(abs, values)) if kind == 'absolute' else
                          (r[k] - low) / (high - low) * (2 if kind == 'minus-one-one' else 1)
                          - (1 if kind == 'minus-one-one' else 0))
        return tuple(result)
    transformed = list(map(transform, source))
    labels, centers = kmeans(transformed)
    raw, _ = kmeans([(r['X'], r['Y']) for r in source])
    groups = lambda ls: sorted([sorted(r['RowID'] for r, label in zip(source, ls) if label == i)
                               for i in range(3)])
    assert groups(labels) != groups(raw)
    means = [{k: sum(r[k] for r, label in zip(source, labels) if label == i) / labels.count(i)
              for k in ['X', 'Y']} for i in range(3)]
    def column(name, kind):
        return dict(name=name, type=kind, label_any=True,
                    **({'category_labels_any': True} if name == 'Cluster' else {}),
                    **({'tolerance': {'abs': 1e-8, 'rel': 1e-10}} if kind == 'real' else {}))
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ['imports.text', 'datamining.clustering', 'exports.text', 'exports.text']],
            'clustering_normalized': {'version': 2, 'seed': 42, 'features': ['X', 'Y'], 'clusters': 3,
                                      'normalization': METHODS[kind], 'source': source,
                                      'groups': groups(labels), 'raw_groups': groups(raw),
                                      'transformed': transformed},
            'outputs': [
                {'output_node_type': 'datamining.clustering', 'output_port': 0,
                 'columns': [column('Cluster', 'integer'), column('Distance', 'real'),
                             column('X', 'real'), column('Y', 'real'), column('RowID', 'integer')],
                 'rows': [dict(r, Cluster=i, Distance=math.dist(p, centers[i]))
                          for r, p, i in zip(source, transformed, labels)]},
                {'output_node_type': 'datamining.clustering', 'output_port': 1,
                 'columns': [column('Cluster', 'integer'), column('X', 'real'), column('Y', 'real')],
                 'rows': [dict(Cluster=i, **mean) for i, mean in enumerate(means)]}]}


if __name__ == '__main__':
    print(json.dumps(expected(sys.argv[1]), ensure_ascii=False, indent=2))
