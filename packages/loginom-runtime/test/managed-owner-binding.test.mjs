import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import vm from 'node:vm';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
const modulePath=process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url);
const output=process.env.BINDING_REPORT;
const bytes=await fsp.readFile(modulePath);
const text=bytes.toString();
const body=text.slice(text.indexOf('function closeRejection('),text.indexOf('const stop ='));
assert.ok(body.startsWith('function closeRejection('));
const scenarios=['no-start','startup-canonical','startup-late-directory','startup-late-owner','startup-late-id','startup-late-context','startup-late-metadata','startup-late-sessionId',
  'startup-retained-empty','startup-retained-missing','startup-retained-repair','bridge-late-owner-same-directory'];
const reports=[];
for(const scenario of scenarios)test('managed original binding '+scenario,async()=>{
  const root=await fsp.mkdtemp(join(tmpdir(),'ordinary73-validation-'));
  const A=join(root,'A'),B=join(root,'B');await fsp.mkdir(A);await fsp.mkdir(B);
  const events=[],opened=new Map();let serial=0,native=0,handleReleases=0,changed=false,fault=false;
  const primary=new Error('one-shot labelled storage callback failure');
  const context={},page={};
  const owner={directory:A,id:'fixture-original',account:'fixture',origin:'https://fixture.invalid',context,page,metadata:{sessionId:'fixture-session'},closed:false,contextClosed:false,
    async close(){native++;this.closed=true;this.contextClosed=true;this.receipt=Object.freeze({cleanup_complete:true,native_logout_confirmed:true});return this.receipt}};
  const originalMetadata=owner.metadata;
  const state=scenario==='no-start'?{}:{startupOwner:owner};
  if(scenario==='bridge-late-owner-same-directory'){
    state.session={directory:A};delete state.startupOwner;state.authenticatedReadiness={account:'fixture'};
    state.bridge={async close(){native++;return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}};
    for(const key of ['client','browserServer','browser'])state[key]={async close(){handleReleases++}};
  }
  const open=(path,flags,mode,callback)=>fs.open(path,flags,mode,(error,fd)=>{
    if(!error)opened.set(fd,{id:++serial,directory:fs.fstatSync(fd).isDirectory()});
    events.push({event:'open',location:path===A?'A-directory':path===B?'B-directory':path.startsWith(A+'/')?'A-temp':'B-temp'});callback(error,fd);
  });
  const sync=(fd,callback)=>fs.fsync(fd,error=>{
    const record=opened.get(fd);events.push({event:'original-sync-callback',...record});
    if(scenario.startsWith('startup-retained-')&&!fault&&state.startupCleanup){fault=true;callback(primary)}else callback(error);
  });
  const close=(fd,callback)=>{
    const record=opened.get(fd);events.push({event:'close-invoked',...record});
    fs.close(fd,error=>{
      events.push({event:'original-close-callback',...record});
      if(!error&&record.directory&&!changed&&(state.startupCleanup||state.bridgeCleanup)){
        if(scenario==='startup-late-directory'){owner.directory=B;changed=true}
        if(scenario==='startup-late-owner'){state.startupOwner={...owner};changed=true}
        if(scenario==='startup-late-id'){owner.id='replacement';changed=true}
        if(scenario==='startup-late-context'){owner.context={};changed=true}
        if(scenario==='startup-late-metadata'){owner.metadata={...owner.metadata};changed=true}
        if(scenario==='startup-late-sessionId'){owner.metadata.sessionId='replacement';changed=true}
        if(scenario==='bridge-late-owner-same-directory'){state.session={directory:A};changed=true}
        if(changed)events.push({event:'late-owner-binding-change',scenario});
      }
      callback(error);
    });
  };
  const f=vm.runInNewContext(body+';({close})',{state,requests:new Set(),evidenceOpen:open,evidenceWrite:fs.writeFile,evidenceSync:sync,evidenceClose:close,
    evidenceRename:fs.rename,evidenceUnlink:fs.unlink,constants:fs.constants,randomUUID,join,rm:fsp.rm,Promise,Error});
  try{
    let firstRefused=false,exactFirstError=false;
    if(scenario.startsWith('startup-retained-')){
      try{await f.close()}catch(error){firstRefused=true;exactFirstError=error===primary}
      assert.equal(firstRefused,true);assert.equal(exactFirstError,true);assert.equal(native,1);assert.equal(handleReleases,0);
      assert.equal(state.startupCleanup.owner,owner);assert.equal(owner.closed,true);assert.equal(owner.contextClosed,true);
      if(scenario==='startup-retained-empty')owner.directory='';
      if(scenario==='startup-retained-missing')state.startupOwner=undefined;
    }
    const before=serial;let rejected=false;
    try{await f.close()}catch{rejected=true}
    const allowed=state.shutdown.stages.some(s=>s.stage==='outer_acknowledgement'&&s.status==='allowed');
    const defect=scenario.includes('-late-')||scenario==='startup-retained-empty'||scenario==='startup-retained-missing';
    assert.equal(rejected,defect);assert.equal(allowed,!defect);
    assert.equal(native,scenario==='no-start'?0:1);
    assert.equal(handleReleases,0);
    if(scenario.endsWith('-empty')||scenario.endsWith('-missing')||scenario==='no-start')assert.equal(serial,before);
    if(scenario.startsWith('startup-retained-'))assert.equal(state.shutdown.primaryFailure.rejection.message,primary.message);
    if(defect){await assert.rejects(f.close());assert.equal(native,1);assert.equal(handleReleases,0);
      if(scenario==='bridge-late-owner-same-directory')state.session=state.evidenceOwnerBinding.owner;
      else {state.startupOwner=owner;owner.directory=A;owner.id='fixture-original';owner.context=context;owner.metadata=originalMetadata;owner.metadata.sessionId='fixture-session'}
      await f.close();assert.equal(native,1);assert.equal(handleReleases,scenario==='bridge-late-owner-same-directory'?3:0);}

    reports.push({scenario,verdict:defect?'REPLACEMENT_REFUSED':'CANONICAL_CONTROL',firstRefused,exactFirstError,rejected,allowed,nativeFixtureCalls:native,
      handleFixtureReleases:handleReleases,ioOpensAfterRefusal:serial-before,confirmedCleanupRetained:!!(state.startupCleanup||state.bridgeCleanup),events});
  }finally{await fsp.rm(root,{recursive:true,force:true})}
});
test('write bounded binding report',async()=>{if(output)await fsp.writeFile(output,JSON.stringify({moduleSHA256:createHash('sha256').update(bytes).digest('hex'),cases:reports,scope:'exact functions in VM; genuine FS callbacks; native/owner/handles/fault doubles; no native or live ACK'},null,2)+'\n')});
