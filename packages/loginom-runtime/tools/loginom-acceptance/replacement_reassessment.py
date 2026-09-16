"""Explicit offline reassessment of frozen node11 v2; never rewrites original receipts.

The execution harness is verified against its original Git tree. Only the named
persistence verifier may differ during evaluation; all other original checks run.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from replacement_acceptance import audit, report, ROOT, WORK, DOCK_SKILL
from replacement_session_evidence import verify_session_evidence
from replacement_persistence_evidence import VERIFIER_VERSION
from preflight import runtime_pin

BASELINE = '5891dfdca2fcf94fe57739fca1a1b492df458513'
RUN_ID = '20260913-122247-a862a34d'
CHANGED = {'replacement_persistence_evidence.py'}
ADDED = {'test_replacement_persistence_evidence.py', 'replacement_reassessment.py'}
sha = lambda data: hashlib.sha256(data).hexdigest()
read = lambda path: json.loads(path.read_text())


def require(value, reason):
    if not value: raise ValueError(reason)


def git_bytes(revision, path):
    return subprocess.check_output(['git', 'show', revision+':'+path], cwd=ROOT)


def verify_artifacts(receipt):
    result = {}
    for name, item in receipt['artifacts'].items():
        path = ROOT/item['path']
        require(path.is_file() and not path.is_symlink(), 'artifact_missing_or_symlink:'+name)
        result[name] = dict(sha256=sha(path.read_bytes()), bytes=path.stat().st_size)
        require(result[name] == {k:item[k] for k in ('sha256','bytes')}, 'frozen_artifact_changed:'+name)
    return result


def verify_harness(request, full):
    require(len(request['harness_inputs']) == 252 and len(full) == 253, 'original_harness_counts')
    require(set(full)-set(request['harness_inputs']) == {'fixtures/replacement/empty.csv'}, 'inventory_difference')
    require(all(full[k] == v for k,v in request['harness_inputs'].items()), 'execution_map_difference')
    changed = {}
    for name, digest in full.items():
        relative = 'tools/loginom-acceptance/'+name
        require(sha(git_bytes(BASELINE, relative)) == digest, 'original_git_harness:'+name)
        path = WORK/name
        require(path.is_file() and not path.is_symlink(), 'current_harness_missing:'+name)
        current = sha(path.read_bytes())
        if current != digest:
            require(name in CHANGED, 'unapproved_verifier_change:'+name)
            changed[name] = dict(execution_sha256=digest, reassessment_sha256=current)
    require(set(changed) == CHANGED, 'expected_verifier_delta')
    # Prevent an added Python module or data file silently shadowing an old input.
    current = {p.relative_to(WORK).as_posix() for p in WORK.rglob('*') if p.is_file()
               and '__pycache__' not in p.parts and p.suffix != '.pyc'}
    prefix = 'tools/loginom-acceptance/'
    baseline_files = {n.removeprefix(prefix) for n in subprocess.check_output(
        ['git','ls-tree','-r','--name-only',BASELINE,'--',prefix],cwd=ROOT,text=True).splitlines()}
    require(current == baseline_files | ADDED, 'unexpected_harness_files')
    for name in baseline_files-set(full):
        require(sha((WORK/name).read_bytes()) == sha(git_bytes(BASELINE,prefix+name)), 'unapproved_extra_change:'+name)
    require(all(not (WORK/name).is_symlink() for name in ADDED), 'added_harness_symlink')
    return dict(passed=True, scope='frozen_execution_harness_git_verified_with_explicit_reassessment_delta',
                baseline_commit=BASELINE, execution_inputs=252, full_inventory_inputs=253,
                changed=changed, added={n:sha((WORK/n).read_bytes()) for n in sorted(ADDED)})


def reassess(directory):
    require(directory.resolve() == ROOT/'.dock/replacement/acceptance-runs'/RUN_ID, 'exact_frozen_run_required')
    receipt = json.loads(git_bytes(BASELINE,'docs/loginom-dock/node11-autonomous-v2-2026-09-13.json'))
    before = verify_artifacts(receipt)
    request = read(directory/'request.json'); evidence = read(directory/'evidence.json'); pin = read(directory/'candidate-pin.json')
    original_audit = read(directory/'replacement-acceptance-audit.json')
    require(original_audit['passed'] is False and len(original_audit['checks']) == 59, 'original_fail_required')
    full = json.loads(git_bytes(BASELINE,'docs/loginom-dock/replacement-saveas-integration-2026-09-13.json'))['harness_inputs']
    harness = verify_harness(request, full)
    source = request['source_inventory']
    for item in source['files']:
        path = ROOT/item['path']
        require(sha(git_bytes(source['source_commit'],item['path'])) == item['sha256'], 'original_git_source:'+item['path'])
        require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == item['sha256'], 'current_source:'+item['path'])
    require(runtime_pin(ROOT) == request['runtime_source_pin'], 'runtime_pin_changed')
    # The same unmodified top-level evaluator retains model/goal/catalog/public,
    # graph/output/save/session checks. Its harness gate is separately recomputed
    # above for frozen execution + narrowly declared verifier evolution.
    result = audit(request,evidence,(directory/'scenario.txt').read_text(),pin)
    result['checks']['harness_files'] = harness
    result['checks']['current_runtime'] = dict(passed=runtime_pin(ROOT) == request['runtime_source_pin'])
    result['checks']['isolated_session_pins'] = verify_session_evidence(directory,request,evidence,pin,DOCK_SKILL)
    result = report(result['checks'])
    require(set(result['checks']) == set(original_audit['checks']), 'all_59_original_checks_required')
    after = verify_artifacts(receipt); require(after == before,'evidence_changed_during_reassessment')
    require(verify_harness(request,full) == harness,'verifier_changed_during_reassessment')
    return dict(schema_version=1, scope='offline_frozen_execution_reassessment', run_id=RUN_ID,
                verifier_version=VERIFIER_VERSION, verifier_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                verifier_sha256=sha((WORK/'replacement_persistence_evidence.py').read_bytes()),
                entry_sha256=sha(Path(__file__).read_bytes()), original_execution_source_commit=source['source_commit'],
                product_source_commit=pin['source_commit'], source_files_verified=len(source['files']),
                runtime_revision=pin['runtime_revision'], manifest_sha256=pin['manifest_sha256'],
                goal_sha256=request['goal_sha256'], artifacts_before=before, artifacts_after=after,
                original_result=dict(passed=False,passed_checks=57,total_checks=59),
                hermes_runs=0, browser_started=False, result=result)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run-dir',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    require(not args.output.resolve().is_relative_to(args.run_dir.resolve()),'separate_output_required')
    result=reassess(args.run_dir)
    with args.output.open('x') as out:out.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(passed=result['result']['passed'],checks=len(result['result']['checks']),failures=[k for k,v in result['result']['checks'].items() if not v['passed']])))
    raise SystemExit(0 if result['result']['passed'] else 1)
