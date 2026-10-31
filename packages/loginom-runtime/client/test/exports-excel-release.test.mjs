import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {releaseNodeApply} from '../lib/node-apply.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'export'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
 navigation_path:[{tid:'path',label:'Scenario'}]};
const phases=['input_mapping','open','configure','output_mapping','finish','execute'];

function fixture(phase='configure',fault,{wizard=true,executionStatus='pending',confirmation=false,wizardStage='excel_export'}={}) {
 let open=wizard,question=false,action,graphReads=0,clock=Date.now();const gestures=[],events=[];
 const request={operation_id:'apply-export',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'exports.excel',ref:node},inputs:[],mode:'xlsx',parameters:{},mappings:[],finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const operation={id:'apply-export',action:{action_key:'node.apply',revision:'1'},parameters:request,deadline:1,
  transportUncertain:fault==='transport',lastReceipt:{id:'apply-export:n1'},
  nodeApply:{request,node,pending:{phase,deadline:1},phases:[],signature:'signature',deadline:1,
   execution:{status:executionStatus,execution_id:'original-exec'},output:{status:'not_refreshed',evidence_ref:null,ports:[]}},
  nodeTargetAdapter:{observe:async()=>{
   graphReads++;
   return {complete:fault!=='incomplete',document_id:fault==='document'?'other':'doc',workflow_ref:workflow,
    nodes:fault==='missing'?[]:[{ref:node,type:'exports.excel',label:'Export',position:{x:320+(fault==='graph'&&graphReads>1?8:0),y:280},inputs:[0],outputs:[]}],
    links:fault==='links'&&graphReads>1?[{source:'changed'}]:[],foreign_links:[]};
  }}};
 const snapshot=()=>({origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,node_id:fault==='foreign'?'other':'export',verified:true,surface:open?'wizard':'graph',locked:open||fault==='locked',
   ...(open&&phase==='input_mapping'?{input_port:{direction:'input',port:0,native_index:0,port_guid:'input',opening_operation_id:'apply-export:n1'}}:{})},
  wizard:open?{status:'observed',root_ref:'ui-w',root_tid:'W',stage:phase==='input_mapping'?'input_mapping':wizardStage,owner_context:{status:'observed',node:{tid:'owner'}}}:{status:'absent'},
  ui:{elements:question?['yes','no'].map(name=>({tid:'msgbox;tlb;'+name,ref:'ui-'+name,label:name==='yes'?'Да':'Нет',signature:{dialog_ref:'ui-question'},allowed_actions:name==='yes'?['click','confirm_wizard_close']:['click']}))
    :open?[{tid:'W;btnClose',ref:'ui-close',allowed_actions:['click']}]:[],
   dialogs:question?[{ref:'ui-question',title:'Подтвердить',text:'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'}]:fault==='dialog'?[{ref:'ui-other-dialog'}]:[],
   masks:fault==='mask'?[{ref:'ui-other-mask'}]:[],truncated:{elements:false,dialogs:false,masks:false}}});
 const record=async e=>{events.push(e);if(e.phase==='node_step_prepared')action=e;
  return fault==='journal'&&e.phase==='node_operation_released'?null:structuredClone(e);};
 const support=createCandidateNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
 const drivers=support.nodeApplyDriverFactory({operation,onRecord:record,
  now:()=>clock+=['locked','dialog','mask'].includes(fault)?5000:0,
  receiptOptions:(id,key,signature)=>({id,action_key:key,signature}),
  readReceipt:async()=>fault==='receipt'?{state:'pending'}:{state:'completed',receipt:{cleanup_complete:fault!=='cleanup'}},
  execute:async()=>{
   if(!action)return {status:'SUCCEEDED',output:snapshot()};
   const current=action;action=null;gestures.push(current.action);
   if(fault==='lost')throw Error('Lost Close reply');
   if(question){
    assert.deepEqual(current.action,{verb:'confirm_wizard_close',ref:'ui-yes'});
    if(fault==='lost_confirmation')throw Error('Lost confirmation reply');
    question=false;open=false;
   }else{
    assert.deepEqual(current.action,{verb:'click',ref:'ui-close'});
    if(confirmation)question=true;else open=false;
   }
   return {status:'SUCCEEDED',operation_id:current.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:snapshot()};
  }});
 return {operation,drivers,gestures,events,run:signal=>releaseNodeApply({operation,handlers:support.nodeApplyHandlers,drivers,record,signal})};
}

test('XLSX sink release retains unknown settings and execution without replay',async()=>{
 for(const phase of ['configure','finish','execute']){const f=fixture(phase),r=await f.run();assert.equal(r.configuration.status,'unknown');assert.equal(r.execution.status,'unknown');assert.equal(r.cleanup_complete,true);assert.equal(r.next_step.tool,'dock_action_run');assert.match(r.next_step.instruction,/Do not[\s\S]*repeat[\s\S]*export/);}
});
