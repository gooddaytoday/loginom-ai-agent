"""Verify actual post-gesture reply loss and public replay against native records."""
import json
from pathlib import Path
import sys
from verify_downloads import raw_result
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import collapse_acceptance as admission

def check(directory, *, expected_runtime=None):
    expected_runtime=admission.RUNTIME if expected_runtime is None else expected_runtime
    p=Path(directory)
    get=lambda name:json.loads((p/name).read_text())
    session=get('session.json')
    if session['clientRevision']!=expected_runtime:raise ValueError('current loss runtime required')
    loss=get('gates-loss.json'); replay=get('gates-loss-replay.json'); native=get('gates-loss-native.json')
    request=loss['request']; outcome=loss['outcome']; body=outcome['output']; operation=request['operation_id']
    if outcome['status']!='AMBIGUOUS' or outcome['operation_id']!=operation or outcome['phase']!='configure' or body['pending_phase']!='configure' or body['cleanup_complete'] is not False:
        raise ValueError('original loss must stay unresolved')
    drops=loss['dropped']
    if len(drops)!=1 or drops[0]['operation_id']!=operation or drops[0]['verb']!='set_checked' or drops[0]['gesture_applied'] is not True:
        raise ValueError('one actual checkbox gesture required')
    sequence=drops[0]['browser_sequence']; gesture=raw_result(p/f'browser-{sequence}.json')
    act=gesture['output']['value']
    if gesture['operation_id']!=operation or act['status']!='SUCCEEDED' or act['action_key']!='ui.act' or act['output']['gesture_applied'] is not True:
        raise ValueError('raw successful gesture required')
    context=act['output']['prepared_node_context']
    for key in ['document_id','node_id']:
        if context[key]!=body['node'][key] or request['target']['ref'][key]!=body['node'][key]:raise ValueError('gesture owner differs')
    if raw_result(p/f'browser-{sequence+1}.json')!=native or native['document_id']!=body['node']['document_id'] or native['skip'] is not request['parameters']['ignore_empty'] or native['variable'] is not False:
        raise ValueError('post-loss native state differs')
    fields=native['grids'][0]['source']
    previous=get('obligation-close-readback.json')['output']['configuration']['readback']
    for role,name in [(6,'information'),(7,'transposed')]:
        names=[f['data']['Name'] for f in sorted((f for f in fields if f['data']['Disposition']==role),key=lambda f:f['data']['Order'])]
        if names!=[f['name'] for f in previous[name]]:raise ValueError('native roles changed')
    if previous['ignore_empty'] is request['parameters']['ignore_empty']:raise ValueError('loss gesture did not change value')
    if any(replay[k]!=sequence for k in ['before','after','after_resume']) or replay['same_result'] is not True or replay['replay_status']!='AMBIGUOUS' or 'unresolved phase' not in replay['resumed']['error']:
        raise ValueError('replay performed work or resumed unresolved operation')
    transcript=[json.loads(line) for line in (p/'public-api.jsonl').read_text().splitlines()]
    requests=[r for r in transcript if r['phase']=='request' and r['request']['arguments'].get('operation_id')==operation]
    replies={r['id']:r for r in transcript if r['phase']=='response'}
    replay_requests=[r for r in requests if r['request']['name']=='dock_node_apply' and r['before']==sequence]
    resume_requests=[r for r in requests if r['request']['name']=='dock_node_resume']
    if len(replay_requests)!=1 or len(resume_requests)!=1:raise ValueError('actual public replay/resume required')
    for row in replay_requests+resume_requests:
        reply=replies[row['id']]
        if row['request']['arguments']!=request or reply['after']!=sequence:raise ValueError('public replay changed request or performed browser work')
    def public_body(row):
        envelope=row['reply'];body=envelope['structuredContent']
        if json.loads(envelope['content'][0]['text'])!=body:raise ValueError('public text/structured reply differ')
        return body
    # Done/Close must also be actual public results, not manually written flags.
    preserved=None
    for filename,finish in [('obligation-done-after-source.json','done'),('obligation-close.json','close'),('obligation-close-readback.json','done')]:
        saved=get(filename);op=saved['operation_id']
        calls=[r for r in transcript if r['phase']=='request' and r['request']['name']=='dock_node_apply' and r['request']['arguments']['operation_id']==op]
        if len(calls)!=1 or calls[0]['request']['arguments']['finish']!=finish:raise ValueError('Done/Close public request missing')
        terminal=[r for r in transcript if r['phase']=='response' and r['reply'].get('structuredContent',{}).get('operation_id')==op and r['reply']['structuredContent'].get('state')=='settled']
        if not terminal or any(public_body(r)['outcome']!=saved for r in terminal):raise ValueError('Done/Close raw result differs')
        body_saved=saved['output']
        if saved['status']!='SUCCEEDED' or body_saved['execution']['status']!='not_requested':raise ValueError('Done/Close unexpectedly executed')
        config=body_saved['configuration']
        if finish=='close':
            if config['status']!='discarded':raise ValueError('Close did not discard draft')
        else:
            fields={k:config['readback'][k] for k in ['mode','information','transposed','ignore_empty','input_mapping','output_mapping']}
            if preserved is not None and fields!=preserved:raise ValueError('Close changed persisted settings')
            preserved=fields
    replay_body=public_body(replies[replay_requests[0]['id']])
    if replay_body['state']!='settled' or replay_body['outcome']!=outcome:raise ValueError('raw replay changed original outcome')
    original_replies=[replies[r['id']] for r in requests if r['id']<replay_requests[0]['id'] and replies[r['id']]['reply'].get('structuredContent',{}).get('state')=='settled']
    if len(original_replies)!=1 or public_body(original_replies[0])['outcome']!=outcome:raise ValueError('original raw loss differs')
    waits=[r for r in requests if r['request']['name']=='dock_node_wait' and r['id']>resume_requests[0]['id']]
    if len(waits)!=1 or replies[waits[0]['id']]['after']!=sequence:raise ValueError('actual settled resume refusal missing')
    resume=public_body(replies[waits[0]['id']])
    if resume['state']!='settled' or resume['outcome'] is not None or resume['error']['code']!='NODE_WORKER_REJECTED' or 'unresolved phase' not in resume['error']['message']:raise ValueError('raw public resume refusal missing')
    return {'status':'POST_GESTURE_LOSS_PASS','operation_id':operation,'browser_sequence':sequence,'native_flag':native['skip'],'public_replay_no_browser_work':True,'resume':'REFUSED_UNRESOLVED_PHASE','done_close':'PASS_WITH_PUBLIC_READBACK','runtime':session['clientRevision'],'model_run':False}

if __name__=='__main__':
    import argparse
    a=argparse.ArgumentParser();a.add_argument('directory');a.add_argument('--output',required=True);args=a.parse_args()
    result=check(args.directory);Path(args.output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
