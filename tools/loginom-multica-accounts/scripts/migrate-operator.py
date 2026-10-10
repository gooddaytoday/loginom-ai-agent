#!/usr/bin/env python3
"""Explicit operator_file-only own pair transaction; no Loginom or config allocation."""
import argparse,json,os,signal
from contextlib import ExitStack
from pathlib import Path
from uuid import UUID,uuid4
from common import read_private,write_private,private_snapshot,account_guard,new_evidence_directory
import importlib.util
spec=importlib.util.spec_from_file_location('migration_card_primitives',Path(__file__).with_name('card-admin-common.py'))
card=importlib.util.module_from_spec(spec);spec.loader.exec_module(card)
provision=card.load('migration_foreground','provision-accounts.py')
owner=card.load('migration_durable','owner-reconcile.py')

def rewrite_operator_only(raw,old,new):
    # Preserve every byte outside the sole top-level operator_file JSON string.
    text=raw.decode('utf-8');decoder=json.JSONDecoder();position=0;keys=set();span=None
    def whitespace(index):
        while index<len(text) and text[index].isspace():index+=1
        return index
    position=whitespace(position)
    if text[position:position+1]!='{':raise RuntimeError('MIGRATION_JSON_INVALID')
    position+=1
    while True:
        position=whitespace(position)
        if text[position:position+1]=='}':position+=1;break
        key,end=decoder.raw_decode(text,position)
        if not isinstance(key,str) or key in keys:raise RuntimeError('MIGRATION_DUPLICATE_KEY')
        keys.add(key);position=whitespace(end)
        if text[position:position+1]!=':':raise RuntimeError('MIGRATION_JSON_INVALID')
        start=whitespace(position+1);value,end=decoder.raw_decode(text,start)
        if key=='operator_file':
            if value!=old:raise RuntimeError('MIGRATION_OLD_OPERATOR_MISMATCH')
            span=(start,end)
        position=whitespace(end)
        if text[position:position+1]==',':position+=1;continue
        if text[position:position+1]!='}':raise RuntimeError('MIGRATION_JSON_INVALID')
    if not span or whitespace(position)!=len(text):raise RuntimeError('MIGRATION_JSON_INVALID')
    result=(text[:span[0]]+json.dumps(new,ensure_ascii=False)+text[span[1]:]).encode()
    before=json.loads(raw);after=json.loads(result)
    if after!={**before,'operator_file':new}:raise RuntimeError('MIGRATION_KEY_DELTA_INVALID')
    return result

def replace_bytes(path,raw):
    temporary=path.with_name(path.name+'.migration-'+str(uuid4()))
    try:
        fd=os.open(temporary,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path);owner.fsync_directory(path.parent)
    finally:temporary.unlink(missing_ok=True)

def migration_transaction(configs,old,new,history,receipt_file,receipt):
    originals=[(binding,Path(binding['path']).read_bytes()) for binding in configs]
    card.require_bindings(configs);history.mkdir(mode=0o700);links=[]
    try:
        changed=[rewrite_operator_only(raw,old,new) for _,raw in originals]
        for binding,raw in originals:
            path=Path(binding['path']);destination=history/path.name
            os.link(path,destination,follow_symlinks=False);links.append((binding,destination))
        owner.fsync_directory(history)
        for (binding,raw),replacement in zip(originals,changed):
            card.require_bindings([binding]);replace_bytes(Path(binding['path']),replacement)
        after=[card.binding(item['path']) for item in configs]
        for (_,original),current in zip(originals,after):
            if Path(current['path']).read_bytes()!=rewrite_operator_only(original,old,new):raise RuntimeError('MIGRATION_KEY_DELTA_INVALID')
        write_private(receipt_file,{**receipt,'changed_keys':['operator_file'],'before':configs,'after':after,
            'old_grants_ready_receipts_valid':False,'ready':False})
        return after
    except BaseException:
        failures=[]
        for binding,retained in links:
            try:
                if {k:card.binding(retained)[k] for k in ['device','inode','sha256']}!={k:binding[k] for k in ['device','inode','sha256']}:raise RuntimeError('MIGRATION_HISTORY_CHANGED')
                path=Path(binding['path']);temporary=path.with_name(path.name+'.restore-'+str(uuid4()))
                try:os.link(retained,temporary,follow_symlinks=False);os.replace(temporary,path);owner.fsync_directory(path.parent)
                finally:temporary.unlink(missing_ok=True)
                card.require_bindings([binding])
            except Exception as error:failures.append(type(error).__name__)
        if failures:raise RuntimeError('MIGRATION_RESTORE_UNKNOWN:'+','.join(failures))
        raise

def migrate(authorization_file,evidence_dir,source_sha,previous_file):
    source=provision.clean_candidate(source_sha);authorization=card.binding(authorization_file);grant=read_private(authorization_file)
    issue=grant.get('issue_id');operation_id=str(UUID(grant['operation_id']))
    if grant.get('schema')!='lab53-operator-migration-owner-binding-v1' or issue not in card.CARDS or grant.get('source')!=source or grant['operation_id']!=operation_id:
        raise RuntimeError('MIGRATION_OWNER_BINDING_REQUIRED')
    configs=grant['configs'];card.require_bindings([*configs,grant['target_operator'],grant['bootstrap_receipt']])
    if len(configs)!=3:raise RuntimeError('MIGRATION_PAIR_SCOPE_REQUIRED')
    global_operator,worker,reviewer=map(read_private,[x['path'] for x in configs]);operators=card.validate_cards(grant['cards'],global_operator)
    selected=next(x for x in grant['cards'] if x['issue_id']==issue)
    if selected['operator']!=grant['target_operator']:raise RuntimeError('MIGRATION_TARGET_OPERATOR_UNKNOWN')
    target=operators[issue]
    for role,value in [('worker',worker),('reviewer',reviewer)]:
        if value['issue_id']!=issue or value['role']!=role or value['operator_file']!=configs[0]['path'] or value['stage']!='stage0':raise RuntimeError('MIGRATION_PAIR_SCOPE_REQUIRED')
    previous_binding=card.binding(previous_file);previous=read_private(previous_file)
    names=[global_operator['admin_user'],target['admin_user'],worker['loginom']['username'],reviewer['loginom']['username']]
    if len(set(names))!=4 or set(previous)!=set(names):raise RuntimeError('MIGRATION_PROCESS_PROVENANCE_REQUIRED')
    directory=new_evidence_directory(evidence_dir);write_private(directory/'immutable-intent.json',{
        'source':source,'operation_id':operation_id,'authorization':authorization,'configs':configs,
        'target_operator':grant['target_operator'],'changed_keys':['operator_file'],'state':'UNKNOWN'})
    snapshots=[private_snapshot(x['path']) for x in [*configs,grant['target_operator']]]
    with ExitStack() as stack:
        pair_directory=Path(configs[1]['path']).parent
        if Path(configs[2]['path']).parent!=pair_directory or Path(grant['target_operator']['path']).parent!=pair_directory:raise RuntimeError('MIGRATION_PAIR_SCOPE_REQUIRED')
        pair=stack.enter_context(provision.pair_guard(pair_directory))
        guards=[stack.enter_context(account_guard(name,snapshots,previous_processes=previous[name])) for name in sorted(names)]
        all_guards=[pair,*guards]
        inputs={k:grant[k] for k in ['issue_id','operation_id','source','configs','target_operator','bootstrap_receipt','expected_observer']}
        inputs.update(directory=str(directory),stand=global_operator['url'])
        input_file=directory/'input.json';write_private(input_file,inputs);collector=[global_operator['node'],Path(__file__).with_name('migration-readback.mjs')]
        if provision.run_foreground([*collector,'request',input_file],[],directory/'request',timeout=10):raise RuntimeError('MIGRATION_NEW_ADMIN_UNQUALIFIED')
        response=directory/'parent-response.json';card.wait_file(response)
        inputs.update(requestFile=str(directory/'parent-request.json'),responseFile=str(response));write_private(input_file,inputs)
        if provision.run_foreground([*collector,'verify',input_file],[],directory/'verify',timeout=10):raise RuntimeError('MIGRATION_CURRENT_PROOF_UNKNOWN')
        request=read_private(directory/'parent-request.json');consumed=directory/('migration-consumed-'+request['nonce']+'.json');proof=read_private(consumed)
        protected=[card.binding(p) for p in [input_file,response,directory/'parent-request.json',consumed]]
        if proof['input_sha256']!=card.binding(input_file)['sha256'] or proof['response_sha256']!=card.binding(response)['sha256'] or proof['request_sha256']!=card.binding(directory/'parent-request.json')['sha256']:
            raise RuntimeError('MIGRATION_CURRENT_PROOF_CHANGED')
        fd_proof=card.request_fd(directory,grant,all_guards,[*configs,*[x['operator'] for x in grant['cards']],authorization,
            previous_binding,grant['bootstrap_receipt'],*[card.binding(x['path']) for x in all_guards]])
        card.require_bindings([*protected,fd_proof,*configs,*[x['operator'] for x in grant['cards']],authorization,previous_binding,grant['bootstrap_receipt']])
        if provision.clean_candidate(source_sha)!=source:raise RuntimeError('MIGRATION_SOURCE_CHANGED')
        card.check_held(all_guards)
        for name,guard in zip(sorted(names),guards):
            from common import marker_paths,check_previous_processes
            check_previous_processes(previous[name])
            if any(os.path.lexists(p) for p in marker_paths(guard['path'])):raise RuntimeError('MIGRATION_MARKER_PRESENT')
        import datetime
        age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['readback']['refreshed_at'].replace('Z','+00:00'))).total_seconds()
        if not 0<=age<=300:raise RuntimeError('MIGRATION_PROOF_STALE')
        return migration_transaction(configs[1:],configs[0]['path'],grant['target_operator']['path'],directory/'immutable-config-history',directory/'operator-migration.json',{
            'schema':'lab53-operator-migration-v1','issue_id':issue,'operation_id':operation_id,'source':source,
            'server_proof':card.binding(consumed),'fd_proof':fd_proof,'target_operator':grant['target_operator'],
            'bootstrap_receipt':grant['bootstrap_receipt'],'history_facts_modified':False})

if __name__=='__main__':
    def cancel(_signum,_frame):raise RuntimeError('MIGRATION_CANCELLED_UNKNOWN')
    for signum in [signal.SIGTERM,signal.SIGINT]:signal.signal(signum,cancel)
    parser=argparse.ArgumentParser();parser.add_argument('--authorization',type=Path,required=True);parser.add_argument('--evidence-dir',type=Path,required=True)
    parser.add_argument('--source-sha',required=True);parser.add_argument('--previous-processes',type=Path,required=True);args=parser.parse_args()
    try:migrate(args.authorization,args.evidence_dir,args.source_sha,args.previous_processes)
    except Exception as error:
        print(str(error) if isinstance(error,RuntimeError) else 'MIGRATION_UNKNOWN',file=__import__('sys').stderr);raise SystemExit(1)
