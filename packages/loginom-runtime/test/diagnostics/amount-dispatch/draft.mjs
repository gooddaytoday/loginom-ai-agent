import assert from 'node:assert/strict';import vm from 'node:vm';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
const root=process.argv[2];const{readAmountDraftPage}=await import(pathToFileURL(resolve(root,'src/amount-draft-page.mjs')));
const o={owner:'owner',origin:'https://labelled.invalid',account:'own',document:'doc',operation:'prepare',session:'sdk',workflow:'workflow',tab:'tab'};
const rows=[];
for(const mode of ['canonical','dirty-new','foreign-owner','stored-path','foreign-operation','foreign-workflow','count','running','unknown-dirty','root-drift','proxy-drift','running-false-error','dirty-undefined-error']){
 class PackageTreeNode{};const pack=new PackageTreeNode();Object.assign(pack,{Package:{},ReadOnly:false,PackageFileName:null});
 const tab={isConnected:true,classList:{contains:()=>true},getAttribute:()=>o.tab};const card={Controller:{Node:{data:{node:pack}}}};
 const session={};const connection={Connected:true,UserName:'own',Session:session};const inventory={Count:1,Items:()=>pack},map={FPackagesParentNode:{},PackageNodes:inventory,FServerConnection:connection};
 const main={FMapTree:map,Items:{Workspace:{getActiveTab:()=>card}}};const bg={app:{Version:'7.4.2',PackageTreeNode,Application:{FInstance:{FMainForm:main}}}};
 const doc={},own={document:doc,id:'owner',account:'own'};
 pack.HasRunningNodes=async()=>{if(mode==='root-drift')map.FPackagesParentNode={};if(mode==='running-false-error')throw false;return mode==='running'};
 session.IsPackageModified=async()=>{if(mode==='proxy-drift')pack.Package={};if(mode==='dirty-undefined-error')throw undefined;return mode==='unknown-dirty'?undefined:mode==='dirty-new'};
 const ctx=vm.createContext({document:doc,location:{origin:o.origin},bg,__loginomStartupV1:own,tab,pack});
 vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['prepare',{request:JSON.stringify({session:'sdk',intent:'new_draft',packagePath:null}),phase:'verified',workflowId:'workflow',packageNode:pack,tab}]])}`,ctx);
 if(mode==='foreign-owner')own.id='other';if(mode==='stored-path')pack.PackageFileName='/own/history.lgp';if(mode==='count')inventory.Count=2;
 if(mode==='foreign-operation')vm.runInContext("__loginomDockPreparationV1.receipts.get('prepare').request=JSON.stringify({session:'sdk',intent:'open_package',packagePath:'/own/history.lgp'})",ctx);
 if(mode==='foreign-workflow')vm.runInContext("__loginomDockPreparationV1.receipts.get('prepare').workflowId='other'",ctx);
 let value,present=false,reason;try{value=await vm.runInContext('('+readAmountDraftPage.toString()+')',ctx)(o)}catch(e){present=true;reason=e}
 if(['canonical','dirty-new'].includes(mode)){assert(!present);assert.equal(value.original_draft_verified,true);assert.equal(value.mutation_authorized,false)}else{assert(present);if(mode==='running-false-error')assert.equal(reason,false);if(mode==='dirty-undefined-error')assert.equal(reason,undefined)}rows.push({mode,pass:true});
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Real serialized draft reader; Page/DOM/native/session are named doubles, not native proof.'}));
