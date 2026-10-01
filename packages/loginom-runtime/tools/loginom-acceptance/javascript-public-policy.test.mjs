import test from 'node:test';
import assert from 'node:assert/strict';
import {runJavascriptOperator} from './javascript-live.mjs';
import {javascriptPublicPolicyRefusalSources} from './javascript-public-policy-reread.mjs';
import {javascriptPublicCodeRequest,javascriptPublicCodeProbe,javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {NODE_READ_MODE} from '../../client/lib/node-read-contract.mjs';

const paths=['--config','/not-read/private.json','--profile','/not-created/profile',
 '--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
test('fixed public policy entrypoint refuses mixed modes, Save and focus flags before private config',async()=>{
 for(const options of [{publicPolicyMode:'unknown'},{publicPolicyMode:'code',coldReader:true},
  {publicPolicyMode:'declared',publicProbeId:'g5-knowledge-v1'},{publicPolicyMode:'code',uiProfileMode:'code'}])
  await assert.rejects(()=>runJavascriptOperator(paths,options),/separate fixed mode/);
 for(const args of [paths,[...paths,'--execution-case','declared-table-execute','--verify-public-declared-lifecycle'],
  [...paths,'--execution-case','code-table-execute','--verify-public-code-lifecycle','--verify-public-code-save'],
  [...paths,'--execution-case','code-table-execute','--verify-public-code-lifecycle','--x11-no-focus']])
  await assert.rejects(()=>runJavascriptOperator(args,{publicPolicyMode:'code'}));
});
for(const mode of ['code','declared'])test('actual public runtime refuses all fixed new/existing modules before browser or journal: '+mode,async()=>{
 const config={targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor()};
 const base=createCandidateNodeSupport(config),support=createJavascriptCodeNodeSupport(config),events=[];
 let calls=0;
 const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),allowCandidate:true,...config,
  nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...support.nodeApplyHandlers]),
  nodeApplyDriverFactory:support.nodeApplyDriverFactory,onRecord:async event=>{events.push(event);return event;},
  execute:async()=>{calls++;throw Error('Unsupported source must not reach browser');}});
 const prepared={document_id:'document',workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',
  tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'workflow',label:'Сценарий'}]}};
 const node={document_id:'document',workflow_id:'workflow',node_id:'node'};
 const probe=javascriptPublicCodeProbe(null,mode),request=javascriptPublicCodeRequest({prepared,input:{node},probe,schemaMode:mode,remaining:1000000});
 for(const kind of ['new','existing'])for(const source of javascriptPublicPolicyRefusalSources){
  assert.equal(inspectJavascriptModulePolicy(source).status,'REFUSED');
  const rejected={...structuredClone(request),...(kind==='existing'?{target:{kind,type:'programming.javascript',ref:node},inputs:[],
   parameters:{source_text:source,expected_source_sha256:probe.source_sha256}}:{parameters:{...request.parameters,source_text:source}})};
  await assert.rejects(()=>dispatchNodeApi(runtime,'dock_node_apply',rejected),{message:'Invalid parameters.source_text'});
 }
 assert.deepEqual(events,[]);assert.equal(calls,0);assert.equal(runtime.hasUnsettledWork(),false);
});
test('installed JS support routes the internal reread to a guarded read driver with configuration forbidden',async()=>{
 const support=createJavascriptCodeNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor()});
 let calls=0;
 const driver=support.nodeApplyDriverFactory({operation:{id:'reread',parameters:{mode:NODE_READ_MODE,document_id:'doc',
  workflow_ref:{workflow_id:'workflow'},target:{kind:'existing',type:'programming.javascript',ref:{node_id:'node'}},
  parameters:{source_operation_id:'created',javascript_source:{source_sha256:'a'.repeat(64),source_utf8_bytes:0,source_lf_lines:1}}}},
  execute:async()=>{calls++;throw Error('No browser call expected');},onRecord:async e=>e,now:Date.now,receiptOptions:()=>({})});
 assert.equal(typeof driver.beforeTarget,'function');assert.equal((await driver.verifySource()).source_operation_id,'created');
 for(const name of ['openWizard','mapPorts','finish'])assert.throws(()=>driver[name](),/cannot open or configure/);
 assert.equal(calls,0);
});
