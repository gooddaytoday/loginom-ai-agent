import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boundedUserToolReply} from '../lib/user-response-budget.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../lib/javascript-code-node.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {userActionInventory} from '../lib/user-workflow.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';

const reply=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
function catalog(types) {
 const config={targetOrigin:'http://loginom.test',targetBuild:'7.4.2',redactor:createRedactor()};
 const handlers=new Map([...createCandidateNodeSupport(config).nodeApplyHandlers,...createJavascriptCodeNodeSupport(config).nodeApplyHandlers]);
 const pins={capabilityAbi:1,executorRevision:'1.3.0',actionCatalogVersion:'fixture',actionCatalogDigest:'a'.repeat(64),
   selectorCatalogDigest:'b'.repeat(64),e2eCommit:'c'.repeat(40),actionManifestDigest:'d'.repeat(64),
   catalogLifecycleStatus:'candidate',acceptanceVerified:false,acceptanceDigest:null,
   compatibilityProfile:{profile_id:'source-fixture-linux',loginom_build:'7.4.2',platform:'linux',browser:'chromium'}};
 return userActionInventory({actions:[],node_types:describeNodeTypes(types??[...handlers.keys()],
   {...pins,skillRevision:'e'.repeat(64),loginomProfile:pins.compatibilityProfile},new Map(),handlers,'7.4.2'),session_manifest:pins});
}

test('actual factory descriptions retain complete JS knowledge/schema/pins and refuse a full batch',()=>{
 for(const types of [['programming.javascript'],['imports.text','programming.javascript']]){
  const value=reply(catalog(types)),before=JSON.stringify(value);
  assert.equal(boundedUserToolReply(value,{tool:'dock_action_describe'}),value);
  assert.equal(JSON.stringify(value),before);assert.ok(bytes(value)<=46000);
  const card=JSON.parse(value.content[0].text).node_types.find(node=>node.type==='programming.javascript');
  assert.equal(card.javascript_knowledge.validated_for.loginom_build,'7.4.2');
  assert.equal(card.javascript_knowledge.version,'1.1.0');
  assert.equal(card.javascript_knowledge.column_names.observed_pairs.length,5);
  assert.ok(card.parameter_schema.properties.source_text);assert.ok(card.session_manifest.skillRevision);
  assert.equal(card.knowledge_sha256.length,64);
 }
 const all=reply(catalog()),before=JSON.stringify(all);assert.equal(JSON.parse(all.content[0].text).node_types.length,15);
 assert.ok(bytes(all)>46000);
 const refused=boundedUserToolReply(all,{tool:'dock_action_describe'}),value=JSON.parse(refused.content[0].text);
 assert.equal(refused.isError,true);assert.equal(value.result_delivery,'refused');
 assert.equal(value.error.scope,'whole_response');assert.equal(value.next_step.tool,'dock_action_describe');
 assert.ok(bytes(refused)<2000);assert.equal(JSON.stringify(all),before);
});

test('exact 46000-byte final MCP boundary includes escaped text and every additional block',()=>{
 const edge={content:[{type:'text',text:''}]};edge.content[0].text='x'.repeat(46000-bytes(edge));
 assert.equal(bytes(edge),46000);assert.equal(boundedUserToolReply(edge),edge);
 for(const changed of [{content:[{type:'text',text:edge.content[0].text+'x'}]},
   {...edge,structuredContent:{retained:'x'}},
   {content:[...edge.content,{type:'text',text:'advice'}]}]){
  assert.ok(bytes(changed)>46000);assert.equal(boundedUserToolReply(changed).isError,true);
 }
 for(const text of ['"'.repeat(24000),'\\'.repeat(24000),'\u0001'.repeat(12000),'😀'.repeat(12000)]){
  const value={content:[{type:'text',text}]};assert.ok(bytes(value)>46000);
  assert.equal(boundedUserToolReply(value).isError,true);
 }
});

test('consumer line boundary measures joined text including inter-block LF',()=>{
 const edge={content:[{type:'text',text:Array(2000).fill('x').join('\n')}]};
 assert.ok(bytes(edge)<46000);assert.equal(boundedUserToolReply(edge),edge);
 const extra={content:[{type:'text',text:edge.content[0].text+'\nx'}]};
 assert.equal(boundedUserToolReply(extra).isError,true);
 assert.equal(boundedUserToolReply({content:[...edge.content,{type:'text',text:'advice'}]}).isError,true);
});

test('JS card has an independent 20000-byte envelope budget even when the whole batch fits',()=>{
 const value=catalog(['programming.javascript']);
 value.node_types[0].session_manifest.skillRevision='"'.repeat(3000);
 const large=reply(value);assert.ok(bytes(large)<46000);assert.ok(bytes(large)>20000);
 const refused=boundedUserToolReply(large,{tool:'dock_action_describe'});
 assert.equal(refused.isError,true);assert.equal(JSON.parse(refused.content[0].text).error.scope,'javascript_description');
 assert.equal(JSON.parse(refused.content[0].text).next_step.tool,undefined);
 assert.equal(value.node_types[0].session_manifest.skillRevision,'"'.repeat(3000));
});

test('whole structured output overflow preserves the actual operation ID and makes no effect claims',()=>{
 const value={operation_id:'retained',state:'settled',status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false,
   exact_table:{rows:[['x'.repeat(30000)]]}};
 const original={...reply(value),structuredContent:value},before=JSON.stringify(original);
 const refused=boundedUserToolReply(original,{operationId:'competing'}),error=JSON.parse(refused.content[0].text);
 assert.equal(refused.isError,true);assert.equal(error.original_operation_id,'retained');
 assert.equal(error.status,undefined);assert.equal(error.effect_possible,undefined);assert.equal(error.cleanup_complete,undefined);
 assert.deepEqual(error.next_step.arguments,{operation_id:'retained'});assert.equal(JSON.stringify(original),before);
});

test('full user node output is refused without removing rows or changing the retained checkpoint',()=>{
 // Delivery-only stress fixture; it does not attest native/UI provenance.
 const result={operation_id:'completed-js',attempt:1,state:'settled',outcome:{status:'SUCCEEDED',effect_possible:true,
   cleanup_complete:true,action_key:'node.apply',phase:'read',output:{configuration:{verified:true,readback:{kind:'javascript'}},
   output:{status:'refreshed',ports:[{port:0,schema:[{index:0,name:'Value',label:'Value',type:'string'}],
     row_count:1,sample_rows:1,sample_complete:true,read_coverage:{mode:'full'},
     sample:[[{type:'string',value:'"'.repeat(20000),is_null:false,precision:'display_text'}]]}]}}}};
 const before=JSON.stringify(result),full=nodeResultReply(result),small=nodeResultReply(result,{userProfile:true});
 assert.ok(bytes(full)>46000);assert.equal(full.isError,undefined);assert.equal(small.isError,true);
 assert.equal(JSON.parse(small.content[0].text).original_operation_id,'completed-js');
 assert.equal(JSON.stringify(result),before);assert.equal(result.outcome.output.output.ports[0].sample.length,1);
});

test('JS full configuration is retained for bounded delivery instead of a readback summary',()=>{
 const result={operation_id:'configured-js',attempt:1,state:'settled',outcome:{status:'SUCCEEDED',effect_possible:true,
   cleanup_complete:true,action_key:'node.apply',phase:'read',output:{configuration:{verified:true,mode:'script',
     readback:{kind:'javascript',output_mapping:{target_fields:Array.from({length:100},(_,index)=>({name:'Field'+index,label:'"'.repeat(240)}))}}},
     output:{status:'not_requested',ports:[]}}}};
 const before=JSON.stringify(result),refused=nodeResultReply(result,{userProfile:true});
 assert.equal(refused.isError,true);assert.equal(JSON.parse(refused.content[0].text).original_operation_id,'configured-js');
 assert.equal(JSON.stringify(result),before);assert.equal(result.outcome.output.configuration.readback_summary,undefined);
});

test('source-bound JS output reread refuses overflow without dropping rows or its source binding',()=>{
 const javascript_source={source_operation_id:'created-js',source_sha256:'a'.repeat(64),source_utf8_bytes:80,
  source_lf_lines:3,settings_sha256:'b'.repeat(64),policy:'javascript-module-v1'};
 const result={operation_id:'reread-js',attempt:1,state:'settled',outcome:{status:'SUCCEEDED',effect_possible:true,
  cleanup_complete:true,action_key:'node.apply',phase:'read',output:{configuration:{status:'not_requested'},
   output:{status:'complete',javascript_source,ports:[{port:0,schema:[{index:0,name:'Value',label:'Value',type:'string'}],
    row_count:1,sample_rows:1,sample_complete:true,
    sample:[[{type:'string',value:'"'.repeat(20000),is_null:false,precision:'display_text'}]]}]}}}};
 const before=JSON.stringify(result),refused=nodeResultReply(result,{userProfile:true});
 assert.equal(refused.isError,true);assert.equal(JSON.parse(refused.content[0].text).original_operation_id,'reread-js');
 assert.equal(JSON.stringify(result),before);assert.equal(result.outcome.output.output.ports[0].sample.length,1);
 result.outcome.output.output.ports[0].sample[0][0].value='value';
 const delivered=nodeResultReply(result,{userProfile:true});assert.equal(delivered.isError,undefined);
 assert.deepEqual(delivered.structuredContent.output.javascript_source,javascript_source);
 assert.equal(delivered.structuredContent.configuration.status,'not_requested');
});

test('real bridge MCP protocol retains knowledge after a refused prepare and continues after describe overflow',async()=>{
 const result=await promisify(execFile)(process.execPath,['--test','--test-reporter=tap','--experimental-test-module-mocks',
   new URL('./support/bridge-budget.mjs',import.meta.url).pathname],{maxBuffer:200000,env:{...process.env,NODE_TEST_CONTEXT:undefined}});
 assert.match(result.stdout,/# pass 1/);
 assert.match(result.stdout,/# fail 0/);
});
