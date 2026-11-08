import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createTextImportNodeSupport} from '../lib/text-import-node.mjs';
import {finishedImportSurface,verifyFinishedImportContinuation,verifyWaitingExecutionContinuation} from '../lib/node-import-continuation.mjs';

function savedImport(kind='bound',active=true,pathOverride){
 const node={document_id:'doc',workflow_id:'wf',node_id:'import'},source={...node,node_id:'vars'};
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const path=pathOverride!==undefined?pathOverride:kind==='outside'?'/shared/a.csv':'/own/inputs/a.csv';
 const r={document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'imports.text',ref:node},mode:'delimited',
  parameters:{settings:{}},bindings:[],inputs:[],variable_inputs:[],mappings:[],finish:'execute',read:{ports:[0]}};
 const operation={id:'saved',action:{action_key:'node.apply',revision:'1'},parameters:r};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:source,type:kind==='other-source'?'variables.calculator':'variables.user',variable_outputs:[{kind:'variables',port:4,port_guid:'source-port'}]}],
  variable_links:kind==='no-variables'?[]:[{source:'vars',target:'import',kind:'variables',input:0,output:4,target_port_guid:'input'}]};
 const mapping={kind:'variables',port:0,port_guid:'input',fields:[{name:'CsvPath',label:'CsvPath',id:7,type:5,source:{name:'CsvPath',id:7,type:5}}]};
 const owner={status:'observed',node:{tid:'flow>Import',label:'Import'},path:[...workflow.navigation_path,{tid:'node',label:'Import'},{tid:'settings',label:'Settings'}]};
 const actions=[];let opened=false,pending,witnesses=0,available=false;
 const state=()=>({origin:'https://app.loginom.ai',loginom_build:'7.4.2',workflow_ref:workflow,scan:{complete:true},dom_epoch:{document:'dom',revision:1},
  prepared_node_context:{...node,verified:true,tid:'N',surface:opened?'wizard':'graph',locked:false},
  wizard:opened?{status:'observed',stage:'text_import_file',root_ref:'ui-W',root_tid:'W',owner_context:owner,
   import_source:{fields:{source_path:{status:'observed',variable_mode:kind!=='literal',variable_caption:'CsvPath ( '+path+' )',value:path,truncated:false,row_id:'file-row'}}}}:{status:'absent'},
  ui:{dialogs:[],masks:[],truncated:{masks:false,dialogs:false},elements:opened?[{ref:'ui-cancel',tid:'W;btnClose',allowed_actions:['click']}]:[
   {ref:'ui-settings',tid:'N;Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Import'},workflow_path:workflow.navigation_path}}]}});
 operation.nodeTargetAdapter={observe:async()=>structuredClone(graph)};
 const options={operation,now:Date.now,receiptOptions:()=>({}),isBoundFileInput:p=>p.startsWith('/own/inputs/'),
  resolveBoundFileSource:async p=>{witnesses++;if(!available)throw Error('BINDING_SOURCE_UNVERIFIED: fresh witness required');return {kind:'storage',verified:true,destination:p};},
  onRecord:async event=>{if(event.phase==='node_step_prepared')pending=event;return structuredClone(event);},
  execute:async()=>{
   if(!pending)return {status:'SUCCEEDED',output:state()};
   const step=pending;pending=null;const action=step.action;actions.push(action.verb);
   if(action.verb.startsWith('user_')||action.verb==='variable_mapping_read'){
    const output={verified:true,cleanup_complete:true,effect_possible:false,independent_readback:true,
     node_context:action.verb==='variable_mapping_read'?node:source,
     ...(action.verb==='variable_mapping_read'?{mapping}:{source_active:active,variables:[{id:7,name:'CsvPath',type:'string',cell:{type:'string',is_null:path===null,value:path}}]})};
    if(action.verb==='user_runtime_read'&&!active){output.independent_readback=false;delete output.variables;}
    return {status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'node.variables.'+action.verb+'.internal',cleanup_complete:true,effect_possible:false,output};
   }
   if(action.verb==='begin_wizard')opened=true;else if(action.verb==='click'&&action.ref==='ui-cancel')opened=false;else assert.fail('Unexpected mutation '+JSON.stringify(action));
   return {status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,error:null,trace:[]};
  }};
 const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+60000};
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 return {options,operation,r,actions,ctx,driver:()=>support.nodeApplyDriverFactory(options),allowWitness:()=>{available=true;},witnesses:()=>witnesses};
}

for(const kind of ['no-variables','literal','other-source','outside'])test('legacy saved '+kind+' has no binding guard without the private session-input capability',()=>{
 const f=savedImport(kind);delete f.options.isBoundFileInput;
 assert.equal(f.driver().beforeTarget,undefined);
 assert.equal(f.witnesses(),0);assert.deepEqual(f.actions,[]);
});
for(const kind of ['no-variables','literal','other-source','outside'])test('saved '+kind+' keeps legacy Execute without a Files witness',async()=>{
 const f=savedImport(kind);await f.driver().beforeTarget?.(f.ctx);
 assert.equal(f.witnesses(),0);assert.equal(f.operation.importBindingInventory,undefined);
 assert.ok(!f.actions.includes('user_values'),'an active foreign source must not be deactivated');
 if(['no-variables','other-source'].includes(kind))assert.deepEqual(f.actions,[]);
});
for(const active of [true,false])for(const bindings of [undefined,[]])test('our saved binding still requires a fresh witness on Execute, empty bindings; active='+active+', omitted='+(bindings===undefined),async()=>{
 const f=savedImport('bound',active);f.r.bindings=bindings;
 await assert.rejects(f.driver().beforeTarget(f.ctx),/BINDING_SOURCE_UNVERIFIED: fresh witness required/);
 assert.equal(f.witnesses(),1);f.allowWitness();f.operation.id='second-execute';
 await f.driver().beforeTarget(f.ctx);assert.equal(f.witnesses(),2);
 assert.equal(f.operation.importBindingInventory[0].variable.name,'CsvPath');
 if(active)assert.ok(!f.actions.includes('user_values'));
});

for(const value of [null,''])test('our saved string binding refuses '+(value===null?'NULL':'empty')+' before Execute',async()=>{
 const f=savedImport('bound',false,value);
 await assert.rejects(f.driver().beforeTarget(f.ctx),value===null?/BINDING_NULL_UNSUPPORTED/:/BINDING_VALUE_INVALID/);
 assert.equal(f.witnesses(),0);
});
for(const type of ['imports.excel','transform.filter_data','transform.sorting','integration.rest_request'])test('private Import capability adds no beforeTarget to another type: '+type,()=>{
 const f=savedImport();f.r.target.type=type;f.r.mode='read_existing_output';
 f.options.isBoundFileInput=()=>assert.fail('Foreign type must not use Import scope');
 assert.equal(f.driver().beforeTarget,undefined);assert.deepEqual(f.actions,[]);
});

for(const running of [false,true])test('actual bound finish retains the identified launch for continuation; running='+running,async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'import'},context={...node,verified:true,surface:'graph',tid:'N'};
 const surface={dom_epoch:{document:'dom',revision:1},prepared_node_context:context,wizard:{status:'absent'},
  node_processes:{verified:true,inventory_complete:true,show_completed:true,node_context:context,root_id:'root',
   processes:[{parent_id:null,process_id:'group',record_id:'record',state:running?'running':'completed',error:false,
    progress_state:{verified:true,state:'running',terminal:false}}]},
  node_outputs:{verified:true,node_context:context,ports:[{index:0,port_guid:'output',active:!running}]},
  ui:{elements:[{tid:'N;Label;Label',graph_node:{part:'label',label_text:'Bound'}}]}};
 const execution={node,execution_id:'execution',root_id:'root',group_id:'group',group_record_id:'record'};
 const operation={parameters:{},nodeApply:{request:{}},importBinding:{},nodeTargetAdapter:{observe:async()=>({})}};
 let launches=0,identified=false,captured=false;
 // Run the actual factory method body with its boundary dependencies. This
 // preserves the bound/sourceSwitch branch instead of fabricating a finish.
 const method=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation}).finish.toString();
 const run=new Function('f',`return (async()=>{const {operation,channel,executionDriver,read,readImportBindings,finishedImportSurface,ctx}=f;
  const sourceSwitch=null,configured=null,enter=()=>{},requireValue=(v,m)=>{if(!v)throw Error(m)},one=(xs,m)=>{requireValue(xs.length===1,m);return xs[0]},verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
  return ({${method}}).finish('execute',ctx);})()`);
 const finish=await run({operation,ctx:{document_id:'doc',workflow_ref:{workflow_id:'wf'},node,deadline:Date.now()+60000},
  read:async()=>({wizard:{root_tid:'W'},ui:{elements:[{tid:'W;btnDone',ref:'done',allowed_actions:['finish_wizard']} ]}}),
  readImportBindings:async()=>[],finishedImportSurface,
  executionDriver:{launchGraph:async()=>{launches++;},identify:async()=>{identified=true;return execution;}},
  channel:{perform:async()=>{},observe:async o=>{if(o.readProcesses){assert.equal(identified,true);assert.equal(o.readOutputs,true);captured=true;assert.ok(o.ready(surface));}return structuredClone(surface);}}});
 assert.equal(captured,true);assert.equal(launches,1);assert.equal(verifyFinishedImportContinuation({node,finish,surface}),!running);
 const checkpoint={phase:'execute',read_only:true,cleanup_complete:true,execution_id:'execution'};
 assert.equal(verifyWaitingExecutionContinuation({node,finish,surface,checkpoint}),true);
 const completed=structuredClone(surface);completed.dom_epoch.revision++;
 completed.node_processes.processes[0].state='completed';completed.node_outputs.ports[0].active=true;
 assert.equal(verifyWaitingExecutionContinuation({node,finish,surface:completed,checkpoint}),true);
 const changed=structuredClone(surface);changed.dom_epoch.document='other';
 assert.equal(verifyWaitingExecutionContinuation({node,finish,surface:changed,checkpoint}),false);
});
