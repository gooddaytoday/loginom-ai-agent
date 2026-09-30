import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {javascriptRequiredManualConfiguration,javascriptRequiredManualLabel,verifyJavascriptRequiredManualMapping,javascriptRequiredOutputOracle} from './javascript-public-required.mjs';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {resolveConfiguredOutputMapping} from '../../client/lib/port-mapping-procedure.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
function native(manual=true) {
 const schema=javascriptDiscoveryProbe('p1-business-code-base').schema;
 const source_fields=schema.map((c,index)=>({...c,index,record_id:'s'+index,field_id:String(index),required:true}));
 return {verified:true,inventory_complete:true,source_identity_verified:true,state_source:'cached_mapping_stores',
  settings_applied:false,package_saved:false,mapping_wizard:'DataSetOutputSocketWizard',autosync:!manual,
  node_context:{...node,verified:true,surface:'wizard',output_port:{direction:'output',port:0}},source_fields,
  target_fields:source_fields.map((c,index)=>({...c,record_id:'t'+index,source:{...c},required:false,inherited:false,excluded:false,
    data_kind:c.type==='integer'?'Непрерывный':'Дискретный',label:manual&&c.name==='NetCents'?javascriptRequiredManualLabel:c.label}))};
}
test('fixed manual configuration uses the real shared resolver with mandatory sources and optional targets',()=>{
 const configuration=javascriptRequiredManualConfiguration(),mapping=native(false);
 const resolved=resolveConfiguredOutputMapping(configuration.mapping,configuration.configured,mapping);
 assert.equal(resolved.autosync,false);assert.equal(resolved.fields[2].label,javascriptRequiredManualLabel);
 assert.ok(resolved.fields.every(f=>f.source.required===true&&f.current.required===false));
 assert.deepEqual(verifyJavascriptRequiredManualMapping(native(),node).source_required,[true,true,true,true]);
 const excluded=structuredClone(configuration.mapping);excluded.fields[2].excluded=true;
 assert.throws(()=>resolveConfiguredOutputMapping(excluded,configuration.configured,mapping),/Required or unverified/);
});
for(const change of [m=>m.source_fields[2].required=false,m=>m.target_fields[2].required=true,
 m=>m.node_context.node_id='foreign',m=>m.node_context.output_port.port=1,m=>m.autosync=true,
 m=>m.source_fields.pop(),m=>m.target_fields.reverse(),m=>m.target_fields[2].source.record_id='foreign',
 m=>m.target_fields[2].source.field_id='foreign',m=>m.target_fields[2].excluded=true,
 m=>m.target_fields[2].label='NetCents',m=>m.source_fields[1].record_id='s0',m=>m.settings_applied=true,
 m=>m.source_fields[0].index=9])test('required manual verifier rejects '+change.toString(),()=>{
 const mapping=native();change(mapping);assert.throws(()=>verifyJavascriptRequiredManualMapping(mapping,node),/Required native/);
});
for(const mode of ['code','declared'])test('real public runtime rejects unsupported required mapping edit before driver/browser admission: '+mode,async()=>{
 const support=createJavascriptCodeNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor()});
 const base=createCandidateNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'});
 let drivers=0,gestures=0;const records=[];
 const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),allowCandidate:true,targetOrigin:'http://logi-test-plan.bg.local',
  targetBuild:'7.4.2',redactor:createRedactor(),nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...support.nodeApplyHandlers]),
  nodeApplyDriverFactory:()=>{drivers++;throw Error('No driver admission allowed');},
  execute:()=>{gestures++;throw Error('No browser execution allowed');},onRecord:async e=>{records.push(e);return e;}});
 const request={operation_id:'required-refused-'+mode,contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'navigation',label:'Workflow'}]},
  target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters:{schema_mode:mode},
  mappings:[{...javascriptRequiredManualConfiguration().mapping,fields:javascriptRequiredManualConfiguration().mapping.fields.map(f=>({...f,...(f.name==='NetCents'?{excluded:true}:{})}))}],
  finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
  budgets:{configure_ms:600000,execute_ms:60000,total_ms:660000}};
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',request),/JavaScript lifecycle requires preserved port mappings/);
 assert.equal(drivers,0);assert.equal(gestures,0);assert.equal(records.length,0);assert.equal(runtime.hasUnsettledWork(),false);
});
for(const mode of ['code','declared'])test('required manual oracle checks the complete independent six by four values and exact manual label: '+mode,()=>{
 const probe=javascriptDiscoveryProbe('p1-business-'+mode+'-base'),table={fresh:true,
  schema:probe.schema.map(c=>({...c,label:c.name==='NetCents'?javascriptRequiredManualLabel:c.label})),
  row_count:6,sample_rows:6,sample_complete:true,filter_enabled:false,precision:{numbers_verified:true,limitations:[]},
  sample:probe.expected.map(row=>row.map((value,index)=>({type:probe.schema[index].type,value,is_null:false,
    precision:probe.schema[index].type==='integer'?'exact_integer':'display_text'})))};
 assert.equal(javascriptRequiredOutputOracle(mode,table).gate_passed,true);
 for(const mutate of [t=>t.fresh=false,t=>t.sample[5][3].value='foreign',t=>t.schema[2].label='NetCents',
   t=>t.sample[4][2].precision='rounded',t=>t.sample.pop()]){
   const changed=structuredClone(table);mutate(changed);assert.throws(()=>javascriptRequiredOutputOracle(mode,changed));
 }
});
const entry=fileURLToPath(new URL('./javascript-public-required-live.mjs',import.meta.url));
for(const args of [[],['--case','foreign'],['--case','required-code','--source','foreign'],
 ['--case','required-declared','--headless','true'],['--case','required-code','--x11-no-focus','true']])
test('required entrypoint refuses uncontrolled inputs '+JSON.stringify(args),()=>{
 const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.equal(result.status,1);
 assert.match(result.stderr,/Fixed public required|Only assigned public required/);
});
