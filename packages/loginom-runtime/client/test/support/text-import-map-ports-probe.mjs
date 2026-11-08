// Run only via text-import-auto-types.test.mjs with --experimental-test-module-mocks.
// Drives the real imports.text node driver (openWizard -> configure -> mapPorts) for an
// existing «Только новые» import whose new file renames Amount to Sum, and prints the
// options that mapPorts passes to resyncOutputFields. Browser procedures are stubbed.
import {mock} from 'node:test';
const lib=new URL('../../lib/',import.meta.url),href=name=>new URL(name,lib).href;
const real=async name=>({...await import(href(name)+'?probe-real')});
let stage='graph';
const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,
 source_fields:[{record_id:'s0',field_id:'0',name:'Id',label:'Id'},{record_id:'s1',field_id:'1',name:'Sum',label:'Sum'}],
 target_fields:[{record_id:'t0',name:'Id',label:'Id',source:{record_id:'s0',field_id:'0',name:'Id',label:'Id'}},{record_id:'t1',name:'Amount',label:'Amount',source:null}]};
const state=()=>({prepared_node_context:{surface:stage==='graph'?'graph':'wizard',tid:'N'},
 wizard:stage==='graph'?{status:'absent'}:{status:'observed',stage,root_tid:'W',owner_context:{status:'observed'}},
 ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;btnPrev',ref:'prev',allowed_actions:['wizard_step']}]},node_mapping:structuredClone(native)});
const channel={observe:async o=>{const s=state();if(!o.ready(s))throw Error('Probe state not ready: '+o.condition);return s;},
 perform:async o=>{const a=o.resolve(o.initialObservation);if(a.verb==='wizard_step')stage=a.expected_stage;},act:async()=>{}};
const configured={verified:true,columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true},{name:'Sum',label:'Sum',type:'real',data_kind:'Непрерывный',used:true}],
 format:{fields:{auto_detect_columns:{status:'observed',value:'Только новые'}}},preservation:{columns_before:[{name:'Id'},{name:'Amount'}]}};
const calls=[];
mock.module(href('node-procedure.mjs'),{exports:{...await real('node-procedure.mjs'),createNodeProcedure:()=>channel}});
mock.module(href('node-graph-selection.mjs'),{exports:{...await real('node-graph-selection.mjs'),selectPreparedGraphNode:async()=>{}}});
mock.module(href('node-wizard-open.mjs'),{exports:{...await real('node-wizard-open.mjs'),openPreparedWizard:async()=>{stage='text_import_file';}}});
mock.module(href('text-import-procedure.mjs'),{exports:{...await real('text-import-procedure.mjs'),isTextImportSourceReady:()=>true,
 configureTextImportPatch:async()=>{stage='text_import_format';return structuredClone(configured);}}});
mock.module(href('port-mapping-procedure.mjs'),{exports:{...await real('port-mapping-procedure.mjs'),
 resyncOutputFields:async(_channel,before,options)=>{calls.push({previousColumns:options?.previousColumns??null,before_targets:before.target_fields.map(t=>t.name)});throw Error('probe stop');}}});
const {createTextImportNodeSupport}=await import(href('text-import-node.mjs'));
const p={source:{kind:'storage',server_source_ref:'ref'},settings:{source:{source_path:'/test/renamed.csv'}}};
const request={target:{kind:'existing'},finish:'done',inputs:[],mappings:[],read:{ports:[]},parameters:p};
const driver=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation:{id:'op',parameters:{parameters:p},nodeApply:{request}},
 execute:async()=>{throw Error('no browser');},onRecord:()=>{},now:()=>Date.now(),receiptOptions:()=>({}),
 resolveStorageSource:async()=>({verified:true,kind:'storage',server_source_ref:'ref',destination:'/test/renamed.csv'})});
const ctx={signal:new AbortController().signal,deadline:Date.now()+60000,document_id:'d',workflow_ref:{workflow_id:'w'},node:{node_id:'n'}};
await driver.verifySource(p);
await driver.openWizard(ctx);
await driver.configureTextImport(ctx,p);
const stop=await driver.mapPorts([],{...ctx,receipt_id:'op:output_mapping'}).then(()=>null,error=>error.message);
console.log(JSON.stringify({stop,calls}));
