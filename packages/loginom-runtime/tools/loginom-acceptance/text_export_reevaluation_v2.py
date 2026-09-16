"""Versioned, explicit re-evaluation of original Node17 evidence, never a frozen rerun.

Reconstructs the original harness from a recorded git revision and verifies every
blob against the ORIGINAL request. Executes that auditor with exactly one source
replacement: the incompatible empty-import-parameters assertion. Future prompt
edits and other current auditor edits cannot enter this historical evaluation.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from text_export_import_contract import verify_unchanged_import_request

WORK = Path(__file__).resolve().parent
ROOT = WORK.parents[1]
OLD = ";assert again['parameters']=={} and again['mappings']==[]"
NEW = "\n            checks['persisted_request_'+name]=verify_unchanged_import_request(ev,r,again,outcomes[r['operation_id']]['output']['node'],(WORK/'fixtures/text-export/input'/name).read_bytes())"


def digest(data): return hashlib.sha256(data).hexdigest()


def reevaluate(run_dir, revision, external_dir=None):
    run_dir = run_dir.resolve()
    original_files = {name: (run_dir/name).read_bytes() for name in ['request.json', 'scenario.txt', 'evidence.json', 'full-audit.json']}
    request = json.loads(original_files['request.json'])
    sha = subprocess.check_output(['git', 'rev-parse', revision+'^{commit}'], cwd=ROOT, text=True).strip()
    names = list(request['harness_inputs'])
    for name in names:
        assert not Path(name).is_absolute() and '..' not in Path(name).parts, 'unsafe_harness_path'
    specs = [sha+':tools/loginom-acceptance/'+name for name in names]
    batch = subprocess.run(['git', 'cat-file', '--batch'], cwd=ROOT, input=('\n'.join(specs)+'\n').encode(), capture_output=True, check=True).stdout
    offset = 0
    with tempfile.TemporaryDirectory(prefix='node17-original-harness-') as directory:
        frozen = Path(directory).resolve()
        for name in names:
            end = batch.index(b'\n', offset); header = batch[offset:end].decode().split(); assert len(header)==3 and header[1]=='blob', 'original_harness_blob_missing'
            size = int(header[2]); blob = batch[end+1:end+1+size]; offset = end+size+2
            assert digest(blob)==request['harness_inputs'][name], 'original_harness_hash:'+name
            path = frozen/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(blob)
        assert offset==len(batch), 'unexpected_git_batch_data'
        # All imported dependencies must still be the frozen versions. Only the
        # auditor, its future goal and new contract tests/helper are permitted to
        # differ; the historical auditor and goal are reconstructed above.
        allowed = {'text_export_acceptance.py', 'goals/text-export-node-complete.txt'}
        for name in names:
            if name not in allowed:
                assert digest((WORK/name).read_bytes())==request['harness_inputs'][name], 'changed_audit_dependency:'+name
        original = (frozen/'text_export_acceptance.py').read_text()
        assert original.count(OLD)==1, 'correction_site_not_unique'
        corrected = original.replace(OLD, NEW)
        namespace = {'__name__': 'node17_historical_auditor_v2', '__file__': str(WORK/'text_export_acceptance.py')}
        exec(compile(corrected, str(frozen/'text_export_acceptance.v2.py'), 'exec'), namespace)
        namespace['WORK'] = frozen
        readiness = {'__name__': 'node17_historical_readiness', '__file__': str(WORK/'text_export_readiness.py')}
        exec(compile((frozen/'text_export_readiness.py').read_text(), str(frozen/'text_export_readiness.py'), 'exec'), readiness)
        readiness['WORK'] = frozen
        namespace['require_reject_baseline_reader'] = readiness['require_reject_baseline_reader']
        namespace['verify_unchanged_import_request'] = verify_unchanged_import_request
        result = namespace['audit_directory'](run_dir, external_dir)
    assert all((run_dir/name).read_bytes()==data for name,data in original_files.items()), 'original_evidence_changed'
    return {'version': 'node17-import-contract-v2', 'evaluation_kind': 'versioned_reevaluation_not_original_frozen_audit',
            'passed': result['passed'], 'original_revision': sha,
            'provenance': {'original_files_sha256': {k:digest(v) for k,v in original_files.items()},
                           'original_runtime_source_pin': request['runtime_source_pin'],
                           'original_harness_inputs': request['harness_inputs'], 'original_harness_verified_files': len(names),
                           'original_auditor_sha256': digest(original.encode()), 'corrected_auditor_sha256': digest(corrected.encode()),
                           'correction': {'old': OLD, 'new': NEW},
                           'v2_sources_sha256': {name:digest((WORK/name).read_bytes()) for name in ['text_export_import_contract.py', 'text_export_reevaluation_v2.py']},
                           'original_files_unchanged': True}, 'audit': result}


if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('--run-dir', type=Path, required=True); p.add_argument('--source-revision', required=True); p.add_argument('--external-dir', type=Path); p.add_argument('--output', type=Path, required=True)
    args=p.parse_args()
    if args.output.exists(): raise SystemExit('Refusing to overwrite an existing evaluation')
    result=reevaluate(args.run_dir,args.source_revision,args.external_dir)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'passed': result['passed'], 'checks': result['audit']['checks'], 'output': str(args.output)},ensure_ascii=False))
    raise SystemExit(0 if result['passed'] else 1)
