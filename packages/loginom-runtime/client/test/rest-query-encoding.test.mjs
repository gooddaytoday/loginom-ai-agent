import test from 'node:test';
import assert from 'node:assert/strict';
import {restQueryEncoderRequest,createRestRequestNodeSupport} from '../lib/rest-request-node.mjs';
import {createJavascriptCodeNodeSupport} from '../lib/javascript-code-node.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {validateNodeApplyRequest,applyNode} from '../lib/node-apply.mjs';

const request=()=>({operation_id:'rest',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'module',label:'Module'},{tid:'flow',label:'Flow'}]},
 inputs:[{source:{document_id:'doc',workflow_id:'flow',node_id:'import'},output:0,input:0}],
 parameters:{query_parameters:[{name:'Key',field:'Key'}]},budgets:{total_ms:600000}});

function encode(source,rows){
 const output=[];
 const InputTable={RowCount:rows.length,Get:(row,name)=>rows[row][name]};
 const OutputTable={Append:()=>output.push({}),Set:(name,value)=>{output.at(-1)[name]=value;}};
 new Function('InputTable','OutputTable',source.slice(source.indexOf('\n')+1))(InputTable,OutputTable);
 return output;
}

test('REST-generated codec preserves raw query values through URL parsing, including ampersands and UTF-8',()=>{
 const original=request(),before=structuredClone(original),child=restQueryEncoderRequest(original,2500,1000);
 const raw=['a b&я','x/y?','%26+#+=','😀\r\n','',null];
 const rows=encode(child.parameters.source_text,raw.map(Key=>({Key})));
 assert.deepEqual(rows.map(r=>r.Key===null?null:new URL('https://echo.test/?Key='+r.Key).searchParams.get('Key')),raw);
 assert.equal(rows[0].Key,'a%20b%26%D1%8F');
 assert.equal(rows[2].Key,'%2526%2B%23%2B%3D');
 assert.throws(()=>encode(child.parameters.source_text,[{Key:1}]),/raw string fields/);
 assert.deepEqual(original,before);
 assert.deepEqual(child.budgets,{configure_ms:1500,execute_ms:1500,total_ms:1500});
 assert.equal(child.finish,'execute');
 assert.deepEqual(child.read.ports,[]);
});

test('codec deduplicates bound fields and quotes their technical names as data',()=>{
 const r=request(),name='Key");throw Error("injected");/*';
 r.parameters.query_parameters=[{name:'a',field:name},{name:'b',field:name}];
 const child=restQueryEncoderRequest(r,2500,1000);
 assert.equal(child.parameters.columns.length,1);
 assert.deepEqual(encode(child.parameters.source_text,[{[name]:'&'}]),[{[name]:'%26'}]);
 assert.throws(()=>restQueryEncoderRequest({...r,inputs:[]},2500,1000),/explicit table input/);
 assert.throws(()=>restQueryEncoderRequest(r,1000,1000),/deadline elapsed/);
});

test('generated child request uses the installed JavaScript contract and bounded operation IDs',()=>{
 const r=request();r.operation_id='x'.repeat(128);
 const child=restQueryEncoderRequest(r,2500,1000);
 const support=createJavascriptCodeNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',redactor:createRedactor()});
 assert.doesNotThrow(()=>validateNodeApplyRequest(child,support.nodeApplyHandlers));
 assert.ok(child.operation_id.length<=128);
 assert.notEqual(child.operation_id,restQueryEncoderRequest({...r,operation_id:'y'.repeat(128)},2500,1000).operation_id);
});

test('D17 third REST encoder does not reuse the two preceding rendered node labels',()=>{
 const children=['rest-ruble','rest-weather','rest-currency'].map(operation_id=>
  restQueryEncoderRequest({...request(),operation_id},2500,1000));
 const labels=children.map(child=>child.target.label);
 assert.equal(new Set(labels).size,3,'independent encoders must not rename to the same rendered label');
 assert.equal(restQueryEncoderRequest({...request(),operation_id:'rest-currency'},3500,1100).target.label,labels[2]);
 const support=createJavascriptCodeNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',redactor:createRedactor()});
 for(const child of children)assert.doesNotThrow(()=>validateNodeApplyRequest(child,support.nodeApplyHandlers));
 assert.equal(new Set(children.map(child=>child.operation_id)).size,3);
 assert.ok(children.every(child=>child.parameters.source_text===children[0].parameters.source_text));
});

test('D82 existing connected REST refuses before effects and directs changed queries to a separate connection',async()=>{
 for(const source of ['owned-encoder','foreign-source']) {
  const r={...request(),target:{kind:'existing',type:'integration.rest_request',ref:{document_id:'doc',workflow_id:'flow',node_id:'rest'}},
   mode:'request',finish:'execute',mappings:[],read:{ports:[],sample_rows:0,require_exact_numbers:false},
   budgets:{configure_ms:600000,execute_ms:600000,total_ms:600000}};
  r.parameters.connection={name:'Echo',base_url:'https://echo.test/anything'};
  const graph={complete:true,document_id:'doc',workflow_ref:r.workflow_ref,
   nodes:[{ref:r.target.ref,type:'integration.rest_request'},{ref:{node_id:source},type:'programming.javascript'}],
   links:[{source,output:0,target:'rest',input:0}]},before=structuredClone(graph),calls=[],events=[];
  const operation={id:r.operation_id,parameters:r,nodeTargetAdapter:{observe:async()=>{calls.push('observe');return graph;}}};
  const support=createRestRequestNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
  const drivers=support.nodeApplyDriverFactory({operation,now:Date.now,onRecord:async e=>e,receiptOptions:()=>({}),
   execute:async()=>assert.fail('No browser mutation or encoder operation may start')});
  const result=await applyNode({request:r,operation,handlers:support.nodeApplyHandlers,
   drivers:{...drivers,prepareTarget:async(_,ctx)=>drivers.beforeTarget(ctx)},record:async e=>{events.push(e);return e;}});
  assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);
  assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);
  assert.deepEqual(calls,['observe']);assert.deepEqual(graph,before);
  assert.match(result.error.message,/next_step: dock_node_apply with a NEW operation_id/);
  assert.match(result.error.message,/NEW integration.rest_request target/);assert.match(result.error.message,/NEW unique connection name and base_url/);
  assert.match(result.error.message,/reuse.*only.*unchanged/);
  assert.doesNotThrow(()=>validateNodeApplyRequest({...r,target:{kind:'new',type:'integration.rest_request'},
   parameters:{...r.parameters,connection:{name:'Echo with Source',base_url:'https://echo.test/anything'}}},support.nodeApplyHandlers));
  assert.equal(events.some(e=>e.operation_id!==r.operation_id),false);
  assert.doesNotThrow(()=>validateNodeApplyRequest({...r,inputs:[],parameters:{},finish:'done'},support.nodeApplyHandlers));
 }
});

test('D19 empty inputs names the executable same-source retry instead of reading empty settings',()=>{
 const r={...request(),target:{kind:'existing',type:'integration.rest_request',ref:{document_id:'doc',workflow_id:'flow',node_id:'rest'}},
  mode:'request',finish:'execute',inputs:[],mappings:[],read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:600000,execute_ms:600000,total_ms:600000}};
 r.parameters.connection={name:'Echo',base_url:'https://echo.test/anything'};
 const support=createRestRequestNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers),/next_step:.*same raw source.*finish=execute/);
});

test('D19 the explicitly confirmed connected raw source reaches encoder preparation',async()=>{
 const r={...request(),target:{kind:'existing',type:'integration.rest_request',ref:{document_id:'doc',workflow_id:'flow',node_id:'rest'}},
  mode:'request',finish:'execute',mappings:[],read:{ports:[],sample_rows:0,require_exact_numbers:false}};
 r.parameters.connection={name:'Echo',base_url:'https://echo.test/anything'};
 const graph={complete:true,document_id:'doc',workflow_ref:r.workflow_ref,nodes:[
  {ref:r.target.ref,type:'integration.rest_request',inputs:[0],outputs:[0,1]},
  {ref:r.inputs[0].source,type:'imports.text',inputs:[],outputs:[0]}],links:[{source:'import',output:0,target:'rest',input:0}]};
 const operation={id:r.operation_id,parameters:r,nodeTargetAdapter:{observe:async()=>graph}};
 const events=[];
 const support=createRestRequestNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const drivers=support.nodeApplyDriverFactory({operation,now:Date.now,onRecord:async e=>{events.push(e);return e;},receiptOptions:()=>({}),execute:async()=>{throw Error('encoder reached');}});
 await assert.rejects(drivers.beforeTarget({deadline:Date.now()+60000}),/query encoder did not complete/);
 assert.ok(events.some(e=>e.operation_id?.startsWith('rest-url-')),'the same source must start the encoder lifecycle');
});
