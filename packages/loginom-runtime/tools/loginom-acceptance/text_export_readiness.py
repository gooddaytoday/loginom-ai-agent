"""Pinned, local candidate admission. No public retained-output API is implied."""
import hashlib,json
from pathlib import Path
WORK=Path(__file__).resolve().parent
ROOT=WORK.parents[1]
MANIFEST=ROOT/'docs/plans/loginom-dock/17-text-export-final-admission.json'
REJECT_BASELINE_BLOCKER='TEXT_EXPORT_REJECT_BASELINE_READER_UNAVAILABLE'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def pinned(root,name,sha):
    p=root/name
    assert p.resolve().is_relative_to(root.resolve()) and not p.is_symlink() and p.is_file(), 'Unsafe admission evidence path'
    assert digest(p)==sha, 'Admission pin differs: '+name
    return p

def require_reject_baseline_reader(purpose='full',manifest=MANIFEST):
    try:
        assert purpose in ('full','user-v1-component')
        m=json.loads(manifest.read_text());assert m['schema_version']==1 and m['goal_id']=='text-export-node-complete'
        assert m['profile']=='user-v1' and m['account']=='test-2' and m['storage_directory']=='/test-2'
        report=pinned(ROOT,m['diagnostic']['path'],m['diagnostic']['sha256']);d=json.loads(report.read_text())
        assert d['candidate_evidence_ready'] is True and d['result_profile']=='diagnostic'
        assert d['checks']['passed'] is True and d['checks']['outer']['passed'] is True
        runtime=m['runtime_inputs']
        # Historical export/observer evidence retains its original runtime. The
        # current candidate includes the documented import editor and save/reopen waits.
        # Full launch still requires fresh current-runtime component evidence below.
        changed_runtime=sorted(n for n in set(runtime)|set(d['runtime_inputs']) if runtime.get(n)!=d['runtime_inputs'].get(n))
        assert changed_runtime==m.get('runtime_changes_since_diagnostic',[]), 'Unaccounted runtime change'
        assert set(changed_runtime)<={'client/lib/text-import-procedure.mjs','client/lib/executor.mjs','client/lib/text-export-output.mjs','client/lib/workspace-ui.mjs'}, 'Export evidence requires a new diagnostic for this runtime change'
        for n,h in runtime.items():pinned(ROOT,n,h)
        from preflight import runtime_pin
        assert runtime_pin(ROOT)=={'client_revision':m['runtime'],'inputs':runtime}, 'Current runtime digest differs'
        assert d['handler_source']==m['handler_source']
        old=d['harness_inputs'];current=m['harness_inputs']
        required=set(old)|{p.name for p in WORK.iterdir() if p.suffix in ('.mjs','.py')}
        assert set(current)==required, 'Incomplete frozen harness inventory'
        for n,h in current.items():pinned(WORK,n,h)
        changed=sorted(n for n in old if old[n]!=current[n])
        assert changed==m['changed_since_diagnostic'], 'Unaccounted harness change'
        # Binding equality is now structural; its current source is frozen above.
        # Historical native download/dispatch evidence keeps its original binder.
        protected=['text-export-observer-native.mjs','text-export-observer-sdk.mjs','text-export-read-observer.mjs','text-export-observer-policy.mjs','text_export_origin.py','text_export_observer_evidence.py','text_export_observer_run.py']
        if purpose=='full' and not all(old[n]==current[n] for n in protected):
            # A component run exercises current native code directly. Historical
            # reports remain immutable; full launch needs the current component.
            ref=m['user_v1'];assert ref is not None, 'Current component evidence pending'
            latest=json.loads(pinned(ROOT,ref['path'],ref['sha256']).read_text())
            r=ROOT/ref['run_directory'];assert r.resolve().is_relative_to(ROOT)
            recorded=json.loads((r/'request.json').read_text())
            assert recorded['runtime_source_pin']['client_revision']==m['runtime']
            assert all(recorded['harness_inputs'][n]==current[n] for n in protected+['text-export-observer-response.mjs'])
            assert latest['passed'] is True

        pinned(WORK,'goals/text-export-node-complete.txt',m['goal_sha256'])
        assert m['full_goal']=={'nodeops':22,'deliveries':3,'all_save_reopen_required':True}
        from text_export_observer_run import verify_run_observer
        def native_evidence(directory,hashes):
            r=ROOT/directory;assert r.resolve().is_relative_to(ROOT)
            for n,h in hashes.items():pinned(r,n,h)
            run=json.loads((r/'request.json').read_text());body=json.loads((r/'replace-body.json').read_text())
            if set(body['workflow_ref'])=={'workflow_id'}:
                sessions=list((r/'private/dock-state/sessions').iterdir());assert len(sessions)==1
                events=[json.loads(x) for x in (sessions[0]/'execution-events.jsonl').read_text().splitlines()]
                rows=[e['request'] for e in events if e.get('phase')=='node_apply_prepared' and e.get('operation_id')==body['operation_id']];assert len(rows)==1
                expanded={**body,'workflow_ref':rows[0]['workflow_ref']};assert expanded==rows[0];body=expanded
            result=verify_run_observer(r,run,body);assert result['passed'],result
            return r
        native_evidence(m['diagnostic']['run_directory'],d['evidence_sha256'])
        if purpose=='full':
            u=m['user_v1'];assert u is not None, 'Native user-v1 component evidence pending'
            p=pinned(ROOT,u['path'],u['sha256']);report=json.loads(p.read_text())
            assert report['passed'] is True and report['result_profile']=='user-v1' and report['projection']['passed'] is True
            r=native_evidence(u['run_directory'],report['evidence_sha256'])
            from text_export_user_v1_evidence import verify_component_wire
            assert verify_component_wire(r)['passed']
        return {'ready':True,'purpose':purpose,'manifest_sha256':digest(manifest),'runtime':m['runtime'],'scope':'private_acceptance_observer','full_goal_accepted':False}
    except (AssertionError,KeyError,TypeError,ValueError,OSError) as e:
        raise ValueError(REJECT_BASELINE_BLOCKER+': '+str(e)) from e

def isolated_user_config(source,destination):
    import os,stat
    info=source.lstat();assert stat.S_ISREG(info.st_mode) and info.st_mode&0o077==0, 'Private explicit config required'
    data=json.loads(source.read_text());m=json.loads(MANIFEST.read_text())
    data['hermes_profile']={'version':1,'result_profile':'user-v1','mode':'executor-replay','passwordless_login':True,'loginom_user':'test-2','action_manifest_uri':m['catalog']['uri'],'action_manifest_sha256':m['catalog']['sha256']}
    with os.fdopen(os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:json.dump(data,f)
    return destination

if __name__=='__main__':
    import sys
    print(json.dumps(require_reject_baseline_reader(sys.argv[1] if len(sys.argv)>1 else 'full')))
