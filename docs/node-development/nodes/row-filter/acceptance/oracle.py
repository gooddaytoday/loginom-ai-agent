"""CLI expectations from fixture bytes; never imports the Loginom runtime."""
import argparse
import hashlib
import json
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[4]
sys.path.insert(0, str(REPO / 'packages/loginom-runtime/tools/loginom-acceptance'))
from row_filter_oracle import load_rows, partition, assert_partition
from filter_goal_contract import INITIAL_GROUPS, FINAL_GROUPS, COLUMNS
from row_filter_matrix import cases


def expectations(package_path):
    source = ROOT / 'data/golden.csv'
    manifest = json.loads((ROOT / 'manifest.json').read_text())['fixtures'][0]
    if hashlib.sha256(source.read_bytes()).hexdigest() != manifest['sha256']:
        raise ValueError('fixture bytes changed')
    rows = load_rows(source)
    columns = [{k: c[k] for k in ('name', 'label', 'type')} for c in COLUMNS]

    def value(v):
        if isinstance(v, datetime):
            return v.isoformat(timespec='milliseconds')
        if isinstance(v, Decimal):
            return float(v)
        return v

    phases = {}
    for phase, groups in [('initial', INITIAL_GROUPS), ('final', FINAL_GROUPS)]:
        ports = partition(rows, groups)
        assert_partition(rows, ports)
        phases[phase] = {'groups': groups, 'ports': [
            {'port': i, 'rows': [{k: value(v) for k, v in row.items()} for row in port]}
            for i, port in enumerate(ports)]}
    cold = {'package_path': package_path,
            'nodes': [{'type': 'imports.text'}, {'type': 'transform.filter_data'}],
            'outputs': [{'output_node_type': 'transform.filter_data',
                         'output_node_label': 'Отбор', 'columns': columns,
                         'rows': phases['final']['ports'][0]['rows']}]}
    return cold, {'columns': columns, 'phases': phases, 'matrix': cases(),
                  'live_matrix_status': 'not_checked',
                  'port_1_cold_audit_status': 'not_checked'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cold, audit = expectations(args.package_path)
    for name, body in [('expected.json', cold), ('partition-expected.json', audit)]:
        (args.output / name).write_text(json.dumps(body, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'phases': {k: [len(p['rows']) for p in v['ports']]
                               for k, v in audit['phases'].items()},
                      'matrix_cases': len(audit['matrix']['cases'])}))
