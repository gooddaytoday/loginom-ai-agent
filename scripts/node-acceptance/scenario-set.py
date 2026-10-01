#!/usr/bin/env python3
"""Execute explicit node fixtures separately; retain every CLI/oracle exit and cleanup."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def validate_scenarios(value, root):
    if set(value) != {'version', 'scenarios'} or value['version'] != 'loginom-scenario-set-v1':
        raise ValueError('SCENARIO_SET_VERSION_OR_FIELDS')
    scenarios = value['scenarios']
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError('SCENARIO_SET_EMPTY')
    ids = set()
    for scenario in scenarios:
        if set(scenario) != {'id', 'directory'} or not isinstance(scenario['id'], str):
            raise ValueError('SCENARIO_FIELDS')
        tag = scenario['id']
        if not tag or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in tag) or tag in ids:
            raise ValueError('SCENARIO_ID')
        ids.add(tag)
        directory = (root / scenario['directory']).resolve()
        if not directory.is_relative_to(root / 'docs/node-development/nodes'):
            raise ValueError('SCENARIO_DIRECTORY')
        if not all((directory / f).is_file() for f in ['task.md', 'expected.json']) or not (directory / 'data').is_dir():
            raise ValueError('SCENARIO_INPUTS')
    return scenarios


def main():
    parser = argparse.ArgumentParser()
    for key in ['set', 'node', 'slot', 'cli', 'out']:
        parser.add_argument('--' + key, required=True)
    args = parser.parse_args()
    script = Path(__file__).resolve().parent
    root = script.parent.parent
    scenarios = validate_scenarios(json.loads(Path(args.set).read_text()), root)
    out = Path(args.out)
    out.mkdir(mode=0o700)
    results = []
    for scenario in scenarios:
        directory = (root / scenario['directory']).resolve()
        attempt = out / scenario['id']
        code = subprocess.run(['bash', str(script / 'accept-node.sh'), '--node', args.node,
                               '--slot', args.slot, '--cli', args.cli, '--out', str(attempt),
                               '--acceptance-dir', str(directory)]).returncode
        result = json.loads((attempt / 'result.json').read_text()) if (attempt / 'result.json').exists() else None
        inputs = [{'path': str(f.relative_to(root)), 'bytes': f.stat().st_size,
                   'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
                  for f in sorted(directory.rglob('*')) if f.is_file()]
        results.append({'id': scenario['id'], 'exit_code': code, 'result': result, 'inputs': inputs})
        # A blocked/unconfirmed cleanup cannot be followed by a new live scenario.
        if result is None or result.get('status') == 'BLOCKED' or not all(result.get('cleanup', {}).get(k) for k in ['package_closed', 'logged_out']):
            break
    passed = len(results) == len(scenarios) and all(r['exit_code'] == 0 and r['result']['status'] == 'PASS' for r in results)
    summary = {'version': 'loginom-scenario-set-v1', 'status': 'PASS' if passed else 'FAIL', 'scenarios': results}
    (out / 'result.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__':
    main()
