import test,{mock} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {performance} from 'node:perf_hooks';import {pathToFileURL} from 'node:url';

const root=process.env.AMOUNT_RUNTIME??new URL('..',import.meta.url).pathname,lib=p=>pathToFileURL(root+'/client/lib/'+p).href;
const nodeContext=await import(lib('node-context.mjs'));
mock.module(lib('node-context.mjs'),{namedExports:{...nodeContext,readPreparedNodeContext:async page=>page.nodeContext}});
const procedure=await import(lib('node-procedure.mjs')),closing=await import(lib('node-wizard-close.mjs'));
let current;
// Only native node-context/procedure/cancellation drivers are labelled doubles.
// The actual harness, serializer, observer, collector and raw cache reader run.

mock.module(lib('node-procedure.mjs'),{namedExports:{...procedure,createNodeProcedure:()=>({observe:async()=>current.observe()})}});
mock.module(lib('node-wizard-close.mjs'),{namedExports:{...closing,closePreparedWizard:async()=>{
 current.events.push('cancel');if(current.scenario==='cancel-lost')throw 0;
 return {verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,execution_started:false,node_context:current.page.nodeContext};
}}});
const {NavigationPage}=await import('../client/test/fixtures/navigation/ui-page.mjs');
const {captureAmount}=await import(pathToFileURL(root+'/src/acceptance/amount-import-type-v1.mjs'));
const {makeWorkspaceUiCode}=await import(lib('workspace-ui.mjs'));
function fixture(scenario){
 const p=new NavigationPage();p.app.Version='7.4.2';p.context.performance=performance;p.context.innerWidth=1000;p.context.innerHeight=800;
 p.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')',p.context)(arg);
 const events=[],prefix='MF;TF-1',root=p.add('div',prefix+';WizrdMCF'),base=prefix+';WizrdMCF;ImportTextFileParamsWizard;';
 p.add('div',base+'edtValueNull','',undefined,root);
 const panel=p.add('div',prefix+';NavigationBar;NavPanel');let tid=prefix+';cnrNaviMode;b.s_Workflow';
 const crumbs=[];for(const [label,icon] of [['Workflow','maptree-icon-workflow'],['ImportAmount','bg-vendor-icon-importtextfile'],['Настройка','maptree-icon-wizard']]){
 if(crumbs.length)tid+='>'+label;const e=p.add('button',tid,label,undefined,panel);p.add('span',null,'',undefined,e).attrs.class=icon;crumbs.push({tid,label});}
 const grid=p.add('div',base+'ColumnDefsTuning;grdSettings;grd-1', '',undefined,root);
 const table=p.add('div',base+'ColumnDefsTuning;grdSettings;grd-1;tbl','',undefined,grid);table.attrs.id='native-view';table.id='native-view';
 const head=base+'ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;1';
 p.add('div',head,'Amount',undefined,grid);
 for(const [i,value]of ['Amount','Amount','Строковый','Непрерывный',''].entries()){
 const cell=p.add('td',head+'_'+i,value,undefined,grid);
 if(i===2)cell.attrs.class='x-grid-cell-selected';
 if(i===4)p.add('img',null,'',undefined,cell).attrs.class='x-grid-checkcolumn x-grid-checkcolumn-checked';}
 const editor=p.add('div',base+'ColumnDefsTuning;grdSettings;grd-1;tbl;celleditor;cbx','',undefined,table);
 const input=p.add('input',null,'',undefined,editor);input.value='Вещественный';input.attrs.type='text';
 const items=Array.from({length:5},(_,i)=>({internalId:'property-'+i})),source={items:[...items]},data={items,getSource:()=>source};
 const store={loading:false,currentPage:1,remoteFilter:false,remoteSort:false,isBufferedStore:false,getData:()=>data,
 getProxy:()=>({pendingOperations:{}}),getCount:()=>items.length,getTotalCount:()=>items.length};
 const view={el:{dom:table},getStore:()=>store};p.context.Ext={getCmp:id=>id==='native-view'?view:undefined};
 class NativeNode{}const node=new NativeNode();node.FGuid='own-node';node.FModelNode={};
 p.app.ModelNodeTreeNode=NativeNode;p.app.Application={FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'test-2'}},
 Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node}}}})}}}}};
 p.context.__loginomDockPreparationV1={document:p.document,id:'own-doc',receipts:new Map([['r',{phase:'verified',tab:p.tab,packageNode:{},workflowId:'own-workflow',crumbs:[crumbs[0]]}]])};
 const workflow_ref={tab_tid:p.tab.attrs['data-tid'],prefix,workflow_id:'own-workflow',navigation_path:[crumbs[0]]};
 const prepared={document_id:'own-doc',workflow_ref,node:{document_id:'own-doc',workflow_id:'own-workflow',node_id:'own-node'}};
 p.nodeContext={verified:true,document_id:'own-doc',workflow_id:'own-workflow',node_id:'own-node',surface:'wizard',tid:root.attrs['data-tid']};
 const execute=code=>vm.runInContext('('+code+')',p.context)(p);
 const observe=async()=>{const r=await execute(makeWorkspaceUiCode({mode:'observe',expected_build:'7.4.2',expected_origin:'https://loginom.test',prepared_node_context:prepared}));assert.equal(r.status,'SUCCEEDED',JSON.stringify(r.error));return r.output;};
 const browser={async callTool({arguments:{code}}){events.push('browser');
 if(scenario==='transport-zero'&&code.includes('const known=new Map'))throw 0;
 if(scenario==='transport-undefined'&&code.includes('const known=new Map'))throw undefined;
 const r=await execute(code);return {content:[{type:'text',text:JSON.stringify(r)}]};}};
 if(scenario==='loading')store.loading=true;if(scenario==='incomplete')source.items.pop();if(scenario==='wrong-editor')input.value='unrecognized';
 if(scenario==='foreign-node')p.nodeContext.node_id='foreign';if(scenario==='foreign-account')p.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName='foreign';
 const binding={revision:1,harness:'amount-import-type-v1',owner:'owner',run:'run',lease:'owner:run',chat:'chat',session:'own-session',account:'test-2',admission:'admission',generation:7,expires:Date.now()+60000,packagePath:'/test-2/result.lgp'};
 const identity={session_id:'own-session',document_id:'own-doc',account:'test-2',package_path:binding.packagePath,tab_tid:workflow_ref.tab_tid,loginom_build:'7.4.2'};
 if(scenario==='foreign-lease')binding.lease='foreign';if(scenario==='expired')binding.expires=0;
 current={scenario,events,page:p,observe};return{events,binding,identity,browser,record:async r=>{events.push(r.event);if(scenario==='persistence')throw Error('fixture EISDIR');}};
}
for(const scenario of ['success','loading','incomplete','wrong-editor','foreign-node','foreign-account','foreign-lease','expired','transport-zero','transport-undefined','cancel-lost','persistence'])test('actual Amount harness/observer/collector composition (Page/Ext drivers): '+scenario,async()=>{
 const f=fixture(scenario);let result,caught,failed=false;try{result=await captureAmount(f);}catch(e){caught=e;failed=true;}
 if(scenario==='success'){assert.equal(failed,false,String(caught));assert.equal(result.cancel_verified,true);assert.equal(result.collection.observer_sha256.length,64);assert.equal(result.surface.cache_complete,true);assert.equal(result.native_verified,false);assert.deepEqual(f.events.filter(x=>x!=='browser'),['amount_capture','cancel','amount_capture_cancel']);}
 else {assert.equal(failed,true);assert.equal(f.events.includes('amount_capture_cancel'),false);if(scenario==='transport-zero'||scenario==='cancel-lost')assert.equal(caught,0);if(scenario==='transport-undefined')assert.equal(caught,undefined);if(!['cancel-lost'].includes(scenario))assert.equal(f.events.includes('cancel'),false);}
});
