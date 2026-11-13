import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {validateConditionParameters} from '../lib/control-condition-parameters.mjs';
import {conditionConfigurationReadback} from '../lib/control-condition-readback.mjs';
import {readConditionOutputs} from '../lib/control-condition-node.mjs';
import {configureCondition} from '../lib/control-condition-procedure.mjs';

const ref=node=>({document_id:'d',workflow_id:'w',node_id:node});
const workflow_ref={workflow_id:'w',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'x',label:'Сценарий'}]};
const ports={kind:'new',type:'control.condition'};
const existing={kind:'existing',type:'control.condition',ref:ref('c')};
const branch={name:'Detailed',variable:'Mode',operator:'=',value:1};
const request=(target,extra={})=>({document_id:'d',workflow_ref,target,inputs:[],finish:'done',...extra});

test('Condition registers an observed native type with a table input, two branch outputs and variables',()=>{
 const t=NODE_TYPES['control.condition'];
 assert.equal(t.icon_class,'bg-vendor-icon-condition');
 assert.equal(t.palette_group,'Управление');
 assert.deepEqual([t.tabular_inputs,t.tabular_outputs,t.variable_inputs,t.variable_outputs],[1,2,1,2]);
 assert.deepEqual(t.modes,['ports','variable_branch']);
 // An existing configured Condition accepts its table link at input 0 only.
 validateNodeTargetRequest({document_id:'d',workflow_ref,target:existing,inputs:[{source:ref('s'),output:0,input:0}]});
 assert.throws(()=>validateNodeTargetRequest({document_id:'d',workflow_ref,target:existing,inputs:[{source:ref('s'),output:0,input:1}]}),/does not exist/);
 const handler=createCandidateNodeSupport({}).nodeApplyHandlers.get('control.condition');
 assert.deepEqual(handler.modes,['ports','variable_branch']);
 assert.equal(handler.parameter_schema.properties.branches.maxItems,1);
});

test('ports creates the inputs of a new unlinked Condition only',()=>{
 validateConditionParameters({},'ports',request(ports));
 for(const [p,r,message] of [
  [{branches:[branch]},request(ports),/parameters \{\}/],
  [{},request(existing),/NEW Condition/],
  [{},request(ports,{inputs:[{source:ref('s'),output:0,input:0}]}),/no links yet/],
  [{},request(ports,{finish:'execute'}),/finish done/],
 ])assert.throws(()=>validateConditionParameters(p,'ports',r),message);
});

test('variable_branch accepts one variable equality branch and refuses unsupported shapes before mutation',()=>{
 const linked=request(existing,{finish:'execute',inputs:[{source:ref('t'),output:0,input:0}],variable_inputs:[{source:ref('v'),output:4,input:0,kind:'variables'}]});
 validateConditionParameters({branches:[branch]},'variable_branch',linked);
 validateConditionParameters({branches:[{...branch,value:'North'}]},'variable_branch',linked);
 for(const [p,message] of [
  [{branches:[branch,{...branch,name:'Second'}]},/exactly one user branch/],
  [{branches:[{...branch,operator:'>'}]},/only operator =/],
  [{branches:[{...branch,aggregation:'sum'}]},/branch name/],
  [{branches:[{...branch,name:'Иначе'}]},/not Иначе/],
  [{branches:[{...branch,value:true}]},/integer or single-line string/],
  [{branches:[branch],debug:'else'},/unsupported parameter/],
 ])assert.throws(()=>validateConditionParameters(p,'variable_branch',linked),message);
 assert.throws(()=>validateConditionParameters({branches:[branch]},'variable_branch',request(ports)),/existing Condition/);
 assert.throws(()=>validateConditionParameters({branches:[branch]},'variable_branch',{...linked,inputs:[{source:ref('t'),output:0,input:1}]}),/input 0/);
});

test('re-execution after an upstream variable change stays in the Condition handler to report branch activity',()=>{
 const rerun={target:existing,finish:'execute',mode:'variable_branch',inputs:[],mappings:[],parameters:{}};
 assert.equal(isUnchangedTransformExecution(rerun),false);
 validateConditionParameters({},'variable_branch',rerun);
 assert.throws(()=>validateConditionParameters({},'variable_branch',{...rerun,finish:'done'}),/exactly one user branch/);
 assert.throws(()=>validateConditionParameters({},'variable_branch',{...rerun,variable_inputs:[{source:ref('v'),output:4,input:0,kind:'variables'}]}),/exactly one user branch/);
});

const owner={verified:true,document_id:'d',workflow_id:'w',node_id:'c',surface:'wizard',tid:'MF;TF-1;WizrdMCF'};
const configuration={verified:true,mode:'variable_branch',node_context:owner,debug_mode:false,
 ports:[{index:0,kind:'table',name:'',label:'Порт1',pass_to_output:true},{index:1,kind:'variables',name:'',label:'Порт2',pass_to_output:true}],
 branches:[{index:0,name:'Detailed'}],conditions:[{index:0,variable:'Mode',relation:'=',value:1}]};
const phases=c=>[{phase:'configure',status:'verified',receipt_id:'op:configure',value:{verified:true,cleanup_complete:true,configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner}}},
 {phase:'finish',status:'verified',receipt_id:'op:finish',value:{verified:true,cleanup_complete:true,settings_applied:true,mode:'execute',node_context:owner}}];

test('readback names each branch output port and the built-in Иначе',()=>{
 const r=conditionConfigurationReadback({node:ref('c'),phases:phases(configuration),operation_id:'op'});
 assert.deepEqual(r.branches,[{name:'Detailed',output_port:0,conditions:[{variable:'Mode',relation:'=',value:1}]},{name:'Иначе',output_port:1,conditions:null}]);
 assert.deepEqual(r.inputs.map(i=>[i.kind,i.port]),[['table',0],['variables',0]]);
 for(const bad of [{...configuration,debug_mode:true},{...configuration,branches:[...configuration.branches,{index:1,name:'B'}]},
  {...configuration,ports:[configuration.ports[0],{...configuration.ports[1],pass_to_output:false}]}])
  assert.throws(()=>conditionConfigurationReadback({node:ref('c'),phases:phases(bad),operation_id:'op'}),/required/);
});

test('reports which branch executed and refuses to read the blocked branch port',async()=>{
 const reads=[];
 const channel={observe:async({ready})=>{const s={node_outputs:{verified:true,surface:'graph',ports:[
   {index:0,label:'Detailed - Порт1',active:false},{index:1,label:'Иначе - Порт1',active:true}]}};assert.equal(ready(s),true);return s;},
  readOutputPort:async({port})=>{reads.push(port);return {output:{port,port_guid:'g'+port,sample_complete:true,schema:[{name:'OrderID',type:'integer'}]}};}};
 const ctx={execution:{execution_id:'e'},receipt_id:'r',portExecution:{}};
 const out=await readConditionOutputs(channel,{ports:[1],sample_rows:10,require_exact_numbers:false},ctx);
 assert.deepEqual(out.ports.map(p=>[p.port,p.schema[0].index]),[[1,0]]);
 assert.deepEqual(out.branch_activity,[{port:0,label:'Detailed - Порт1',executed:false},{port:1,label:'Иначе - Порт1',executed:true}]);
 await assert.rejects(readConditionOutputs(channel,{ports:[0],sample_rows:10,require_exact_numbers:false},ctx),/did not execute/);
 assert.deepEqual(reads,[1]);
});

test('reads branch ports only when exactly one of the two branches executed',async()=>{
 const states=active=>({node_outputs:{verified:true,surface:'graph',ports:active.map((a,index)=>({index,label:'P'+index,active:a}))}});
 const channel=sequence=>({observe:async({ready})=>{const s=sequence.find(s=>ready(s));if(!s)throw Error('observation timed out');return s;},
  readOutputPort:async({port})=>({output:{port,port_guid:'g'+port,sample_complete:true,schema:[{name:'OrderID',type:'integer'}]}})});
 const ctx={execution:{execution_id:'e'},receipt_id:'r',portExecution:{}},read={ports:[1],sample_rows:10,require_exact_numbers:false};
 // Icons may still be inactive right after Execute: wait for the one active branch.
 const out=await readConditionOutputs(channel([states([false,false]),states([false,true])]),read,ctx);
 assert.deepEqual(out.branch_activity.map(b=>b.executed),[false,true]);
 for(const bad of [[true,true],[false,false],[false,true,false]])
  await assert.rejects(readConditionOutputs(channel([states(bad)]),read,ctx),/timed out/);
});

// configureCondition with a scripted wizard: native stores load after the page
// is shown. As observed live (run 1794590461778939609, journal :1118), a reopened
// wizard never resolves the saved row's field object against the editor list.
function wizard({text='Порт2.Mode',value=1,emptyReads=2}={}){
 const log=[],ui={page:'ports',editor:false,reads:0,editorReads:0};
 const options=[['*',false],['OrderID',false],['Amount',false],['Mode',true]].map(([name,variable],i)=>({record_id:'f'+i,name,variable,socket_guid:variable?'v':'t',data_type:1}));
 const read=()=>{
  ui.reads++;
  if(ui.page==='ports')return {verified:true,page:'ports',error:null,ports:ui.reads<=emptyReads?[]:[
   {index:0,record_id:'1',kind:'table',name:'',label:'Порт1',pass_to_output:true},{index:1,record_id:'2',kind:'variables',name:'',label:'Порт2',pass_to_output:true}]};
  if(ui.page==='done')return {verified:true,page:'done',error:null};
  if(ui.editor)ui.editorReads++;
  const loaded=ui.editor&&ui.editorReads>emptyReads;
  return {verified:true,page:'branches',error:null,branches:[{index:0,record_id:'b',name:'Detailed',active_in_debug:false}],selected_branch:0,debug_mode:false,
   conditions:ui.reads<=emptyReads+3?[]:[{index:0,record_id:'c',field_text:text,field:null,
    data_type:1,aggregation:0,relation:'=',value,or:false,case_sensitive:false}],
   field_options:ui.editor?(loaded?options:[]):null};
 };
 const locator=selector=>({click:async()=>{log.push(['click',selector]);
   if(selector.includes(';btnNext'))ui.page=ui.page==='ports'?'branches':'done';
   if(selector.includes('colField_0'))ui.editor=true;},
  dblclick:async()=>log.push(['dblclick',selector]),count:async()=>1,first(){return this;},waitFor:async()=>{}});
 const page={locator,waitForTimeout:async()=>{},evaluate:async(fn,arg)=>fn===read?read(arg):true,
  keyboard:{press:async key=>{log.push(['press',key]);if(key==='Escape')ui.editor=false;},type:async text=>log.push(['type',text])}};
 const readNode=async()=>({verified:true,surface:'wizard',document_id:'d',workflow_id:'w',node_id:'c'});
 return {log,run:()=>configureCondition(page,{mode:'variable_branch',parameters:{},binding:{workflow_ref:{prefix:'MF;TF-1'}},deadline:Date.now()+3000},readNode,read)};
}

test('re-execution {} waits for loaded stores and matches the saved field cell to an input variable read-only',async()=>{
 const w=wizard(),r=await w.run();
 assert.equal(r.status,'SUCCEEDED',r.error);
 assert.deepEqual(r.configuration.conditions,[{index:0,variable:'Mode',relation:'=',value:1}]);
 assert.deepEqual(r.configuration.ports.map(p=>p.kind),['table','variables']);
 // Opened the editor list, chose nothing, cancelled with Escape.
 assert.ok(w.log.some(([a,s])=>a==='click'&&s.includes('celleditor;cbx;trg_picker')));
 assert.equal(w.log.some(([a,s])=>a==='click'&&s.includes('boundlist')),false);
 assert.deepEqual(w.log.filter(([a])=>a==='press'||a==='type'),[['press','Escape'],['press','Escape']]);
});

for(const [name,options,message] of [
 ['a table field',{text:'Порт1.Amount'},/"Порт1.Amount" is not exactly one input variable/],
 ['a variable name on the table port',{text:'Порт1.Mode'},/"Порт1.Mode" is not exactly one input variable/],
 ['an unrendered field cell',{text:null},/null is not exactly one input variable/],
 ['an unsupported stored value',{value:'unsupported'},/not one variable = value branch/],
])test('re-execution {} refuses '+name+' without changing the node',async()=>{
 const w=wizard(options),r=await w.run();
 // Refused on the branches page: nothing typed or chosen, Done never reached.
 assert.equal(r.verified,false);assert.match(r.error,message);
 assert.equal(w.log.some(([a,s])=>a==='type'||s?.includes('boundlist')),false);
 assert.equal(w.log.filter(([,s])=>s?.includes(';btnNext')).length,1);
});
