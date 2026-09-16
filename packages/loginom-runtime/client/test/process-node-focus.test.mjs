import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {captureProcessNodeFocus,restoreProcessNodeFocus} from '../lib/process-node-focus.mjs';

function fixture(){
 class ModelForm{};class ModelNodeTreeNode{};class WorkFlowTreeNode{};class PackageTreeNode{};
 const pkg=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:pkg}),data={},cell={};
 const tree=Object.assign(new ModelNodeTreeNode(),{FGuid:'node',FModelNode:data,ParentNode:workflow});
 const owner={FGuid:'node',data,FCell:cell};let activeTab=true;
 const tab={classList:{contains:()=>activeTab},checkVisibility:()=>true,getBoundingClientRect:()=>({x:10,y:10,width:100,height:20}),contains:()=>false};
 const model=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[owner]},FmxGraph:{getSelectionCells:()=>[cell]}}});
 const card={tab:{el:{dom:tab}},Controller:{FController:model,Node:{data:{node:tree}}}};
 const files={Controller:{FController:{constructor:{name:'FileStorageForm'}}}};
 let active=card;
 const grids=[0,1].map(i=>({id:'grid'+i,querySelectorAll:()=>[rows[i]],contains:()=>true}));
 const rows=grids.map(g=>({getAttribute:k=>k==='data-recordid'?'record':k==='data-boundview'?g.id:null}));
 const processCell={closest:()=>rows[0]};
 const root={isModel:true,internalId:'root',data:{loaded:true},childNodes:[]};
 const parent={isModel:true,internalId:'group',data:{id:'1'},parentNode:root,childNodes:[]};
 const record={isModel:true,internalId:'record',data:{id:'1.1',ModelNode:data},parentNode:parent,childNodes:[]};root.childNodes=[parent];parent.childNodes=[record];
 const store={$className:'Ext.data.TreeStore',isLoading:()=>false,getRoot:()=>root};
 const document={querySelectorAll:s=>s.includes('role=')?[]:s.includes('"tab"')?[tab]:s.includes('treepanel;tree')?[grids[0]]:s.includes('grd;tbl')?[grids[1]]:s.includes('colProcess_')?[processCell]:[],elementFromPoint:()=>tab};
 const receipt={phase:'verified',workflowId:'workflow',tab,packageNode:pkg,nodeTargetWorkflowNode:workflow};
 const workspace={items:{items:[card,files]},getActiveTab:()=>active};
 const app={Version:'7.4.2',ModelForm,ModelNodeTreeNode,WorkFlowTreeNode,PackageTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}};
 const context=vm.createContext({document,location:{origin:'http://example'},bg:{app},Ext:{getCmp:id=>({el:{dom:grids.find(g=>g.id===id)},getStore:()=>store})},innerWidth:1000,innerHeight:800});
 const prep={document,id:'doc',receipts:new Map([['prepare',receipt]])};context.__loginomDockPreparationV1=prep;
 const epoch={epoch:'epoch',revision:1,observer:{takeRecords:()=>[]},captureMutations:()=>{}};
 context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=epoch;
 const clicks=[];let reads=0,hook=()=>{};
 const execute=(fn,args)=>vm.runInContext('('+fn.toString()+')',context)(args);
 const page={evaluateHandle:async(fn,args)=>({value:execute(fn,args),dispose:async()=>{}}),evaluate:async(fn,handle)=>{hook(++reads);return execute(fn,handle?.value??handle);},mouse:{click:async(...args)=>{clicks.push(args);active=card;activeTab=true;}}};
 const task={binding:{document_id:'doc',workflow_ref:{workflow_id:'workflow',tab_tid:'tab'},node:{node_id:'node'}},process:{record_id:'record',path:'Root>Group>Node',grid_ids:['grid0','grid1']},origin:'http://example',build:'7.4.2'};
 return {page,task,clicks,context,document,app,workspace,card,files,tab,tree,model,owner,root,record,parent,store,receipt,epoch,prep,grids,
  show:()=>{activeTab=false;active=files;},setHook:f=>{hook=f;}};
}

test('restores the exact selected graph after Show Node leaves Files active',async()=>{
 const f=fixture(),ticket=await captureProcessNodeFocus(f.page,f.task);assert.ok(ticket.value);f.show();
 const r=await restoreProcessNodeFocus(f.page,ticket);assert.equal(r.restored,true);assert.equal(r.proof.process_id,'1.1');assert.equal(r.proof.root_id,'root');
 assert.deepEqual(f.clicks,[[60,20,{clickCount:1,button:'left'}]]);
 assert.equal((await restoreProcessNodeFocus(f.page,ticket)).restored,false);assert.equal(f.clicks.length,1);
});
const faults={
 foreign_node:f=>{f.tree.FGuid='other';},
 replaced_same_id_record:f=>{f.parent.childNodes=[{...f.record}];},
 old_execution_same_node:f=>{f.record.data.id='2.1';},
 replaced_record_data:f=>{f.record.data={...f.record.data};},
 foreign_process_owner:f=>{f.record.data.ModelNode={};},
 replaced_root:f=>{f.store.getRoot=()=>({...f.root});},
 changed_root_id:f=>{f.root.internalId='other';},
 reparented_record:f=>{f.record.parentNode={};},
 foreign_package:f=>{f.receipt.packageNode={};},
 foreign_workflow:f=>{f.receipt.nodeTargetWorkflowNode={};},
 replaced_receipt:f=>{f.prep.receipts=new Map([['new',{...f.receipt}]]);},
 replaced_preparation:f=>{f.context.__loginomDockPreparationV1={...f.prep};},
 foreign_graph:f=>{f.files.Controller.FController=new f.app.ModelForm();},
 unselected_graph:f=>{f.model.FDiagram.FmxGraph.getSelectionCells=()=>[];},
 loading_store:f=>{f.store.isLoading=()=>true;},
 changed_grid:f=>{f.grids[0].id='other';},
 covered_tab:f=>{f.document.elementFromPoint=()=>({});},
 hidden_tab:f=>{f.tab.checkVisibility=()=>false;},
 modal:f=>{const original=f.document.querySelectorAll;f.document.querySelectorAll=s=>s.includes('role=')?[{checkVisibility:()=>true}]:original(s);},
 changed_second_read:f=>{f.setHook(n=>{if(n===2)f.epoch.revision++;});},
 replaced_files_between_reads:f=>{f.setHook(n=>{if(n===2)f.workspace.getActiveTab=()=>({...f.files});});},
 tree_cycle:f=>{f.record.childNodes=[f.parent];},
};
for(const [name,mutate] of Object.entries(faults))test('refuses '+name+' without a focus click',async()=>{
 const f=fixture(),ticket=await captureProcessNodeFocus(f.page,f.task);f.show();mutate(f);
 assert.equal((await restoreProcessNodeFocus(f.page,ticket)).restored,false);assert.deepEqual(f.clicks,[]);
});
test('cannot capture a different process owner or an already inactive graph',async()=>{
 for(const mutate of [f=>{f.record.data.ModelNode={};},f=>f.show()]){const f=fixture();mutate(f);assert.equal((await captureProcessNodeFocus(f.page,f.task)).value,null);}
});
test('lost click response remains an error and does not repeat the click',async()=>{
 const f=fixture(),ticket=await captureProcessNodeFocus(f.page,f.task);f.show();f.page.mouse.click=async(...args)=>{f.clicks.push(args);throw Error('lost response');};
 await assert.rejects(restoreProcessNodeFocus(f.page,ticket),/lost response/);assert.equal(f.clicks.length,1);
});
