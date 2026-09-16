"""Explicit versioned reassessment of run8. Keeps the original frozen guard/report intact."""
import argparse
import difflib
import hashlib
import json
import subprocess
from pathlib import Path

WORK = Path(__file__).resolve().parent
REPO = WORK.parents[1]
RUN_ID = '20260914-124616-9e88066c'
RUNTIME = 'e909a974f924fe2be856eb9508cd85c42ac18245ea16df01c6bb75d8b4e874fc'
FIX_COMMIT = '21b05b3e476d9b600b2ad5f77f71e73a90c75e9a'
RECEIPT_COMMIT = '39380d11'
RECEIPT_PATH = 'docs/loginom-dock/missing-values-autonomous-acceptance-8-pins-2026-09-14.json'
DELTA = {'artifact_delivery_evidence.py', 'existing_import_evidence.py', 'missing_values_acceptance.py'}
KIT = REPO / '.dock/node14-acceptance8-preparation/kit-2026.09.14-node14-acceptance8.1'


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def git_blob(commit, name):
    return subprocess.check_output(['git', 'show', commit + ':' + name], cwd=REPO)


def verify_file(path, record):
    if path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
        raise ValueError('Immutable receipt differs: ' + str(path))


def verify_delta(original, current, expected, declared):
    if set(original) != set(current) or set(expected) != set(declared):
        raise ValueError('Incomplete verifier inventory')
    changed = {name for name in original if original[name] != current[name]}
    if changed != set(declared) or any(current[name] != expected[name] for name in declared):
        raise ValueError('Undeclared or unpinned verifier delta')
    return sorted(changed)


def provenance(run, directory):
    from preflight import runtime_pin
    if run.resolve() != (REPO / '.dock/node14-autonomous-acceptance-8/runs' / RUN_ID).resolve():
        raise ValueError('Exact original run8 required')
    anchor_bytes = git_blob(RECEIPT_COMMIT, RECEIPT_PATH)
    anchor = json.loads(anchor_bytes)
    for name, record in anchor['receipts'].items():
        verify_file(REPO / name, record)
    request = json.loads((run / 'request.json').read_text())
    if request['run_id'] != RUN_ID or request['runtime_source_pin']['client_revision'] != RUNTIME:
        raise ValueError('Original run identity differs')
    if runtime_pin(REPO) != request['runtime_source_pin']:
        raise ValueError('Product runtime changed')
    old = request['harness_inputs']
    if len(old) != 256:
        raise ValueError('Original harness inventory differs')
    frozen = directory / 'original-harness'
    frozen.mkdir(exist_ok=True)
    active, expected, changes = {}, {}, []
    for name, sha in old.items():
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Unsafe original input path')
        blob = (KIT / 'harness' / rel).read_bytes()
        if hashlib.sha256(blob).hexdigest() != sha:
            raise ValueError('Original kit blob differs: ' + name)
        restored = frozen / rel
        if not restored.exists():
            restored.parent.mkdir(parents=True, exist_ok=True)
            with restored.open('xb') as stream:
                stream.write(blob)
        if digest(restored) != sha:
            raise ValueError('Restored original harness differs: ' + name)
        active[name] = digest(WORK / rel)
        if name in DELTA:
            approved = git_blob(FIX_COMMIT, 'tools/loginom-acceptance/' + name)
            expected[name] = hashlib.sha256(approved).hexdigest()
            changes.extend(difflib.unified_diff(blob.decode().splitlines(True), approved.decode().splitlines(True),
                           fromfile='original/' + name, tofile='verifier-v1/' + name))
    changed = verify_delta(old, active, expected, DELTA)
    historical = json.loads((run / 'final-audit-frozen.json').read_text())
    failures = {k for k, v in historical['checks'].items() if not v['passed']}
    if historical['passed'] or failures != {'source_bytes:import-mutable-change-source-01', 'independent_reopen_present'}:
        raise ValueError('Historical frozen FAIL differs')
    patch = ''.join(changes).encode()
    patch_path = directory / 'verifier-delta.patch'
    if patch_path.exists():
        if patch_path.read_bytes() != patch:
            raise ValueError('Recorded verifier delta differs')
    else:
        patch_path.write_bytes(patch)
    return dict(version='missing-values-run8-reevaluation-v1', run_id=RUN_ID,
                original_receipt_commit=RECEIPT_COMMIT, original_receipt_sha256=hashlib.sha256(anchor_bytes).hexdigest(),
                original_receipts_verified=len(anchor['receipts']), original_harness_restored=len(old),
                original_harness_sha256=hashlib.sha256(json.dumps(old, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                runtime_revision=RUNTIME, runtime_inputs_verified=len(request['runtime_source_pin']['inputs']),
                approved_fix_commit=FIX_COMMIT, declared_delta={n: dict(original=old[n], updated=active[n]) for n in changed},
                delta_patch_sha256=hashlib.sha256(patch).hexdigest(), evaluator_sha256=digest(Path(__file__)),
                original_files_unchanged=True, original_frozen_fail_preserved=True, model_started=False)


def reassess(run, candidate, directory, reopen=None):
    directory.mkdir(parents=True, exist_ok=True)
    before = provenance(run, directory)
    # The original auditor still executes its frozen guard. Its complete raw
    # report is retained; this new verdict uses the explicit versioned proof.
    from missing_values_acceptance import audit, full_goal_passed
    original_report = audit(run, candidate, reopen)
    phase = 'final' if reopen else 'pre'
    with (directory / (phase + '-original-auditor.json')).open('x') as stream:
        json.dump(original_report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    after = provenance(run, directory)
    if before != after:
        raise ValueError('Provenance changed during reassessment')
    if original_report.get('checks', {}).get('frozen') != {'passed': False}:
        raise ValueError('Expected original frozen guard refusal was not preserved')
    checks = {k: v for k, v in original_report['checks'].items() if k != 'frozen'}
    checks['versioned_source_provenance'] = dict(passed=True, **after)
    report = dict(version=before['version'], scope='full_missing_values_goal_versioned_run8',
                  passed=full_goal_passed(checks), checks=checks, provenance=after,
                  original_auditor_frozen_guard=original_report['checks']['frozen'],
                  original_frozen_verdict='FAIL', model_started=False,
                  source_bytes_reverified_after_reopen=False)
    if 'reopen_plan' in original_report:
        report['reopen_plan'] = original_report['reopen_plan']
    with (directory / (phase + '-audit-v1.json')).open('x') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--reopen-dir', type=Path)
    args = parser.parse_args()
    result = reassess(args.run_dir, args.candidate, args.out, args.reopen_dir)
    print(json.dumps(dict(passed=result['passed'], checks=len(result['checks']),
                          failed=[k for k, v in result['checks'].items() if not v['passed']], version=result['version'])))
    raise SystemExit(0 if result['passed'] else 1)
