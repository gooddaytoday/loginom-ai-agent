#!/usr/bin/env python3
"""Independent geometric invariants, not an emulation of Loginom's PRNG.

Source groups are the three separated corners after sample-SD scaling.
Cluster numbers are free bijections. Distances and original-unit centroids
come exclusively from source arithmetic, never from Loginom output.
"""
import csv
import json
import math
import statistics
from pathlib import Path


def expected():
    with (Path(__file__).parent / 'data/normalized.csv').open() as stream:
        source = [{k: int(v) if k == 'RowID' else float(v) for k, v in row.items()}
                  for row in csv.DictReader(stream)]
    groups = [[r for r in source if r['Y'] > 10000],
              [r for r in source if r['X'] > 10],
              [r for r in source if r['X'] < 10 and r['Y'] < 10000]]
    assert len(source) == 12 and all(len(g) == 4 for g in groups)
    sd = {k: statistics.stdev(r[k] for r in source) for k in ['X', 'Y']}
    centers = [{k: statistics.mean(r[k] for r in group) for k in ['X', 'Y']} for group in groups]
    rows = [dict(r, Cluster=i, Distance=math.sqrt(sum(((r[k] - centers[i][k]) / sd[k]) ** 2
                                                    for k in ['X', 'Y'])))
            for i, group in enumerate(groups) for r in group]
    def column(name, kind):
        return dict(name=name, type=kind, label_any=True,
                    **({'category_labels_any': True} if name == 'Cluster' else {}),
                    **({'tolerance': {'abs': 1e-6, 'rel': 0}} if kind == 'real' else {}))
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ['imports.text', 'datamining.clustering', 'exports.text', 'exports.text']],
            'clustering_normalized': {'version': 1, 'seed': 42, 'features': ['X', 'Y'], 'clusters': 3,
                                      'normalization': 'standardize', 'source': source,
                                      'groups': [[r['RowID'] for r in g] for g in groups],
                                      'raw_groups': [[1, 3, 5, 7], [2, 4, 6, 8], [9, 10, 11, 12]]},
            'outputs': [
                {'output_node_type': 'datamining.clustering', 'output_port': 0,
                 'columns': [column('Cluster', 'integer'), column('Distance', 'real'),
                             column('X', 'real'), column('Y', 'real'), column('RowID', 'integer')],
                 'rows': sorted(rows, key=lambda r: r['RowID'])},
                {'output_node_type': 'datamining.clustering', 'output_port': 1,
                 'columns': [column('Cluster', 'integer'), column('X', 'real'), column('Y', 'real')],
                 'rows': [dict(Cluster=i, **center) for i, center in enumerate(centers)]}]}


if __name__ == '__main__':
    print(json.dumps(expected(), ensure_ascii=False, indent=2))
