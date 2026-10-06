"""Receipt oracle for repeated source references, never a missing-field oracle."""
import json

def require(ok,message):
 if not ok:raise ValueError(message)

def audit(terminal,case):
 prepared=[t['result'] for t in terminal if t['tool']=='loginom_dock_prepare']
 require(len(prepared)==1,'ONE_PREPARED_PACKAGE_REQUIRED')
 workspace=prepared[0].get('workspace',{});account=workspace.get('loginom_account');require(workspace.get('status')=='READY' and workspace.get('ownership_verified') is True and isinstance(account,str) and account,'OWNED_WORKSPACE_REQUIRED')
 source=case['source'];admitted=[v for v in prepared[0].get('input_artifacts',[]) if v.get('bytes')==source['bytes'] and v.get('sha256')==source['sha256'] and v.get('name','').endswith(source['name'])]
 require(len(admitted)==1,'EXACT_ORIGINAL_ARTIFACT_REQUIRED')
 uploads=[t for t in terminal if t['tool']=='loginom_dock_artifact_deliver'];require(len(uploads)==1,'ONE_DELIVERY_REQUIRED')
 upload=uploads[0];transfer=upload['result'].get('output',{});artifact=admitted[0]
 require(upload['input'].get('artifact_id')==artifact['artifact_id'] and upload['input'].get('upload_grant_id')==artifact['upload']['grant_id'],'ADMITTED_GRANT_DIFFERS')
 require(upload['result'].get('status')=='SUCCEEDED' and transfer.get('upload_completion_verified') is True and transfer.get('cleanup_complete') is True and transfer.get('destination')==artifact['upload']['destination'] and transfer.get('bytes')==source['bytes'] and transfer.get('sha256')==source['sha256'],'SERVER_BYTES_UNCONFIRMED')
 applies=[t for t in terminal if t['tool']=='loginom_dock_node_apply'];require(len(applies)==1,'ONE_UNCORRECTED_REQUEST_REQUIRED')
 call=applies[0];request=call['input'];parameters=request['parameters'];settings=parameters['settings']
 require(request['target']['kind']=='new' and request['target']['type']=='imports.text' and request['mode']=='delimited' and request['finish']=='execute' and request['inputs']==[] and request.get('mappings',[])==[],'NEGATIVE_REQUEST_DIFFERS')
 require(request.get('document_id')==workspace.get('document_id') and request.get('workflow_ref',{}).get('workflow_id')==workspace.get('workflow_ref',{}).get('workflow_id') and transfer['destination'].startswith('/'+account+'/'),'REQUEST_WORKSPACE_OWNER_DIFFERS')
 require(parameters['source']['artifact_id']==artifact['artifact_id'] and parameters['source']['upload_operation_id']==transfer['upload_operation_id'],'SOURCE_LINEAGE_DIFFERS')
 require(settings['columns']==case['columns'] and settings['format']==case['settings']['format'] and settings['source']=={**case['settings']['source'],'source_path':transfer['destination']},'EXACT_REPEAT_REFERENCES_REQUIRED')
 # The public boundary emits a structured settled request rejection. It is
 # not a node operation and has no browser effects. Transport errors cannot pass.
 refusal=call['result'];error=refusal.get('error',{})
 require(refusal.get('operation_id')==request['operation_id'] and refusal.get('state')=='settled' and refusal.get('status')=='NOT_APPLIED' and refusal.get('action_key')=='request.validate' and refusal.get('phase')=='request_rejected' and refusal.get('request_rejected') is True and refusal.get('effect_possible') is False and refusal.get('cleanup_complete') is True and error.get('code')=='REQUEST_REJECTED' and error.get('message')=='Duplicate source column names','EXACT_PREFLIGHT_REFUSAL_REQUIRED')
 require(not any(t['tool'] in ['loginom_dock_node_resume','loginom_dock_node_target','loginom_dock_run','loginom_dock_ui_act'] for t in terminal),'ALTERNATIVE_MUTATION_REFUSED')
 require(not any(t['result'].get('operation_id')==request['operation_id'] and t['result'].get('state') in ['running','settled'] and t['result'].get('action_key')!='request.validate' for t in terminal),'IMPORT_OPERATION_MUST_NOT_START')
 saves=[t for t in terminal if t['tool']=='loginom_dock_action_run']
 require(len(saves)==1 and saves[0]['input'].get('action_key')=='package.save_checkpoint' and saves[0]['result'].get('status')=='SUCCEEDED' and saves[0]['result'].get('cleanup_complete') is True and terminal.index(saves[0])<terminal.index(upload),'EMPTY_PACKAGE_SAVE_BEFORE_DELIVERY_REQUIRED')
 save=saves[0];out=save['result'].get('output',{});path=save['input'].get('parameters',{}).get('path','');require(path.startswith('/'+account+'/') and out.get('package_ref',{}).get('path')==path and out.get('package_ref',{}).get('active_identity')==path and out.get('save_completed') is True and out.get('workflow_preserved') is True,'EMPTY_PACKAGE_SAVE_UNCONFIRMED')
 return {'status':'PASS','reason':error['message'],'refusal_boundary':'request_validation_before_browser_phase','receipt':refusal,'source':source,'cli_delivery':transfer,'source_references':[c['source_name'] for c in settings['columns']],'output_names':[c['name'] for c in settings['columns']],'node_apply_count':1,'delivery_count':1,'execute_requested':True,'execute_started':False}
