"""Separate Date/time launcher using the existing isolated subscription runner.

Default is a model-free gate check. --run additionally requires a complete,
coordinator-bound admission document; no candidate defaults or fallback.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from date_time_admission import check, ROOT, receipt


def guard(args):
    path = args.date_time_admission.resolve()
    value = json.loads(path.read_text())
    result = check(value, path.parent)
    if not result['passed']:
        raise ValueError('Date/time admission blocked: '+', '.join(k for k, v in result['checks'].items() if not v['passed']))
    if (args.model_profile != 'chatgpt-sol' or args.fault != 'none' or args.loginom_user != 'test-3'
            or args.storage_directory != '/test-3' or args.manifest_uri != value['catalog']['manifest_uri']
            or args.manifest_sha256 != value['catalog']['manifest_sha256']
            or args.loginom_url != value['loginom_url']
            or args.timeout != value['budget']['timeout_seconds'] or args.max_turns != value['budget']['max_turns']):
        raise ValueError('Date/time launch differs from coordinator admission')
    if not args.runs_root.resolve().is_relative_to(ROOT/'.dock'):
        raise ValueError('Date/time run must use this worktree owned state')
    if not args.dock_config.resolve().is_relative_to(ROOT/'.dock'):
        raise ValueError('Date/time must use its own Dock config')
    from date_time_environment import snapshot
    if snapshot(args) != receipt(value['environment_pin'], path.parent):
        raise ValueError('Current local environment differs from admission')
    catalog = value['catalog']
    catalog_path = (path.parent/catalog['manifest_path']).resolve().parent
    validated = json.loads(subprocess.check_output([str(args.node),str(ROOT/'tools/loginom-acceptance/date-time-candidate-check.mjs'),
        str(catalog_path),catalog['manifest_uri'],catalog['manifest_sha256']],text=True,timeout=30))
    if validated['save_checkpoint_revision'] != catalog['save_checkpoint_revision']:
        raise ValueError('Save checkpoint revision differs')
    with tempfile.TemporaryDirectory(prefix='node13-current-pins-') as tmp:
        current = Path(tmp)/'pins.json'
        subprocess.run([str(args.node),str(ROOT/'tools/loginom-acceptance/date-time-current-pins.mjs'),str(args.dock_config),str(current)],
            check=True,capture_output=True,text=True,timeout=300)
        if json.loads(current.read_text()) != receipt(value['remote_pin'],path.parent):
            raise ValueError('Current skill/frontend differs from admission')
    return value


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--admission', type=Path)
    p.add_argument('--run', action='store_true')
    p.add_argument('--environment-preflight', action='store_true')
    p.add_argument('--output', type=Path)
    p.add_argument('--dock-config', type=Path, default=ROOT/'.dock/stream-runtime/config.json')
    p.add_argument('--node', type=Path, default=Path.home()/'.loginom-dock/current/runtime/node')
    p.add_argument('--browsers', type=Path, default=Path.home()/'.loginom-dock/runtime/browsers')
    p.add_argument('--hermes-home', type=Path, default=Path.home()/'.hermes')
    p.add_argument('--hermes', type=Path, default=Path.home()/'.local/bin/hermes')
    p.add_argument('--hermes-python', type=Path, default=Path.home()/'.hermes/hermes-agent/venv/bin/python')
    p.add_argument('--hermes-source', type=Path, default=Path.home()/'.hermes/hermes-agent')
    a = p.parse_args()
    if a.environment_preflight:
        if a.run or not a.output:
            p.error('Environment preflight requires --output and forbids --run')
        from date_time_environment import snapshot
        value = snapshot(a)
        with a.output.open('x') as f:
            json.dump(value,f,indent=2); f.write('\n')
        print(json.dumps(dict(passed=True,model_started=False,scope='local_environment_only')))
        return 0
    if not a.admission:
        p.error('--admission required outside environment preflight')
    value = json.loads(a.admission.read_text()); checked = check(value, a.admission.resolve().parent)
    print(json.dumps(checked, ensure_ascii=False, indent=2), flush=True)
    if not checked['passed']:
        return 1
    if not a.run:
        return 0
    args = argparse.Namespace(**vars(a), date_time_admission=a.admission, goal='date-time-sales',
        model_profile='chatgpt-sol', fault='none', loginom_user='test-3', storage_directory='/test-3',
        loginom_url=value['loginom_url'], manifest_uri=value['catalog']['manifest_uri'],
        manifest_sha256=value['catalog']['manifest_sha256'], timeout=value['budget']['timeout_seconds'],
        max_turns=value['budget']['max_turns'], runs_root=ROOT/'.dock/node13-acceptance/runs')
    from run import execute
    return execute(args)


if __name__ == '__main__':
    raise SystemExit(main())
