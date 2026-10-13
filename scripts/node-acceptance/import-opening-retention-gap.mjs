// Three targeted gap controls, no resource algorithm or private grant alteration.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const {createActionRuntime}=await import(pathToFileURL(root+'/executor.mjs').href);
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const ref={document_id:'doc',workflow_id:'wf',node_id:'existing'};
const request={operation_id:'original-import-opening',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'existing',type:'imports.text',ref},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref,type:'imports.text',label:'Existing',position:{x:0,y:0},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
let runtime,openCalls=0,configureCalls=0,mutations=0;const first=Error('configure not admitted by this fixture',{cause:0});
const handler={revision:'1',modes:['delimited'],validate:()=>{},configure:async()=>{
 configureCalls++;assert.throws(()=>runtime.retainCaptureNode(request.operation_id),/LOGINOM_CAPTURE_NODE_REFUSED/);
 assert.equal(runtime.hasUnsettledWork(),true);throw first;
}};
const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});
runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},execute:async()=>{throw Error('No Page/native transport allowed');},
 nodeApplyHandlers:new Map([['imports.text',handler]]),
 nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,
  mutate:async()=>{mutations++;throw Error('No target mutation allowed');},reconcile:async()=>({verified:true,cleanup_complete:true})}),
 nodeApplyDriverFactory:()=>({verifySource:ok,mapPorts:ok,openWizard:async()=>{openCalls++;return {verified:true,cleanup_complete:true,effect_possible:false};},
  finish:async()=>{throw Error('No Finish/Close allowed');},waitExecution:async()=>{throw Error('No execute allowed');},readOutput:async()=>{throw Error('No reader allowed');},verifyContinuation:async()=>true}),
 onRecord:async e=>structuredClone(e)});
const signal=new AbortController().signal;
const result=await runtime.runNodeApply(request,{signal});
assert.equal(openCalls,1);assert.equal(configureCalls,1);assert.equal(mutations,0);
assert.equal(result.status,'AMBIGUOUS');assert.equal(result.output.pending_phase,'configure');
assert.throws(()=>runtime.retainCaptureNode(request.operation_id),/LOGINOM_CAPTURE_NODE_REFUSED/);
assert.equal(runtime.hasUnsettledWork(),true);
console.log(JSON.stringify({controls:3,originalOpenBeforeConfigure:true,preconfigHandleRefused:true,settledRefusalRemainsPending:true,
 nativeDispatch:0,resourceReaderDispatch:0,closeSaveExecute:0,
 limits:'production apply/executor; Page/native/adapter/driver/journal are labelled doubles, not native preparation or grant authority'}));
