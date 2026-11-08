import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema,nodeApiTools} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {readFileSync} from 'node:fs';

test('native enrich icon has its own callable handler and model-facing parameter contract',()=>{
 const type=NODE_TYPES['transform.enrich_data'];
 assert.ok(type,'Enrich must be registered independently of Join and Union');
 assert.equal(type.icon_class,'bg-vendor-icon-enrichdata');
 assert.deepEqual(type.modes,['left']);
 assert.equal(type.tabular_inputs,2);
 assert.equal(type.additional_tabular_inputs,true);
 assert.equal(type.tabular_outputs,1);
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes(type.type));
 const handler=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyHandlers.get(type.type);
 assert.ok(handler);
 assert.deepEqual(handler.modes,['left']);
 assert.ok(handler.parameter_schema.properties.enrichment);
 assert.throws(()=>describeNodeTypes([...Object.keys(NODE_TYPES),type.type]),/distinct supported node types/);
});

test('unchanged enrich execution preserves settings; source or mapping edits cannot bypass configuration',()=>{
 const r={target:{kind:'existing',type:'transform.enrich_data'},mode:'left',finish:'execute',parameters:{},inputs:[],mappings:[]};
 assert.equal(isUnchangedTransformExecution(r),true);
 assert.equal(isUnchangedTransformExecution({...r,inputs:[{input:1}]}),false);
 assert.equal(isUnchangedTransformExecution({...r,mappings:[{direction:'output',port:0,autosync:false}]}),false);
 assert.equal(isUnchangedTransformExecution({...r,parameters:{enrichment:{}}}),false);
 assert.equal(isUnchangedTransformExecution({...r,target:{...r.target,kind:'new'}}),false);
 assert.equal(isUnchangedTransformExecution({...r,mode:'inner'}),false);
 // Existing Join and Union retain their original unchanged-execution routing.
 assert.equal(isUnchangedTransformExecution({...r,target:{kind:'existing',type:'transform.join_data'}}),true);
 assert.equal(isUnchangedTransformExecution({...r,target:{kind:'existing',type:'transform.union_data'},mode:'append_all'}),false);
});

test('enrich model contract stays within apply, type card and node-reference budgets',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const card=describeNodeTypes(['transform.enrich_data'],{},new Map(),support.nodeApplyHandlers)[0];
 assert.ok(card);
 assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 const apply=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify(apply.inputSchema))<=20000);
 const reference=readFileSync(new URL('../../../product/skills/loginom-automation/references/nodes/transform.enrich_data.md',import.meta.url),'utf8');
 assert.ok(Buffer.byteLength(reference)<=6000);
 assert.doesNotMatch(reference,/\$(?:[1-9][0-9]*|ARGUMENTS)\b/);
});

test('public enrich schema accepts four lookups and rejects a fifteenth',async()=>{
 const {validateActionParameters}=await import('../lib/action-catalog.mjs');
 const handler=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyHandlers.get('transform.enrich_data');
 const tables=n=>Array.from({length:n},(_,i)=>({port:i+1,keys:[{main:'Key',lookup:'Key'}]}));
 const params=n=>({enrichment:{prefixes:{enabled:false,name:'',label:''},tables:tables(n)}});
 for(const n of [3,4,14])assert.doesNotThrow(()=>validateActionParameters(handler.parameter_schema,params(n)));
 assert.throws(()=>validateActionParameters(handler.parameter_schema,params(15)));
});
