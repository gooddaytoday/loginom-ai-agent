"""Distinguish a verified delivery child from an unresolved ambiguous operation."""
import json

def verified_delivery_child(v,e,ps,ambiguous):
    need=v.need;op=ambiguous['operation_id'];initial=ambiguous['outcome']
    need(ambiguous.get('action_key')=='artifact.upload' and initial.get('error',{}).get('code')=='UPLOAD_SERVER_VERIFICATION_REQUIRED','Not a pending upload verification')
    prepared=v.event(e,op,'prepared');transfer=v.event(e,op,'transfer_completed');final=transfer['outcome'];data=final['output'];proof=data['server_copy_verification']
    need(prepared['parameters']==ambiguous['parameters']==transfer['parameters'],'Upload parameters changed')
    need(initial['output']['upload_submitted'] is True and final['status']=='SUCCEEDED' and final['cleanup_complete'] is True and final.get('error') is None,'Upload not completed cleanly')
    need(data['upload_submitted'] is True and data['verification_required'] is False and proof['status']=='SUCCEEDED' and proof['bytes_verified'] is True and proof['upload_completion_verified'] is True,'Upload bytes remain unverified')
    parent=v.one([x for x in e['events'] if x.get('phase')=='artifact_delivery_completed' and x.get('result',{}).get('upload_operation_id')==op],'Verified delivery parent missing')
    start=v.event(e,parent['operation_id'],'artifact_delivery_prepared');delivery=parent['result'];params=prepared['parameters']
    need(type(data['bytes']) is int and data['bytes']>0,'Invalid verified byte count')
    for key in ('destination','bytes','sha256'):
        need(data[key]==proof[key]==start[key]==delivery[key],'Delivery byte identity differs: '+key)
    need(params['destination']==data['destination'] and start['artifact_id']==params['artifact_id']==data['artifact_id'] and params['upload_grant_id']==data['upload_grant_id'],'Delivery artifact identity differs')
    need(delivery['status']=='SUCCEEDED' and delivery['cleanup_complete'] is True and delivery['upload_completion_verified'] is True and delivery['verification_id']==proof['verification_id'],'Delivery completion missing')
    call,reply=v.one([(c,r) for c,r in ps if c['tool']==v.PREFIX+'dock_artifact_deliver' and c['arguments'].get('operation_id')==parent['operation_id']],'One public delivery call required')
    need(call['arguments']['artifact_id']==params['artifact_id'] and call['arguments']['upload_grant_id']==params['upload_grant_id'],'Public delivery changed grant')
    body=reply['result']
    need(body['operation_id']==parent['operation_id'] and body['state']=='settled' and body['error'] is None,'Public delivery has not resolved')
    if body.get('result_version')=='user-v1':
        need(body['status']=='SUCCEEDED' and body['cleanup_complete'] is True and json.dumps(body['output'],sort_keys=True)==json.dumps(delivery,sort_keys=True) and body['limitations']==[],'Compact delivery differs from verified journal')
    else:
        need(body['phase']=='completed' and body['upload_operation_id']==op and json.dumps(body['outcome'],sort_keys=True)==json.dumps(delivery,sort_keys=True),'Diagnostic delivery differs from verified journal')
    verify=proof['verification_id'];download=v.event(e,verify,'download_completed');checked=v.event(e,verify,'download_verified')
    need(download['parameters']['upload_operation_id']==checked['parameters']['upload_operation_id']==op and download['outcome']['status']=='SUCCEEDED' and download['outcome']['cleanup_complete'] is True,'Unbound or incomplete native download')
    out=checked['outcome'];verified=out['output']
    need(out['status']=='SUCCEEDED' and out['cleanup_complete'] is True and verified['bytes_verified'] is True and verified['download_completed'] is True and verified['bytes_verification_required'] is False,'Native bytes verification incomplete')
    for key in ('destination','bytes','sha256','artifact_id','upload_grant_id'):
        need(verified[key]==data[key],'Native download differs: '+key)
    need(verified['upload_operation_id']==op,'Native verification belongs to another upload')
    ordered=[start,prepared,ambiguous,download,checked,transfer,parent]
    indexes=[e['events'].index(x) for x in ordered];need(indexes==sorted(indexes),'Transfer proof order differs')
    for x in ordered:
        need(all(x.get(k)==ambiguous.get(k) for k in ('session_id','runtime_revision','manifest_sha256')),'Foreign transfer proof')
    preparations=[r['result'] for c,r in ps if c['tool']==v.PREFIX+'dock_prepare' and c['session_id']==call['session_id'] and r['row']<call['row'] and r['result'].get('prepared') is True]
    need(bool(preparations) and all(p['sessionId']==ambiguous['session_id'] for p in preparations),'Foreign public delivery session')
    return True
