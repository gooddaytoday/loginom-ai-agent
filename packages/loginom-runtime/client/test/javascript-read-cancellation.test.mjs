import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {createActionRuntime} from '../lib/executor.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {dispatchNodeApi,nodeApiTools} from '../lib/node-api.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {userResultSchema} from '../lib/user-results.mjs';

const node={document_id:'document',workflow_id:'workflow',node_id:'javascript-node'};
const workflow_ref={workflow_id:node.workflow_id,tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  prefix:'MF;TF-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]};
const request=kind=>({kind,operation_id:'cancel-'+kind,document_id:node.document_id,workflow_ref,node,budget_ms:60000});
const validator=new AjvJsonSchemaValidator();
const validate=(tool,value)=>assert.equal(validator.getValidator(nodeApiTools.find(t=>t.name===tool).outputSchema)(value).valid,true);

function fixture({lostClose=false}={}){
  const opening=Promise.withResolvers(),closing=Promise.withResolvers(),calls=[];
  const adapter={active:false,uncertain:false,
    async open({owner}){calls.push('open');this.active=true;await opening.promise;return {owner};},
    async read(handle,{owner}){calls.push('read');assert.deepEqual(owner,handle.owner);
      return {owner,source:'const value = 1;',settings:{generation:true}};},
    async discard(handle,{owner}){calls.push('discard');assert.deepEqual(owner,handle.owner);
      await closing.promise;
      if(lostClose){this.uncertain=true;throw Error('Close response lost');}
      this.active=false;return {closed:true,owner};}};
  const graph={complete:true,document_id:node.document_id,workflow_ref,nodes:[{ref:node,locked:false}],links:[],foreign_links:[]};
  const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
    allowCandidate:true,nodeApplyHandlers:new Map([['imports.text',{}]]),nodeApplyDriverFactory:()=>({}),
    targetOrigin:'http://loginom.test',targetBuild:'7.4.2',redactor:createRedactor(),
    execute:async()=>{throw Error('Unexpected browser transport');},onRecord:async event=>event,
    javascriptSourceAdapterFactory:()=>adapter,nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph)})});
  return {runtime,calls,opening,closing};
}

for(const kind of ['source','context'])test(kind+' caller cancellation waits for owned Close and releases only confirmed cleanup',async()=>{
  const f=fixture(),controller=new AbortController(),reason=Error('Caller cancelled');
  const reading=dispatchNodeApi(f.runtime,'dock_node_read',request(kind),{signal:controller.signal})
    .then(value=>({value}),error=>({error}));
  try{
    await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls,['open']);
    controller.abort(reason);
    const status=await dispatchNodeApi(f.runtime,'dock_node_status',{operation_id:request(kind).operation_id});
    validate('dock_node_status',status);assert.equal(status.cancel_requested,true);assert.equal(status.state,'running');
    assert.equal(f.runtime.hasUnsettledWork(),true);
    f.opening.resolve();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.filter(call=>call==='discard').length,1);assert.equal(f.runtime.hasUnsettledWork(),true);
    const pending=await dispatchNodeApi(f.runtime,'dock_node_wait',{operation_id:request(kind).operation_id,timeout_ms:0});
    validate('dock_node_wait',pending);assert.equal(pending.state,'running');
    f.closing.resolve();assert.equal((await reading).error,reason);
    assert.equal(f.runtime.hasUnsettledWork(),false);
    const settled=await dispatchNodeApi(f.runtime,'dock_node_wait',{operation_id:request(kind).operation_id});
    validate('dock_node_wait',settled);assert.equal(settled.state,'settled');assert.equal(settled.cancel_requested,true);
    assert.equal(settled.progress.cleanup_complete,true);assert.equal(settled.error.code,'JAVASCRIPT_READ_CANCELLED');
    const compact=nodeResultReply(settled,{userProfile:true}).structuredContent;
    assert.equal(validator.getValidator(userResultSchema)(compact).valid,true);
    assert.equal(compact.progress.cleanup_complete,true);
    const before=f.calls.slice();await assert.rejects(()=>dispatchNodeApi(f.runtime,'dock_node_read',request(kind)));
    assert.deepEqual(f.calls,before);
  }finally{f.opening.resolve();f.closing.resolve();await reading;}
});

for(const kind of ['source','context'])test(kind+' explicit local cancellation recognizes the retained read ID',async()=>{
  const f=fixture(),args=request(kind);
  const reading=dispatchNodeApi(f.runtime,'dock_node_read',args).then(value=>({value}),error=>({error}));
  try{
    await new Promise(resolve=>setImmediate(resolve));
    const cancelled=await dispatchNodeApi(f.runtime,'dock_node_cancel',{operation_id:args.operation_id});
    validate('dock_node_cancel',cancelled);assert.equal(cancelled.cancel_requested,true);assert.equal(cancelled.state,'running');
    f.opening.resolve();f.closing.resolve();assert.match((await reading).error.message,/cancellation/);
    assert.equal(f.runtime.hasUnsettledWork(),false);
    const again=await dispatchNodeApi(f.runtime,'dock_node_cancel',{operation_id:args.operation_id});
    assert.equal(again.state,'settled');assert.equal(f.calls.filter(call=>call==='discard').length,1);
  }finally{f.opening.resolve();f.closing.resolve();await reading;}
});

test('lost Close after cancellation retains the browser and cannot replay cleanup',async()=>{
  const f=fixture({lostClose:true}),args=request('source');
  const reading=dispatchNodeApi(f.runtime,'dock_node_read',args).then(value=>({value}),error=>({error}));
  try{
    await new Promise(resolve=>setImmediate(resolve));
    await dispatchNodeApi(f.runtime,'dock_node_cancel',{operation_id:args.operation_id});
    f.opening.resolve();f.closing.resolve();assert.match((await reading).error.message,/Close response lost/);
    const settled=await dispatchNodeApi(f.runtime,'dock_node_status',{operation_id:args.operation_id});
    validate('dock_node_status',settled);assert.equal(settled.progress.cleanup_complete,false);
    assert.equal(f.runtime.hasUnsettledWork(),true);
    const before=f.calls.slice();await assert.rejects(()=>dispatchNodeApi(f.runtime,'dock_node_read',args));
    await assert.rejects(()=>dispatchNodeApi(f.runtime,'dock_node_read',{...args,operation_id:'other-source'}));
    assert.deepEqual(f.calls,before);
  }finally{f.opening.resolve();f.closing.resolve();await reading;}
});

test('cancelled status wait never cancels the source worker',async()=>{
  const f=fixture(),args=request('source'),controller=new AbortController();
  const reading=dispatchNodeApi(f.runtime,'dock_node_read',args).then(value=>({value}),error=>({error}));
  try{
    await new Promise(resolve=>setImmediate(resolve));
    const waiting=dispatchNodeApi(f.runtime,'dock_node_wait',{operation_id:args.operation_id,timeout_ms:60000},
      {signal:controller.signal}).then(value=>({value}),error=>({error}));
    controller.abort(Error('Wait cancelled'));assert.equal((await waiting).error,controller.signal.reason);
    assert.equal((await dispatchNodeApi(f.runtime,'dock_node_status',{operation_id:args.operation_id})).cancel_requested,false);
    f.opening.resolve();f.closing.resolve();assert.equal((await reading).value.kind,'source');
    assert.equal(f.runtime.hasUnsettledWork(),false);
  }finally{f.opening.resolve();f.closing.resolve();await reading;}
});

test('already cancelled public read dispatches no browser work',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort(Error('Before dispatch'));
  await assert.rejects(()=>dispatchNodeApi(f.runtime,'dock_node_read',request('source'),{signal:controller.signal}),
    error=>error===controller.signal.reason);
  assert.deepEqual(f.calls,[]);assert.equal(f.runtime.hasUnsettledWork(),false);
});

test('a source operation ID cannot be reused as an apply or output-read ID',async()=>{
  const f=fixture(),args=request('source');f.opening.resolve();f.closing.resolve();
  assert.equal((await dispatchNodeApi(f.runtime,'dock_node_read',args)).kind,'source');
  assert.throws(()=>f.runtime.startNodeApply({operation_id:args.operation_id}),/ID belongs to a JavaScript read/);
  await assert.rejects(()=>f.runtime.startNodeRead({operation_id:args.operation_id,source_operation_id:'other'}),
    /ID belongs to a JavaScript read/);
  assert.equal((await dispatchNodeApi(f.runtime,'dock_node_status',{operation_id:args.operation_id})).state,'settled');
});

for(const kind of ['source','context'])test('MCP '+kind+' interruption retains lifecycle access until owned cleanup settles',async()=>{
  const f=fixture(),controller=new AbortController(),args=request(kind);
  const server=new Server({name:'read-cancellation-server',version:'1'},{capabilities:{tools:{}}});
  const client=new Client({name:'read-cancellation-client',version:'1'});
  const completed=Promise.withResolvers();
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:nodeApiTools}));
  server.setRequestHandler(CallToolRequestSchema,async(call,extra)=>{
    try{return nodeResultReply(await dispatchNodeApi(f.runtime,call.params.name,call.params.arguments,{signal:extra.signal}));}
    finally{if(call.params.name==='dock_node_read')completed.resolve();}
  });
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  const reading=client.callTool({name:'dock_node_read',arguments:args},undefined,{signal:controller.signal})
    .then(value=>({value}),error=>({error}));
  try{
    await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls,['open']);
    controller.abort(Error('MCP caller interrupted'));assert.ok((await reading).error);
    const pending=(await client.callTool({name:'dock_node_status',arguments:{operation_id:args.operation_id}})).structuredContent;
    assert.equal(pending.cancel_requested,true);assert.equal(pending.state,'running');
    assert.equal(f.runtime.hasUnsettledWork(),true);
    f.opening.resolve();f.closing.resolve();await completed.promise;
    const settled=(await client.callTool({name:'dock_node_wait',arguments:{operation_id:args.operation_id}})).structuredContent;
    assert.equal(settled.state,'settled');assert.equal(settled.progress.cleanup_complete,true);
    assert.equal(settled.error.code,'JAVASCRIPT_READ_CANCELLED');assert.equal(f.runtime.hasUnsettledWork(),false);
    assert.equal(f.calls.filter(call=>call==='discard').length,1);
  }finally{
    f.opening.resolve();f.closing.resolve();await reading;await completed.promise;
    await client.close();await server.close();
  }
});
