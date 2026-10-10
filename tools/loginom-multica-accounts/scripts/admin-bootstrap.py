#!/usr/bin/env python3
"""Fixed bounded bootstrap/probe for one of the pinned eight card operators."""
import argparse,hashlib,json,os,signal
from contextlib import ExitStack
from pathlib import Path
from uuid import UUID
from common import read_private,private_snapshot,write_private,new_evidence_directory,account_guard,begin_account_effect,process_identity
import importlib.util
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
card=load('bootstrap_card_bindings','card-admin-common.py')
provision=card.load('bootstrap_foreground','provision-accounts.py')
owner=card.load('bootstrap_archival','owner-reconcile.py')
LAB53='01a11e17-b869-7550-8450-35e5e17119d4'

def bootstrap(authorization_file,evidence_dir,source_sha,previous_file):
    source=provision.clean_candidate(source_sha);authorization=card.binding(authorization_file);grant=read_private(authorization_file)
    issue=grant.get('issue_id');operation_id=str(UUID(grant['operation_id']))
    if grant.get('schema')!='lab53-admin-bootstrap-owner-binding-v1' or grant.get('lab53_issue_id')!=LAB53 or (
        issue not in card.CARDS or grant.get('card_issue_id')!=issue or grant.get('source')!=source or grant['operation_id']!=operation_id):
        raise RuntimeError('BOOTSTRAP_OWNER_BINDING_REQUIRED')
    if len(grant['configs'])!=3: raise RuntimeError('BOOTSTRAP_CONFIG_BINDING_REQUIRED')
    card.require_bindings(grant['configs']);global_operator=read_private(grant['configs'][0]['path'])
    operators=card.validate_cards(grant['cards'],global_operator);selected=next(x for x in grant['cards'] if x['issue_id']==issue)
    if selected['operator']!=grant['configs'][1] or grant['intent_file']!=grant['configs'][2]['path']: raise RuntimeError('BOOTSTRAP_CONFIG_BINDING_REQUIRED')
    target=operators[issue];intent=read_private(grant['intent_file']);card.validate_intent(intent,grant['configs'][1],target)
    previous_binding=card.binding(previous_file);previous=read_private(previous_file)
    if set(previous)!={global_operator['admin_user'],target['admin_user']}: raise RuntimeError('BOOTSTRAP_PREVIOUS_PROVENANCE_REQUIRED')
    directory=new_evidence_directory(evidence_dir);snapshots=[private_snapshot(x['path']) for x in grant['configs']]
    # All files below are new own evidence; no card operator/role config is edited.
    write_private(directory/'immutable-intent.json',{'authorization':authorization,'source':source,'operation_id':operation_id,
        'nonce':__import__('secrets').token_hex(32),'configs':grant['configs'],'intent':intent,'previous_binding':previous_binding})
    with ExitStack() as stack:
        pair=stack.enter_context(provision.pair_guard(Path(grant['configs'][1]['path']).parent))
        guards={name:stack.enter_context(account_guard(name,snapshots,previous_processes=previous[name])) for name in sorted(previous)}
        all_guards=[pair,*guards.values()]
        markers=[]
        for guard in guards.values():markers.append(card.binding(begin_account_effect(guard,issue,'admin',operation_id,source_sha)))
        operation={'schema':'lab53-admin-bootstrap-operation-v1','issue_id':issue,'operation_id':operation_id,'source':source,
            'stand':global_operator['url'],'expected_observer':grant['expected_observer'],'configs':grant['configs'],
            'cards':grant['cards'],'parent_authorization':authorization}
        operation_file=directory/'operation.json';write_private(operation_file,operation)
        command=[global_operator['node'],Path(__file__).with_name('qualify-preparation.mjs'),
            '--global-operator',grant['configs'][0]['path'],'--card-operator',grant['configs'][1]['path'],
            '--intent',grant['intent_file'],'--operation-file',operation_file,'--evidence-dir',directory/'ui']
        audit={'schema':'parent-held-audited-harness-v1','source_sha':source_sha,'manifest_sha256':source['manifest_sha256'],
            'entrypoint':'qualify-preparation.mjs','parent':process_identity(os.getpid()),
            'parent_command_sha256':card.digest(card.compact(Path('/proc/self/cmdline').read_bytes().decode().split('\0')[:-1]))}
        if provision.run_foreground(command,all_guards,directory/'ui',operation_binding={'issue_id':issue,'operation_id':operation_id,'source_sha':source_sha},
            guard_barrier=True,harness_audit=audit): raise RuntimeError('BOOTSTRAP_CHILD_UNKNOWN')
        cleanup=next(read_private(p) for p in (directory/'ui').glob('event-*.json') if read_private(p).get('phase')=='process-cleanup')
        if cleanup['process_cleanup']!='PASS' or cleanup['failure'] is not None or cleanup['returncode']!=0: raise RuntimeError('BOOTSTRAP_PROCESS_UNKNOWN')
        bound={'issue_id':issue,'operation_id':operation_id,'source_sha':source_sha}
        cleanup_file=directory/'cleanup.json';write_private(cleanup_file,{**cleanup,**bound})
        completion=directory/'ui/ui-completion.json';final=directory/'final';final.mkdir(mode=0o700)
        inputs={'directory':str(final),'operation':operation,'completionFile':str(completion),'cleanupFile':str(cleanup_file)}
        input_file=final/'input.json';write_private(input_file,inputs)
        collector=[global_operator['node'],Path(__file__).with_name('bootstrap-readback.mjs')]
        if provision.run_foreground([*collector,'request',input_file],[],final/'request',timeout=10): raise RuntimeError('BOOTSTRAP_FINAL_REQUEST_UNKNOWN')
        response=final/'parent-response.json';card.wait_file(response)
        inputs.update(requestFile=str(final/'parent-request.json'),responseFile=str(response));write_private(input_file,inputs)
        if provision.run_foreground([*collector,'verify',input_file],[],final/'verify',timeout=10): raise RuntimeError('BOOTSTRAP_FINAL_PROOF_UNKNOWN')
        request=read_private(final/'parent-request.json');consumed=final/('bootstrap-consumed-'+request['nonce']+'.json');proof=read_private(consumed)
        protected=[card.binding(p) for p in [input_file,response,final/'parent-request.json',consumed,completion,cleanup_file]]
        if proof['input_sha256']!=card.binding(input_file)['sha256'] or proof['response_sha256']!=card.binding(response)['sha256'] or (
                proof['request_sha256']!=card.binding(final/'parent-request.json')['sha256']): raise RuntimeError('BOOTSTRAP_FINAL_PROOF_CHANGED')
        targets=[*grant['configs'],*[x['operator'] for x in grant['cards']],authorization,previous_binding,
            *intent['history']['files'],*markers,*[card.binding(g['path']) for g in all_guards]]
        fd_proof=card.request_fd(directory,operation,all_guards,targets)
        card.require_bindings([*protected,fd_proof,authorization,previous_binding,*grant['configs'],*[x['operator'] for x in grant['cards']],*intent['history']['files'],*markers])
        if provision.clean_candidate(source_sha)!=source: raise RuntimeError('BOOTSTRAP_SOURCE_CHANGED')
        for records in previous.values():
            for record in records:
                current=process_identity(record['pid'])
                if current and current['start_ticks']==record['start_ticks'] and current['state'] not in {'Z','X'}: raise RuntimeError('BOOTSTRAP_PREVIOUS_PROCESS_PRESENT')
        owner.check_absent(cleanup['processes']);card.check_held(all_guards)
        import datetime
        age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['readback']['refreshed_at'].replace('Z','+00:00'))).total_seconds()
        if not 0<=age<=300: raise RuntimeError('BOOTSTRAP_FINAL_STALE')
        for guard in guards.values():
            from common import marker_paths
            if [str(p) for p in marker_paths(guard['path']) if os.path.lexists(p)]!=[str(Path(guard['path']).with_suffix('.active.json'))]:
                raise RuntimeError('BOOTSTRAP_MARKER_CHANGED')
        owner.archive_legacy(markers,directory/'immutable-history',directory/'card-admin-qualified.json',{
            'schema':'lab53-card-admin-qualified-v1','issue_id':issue,'operation_id':operation_id,'source':source,
            'configs':grant['configs'],'target_operator':grant['configs'][1],'effective_admin':True,
            'server_proof':card.binding(consumed),'fd_proof':fd_proof,'completion':card.binding(completion),
            'server_request':card.binding(final/'parent-request.json'),'server_response':card.binding(response),
            'server_input':card.binding(input_file),'fd_request':card.binding(directory/'fd-request.json'),
            'cleanup':card.binding(cleanup_file),'authorization':authorization,'state':'COMPONENT_QUALIFIED_RUNTIME_REVIEW_REQUIRED',
            'ready':False,'history_facts_modified':False})

if __name__=='__main__':
    def cancel(_signum,_frame):raise RuntimeError('BOOTSTRAP_CANCELLED_UNKNOWN')
    for signum in [signal.SIGTERM,signal.SIGINT]:signal.signal(signum,cancel)
    parser=argparse.ArgumentParser();parser.add_argument('--authorization',type=Path,required=True);parser.add_argument('--evidence-dir',type=Path,required=True)
    parser.add_argument('--source-sha',required=True);parser.add_argument('--previous-processes',type=Path,required=True);args=parser.parse_args()
    try:bootstrap(args.authorization,args.evidence_dir,args.source_sha,args.previous_processes)
    except Exception as error:
        print(str(error) if isinstance(error,RuntimeError) else 'BOOTSTRAP_UNKNOWN',file=__import__('sys').stderr);raise SystemExit(1)
