// Isolated module mocks stop the two browser-adapter awaits without adding
// injection parameters to production. The real JS driver and apply shell run.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createHash} from 'node:crypto';
import {createRedactor} from '../../lib/redact.mjs';
import {applyNode} from '../../lib/node-apply.mjs';

const point=process.argv[2];assert.ok(['read','replace'].includes(point));
const calls=[],events=[],controller=new AbortController();
const entered=Promise.withResolvers(),returned=Promise.withResolvers();
const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'nav',label:'Scenario'}]};
const source='import {InputTable,OutputTable} from "builtIn/Data";\n';
const request={operation_id:'cancel-js',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'programming.javascript',position:{x:320,y:280}},
 inputs:[{source:{...node,node_id:'input'},output:0,input:0}],mode:'script',
 parameters:{schema_mode:'code',source_text:source},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:30000,execute_ms:1000,total_ms:30000}};
let wizard=true;
const snapshot=()=>({prepared_node_context:{...node,verified:true,surface:wizard?'wizard':'graph',locked:wizard},
 wizard:wizard?{status:'observed',root_ref:'wizard',root_tid:'W',stage:'input_mapping',owner_context:{status:'observed'}}:{status:'absent'},
 ui:{elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}],dialogs:[],masks:[]},
 node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,state_source:'cached_mapping_stores',
  settings_applied:false,package_saved:false,autosync:true,node_context:{...node,surface:'wizard',input_port:{direction:'input',port:0}},
  source_fields:[{name:'RowID'}],target_fields:[{name:'RowID'}]}});
const procedure=await import('../../lib/node-procedure.mjs');
mock.module(new URL('../../lib/node-procedure.mjs',import.meta.url),{namedExports:{...procedure,
 createNodeProcedure:()=>({openPort:async()=>{},observe:async({ready})=>{const s=snapshot();assert.ok(ready(s));return s;},
  perform:async({resolve,initialObservation})=>{assert.deepEqual(resolve(initialObservation),{verb:'click',ref:'close'});wizard=false;}})}});
const managed=await import('../../lib/javascript-managed-source-adapter.mjs');
mock.module(new URL('../../lib/javascript-managed-source-adapter.mjs',import.meta.url),{namedExports:{...managed,
 createJavascriptManagedSourceAdapter:()=>({open:async()=>({settings:{generation:true},schema:{}}),
  read:async()=>{calls.push('read');if(point==='read'){entered.resolve();await returned.promise;}return {source};},
  replace:async()=>{calls.push('replace');if(point==='replace'){entered.resolve();await returned.promise;}
   return {draft_exact:true,source_sha256:createHash('sha256').update(source).digest('hex')};}})}});
const {createJavascriptCodeNodeSupport}=await import('../../lib/javascript-code-node.mjs');
const support=createJavascriptCodeNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()});
const graph={complete:true,document_id:'doc',workflow_ref:workflow,
 nodes:[{ref:node,inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
const operation={id:request.operation_id,parameters:request,nodeTargetAdapter:{observe:async()=>graph}};
const record=async e=>{events.push(e);return e;};
const driver=support.nodeApplyDriverFactory({operation,execute:async()=>assert.fail('Unexpected browser transport'),
 onRecord:record,now:Date.now,receiptOptions:()=>({})});
const result=applyNode({request,operation,handlers:support.nodeApplyHandlers,signal:controller.signal,record,
 drivers:{...driver,prepareTarget:async(_,ctx)=>{await driver.beforeTarget(ctx);return {verified:true,cleanup_complete:true,node};},
  finish:async()=>{calls.push('Done');assert.fail('Cancelled configure must not reach Done');},
  finishGraph:async()=>assert.fail('Cancelled configure must not reach graph finish')}});
await entered.promise;
assert.equal(operation.nodeApply.pending.phase,'configure');
assert.equal(operation.nodeApply.phases.some(p=>p.phase==='configure'),false);
controller.abort(Error('cancel during managed '+point));returned.resolve();
const stopped=await result;
assert.equal(stopped.status,'AMBIGUOUS');assert.equal(stopped.pending_phase,'configure');
assert.equal(stopped.error.code,'NODE_APPLY_STOPPED');
assert.match(stopped.error.message,new RegExp('cancel during managed '+point));
assert.equal(operation.nodeApply.pending.phase,'configure');
assert.deepEqual(calls,point==='read'?['read']:['read','replace']);
assert.equal(events.some(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='configure'),false);
console.log(JSON.stringify({point,status:stopped.status,pending_phase:stopped.pending_phase,calls}));
