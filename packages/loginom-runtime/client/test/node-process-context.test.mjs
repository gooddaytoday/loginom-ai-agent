import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readNodeProcesses} from '../lib/node-process-context.mjs';

function fixture() {
  const base='ConsoleForm;ProgressForm;',elements=new Map();
  const el=(tid,attrs={})=>{
    const e={attrs:{'data-tid':tid,...attrs},children:[],hidden:false,textContent:'',
      getAttribute(k){return this.attrs[k]??null},
      getBoundingClientRect(){return {width:this.hidden?0:100,height:this.hidden?0:20}},
      querySelectorAll(selector){return this.children.filter(c=>selector==='table.x-grid-item'?c.tag==='table'
        :selector==='td[data-tid]'?c.tag==='td':selector==='.x-tree-expander'?c.tag==='expander':false)}};
    e.classList={contains:c=>(e.attrs.class??'').split(' ').includes(c)};elements.set(tid,e);return e;
  };
  const left=el(base+'trpProgress;treepanel;tree'),right=el(base+'trpProgress;grd;tbl');left.id='left';right.id='right';
  const menu=el('mnContextMenu;mniShowCompletedProcesses',{class:'x-menu-item-checked'});
  const model=(id,record)=>({isModel:true,internalId:record,childNodes:[],data:{id,loaded:true,loading:false,expanded:true,Status:3,ErrorDetails:'',text:'Node'}});
  const root=model('root',100),group=model('1',101),child=model('1.1',102);root.childNodes=[group];group.childNodes=[child];
  const store={$className:'Ext.data.TreeStore',getRoot:()=>root,isLoading:()=>false};
  const views={left:{el:{dom:left},getStore:()=>store},right:{el:{dom:right},getStore:()=>store}};
  const rows=[];
  for(const m of [group,child]) {
    const row=el('left-'+m.data.id,{'data-recordid':String(m.internalId),'data-boundview':'left',class:m===child?'x-grid-item-selected':''});row.tag='table';
    const r=el('right-'+m.data.id,{'data-recordid':String(m.internalId),'data-boundview':'right'});r.tag='table';
    const id=el(base+'colId_'+m.data.id);id.tag='td';id.textContent=m.data.id;
    const process=el(base+'colProcess_'+m.data.id);process.tag='td';
    const expander=el(base+'colProcess_'+m.data.id+';TreeExpander');expander.tag='expander';process.children=[expander];
    const progress=el(base+'colProgress_'+m.data.id,{class:'bg-progress-ptpsCompleted'});progress.tag='td';
    row.children=[id,process];r.children=[progress];left.children.push(row);right.children.push(r);rows.push({row,r,id,process,progress});
  }
  const masks=[];
  const context=vm.createContext({document:{querySelectorAll:q=>q==='.x-mask-msg,.bg-mask-message'?masks
    :elements.has(JSON.parse(q.slice(10,-1)))?[elements.get(JSON.parse(q.slice(10,-1)))]:[]},
    Ext:{getCmp:id=>views[id]},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const nodes=[],workspace={getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:nodes}}}}})};
  context.bg={app:{Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
  const page={evaluate:(fn,arg)=>{context.evaluateArg=arg;return structuredClone(vm.runInContext('('+fn.toString()+')(evaluateArg)',context));}};
  const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'graph'};
  return {nodes,page,node,readNode:async()=>({...node}),left,right,menu,root,group,child,store,views,rows,masks,el};
}
test('native process inventory binds both split grids and cached tree records',async()=>{
 const f=fixture(),r=await readNodeProcesses(f.page,{},f.readNode);
 assert.equal(r.verified,true);assert.equal(r.processes[1].process_id,'1.1');assert.equal(r.processes[1].selected,true);
 assert.equal(r.processes[0].expanded,true);assert.equal(r.execution_freshness_verified,false);
 assert.equal(r.processes.every(p=>p.rendered),true);
});
test('empty loaded history is a valid pre-launch baseline',async()=>{
 const f=fixture();f.root.childNodes=[];f.left.children=[];f.right.children=[];
 const r=await readNodeProcesses(f.page,{},f.readNode);assert.equal(r.verified,true);assert.deepEqual(r.processes,[]);
});
for(const [name,mutate] of Object.entries({
 hidden_console:f=>f.left.hidden=true,loading_store:f=>f.store.isLoading=()=>true,
 foreign_grid:f=>f.views.right.getStore=()=>({}),foreign_dom:f=>f.views.left.el.dom={},
 unloaded_root:f=>f.root.data.loaded=false,missing_root_identity:f=>delete f.root.internalId,
 ambiguous_filter:f=>f.menu.attrs.class='x-menu-item-checked x-menu-item-unchecked',
 unloaded_process:f=>f.child.data.loading=true,duplicate_record:f=>f.child.internalId=f.group.internalId,
 duplicate_dom_record:f=>f.left.children.push(f.left.children[0]),
 foreign_parent:f=>f.child.data.id='2.1',cycle:f=>f.child.childNodes=[f.group],
 visible_mask:f=>f.masks.push(f.el('mask')),
}))test('process read refuses '+name,async()=>{const f=fixture();mutate(f);assert.equal((await readNodeProcesses(f.page,{},f.readNode)).verified,false);});
test('a completed cached record without its matching native progress cell is not rendered completion',async()=>{
 const f=fixture();f.rows[1].progress.attrs.class='bg-progress-ptpsActive';
 const r=await readNodeProcesses(f.page,{},f.readNode);assert.equal(r.verified,true);assert.equal(r.processes[1].rendered,false);
});
test('offscreen cached records remain inventory, not actionable process evidence',async()=>{
 const f=fixture();f.left.children.pop();f.right.children.pop();
 const r=await readNodeProcesses(f.page,{},f.readNode);assert.equal(r.processes.length,2);assert.equal(r.processes[1].rendered,false);
});
test('node identity drift during a process read invalidates all evidence',async()=>{
 const f=fixture();let calls=0;const r=await readNodeProcesses(f.page,{},async()=>({...f.node,node_id:++calls===1?'node':'other'}));
 assert.equal(r.reason,'node_context_changed');
});

test('process status distinguishes running, cancellation and errors without guessed numeric enum values',async()=>{
 const states={ptpsNotStarted:'not_started',ptpsProcessing:'running',ptpsNotResponding:'not_responding',
  ptpsCompleted:'completed',ptpsExplicitCanceled:'cancelled',ptpsError:'failed',ptpsParentCanceled:'parent_cancelled',ptpsParentError:'parent_failed'};
 for(const [key,state] of Object.entries(states)) {
  const f=fixture(),terminal=['completed','cancelled','failed','parent_cancelled','parent_failed'].includes(state);
  Object.assign(f.child.data,{Status:state==='completed'?3:42,ProgressBarCls:'bg-progress-'+key+(state==='running'?' bg-progress-progresscolumn-animate':''),CanCancelProcess:!terminal&&state!=='not_started'});
  const r=await readNodeProcesses(f.page,{},f.readNode),actual=r.processes[1].progress_state;
  assert.deepEqual(actual,{verified:true,state,terminal,can_cancel:f.child.data.CanCancelProcess,source:'native_progress_record'});
 }
});
test('unrecognised, contradictory or incomplete process status never grants cancellation',async()=>{
 for(const mutate of [d=>delete d.CanCancelProcess,d=>d.ProgressBarCls='bg-progress-ptpsFuture',
  d=>d.ProgressBarCls+=' bg-progress-ptpsProcessing',d=>d.Status=42,d=>d.CanCancelProcess=true]) {
  const f=fixture();Object.assign(f.child.data,{Status:3,ProgressBarCls:'bg-progress-ptpsCompleted',CanCancelProcess:false});mutate(f.child.data);
  const r=await readNodeProcesses(f.page,{},f.readNode);assert.equal(r.verified,true);assert.deepEqual(r.processes[1].progress_state,{verified:false});
 }
});

 test('process ownership uses the unique cached model identity without dereferencing proxies',async()=>{
 const f=fixture(),model=new Proxy({},{get(){throw new Error('proxy must not be dereferenced')}});
 f.nodes.push({FGuid:'node',data:model});f.child.data.ModelNode=model;
 const r=await readNodeProcesses(f.page,{},f.readNode);
 assert.deepEqual(r.processes[1].owner,{verified:true,node_id:'node',source:'native_process_model_identity'});
 assert.equal(r.processes[0].owner,undefined);
 });
 for(const [name,mutate] of Object.entries({
 lookalike:f=>f.child.data.ModelNode={},
 foreign:f=>f.nodes[0].FGuid='foreign',
 duplicate_guid:f=>f.nodes.push({FGuid:'node',data:{}}),
 shared_model:f=>f.nodes.push({FGuid:'other',data:f.nodes[0].data}),
 wizard:f=>f.node.surface='wizard',
 }))test('process ownership is withheld for '+name,async()=>{
 const f=fixture(),model={};f.nodes.push({FGuid:'node',data:model});f.child.data.ModelNode=model;mutate(f);
 const r=await readNodeProcesses(f.page,{},f.readNode);assert.equal(r.verified,true);
 assert.equal(r.processes[1].owner,undefined);
 });
