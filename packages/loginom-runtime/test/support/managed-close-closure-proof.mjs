import vm from 'node:vm';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const source=await readFile(process.argv[2],'utf8'),begin=source.indexOf('function close()'),end=source.indexOf('const stop =',begin);
const close=source.slice(begin,end),rbegin=source.indexOf('function closeRejection('),rend=source.indexOf('async function closeEvidenceFile(',rbegin);
const reject=source.slice(rbegin,rend),values={error:Error('original bridge',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
const scenarios=[...['bridge','client','browser_server'].map(stage=>({mode:'evidence',stage})),...['bridge','client'].flatMap(stage=>Object.keys(values).map(value=>({mode:'rejection',stage,value}))),{mode:'incomplete',stage:'bridge'}];
const receipts=[];
for(const c of scenarios){
 const dir=await mkdtemp(join(tmpdir(),'managed-closure-69-')),events=[],calls={bridge:0,client:0,browser_server:0,browser_context:0};let fault=false;
 const state={session:{directory:dir},authenticatedReadiness:{account:'own'},bridge:{async close(){calls.bridge++;if(c.mode==='rejection'&&c.stage==='bridge')throw values[c.value];return {cleanup_complete:c.mode!=='incomplete',browser_transport_closed:true,native_logout_confirmed:true}}}};
 for(const k of ['client','browser_server','browser_context']){const field={browser_server:'browserServer',browser_context:'browser'}[k]??k;state[field]={async close(){calls[k]++;if(c.mode==='rejection'&&c.stage===k)throw values[c.value]}}}
 const projected=Error('projected evidence',{cause:0});
 const recordClose=async(stage,detail)=>{state.shutdown??={stages:[]};state.shutdown.stages.push({stage,...detail});events.push({stage,...detail});
  if(c.mode==='evidence'&&stage===c.stage&&detail.status==='returned'&&!fault){fault=true;throw projected}
  await writeFile(join(dir,'evidence.json'),JSON.stringify(state.shutdown));
 };
 const context=vm.createContext({state,requests:new Set(),recordClose,rm,Error});
 const api=vm.runInContext(reject+close+';({close})',context);let first,second;
 try{
  try{await api.close()}catch(value){first={value}}
  await Promise.resolve();try{await api.close()}catch(value){second={value}}
  assert.ok(first);assert.equal(calls.bridge,1);
  if(c.mode==='evidence'){assert.equal(first.value,projected);assert.equal(second,undefined);assert.ok(events.some(e=>e.stage==='outer_acknowledgement'&&e.status==='allowed'));assert.equal(calls.client,1);assert.equal(calls.browser_server,1);assert.equal(calls.browser_context,1)}
  else{assert.ok(second);assert.equal(second.value,first.value);assert.equal(events.some(e=>e.stage==='outer_acknowledgement'),false);if(c.stage==='bridge'){assert.equal(calls.client,0);if(c.mode==='rejection')assert.equal(first.value,values[c.value])}else{assert.equal(first.value.cause,values[c.value]);assert.equal(calls.client,1);assert.equal(calls.browser_server,0)}}
  receipts.push({fixture:true,scenario:c,calls,events,primary:state.shutdown.primaryFailure,scope:'exact accepted close function, recordClose injection with own real fs writes; bridge/context/native doubles; callback writer proof remains separate reviewed15+6'});
 }finally{await rm(dir,{recursive:true,force:true})}
}
await mkdir(process.argv[3],{recursive:true});await writeFile(join(process.argv[3],'closure-proof.json'),JSON.stringify(receipts,null,2));console.log(JSON.stringify({pass:receipts.length,source:process.argv[2],fixture:true}));
