import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCalculatorOutputMapping} from '../lib/calculator-output-source.mjs';
import {readNodeMapping} from '../lib/node-mapping-context.mjs';
import {outputMappingState} from '../lib/node-output-mapping-recovery.mjs';
import {makeSavedPackageStateCode} from '../lib/package-persistence.mjs';

// Production orchestration, mapping wrapper and strict checkpoint classifier;
// Page/cache, context reader and server dirty state are doubles, not native proof.
function fixture({visible=false,disabled=false,foreign=false,failure=false,empty=false}={}) {
 const events=[],node={document_id:'doc',workflow_id:'flow',node_id:'calculator'},root='wizard';
 const context={...node,verified:true,surface:'wizard',tid:'W',output_port:{direction:'output',port:0,native_index:0,port_guid:'port'}};
 const source={record_id:'source',field_id:'4',index:0,name:'Region',label:'Region',type:'string'};
 let links=visible,fetched=false;
 const mapping=()=>({verified:true,inventory_complete:true,source_identity_verified:fetched&&!empty,
  mapping_wizard:'DerivedDataSourceOutputSocketWizard',state_source:'cached_mapping_stores',autosync:true,
  source_fields:fetched&&!empty?[source]:[],target_fields:[{record_id:'target',field_id:'4',name:'Region',label:'Region display',excluded:false,source:fetched&&!empty?source:null}],
  settings_applied:false,package_saved:false});
 let dirtyReads=0;
 class PackageTreeNode{}
 const pack=new PackageTreeNode();Object.assign(pack,{PackageFileName:'/account/own.lgp',ReadOnly:false,Package:{},HasRunningNodes:()=>false});
 const tab={Controller:{Node:{data:{node:{ParentNode:pack}}}}};
 const tree={PackageNodes:{Count:1,Items:()=>pack},FServerConnection:{Connected:true,UserName:'account',Session:{IsPackageModified:async p=>{assert.equal(p,pack.Package);dirtyReads++;return false;}}}};
 const document={},ctx=vm.createContext({document,location:{origin:'https://own.test'},bg:{app:{Version:'7.4.2',PackageTreeNode,Application:{FInstance:{FMainForm:{FMapTree:tree,Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
 vm.runInContext("globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['r',{request:JSON.stringify({session:'session'})}]])}",ctx);
 const page={evaluate:async(fn,arg)=>fn.name==='readMappingBrowser'?structuredClone(mapping()):vm.runInContext('('+fn.toString()+')',ctx)(arg)};
 const savedState=()=>vm.runInThisContext('('+makeSavedPackageStateCode({sessionId:'session',documentId:'doc',account:'account',packagePath:'/account/own.lgp',loginomUrl:'https://own.test',loginomBuild:'7.4.2'})+')')(page);
 const state=()=>({wizard:{status:'observed',stage:'output_mapping',root_ref:root,root_tid:'W'},prepared_node_context:{...context,...(foreign&&links?{node_id:'foreign'}:{})},
  ui:{elements:[{tid:'W;DerivedDataSourceOutputSocketWizard;rbLinks;DisplayEl',ref:'links',check_state:{checked:links},allowed_actions:['click']},
   {tid:'W;DerivedDataSourceOutputSocketWizard;btnGetSourceColumns',ref:'fetch',visible:links,enabled:!disabled,allowed_actions:['click']}]}});
 const channel={openOutputPort:async p=>{assert.equal(p,0);events.push('open')},
  observe:async o=>{const s=state();if(o.readMappings){events.push('reader');s.node_mapping=await readNodeMapping(page,{workflow_ref:{prefix:'MF;TF'}},async()=>context);}
   assert.ok(o.ready(s),o.condition);return s;},
  perform:async o=>{const s=state();assert.ok(o.ready(s),'same owner before click');const a=o.resolve(s);assert.equal(a.verb,'click');events.push(a.ref);
   if(a.ref==='links')links=true;
   else {assert.equal(a.ref,'fetch');if(failure)throw Error('unknown fetch');fetched=true;}}};
 return {events,node,channel,savedState,dirtyReads:()=>dirtyReads,mapping};
}
for(const visible of [false,true])test('one fetch precedes production reader and strict checkpoint; no persisted claim, visible='+visible,async()=>{
 const f=fixture({visible});assert.equal(f.mapping().source_identity_verified,false);
 const before=await f.savedState();await f.channel.openOutputPort(0);const s=await readCalculatorOutputMapping(f.channel),m=s.node_mapping;
 assert.equal(m.verified,true);assert.equal(m.source_identity_verified,true);assert.equal(m.source_fields.length,1);
 assert.equal(m.target_fields[0].source.name,'Region');assert.equal(m.target_fields[0].excluded,false);
 assert.equal(outputMappingState(m,f.node).source_fields[0].name,'Region');
 assert.deepEqual(f.events,visible?['open','fetch','reader']:['open','links','fetch','reader']);
 const after=await f.savedState();assert.equal(f.dirtyReads(),2);
 assert.equal(before.modified,false);assert.equal(after.modified,false);assert.equal(after.persisted_content_verified,false);
 assert.equal(m.settings_applied,false);assert.equal(m.package_saved,false);assert.equal(m.persisted_content_verified,undefined);
});
for(const fault of ['disabled','foreign','failure'])test('source retrieval refuses '+fault+' without another gesture or mapping read',async()=>{
 const f=fixture({[fault]:true});await assert.rejects(readCalculatorOutputMapping(f.channel));
 assert.ok(!f.events.includes('reader'));assert.ok(f.events.filter(x=>x==='fetch').length<=1);
 const after=await f.savedState();assert.equal(after.modified,false);assert.equal(after.persisted_content_verified,false);
});
test('successful fetch with an empty source cannot pass unchanged outputMappingState',async()=>{
 const f=fixture({empty:true});const s=await readCalculatorOutputMapping(f.channel);
 assert.equal(s.node_mapping.source_identity_verified,false);
 assert.throws(()=>outputMappingState(s.node_mapping,f.node),/complete owned output mapping required/);
});
