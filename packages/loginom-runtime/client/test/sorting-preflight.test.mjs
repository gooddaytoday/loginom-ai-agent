import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightSortingSource} from '../lib/sorting-preflight.mjs';
import {preflightCalculatorSource} from '../lib/calculator-preflight.mjs';
import {preflightTabularSource} from '../lib/sorting-preflight.mjs';

function fixture({kind='existing',parameters={keys:[{field:{kind:'input_field',name:'RevenueAlias'},direction:'DESC'}]},inputs=[]}={}){
 const calls=[];
 const unexpected=name=>()=>{calls.push(name);throw Error('Unexpected '+name);};
 const options={operation:{id:'sorting-preflight',parameters:{target:{kind},parameters,inputs,mappings:[]}},
  execute:unexpected('browser call'),onRecord:unexpected('journal write'),receiptOptions:unexpected('mutation receipt')};
 return {calls,run:()=>preflightSortingSource(options,{signal:new AbortController().signal},{})};
}

test('existing sorting defers upstream key validation to its input mapping without browser calls',async()=>{
 for(const inputs of [[],[{input:0,output:0,source:{name:'upstream'}}]]){
  const f=fixture({inputs});
  assert.deepEqual(await f.run(),{verified:true,not_applicable:true,validation_deferred:'input_mapping'});
  assert.deepEqual(f.calls,[]);
 }
});
test('sorting preflight preserves the no-op for existing empty parameters',async()=>{
 const f=fixture({parameters:{}});
 assert.deepEqual(await f.run(),{verified:true,not_applicable:true});assert.deepEqual(f.calls,[]);
});
test('new sorting still rejects missing explicit input before any browser call',async()=>{
 const f=fixture({kind:'new'});
 await assert.rejects(f.run(),/requires an explicit input/);assert.deepEqual(f.calls,[]);
});

// LAB-894 settings-main.jsonl:765,792,794: two table fields plus a
// separate one-field W1 mapping. Only browser transport is simulated.
function mappedSourceFixture(){
 const node={document_id:'doc',workflow_id:'flow',node_id:'orders'},tid='MF;TF;Graph;Orders',root='MF;TF;ModelForm;PreviewWindow';
 const owner={...node,verified:true,surface:'graph',locked:false,tid};
 const port={index:0,native_index:0,port_guid:'orders-output',tid:tid+';Output_Data-0',active:true};
 const fields=[{name:'Client',label:'Client',type:'string'},{name:'AmountUSD',label:'AmountUSD',type:'real'}];
 const variable={direction:'input',kind:'variables',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'rate'}}]};
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'new',type:'transform.calculator'},
  inputs:[{source:node,output:0,input:0}],variable_inputs:[{source:{...node,node_id:'rate'},output:0,input:0,kind:'variables'}],mode:'expression',
  parameters:{expressions:[{target:{kind:'new'},name:'AmountRUB',label:'AmountRUB',type:'real',formula:'AmountUSD * Var.rate',replace:false}]},
  mappings:[variable,{direction:'output',port:0,autosync:false,fields:['Client','AmountUSD','AmountRUB'].map(name=>({source:{kind:'configured_field',name}}))}]};
 let preview=false,receipt;
 const events=[],operation={id:'calculate-rubles',action:{action_key:'node.apply',revision:'1.0.0'},deadline:Date.now()+5000,parameters:request};
 const state=()=>({origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:request.workflow_ref,dom_epoch:{document:'doc'},
  prepared_node_context:owner,wizard:{status:'absent'},scan:{complete:true},
  nodes:[{node_ref:{workflow_ref:request.workflow_ref,node_label:'Orders'},bounding_box:{x:10,y:10,width:100,height:40},ports:[{tid:port.tid,ui_ref:'ui-port'}]}],
  ui:{masks:[],dialogs:preview?[{ref:'ui-preview',identity:{anchor_tid:root}}]:[],truncated:{elements:false,masks:false,dialogs:false},
   elements:preview?[{tid:root,ref:'ui-preview',allowed_actions:[]},{tid:root+';p.h;close',ref:'ui-close',allowed_actions:['click']}]
    :[{tid:port.tid,ref:'ui-port',kind:'port',allowed_actions:['click','press']}]} });
 const options={operation,onRecord:async r=>{events.push(r);return structuredClone(r);},
  receiptOptions:(id,action_key)=>{receipt={id,action_key};return {};},execute:async code=>{
   if(code.includes('browserReceipt')){
    if(code.includes('"key":"F3"'))preview=true;
    if(code.includes('"ref":"ui-close"'))preview=false;
    return {status:'SUCCEEDED',action_key:receipt.action_key,operation_id:receipt.id,effect_possible:true,cleanup_complete:true};
   }
   if(code.includes('readOutputContext'))return {verified:true,node_context:owner,ports:[port]};
   if(code.includes('readNodePreviewSchema'))return {verified:true,inventory_complete:true,settings_changed:false,fields,root_tid:root,
    port:0,port_guid:port.port_guid,node_id:node.node_id,node_context:owner};
   return {status:'SUCCEEDED',output:structuredClone(state())};
  }};
 const config={targetOrigin:'https://example.test',targetBuild:'7.4.2'};
 return {request,variable,fields,events,options,config,run:()=>preflightCalculatorSource(options,{},config),get preview(){return preview;}};
}

test('LAB-894 Calculator table preflight leaves the explicit W1 mapping to its own path',async()=>{
 const f=mappedSourceFixture(),before=structuredClone(f.request);
 const proof=await f.run();
 assert.equal(proof.parameters_valid,true);assert.deepEqual(proof.schema,f.fields);
 assert.deepEqual(f.request,before);assert.equal(f.preview,false);
 assert.equal(f.events.at(-1).phase,'calculator_preflight_completed');
});

for(const kind of ['variables','control'])test('table preflight selects its own port after '+kind+' mapping',async()=>{
 const f=mappedSourceFixture();f.variable.kind=kind;
 f.request.mappings.splice(1,0,{direction:'input',port:1,fields:[]},
  {direction:'input',port:0,fields:f.fields.map(field=>({source:{kind:'configured_field',name:field.name},name:field.name+'Alias'}))});
 f.request.mappings.pop();f.request.parameters={keys:[{field:{kind:'input_field',name:'AmountUSDAlias'},direction:'DESC'}]};
 const proof=await preflightSortingSource(f.options,{},f.config);
 assert.deepEqual(proof.schema.map(f=>f.name),['ClientAlias','AmountUSDAlias']);assert.equal(f.preview,false);
});

test('explicit nonzero table port keeps its mapping and ignores a different table port',async()=>{
 const f=mappedSourceFixture();f.request.inputs[0].input=1;
 f.request.mappings=[{direction:'input',port:0,fields:[]},{direction:'input',port:1,fields:f.fields.map(field=>({source:{kind:'configured_field',name:field.name}}))}];
 const proof=await preflightTabularSource(f.options,{},f.config,{required:true,inputPort:1,label:'join_input_1',resolve:(_,fields)=>assert.deepEqual(fields,f.fields)});
 assert.equal(proof.parameters_valid,true);
});

test('Calculator keeps the previous complete table mapping without a variable mapping',async()=>{
 const f=mappedSourceFixture();f.request.mappings[0]={direction:'input',port:0,autosync:false,
  fields:f.fields.map(field=>({source:{kind:'configured_field',name:field.name}}))};
 assert.deepEqual((await f.run()).schema,f.fields);assert.equal(f.preview,false);
});

test('incomplete table mapping still refuses after closing the source preview',async()=>{
 const f=mappedSourceFixture();f.request.mappings=[{direction:'input',port:0,fields:[{source:{kind:'configured_field',name:'Client'}}]}];
 await assert.rejects(f.run(),e=>/Input mapping must account/.test(e.message)&&e.nodePhaseRefusal?.effect_possible===false&&e.nodePhaseRefusal.cleanup_complete===true);
 assert.equal(f.preview,false);assert.equal(f.events.at(-1).proof.parameters_valid,false);
});
