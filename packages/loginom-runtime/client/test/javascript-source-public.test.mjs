import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createActionRuntime} from '../lib/executor.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {dispatchNodeApi,nodeApiTools} from '../lib/node-api.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {createUserWorkflowBindings,userNodeTool} from '../lib/user-workflow.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';

const workflow_ref={workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  prefix:'MF;TF-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]};
const node={document_id:'document',workflow_id:'workflow',node_id:'javascript-node'};
const initial={kind:'source',operation_id:'public-source',document_id:'document',workflow_ref,node,budget_ms:60000};
const hash=value=>createHash('sha256').update(value).digest('hex');

function fixture({source='const привет = "😀";\n',secret,failClose=false,pauseOpen}={}){
  const calls=[];
  const adapter={active:false,uncertain:false,
    async open({owner}){calls.push('open');this.active=true;if(pauseOpen)await pauseOpen;return {owner};},
    async read(handle,{owner}){calls.push('read');assert.deepEqual(owner,handle.owner);
      return {owner,source,settings:{generation:true}};},
    async discard(handle,{owner}){calls.push('discard');assert.deepEqual(owner,handle.owner);
      if(failClose){this.uncertain=true;throw Error('Close response lost');}
      this.active=false;return {closed:true,owner};}};
  const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
    allowCandidate:true,nodeApplyHandlers:new Map([['imports.text',{}]]),nodeApplyDriverFactory:()=>({}),
    targetOrigin:'http://loginom.test',targetBuild:'7.4.2',redactor:createRedactor(secret?[secret]:[]),
    execute:async()=>{throw Error('Unexpected browser transport');},
    onRecord:async event=>event,javascriptSourceAdapterFactory:()=>adapter});
  return {runtime,calls,adapter};
}

test('full and compact public schemas admit only the source initial/continuation shapes',()=>{
  const full=nodeApiTools.find(tool=>tool.name==='dock_node_read');
  const compact=userNodeTool(full);
  const validator=new AjvJsonSchemaValidator();
  assert.equal(full.inputSchema.type,'object');
  assert.equal(full.outputSchema.type,'object');
  assert.equal(compact.inputSchema.type,'object');
  const short={...initial,workflow_ref:{workflow_id:'workflow'}};
  delete short.budget_ms;
  assert.equal(validator.getValidator(full.inputSchema)(initial).valid,true);
  assert.equal(validator.getValidator(compact.inputSchema)(short).valid,true);
  assert.equal(validator.getValidator(compact.inputSchema)(initial).valid,false);
  for(const extra of [{source_text:'x'},{execute:true},{read:{ports:[0]}},{source_operation_id:'other'}]){
    assert.equal(validator.getValidator(full.inputSchema)({...initial,...extra}).valid,false);
    assert.throws(()=>validateActionParameters(full.inputSchema,{...initial,...extra}));
  }
  const bindings=createUserWorkflowBindings();
  bindings.remember({document_id:'document',workflow_ref});
  assert.deepEqual(bindings.expandNodeRead(short),{...initial,budget_ms:300000});
  assert.throws(()=>bindings.expandNodeRead({...short,budget_ms:1}),/host-owned/);
});

test('public source route returns exact text to full and user replies without output Execute',async()=>{
  const f=fixture();
  const receipt=await dispatchNodeApi(f.runtime,'dock_node_read',initial);
  assert.equal(receipt.kind,'source');
  assert.equal(receipt.source_text,'const привет = "😀";\n');
  assert.equal(receipt.source_sha256,hash(receipt.source_text));
  assert.deepEqual(f.calls,['open','read','read','read','discard']);
  assert.deepEqual(nodeResultReply(receipt,{userProfile:true}).structuredContent,receipt);
  assert.equal(JSON.parse(nodeResultReply(receipt,{userProfile:true}).content[0].text).source_text,receipt.source_text);
  assert.deepEqual(await dispatchNodeApi(f.runtime,'dock_node_read',initial),receipt);
  assert.deepEqual(f.calls,['open','read','read','read','discard']);
  const schema=nodeApiTools.find(tool=>tool.name==='dock_node_read').outputSchema;
  assert.equal(new AjvJsonSchemaValidator().getValidator(schema)(receipt).valid,true);
});

test('public source continuation binds digest and reopens only for a new chunk',async()=>{
  const source='//'+ '😀'.repeat(2000);
  const f=fixture({source});
  const first=await dispatchNodeApi(f.runtime,'dock_node_read',initial);
  assert.ok(first.cursor);
  const next={kind:'source',operation_id:initial.operation_id,cursor:first.cursor,
    expected_source_sha256:first.source_sha256};
  const second=await dispatchNodeApi(f.runtime,'dock_node_read',next);
  assert.equal(first.source_text+second.source_text,source);
  assert.equal(second.cursor,null);
  assert.equal(f.calls.filter(call=>call==='open').length,2);
  assert.deepEqual(await dispatchNodeApi(f.runtime,'dock_node_read',next),second);
  assert.equal(f.calls.filter(call=>call==='open').length,2);
  await assert.rejects(()=>dispatchNodeApi(f.runtime,'dock_node_read',
    {...next,expected_source_sha256:hash('other')}),/cursor\/digest refused/);
});

test('simultaneous exact public retries join one browser read',async()=>{
  let release;
  const f=fixture({pauseOpen:new Promise(resolve=>{release=resolve;})});
  const first=dispatchNodeApi(f.runtime,'dock_node_read',initial);
  await new Promise(resolve=>setImmediate(resolve));
  const retry=dispatchNodeApi(f.runtime,'dock_node_read',initial);
  release();
  assert.deepEqual(await first,await retry);
  assert.equal(f.calls.filter(call=>call==='open').length,1);
});

test('secret refusal closes before delivery; lost Close holds the host gate',async()=>{
  const secret=fixture({source:'const value = "TOPSECRET";',secret:'TOPSECRET'});
  await assert.rejects(()=>dispatchNodeApi(secret.runtime,'dock_node_read',initial),/redaction refused/);
  assert.equal(secret.calls.filter(call=>call==='discard').length,1);
  assert.equal(secret.runtime.hasUnsettledWork(),false);
  const lost=fixture({failClose:true});
  await assert.rejects(()=>dispatchNodeApi(lost.runtime,'dock_node_read',initial),/Close response lost/);
  assert.equal(lost.runtime.hasUnsettledWork(),true);
  await assert.rejects(()=>dispatchNodeApi(lost.runtime,'dock_node_read',
    {...initial,operation_id:'new-source'}),/pending Dock operation/);
  assert.equal(lost.calls.filter(call=>call==='open').length,1);
});
