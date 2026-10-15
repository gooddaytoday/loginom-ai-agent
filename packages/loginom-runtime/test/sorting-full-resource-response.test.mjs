import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,open,rm,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=process.env.SORTING_RUNTIME;
if(!runtime)throw Error('Exact built runtime required, no fabricated product metadata');
const lib=p=>pathToFileURL(runtime+'/client/lib/'+p).href;
const originals=await import(lib('node-procedure.mjs'));
let fixture;
// Explicit executor responses replace Page/UI execution, not the fixed resource,
// runtime verifier, decoder, conversion or final completeness/multiplicity audit.
mock.module(lib('node-procedure.mjs'),{namedExports:{...originals,createNodeProcedure:({record})=>({
 observe:async({ready})=>{const s=fixture.snapshot();assert.equal(ready(s),true);fixture.events.push('observe');await record({phase:'fixture_observation',state:s});return s},
 perform:async({ready,resolve,identity})=>{const s=fixture.snapshot();assert.equal(ready(s),true);assert.equal(identity(s).node_id,'n');resolve(s);fixture.events.push('preview-gesture-response');await record({phase:'fixture_gesture_response',state:s})}
})}});
const {captureSorting}=await import(pathToFileURL(runtime+'/src/acceptance/sorting-before-close-v1.mjs'));
const frozen=JSON.parse(await readFile(new URL('../tools/loginom-acceptance/collapse/review-fix/loaded-runtime-sources.json',import.meta.url),'utf8'));
const loaders=JSON.parse(await readFile(new URL('./sorting-count-loader-inputs.json',import.meta.url),'utf8'));
for(const [k,s]of Object.entries(loaders.sources))assert.equal(createHash('sha256').update(s).digest('hex'),loaders.sha256[k]);
const schema=[{name:'Scalar',label:'Scalar',type:'variant'},{name:'Integer',label:'Integer',type:'integer'},
 {name:'String',label:'String',type:'string'},{name:'Bool',label:'Bool',type:'boolean'},
 {name:'Real',label:'Real',type:'real'},{name:'When',label:'When',type:'datetime'}];
function frame(tag,value){
 const str=tag===8?new TextEncoder().encode(value):null,used=tag===8?(str.length?16+str.length:14):10;
 const bytes=new Uint8Array(used),v=new DataView(bytes.buffer);v.setInt16(0,tag,true);
 if(tag===20)v.setBigInt64(2,BigInt(value),true);else if([5,7].includes(tag))v.setFloat64(2,value,true);
 else if(tag===11)bytes[2]=value?1:0;else if(tag===8){v.setInt32(10,str.length,true);if(str.length){v.setUint16(14,65001,true);bytes.set(str,16)}}
 return {tag,payload:[...bytes],frame_size:Math.max(60,12+used)};
}
function jsonArgument(code){
 const i=code.indexOf('{"document_id":');assert.ok(i>=0);let depth=0,quoted=false,escape=false;
 for(let j=i;j<code.length;j++){const c=code[j];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth)return JSON.parse(code.slice(i,j+1))}
 throw Error('Fixed serialized argument unavailable');
}
export function makeFixture(mode,overrides={}){
 const events=[],identity={session_id:'s',account:'account',package_path:'/account/test.lgp',document_id:'d',tab_tid:'tab',loginom_build:'7.4.2',...overrides};
 const binding={revision:1,harness:'sorting-before-close-v1',owner:'o',run:'r',lease:'o:r',chat:'c',admission:'a',generation:1,expires:Date.now()+60000,account:identity.account,session:identity.session_id,packagePath:identity.package_path};
 const node={document_id:identity.document_id,workflow_id:'w',node_id:'n'},execution={status:'completed',execution_id:identity.document_id+':1:2'};
 const count=mode==='empty'?0:3;
 const ordinary={status:'SUCCEEDED',cleanup_complete:true,node,execution,configuration:{readback:{kind:'sorting',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node,
   keys:[{name:'Scalar',type:'variant',order:0,direction:'ASC',case_sensitive:false}],receipt_ids:['a','b','c','d','e']}},
  output:{ports:[{port:0,port_guid:'p',row_count:count,schema,sample:[],fresh:true,execution_id:execution.execution_id}]}};
 let before,readId,calls=0;
 const snapshot=()=>({prepared_node_context:{verified:true,surface:'graph',...node},wizard:{status:'absent'},
   node_outputs:{verified:true,ports:[{index:0,active:true,port_guid:'p',tid:'output'}]},
   ui:{elements:[{ref:'output',tid:'output',allowed_actions:['click','press']}]},
   node_preview_schema:{verified:true,port:0,node_id:'n',port_guid:'p',fields:schema}});
 const browser={callTool:async({arguments:{code}})=>{
  calls++;events.push('browser');let value;
  if(code.includes('function readCapturePreparation'))value={origin:'http://test',workflow_ref:{tab_tid:identity.tab_tid,prefix:'TF',workflow_id:'w',navigation_path:[]}};
  else if(code.includes('async function bindLoadedNativeRuntime')){
   events.push('frozen-runtime-proof-response');readId=code.match(/"binding_id":"([^"]+)"/)[1];
   value={binding_id:readId,document_id:mode==='runtime-identity'?'foreign':identity.document_id,...structuredClone(frozen)};
   if(mode==='runtime-pin')value.sources['session.DispatchMessageAsync']+=' ';
  }else if(code.includes('async function bindSortingNative')){
   events.push('native-binding-response');const a=jsonArgument(code);
   value={...a,port:0,method:321,interface:116,offset:0,rows:count,columns:schema.map((_,i)=>i),row_count:count,
    source:{owner:0,object:9},static_source:{node_id:'source',execution_id:identity.document_id+':1:1'},count_loader_sources:structuredClone(loaders.sources)};
   delete value.account;delete value.build;
   if(mode==='loader-pin')value.count_loader_sources.InitOutput+=' ';
   if(before&&mode==='binding-change')value.port_guid='foreign';
   before??=structuredClone(value);
  }else if(code.includes('async function readNativeVariant')){
   events.push('rpc-response');
   if(mode==='lost-reply')throw 0;
   const b={...before,runtime_binding_id:readId};delete b.count_loader_sources;
   const cells=[];let id=100;
   const values=[[1,null],[20,'9007199254740993'],[8,'A'],[11,false],[5,-0],[7,45292.25]];
   for(let row=0;row<count;row++)for(let column=0;column<schema.length;column++)cells.push({row,column,message_id:++id,...frame(...(row===2&&column===1?[20,'-1']:values[column]))});
   if(mode==='incomplete')cells.pop();if(mode==='wrong-type')cells[1]={...cells[1],...frame(8,'0')};if(mode==='duplicate-address')cells[1].column=0;
   const n=cells.length;
   value={result:{...b,read_id:readId,cells,empty_count_attested:count===0,owner_rechecked:true,cache_identity_rechecked:true},
    lifecycle:{id:readId,status:'completed',published:true,pending:0,retired:false,requests:n,releasedRequests:n,releasedResponses:n}};
  }else throw Error('Unexpected fixed resource stage');
  return {content:[{type:'text',text:JSON.stringify({status:'SUCCEEDED',action_key:'acceptance.sorting.read',action_revision:'1',phase:'read',effect_possible:false,trace:[],error:null,output:{value}})}]};
 }};
 return {events,snapshot,browser,binding,identity,ordinary,get calls(){return calls}};
}
for(const mode of ['mixed','empty','runtime-pin','runtime-identity','loader-pin','binding-change','lost-reply','incomplete','wrong-type','duplicate-address','persistence'])
 test('complete captureSorting function with explicit Page/executor/RPC response doubles: '+mode,async()=>{
  fixture=makeFixture(mode);const dir=await mkdtemp(join(tmpdir(),'sorting-resource-'));
  const record=async event=>{const f=await open(join(dir,'journal.jsonl'),'a',0o600);try{await f.writeFile(JSON.stringify(event)+'\n');await f.sync()}finally{await f.close()}};
  try{
   if(mode==='persistence')await mkdir(join(dir,'journal.jsonl'));
   if(!['mixed','empty'].includes(mode)){
    let failed=false,rejected;try{await captureSorting({...fixture,record})}catch(e){failed=true;rejected=e}
    assert.equal(failed,true);if(mode==='lost-reply')assert.equal(rejected,0);
    if(['runtime-pin','runtime-identity','loader-pin'].includes(mode))assert.equal(fixture.events.includes('rpc-response'),false);
   }else{
    const result=await captureSorting({...fixture,record});
    assert.equal(result.capture_complete,true);assert.equal(result.native_verified,false);
    assert.equal(result.output.exact_table.complete,true);assert.equal(result.output.row_count,mode==='empty'?0:3);
    assert.equal(result.output.schema.length,6);assert.equal(Object.keys(result.runtime.functions).length,53);
    if(mode==='mixed'){assert.deepEqual(Object.values(result.full.multiplicity),[2,1]);assert.deepEqual(result.full.rows.map(r=>r[1].value),['9007199254740993','9007199254740993','-1']);assert.equal(result.full.rows[0][1].value,'9007199254740993');assert.equal(result.full.rows[0][4].value,'-0');assert.equal(result.full.rows[0][0].is_null,true);assert.equal(result.full.rows[0][5].timezone,'unspecified')}
    const f=await open(join(dir,'capture.json'),'w',0o600);try{await f.writeFile(JSON.stringify(result));await f.sync()}finally{await f.close()}
    const d=await open(dir,'r');try{await d.sync()}finally{await d.close()}
    fixture.events.push('capture-durable');assert.equal(fixture.events.filter(x=>x==='rpc-response').length,1);
    if(process.env.SORTING_RESULTS)await writeFile(join(process.env.SORTING_RESULTS,mode+'.json'),JSON.stringify({fixture:true,executed_native:false,scope:'complete fixed resource with response doubles; no full owner/Page proof',events:fixture.events,result},null,2)+'\n');
   }
  }finally{await rm(dir,{recursive:true,force:true})}
 });

export function activateFixture(mode,overrides){fixture=makeFixture(mode,overrides);return fixture}
