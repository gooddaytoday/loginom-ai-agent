import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {makeSavedPackageStateCode,parseSavedPackageState,readSavedPackageState,savedPackageStateAdvice} from '../lib/package-persistence.mjs';
const options={sessionId:'own',documentId:'doc',account:'mimo',packagePath:'/mimo/own.lgp',loginomUrl:'http://loginom.invalid/app',loginomBuild:'7.4.2'};
function fixture(overrides={}){
 const s={path:'/mimo/own.lgp',account:'mimo',modified:false,readonly:false,running:false,...overrides};let calls=0;
 class PackageTreeNode{};const pack=new PackageTreeNode();Object.defineProperties(pack,{PackageFileName:{get:()=>s.path},ReadOnly:{get:()=>s.readonly}});pack.Package={};pack.HasRunningNodes=()=>s.running;
 const card={Controller:{Node:{data:{node:{ParentNode:pack}}}}};const m={PackageNodes:{Count:1,Items:()=>pack},FServerConnection:{Connected:true,get UserName(){return s.account;},Session:{async IsPackageModified(p){assert.equal(p,pack.Package);calls++;overrides.race?.(s,pack,card,m);return s.modified;}}}};
 m.FServerConnection.Session.get_FileStorage=async()=>({FileExists:path=>{
  assert.equal(path,options.packagePath);overrides.existenceRace?.(s);return overrides.exists;
 }});
 const doc={},ctx=vm.createContext({setTimeout,clearTimeout,document:doc,location:{origin:'http://loginom.invalid'},bg:{app:{Version:'7.4.2',PackageTreeNode,Application:{FInstance:{FMainForm:{FMapTree:m,Items:{Workspace:{getActiveTab:()=>card}}}}}}}});
 vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['r',{request:JSON.stringify({session:'own'})}]])}`,ctx);
 const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')',ctx)(arg)};
 ctx.reloadReceipt={phase:'verified',request:JSON.stringify({session:'own'}),packageNode:pack,
  openConnection:m.FServerConnection,openServerSession:m.FServerConnection.Session};
 vm.runInContext("globalThis.__loginomDockPreparationV1.receipts.set('reopen',reloadReceipt)",ctx);
 return {run:changed=>vm.runInThisContext('('+makeSavedPackageStateCode({...options,...changed})+')')(page),calls:()=>calls,
  readReload:changed=>page.evaluate(readSavedPackageState,{...options,origin:'http://loginom.invalid',
   reloadOperationId:'reopen',expectedReadOnly:s.readonly,...changed})};
}
for(const modified of [false,true])test('bound saved state remains a read, dirty='+modified,async()=>{
 const f=fixture({modified}),state=await f.run();assert.equal(state.modified,modified);assert.equal(f.calls(),1);
 const response={content:[{type:'text',text:JSON.stringify(state)}]};assert.equal(parseSavedPackageState(response,options).modified,modified);
 const a=savedPackageStateAdvice(state,{status:'SUCCEEDED',action_key:'package.save_as',operation_id:'save',output:{package_ref:{path:options.packagePath}}});
 assert.equal(a.persisted_content_verified,false);assert.equal(!!a.next_step,modified);if(modified){assert.equal(a.next_step.arguments.action_key,'package.save_checkpoint');assert.equal(a.next_step.arguments.parameters.conflict_policy,'replace');}
 if(!modified)assert.match(a.instruction,/report from the verified outcome receipts and exports/);
});
test('checkpoint existence requires a native reply for the same bound server path',async()=>{
 for(const exists of [true,false,undefined]){
  const state=await fixture({exists}).run({checkExistence:true});
  assert.equal(state.exists,exists);
  assert.equal(state.persisted_content_verified,false);
 }
 assert.equal((await fixture({exists:true,existenceRace:s=>s.path='/other.lgp'}).run({checkExistence:true})).exists,undefined);
 assert.equal((await fixture({exists:true}).run()).exists,undefined);
});
for(const [name,change] of Object.entries({foreign_path:{path:'/mimo/foreign.lgp'},foreign_account:{account:'other'},readonly:{readonly:true},running:{running:true},unknown_modified:{modified:null},path_race:{race:s=>s.path='/other.lgp'},proxy_race:{race:(_,p)=>p.Package={}},connection_race:{race:(_s,_p,_c,m)=>m.FServerConnection.Session={}},inventory_race:{race:(_s,_p,_c,m)=>m.PackageNodes.Count=2}}))test('reject '+name,async()=>{await assert.rejects(fixture(change).run());});
for(const readonly of [false,true])for(const modified of [false,true])
test('reload reads the native modified flag from its exact Open receipt, readonly='+readonly+', modified='+modified,async()=>{
 const f=fixture({readonly,modified});
 assert.equal((await f.readReload()).modified,modified);
 assert.equal(f.calls(),1);
});
test('reload rejects other Open receipts and a session replaced during the native check',async()=>{
 for(const change of [{reloadOperationId:'r'},{reloadOperationId:'unknown'},{expectedReadOnly:true}]){
  const f=fixture();
  await assert.rejects(f.readReload(change));
  assert.equal(f.calls(),0);
 }
 const changed=fixture({race:(_s,_p,_c,m)=>m.FServerConnection.Session={}});
 await assert.rejects(changed.readReload());
 assert.equal(changed.calls(),1);
});
test('wrong document/session and malformed paths rejected',async()=>{
 for(const changed of [{documentId:'foreign'},{sessionId:'foreign'}]){const f=fixture();await assert.rejects(f.run(changed));assert.equal(f.calls(),0);}
 for(const changed of [{packagePath:'/mimo/../foreign.lgp'},{packagePath:'relative.lgp'},{loginomUrl:'http://name:secret@loginom.invalid'},{loginomBuild:'unknown'}])assert.throws(()=>makeSavedPackageStateCode({...options,...changed}));
});
test('malformed replies and unmatched saves never authorize replacement',async()=>{
 const state=await fixture({modified:true}).run();
 for(const changed of [{session_id:'other'},{package_path:'/other.lgp'},{modified:null},{read_only:false},{persisted_content_verified:true}])assert.throws(()=>parseSavedPackageState({content:[{type:'text',text:JSON.stringify({...state,...changed})}]},options));
 assert.throws(()=>savedPackageStateAdvice(state,{status:'AMBIGUOUS',action_key:'package.save_as',output:{package_ref:{path:options.packagePath}}}));
 assert.throws(()=>savedPackageStateAdvice(state,{status:'SUCCEEDED',action_key:'package.save_as',output:{package_ref:{path:'/foreign.lgp'}}}));
});
