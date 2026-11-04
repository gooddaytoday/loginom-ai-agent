import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mutateGraph} from '../lib/node-target-browser.mjs';
function fixture({type='transform.col_union_data',overlay=false,duplicate=false}={}){
 const prefix='MF;TF-1',tid=prefix+';Graph;Соединение',rootTid=prefix+';ModelForm;cmpDiagram',tabTid='tab';
 let menu=false,created=false,clicks=0;
 const rect={x:10,y:10,width:100,height:20};
 const element=()=>({getBoundingClientRect:()=>rect,contains:e=>e===labelHit});
 const add=element(),data={...element(),contains:()=>false},label=element(),labelHit={},tab={classList:{contains:()=>true}},canvas={};
 const exact=new Map([[rootTid,[canvas]],[tabTid,[tab]],[tid+';Input_Add',[add]],[tid+';Input_Add;Data',[data]],[tid+';Input_Add;Data;Label',duplicate?[label,label]:[label]]]);
 const document={querySelectorAll:s=>exact.get(JSON.parse(s.slice(10,-1)))??[],elementFromPoint:()=>overlay?{}:labelHit};
 const before={dom_epoch:1,interaction_ready:true,nodes:[{ref:{node_id:'n'},type}]};
 const preparation={document,id:'doc',receipts:new Map([['r',{workflowId:'wf',phase:'verified',tab}]]),nodeTargetDomEpochs:{objects:new Map([[canvas,1]])}};
 const bg={app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:[{FGuid:'n',FCell:{}}]},FmxGraph:{view:{getState:()=>({shape:{node:{getAttribute:()=>tid}}})}}}}}})}}}}}}};
 const evaluate=(fn,args,e)=>vm.runInNewContext('('+fn.toString()+')(arg)',{arg:e??args,document,bg,innerWidth:1000,innerHeight:800,__loginomDockPreparationV1:preparation});
 const locator=s=>{const key=s.startsWith('[data-tid=')?JSON.parse(s.slice(10,-1)):null;const elements=exact.get(key)??[];return{locator,count:async()=>s.startsWith('[data-tid^=')?(created?2:1):key?.includes(';Input_Add;Data')&&!menu?0:elements.length,isVisible:async()=>true,isEnabled:async()=>true,evaluate:async fn=>evaluate(fn,null,elements[0]),click:async()=>{clicks++;if(key===tid+';Input_Add')menu=true;else created=true;}};};
 const page={evaluate,locator,waitForTimeout:async()=>{},mouse:{move:async()=>{}},keyboard:{press:async()=>{}}};
 const task={deadline:Date.now()+1000,request:{document_id:'doc',workflow_ref:{prefix,tab_tid:tabTid,workflow_id:'wf'}},effect:{id:'effect',kind:'add_input',before,parameters:{ref:{node_id:'n'},input:1}}};
 return{run:()=>mutateGraph(page,task,async()=>created?{...before,added:true}:before),clicks:()=>clicks};
}
test('positional union adds one table through its exact native label sibling',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(f.clicks(),2);
});
test('positional union refuses an overlay or duplicate label and leaves other types unchanged',async()=>{
 for(const options of [{overlay:true},{duplicate:true},{type:'transform.union_data'}]){const f=fixture(options),r=await f.run();assert.notEqual(r.status,'SUCCEEDED');assert.ok(f.clicks()<=1);}
});
