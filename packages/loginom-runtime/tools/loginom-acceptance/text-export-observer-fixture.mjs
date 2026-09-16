// Synthetic offline fixtures. No native evidence or product outcome creation.
import {createHash} from 'node:crypto';
export function syntheticBinding(){
 const hash=x=>createHash('sha256').update(x).digest('hex'),run_id='20260913-180000-1234abcd',destination=`/test-2/Dock-export-${run_id}-csv.csv`;
 const node={document_id:'d',workflow_id:'w',node_id:'n'},source={...node,node_id:'s'},workflow_ref={workflow_id:'w',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[]};
 const meta={session_id:'session',runtime_revision:'a'.repeat(64),target:{profile_id:'loginom-7.4.2-macos-chromium-ru',loginom_build:'7.4.2',platform:'macos',browser:'chromium'}};
 const sourceEvent={...meta,operation_id:'source',phase:'completed',outcome:{status:'SUCCEEDED',output:{node:source}}};
 const original={...meta,operation_id:'original',phase:'completed',parameters:{document_id:'d',workflow_ref,inputs:[{source,output:0,input:0}]},outcome:{status:'SUCCEEDED',output:{node,output:{file_artifacts:[{artifact_id:'original',execution_id:'e',destination,sha256:hash('x\n'),bytes:2,freshness_basis:'native_absence_check_and_completed_execution'}]}}}};
 const rejected={...meta,operation_id:'reject',phase:'node_phase_refused',receipt:{verification:'text_export_conflict_rejected',before_node:node,cleanup_complete:true}};
 const terminal={...meta,operation_id:'reject',phase:'completed',parameters:{parameters:{destination,overwrite:'reject'},target:{ref:node}},outcome:{status:'FAILED',cleanup_complete:true}};
 const request={params:{name:'dock_node_apply',arguments:{operation_id:'replace',document_id:'d',workflow_ref,target:{kind:'existing',type:'exports.text',ref:node},inputs:[],parameters:{destination,overwrite:'replace'}}}};
 const prepared={...meta,event:'workspace_prepared',state:{status:'READY',authenticated:true,ownership_verified:true,target_verified:true,session_id:'session',document_id:'d',workflow_ref,target:meta.target}};
 const observation={...meta,operation_id:'original',phase:'node_observation_completed',outcome:{output:{origin:'http://logi-test-plan.bg.local/',authenticated:true,loginom_build:'7.4.2',dom_epoch:{document:'epoch'},workflow_ref,prepared_node_context:{verified:true,...node}}}};
 return {node,source,workflow_ref,request,journal:[prepared,sourceEvent,observation,original,rejected,terminal].map(JSON.stringify).join('\n')+'\n',run:{run_id,goal_id:'text-export-node-complete',runtime_source_pin:{client_revision:meta.runtime_revision}},session:{sessionId:'session',clientRevision:meta.runtime_revision}};
}
export function syntheticNativeResponses(c){
 const name=c.baseline.destination.split('/').at(-1),prefix=c.workflow_ref.prefix;
 const graph={complete:true,interaction_ready:true,document_id:c.identity.document_id,workflow_ref:c.workflow_ref,nodes:[c.identity.node_id,c.identity.source_node_id].map(node_id=>({ref:{document_id:c.identity.document_id,workflow_id:c.identity.workflow_id,node_id}})),links:[c.source_edge],foreign_links:[]};
 const element=(tid,ref,label='',actions=[])=>({tid,ref:'ui-'+ref,label,allowed_actions:actions});
 const toolbar=element('MF;cntMain;tlbMainToolbar','toolbar'),files=element('MF;cntMain;tlbMainToolbar;btnFilestorage','files','Files',['click']);
 const panel=element(prefix+';NavigationBar;NavigationPanel','panel');
 const file={...element(prefix+';FileStorageForm;colName_'+name,'file',name,['double_click']),storage_entry:{bytes:c.baseline.bytes,kind:'file'},interaction:{state:'point_observed'}};
 const workspace=element('MF;cntMain;cntWorkspace;Workspace;t.br','workspace'),tab=element(c.workflow_ref.tab_tid,'tab','Workflow',['click']);
 const snapshot=elements=>({authenticated:true,origin:c.origin,loginom_build:'7.4.2',workflow_ref:c.workflow_ref,file_storage:{directory:'/test-2',status:'observed'},ui:{elements,dialogs:[],masks:[]},dom_epoch:{document:'epoch',revision:1},observation_id:'observation'});
 const obs=els=>({status:'SUCCEEDED',output:snapshot(els)}),gesture={status:'SUCCEEDED',cleanup_complete:true,output:{gesture_applied:true}};
 const download={status:'SUCCEEDED',cleanup_complete:true,observer_download_count:1,observer_listener_registered:true,output:{suggested_name:name,download_completed:true,destination:c.baseline.destination,output_binding:{session_id:c.session_id,document_id:c.identity.document_id,workflow_id:c.identity.workflow_id,node_id:c.identity.node_id,execution_id:c.baseline.execution_id,destination:c.baseline.destination,directory:'/test-2'}}};
 return [graph,obs([toolbar]),obs([files]),gesture,obs([panel]),obs([panel]),obs([file]),obs([file]),download,obs([workspace]),obs([tab]),gesture,obs([tab]),graph].map(x=>structuredClone(x));
}
