#!/usr/bin/env python3
"""Exact LAB47 observer3119 marker: current proof only, no login or old PASS."""
import argparse,datetime,fcntl,json,os,signal
from pathlib import Path
from uuid import UUID
from common import read_private,write_private,new_evidence_directory,process_identity,marker_paths
import importlib.util
spec=importlib.util.spec_from_file_location('card47_primitives',Path(__file__).with_name('card-admin-common.py'))
card=importlib.util.module_from_spec(spec);spec.loader.exec_module(card)
owner=card.load('card47_archive','owner-reconcile.py');provision=card.load('card47_foreground','provision-accounts.py')
ISSUE='01a11e17-b869-7550-8450-35e5e17119d4';CARD='01a11d36-1c50-7c05-bb73-d72ffd159b1b'
ATTEMPT='504fb604-40c6-4ccf-9f64-c784cb1bb136';TASK='01a11dea-c6a1-781f-80c9-596eb304a5b6'
MARKER_SHA='0b61b8d53549a5d68564dcd66cdd796c5b483b0b58ea38940803c8c57aa54528'
CONFIG_SHA='140782d3c2d3a4045068dfeb5571fbe71646d4ea3ce3c99405f6a4c62f4e6799'
GUID_SHA='b898c6aee54ebfd9cf99762a978565508720322de8368e3fa3e551a7a28e99cc'
ORIGINS={
 'observer.json':'3f992d2346344bdf42955cfa037b3204bdcf9690df3d20e889ce013efe2fdc7b',
 'observer-main-process.json':'a2b277065606ff55ec97ffa3b287dcf67baf3828c5e3eb030df6e18cc8e0f915',
 'observer-key-initial-process.json':'7caeedbe9d17ced7e438bae04bce4a383abf045038104a76a156ce44b156683a',
 'observer-publication-verification.private.json':'5e0cb54f5fe1b52e6854763f2c91ffe679b8f3d508971be77579e4599818728e',
 'session-Observer-secrets.private.json':'9b5c6f8a085da7bcf95320ed8aef779f03c1ed52fa0f2f89744c0537c7ecbdaf',
 'observer.mjs':'9bbf3c388a2ce33962e7dcae86326cfdc7a4c8c06c248e5b478d5bccc4088abd'}
def origin_records(marker,origins):
    if marker.get('issue_id')!=CARD or marker.get('attempt_uuid')!=ATTEMPT or marker.get('task_id')!=TASK or marker.get('original_card_config_hash')!=CONFIG_SHA:
        raise RuntimeError('CARD47_ORIGIN_UNKNOWN')
    checkpoint=marker['finite_checkpoint'];target=checkpoint['minimum_next_readback'];session=marker['sessions']
    if (checkpoint['phase']!='own_observer3119_independent_absence_required' or target['target_numeric_ID']!=3119
        or target['target_CreateTime']!='2026-10-08T23:54:12.928Z' or target['GUID_sha256']!=GUID_SHA
        or checkpoint['root_manifest_sha256']!='540fd195ee0b4ac79558d922adfd9f2fc1ba97aead64b1a7f0e75e72cb052620'
        or len(session)!=1 or session[0]['session_id']!=3119 or session[0]['guid_sha256']!=GUID_SHA):raise RuntimeError('CARD47_ORIGIN_UNKNOWN')
    base=Path(marker['private_evidence']);expected={str(base/name):sha for name,sha in ORIGINS.items()}
    if {x['path']:x['sha256'] for x in origins}!=expected:raise RuntimeError('CARD47_ORIGINAL_BYTES_REQUIRED')
    card.require_bindings(origins)
    secret=read_private(base/'session-Observer-secrets.private.json')
    if not isinstance(secret['guid'],str) or card.digest(secret['guid'].encode('utf-8'))!=GUID_SHA:raise RuntimeError('CARD47_GUID_ALGORITHM_UNKNOWN')
    result=read_private(base/'observer.json')
    if result['issue_id']!=CARD or result['attempt_uuid']!=ATTEMPT or result['observer_login_attempts']!=1:
        raise RuntimeError('CARD47_ORIGIN_UNKNOWN')
    exact={};partial=set()
    for name in ['observer-main-process.json','observer-key-initial-process.json']:
        data=read_private(base/name)
        leader=next((r for r in data['observed_exact_process_tree'] if r.get('pid')==data['child_pid']),None)
        if leader is None:raise RuntimeError('CARD47_PROCESS_UNKNOWN')
        # The retained direct parent PID is also a known numeric fact, but its
        # start tick was not captured. Require current absence without asserting
        # an old owned identity, inventing ticks or signalling a reused PID.
        parent=leader.get('ppid')
        if not isinstance(parent,int) or isinstance(parent,bool) or parent<=0:raise RuntimeError('CARD47_PROCESS_UNKNOWN')
        partial.add(parent)
        for record in data['observed_exact_process_tree']:
            pid,ticks=record.get('pid'),record.get('start_ticks')
            if not isinstance(pid,int) or isinstance(pid,bool) or pid<=0:raise RuntimeError('CARD47_PROCESS_UNKNOWN')
            if ticks is None:partial.add(pid)
            elif not isinstance(ticks,str) or not ticks.isdigit():raise RuntimeError('CARD47_PROCESS_UNKNOWN')
            else:exact[(pid,ticks)]={'pid':pid,'start_ticks':ticks}
    publication=read_private(base/'observer-publication-verification.private.json')
    pid,ticks=publication['publisher_exact_PID'],publication['publisher_start_ticks']
    if not isinstance(pid,int) or not isinstance(ticks,str) or not ticks.isdigit():raise RuntimeError('CARD47_PROCESS_UNKNOWN')
    exact[(pid,ticks)]={'pid':pid,'start_ticks':ticks}
    if not exact:raise RuntimeError('CARD47_PROCESS_UNKNOWN')
    return list(exact.values()),sorted(partial)
def absence(exact,partial):
    owner.check_absent(exact)
    if any(process_identity(pid) is not None for pid in partial):raise RuntimeError('CARD47_PARTIAL_PID_PRESENT_OR_REUSED')
def reconcile(authorization_file,evidence_dir,source_sha):
    source=provision.clean_candidate(source_sha);authorization=card.binding(authorization_file);grant=read_private(authorization_file)
    operation_id=str(UUID(grant['operation_id']))
    if grant.get('schema')!='lab53-card47-owner-binding-v1' or grant.get('issue_id')!=ISSUE or grant.get('source')!=source or grant['operation_id']!=operation_id:
        raise RuntimeError('CARD47_OWNER_BINDING_REQUIRED')
    configs=grant['configs'];operator_binding=grant['card_operator'];marker=grant['marker'];lock=grant['lock'];origins=grant['origins']
    if len(configs)!=7 or operator_binding not in configs or operator_binding['sha256']!=CONFIG_SHA:raise RuntimeError('CARD47_CONFIG_UNKNOWN')
    card.require_bindings([*configs,marker,lock,*origins]);operator=read_private(operator_binding['path'])
    if card.digest(operator['admin_user'].encode())!=card.CARDS[CARD]:raise RuntimeError('CARD47_CONFIG_UNKNOWN')
    canonical_lock=Path.home()/'.local/state/loginom-multica/account-locks'/(operator['admin_user']+'.lock');canonical=marker_paths(canonical_lock)[0]
    if marker['path']!=str(canonical) or marker['sha256']!=MARKER_SHA or (marker['device'],marker['inode'])!=(64512,2398118) or canonical.stat().st_size!=4533:
        raise RuntimeError('CARD47_EXACT_MARKER_REQUIRED')
    if lock['path']!=str(canonical_lock) or (lock['device'],lock['inode'])!=(64512,2398072):raise RuntimeError('CARD47_PERMANENT_FLOCK_REQUIRED')
    expected=grant['expected_observer']
    if expected['session_id']!=3128 or expected['guid_hash']!='8d9e536e57f281f3d831d169e7fd5b3d24e9f56c74161cf598fae598ef2f7a92' or expected['create_time']!='2026-10-09T04:14:57.984Z' or expected['user_hash']!=card.digest(b'admin'):
        raise RuntimeError('CARD47_OWNER_OBSERVER_CHANGED')
    old=read_private(canonical);exact,partial=origin_records(old,origins)
    targets=[*configs,marker,lock,*origins,authorization]
    directory=new_evidence_directory(evidence_dir);fd=os.open(canonical_lock,os.O_RDWR|os.O_NOFOLLOW)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);guard={**lock,'fd':fd}
        def current():
            if provision.clean_candidate(source_sha)!=source:raise RuntimeError('CARD47_SOURCE_CHANGED')
            card.require_bindings(targets);card.check_held([guard]);absence(exact,partial)
            if os.path.lexists(marker_paths(canonical_lock)[1]):raise RuntimeError('CARD47_OTHER_MARKER_PRESENT')
        current();inputs={k:grant[k] for k in ['issue_id','operation_id','source','expected_observer','configs','marker','card_operator','origins']}
        inputs.update(directory=str(directory),stand=operator['url']);input_file=directory/'input.json';write_private(input_file,inputs)
        collector=[operator['node'],Path(__file__).with_name('card-observer-readback.mjs')]
        if provision.run_foreground([*collector,'request',input_file],[],directory/'request',timeout=10):raise RuntimeError('CARD47_REQUEST_UNKNOWN')
        response=directory/'parent-response.json';card.wait_file(response);inputs.update(requestFile=str(directory/'parent-request.json'),responseFile=str(response));write_private(input_file,inputs)
        if provision.run_foreground([*collector,'verify',input_file],[],directory/'verify',timeout=10):raise RuntimeError('CARD47_SERVER_UNKNOWN')
        request=read_private(directory/'parent-request.json');consumed=directory/('card47-consumed-'+request['nonce']+'.json');proof=read_private(consumed)
        protected=[card.binding(p) for p in [input_file,response,directory/'parent-request.json',consumed]]
        if [proof[k] for k in ['input_sha256','response_sha256','request_sha256']]!=[x['sha256'] for x in protected[:3]]:raise RuntimeError('CARD47_PROOF_CHANGED')
        fd_proof=card.request_fd(directory,grant,[guard],targets);current();card.require_bindings([*protected,fd_proof])
        age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['readback']['refreshed_at'].replace('Z','+00:00'))).total_seconds()
        if not 0<=age<=300:raise RuntimeError('CARD47_SERVER_STALE')
        owner.archive_legacy([marker],directory/'immutable-history',directory/'current-card47-reconciled.json',{
            'operation_id':operation_id,'source':source,'current_proof':'CURRENT_CARD47_PROOF_ONLY','ready':False,'history_state':'UNKNOWN_PRESERVED',
            'history_facts_modified':False,'origins':origins,'known_exact_records':exact,'partial_numeric_pids':partial,
            'guid_algorithm':'sha256-utf8-exact-guid-string','historical_executed_bytes':'NOT_ESTABLISHED',
            'server_proof':card.binding(consumed),'fd_proof':fd_proof,'marker_original_status':old.get('phase')})
    finally:os.close(fd)
if __name__=='__main__':
    def cancel(_signum,_frame):raise RuntimeError('CARD47_CANCELLED_UNKNOWN')
    for sig in [signal.SIGINT,signal.SIGTERM]:signal.signal(sig,cancel)
    parser=argparse.ArgumentParser();parser.add_argument('--authorization',type=Path,required=True);parser.add_argument('--evidence-dir',type=Path,required=True);parser.add_argument('--source-sha',required=True)
    args=parser.parse_args()
    try:reconcile(args.authorization,args.evidence_dir,args.source_sha)
    except Exception as error:print(str(error) if isinstance(error,RuntimeError) else 'CARD47_UNKNOWN',file=__import__('sys').stderr);raise SystemExit(1)
