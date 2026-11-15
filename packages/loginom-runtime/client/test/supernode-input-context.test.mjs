import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {Page,Element,build,origin,clone} from './support/workspace-ui-fixture.mjs';

// accepted-r2/execution-events.jsonl:732,814: epoch
// 8e8b8eed-1f65-4ee5-85ad-38967c8c4bdb:60726. The verified NW1 path
// has eight ancestors; the input editor adds node/folder/port/Settings.
function fixture({nested=true,fault=null,graph=false}={}){
 const page=new Page(),prefix='MF;TF-1',base=prefix+';WizrdMCF',family=base+';TuneDataSourceMappingWizard;';
 page.context.innerWidth=1280;page.context.innerHeight=800;
 const names=['Сервер','Пакеты','Package1','Модуль1','Сценарий',...(nested?['Расчёт Doubled','Модуль','Сценарий']:[])];
 const nodeIndex=names.length,labels=[...names,'Калькулятор',...(!graph?['Входные порты','Входной источник данных','Настройка']:[])];
 const panel=page.add('div',prefix+';NavigationBar;NavigationPanel','',{x:182,y:35,width:1054,height:36});
 let tid=prefix+';cnrNaviMode;b.s_';
 const crumbs=labels.map((label,i)=>{
  tid+=(i?'>':'')+label.replace(/\s/g,'_');
  const hidden=i<nodeIndex-1||!graph&&i>=nodeIndex;
  const box=hidden?{x:0,y:0,width:0,height:0}:{x:190+(i-nodeIndex+1)*160,y:41,width:150,height:24};
  const c=page.add('a',tid,i===0?'':label,box,panel);if(hidden)c.style.display='none';
  const cls=i===4||nested&&i===7?'maptree-icon-workflow':nested&&i===5?'bg-vendor-icon-modelgeneric':i===nodeIndex?'bg-vendor-icon-calcdata':i===nodeIndex+1?'maptree-icon-modelinputports':i===nodeIndex+3?'maptree-icon-wizard':null;
  if(cls)page.add('span',null,'',{...box,width:hidden?0:16,height:hidden?0:16},c).attrs.class=cls;
  return c;
 });
 const path=crumbs.slice(0,nodeIndex).map(c=>({tid:c.attrs['data-tid'],label:c.textContent.trim()}));
 const binding={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:graph?'graph':'wizard',
  navigation_node:{tid:crumbs[nodeIndex].attrs['data-tid'],label:'Калькулятор'},
  ...(!graph?{input_port:{direction:'input',port:0,native_index:0,port_guid:'9dc72a3f-56bf-3bfc-84ec-f979daf4da6b',opening_operation_id:'inner-calc:n3',node_icon_class:'bg-vendor-icon-calcdata'}}:{})};
 if(!graph){
  const form=page.add('div',base,'',{x:48,y:90,width:1232,height:710});
  page.add('button',family+'btnAddMappingColumn','',undefined,form);
  page.add('div',family+'rbTable','',undefined,form).attrs.class='x-form-cb-checked';page.add('div',family+'rbLinks','',undefined,form);
  page.add('button',family+'btnAutoSyncThroughColumns','',undefined,form).attrs.class='x-btn-pressed';
  const body=page.add('div',family+'grdTargetColumns;tbl','',{x:100,y:200,width:600,height:400},form);body.attrs.id='bound-grid';
  body.clientWidth=body.scrollWidth=600;body.clientHeight=body.scrollHeight=400;body.scrollLeft=body.scrollTop=0;
  const container=page.add('div',null,'',{x:100,y:200,width:500,height:25},body);container.attrs.class='x-grid-item-container';
  const filter=page.add('div',family+'TargetFilter','',undefined,form);filter.append(new Element('input')).value='';
  const row=page.add('table',null,'',{x:100,y:200,width:500,height:25},container);Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':'0','data-boundview':'bound-grid'});
  for(const [j,key]of ['colName_','colDisplayName_','colSourceDisplayName_','colDataKind_','colUsageType_'].entries()){
   const cell=page.add('td',family+key+'RowID',j===3?'Непрерывный':j===4?'Не задано':'RowID',{x:100+j*100,y:200,width:100,height:25},row);
   if(j===1||j===2)page.add('span',null,'',cell.box,cell).attrs.class='bg-TBGDataType-dtInteger';
  }
  page.add('button',base+';btnDone','Готово',{x:1208,y:380,width:64,height:64},form);
 }
 if(fault==='path')path[5].tid+='-foreign';
 if(fault==='unbound_path')path.length=0;
 if(fault==='foreign_node')binding.node_id='foreign';
 if(fault==='opening')delete binding.input_port.opening_operation_id;
 if(fault==='duplicate')page.add('a',crumbs[nodeIndex+2].attrs['data-tid'],'Входной источник данных',crumbs[nodeIndex+2].box,panel);
 const observe=async()=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {mode:'observe',expected_build:build,expected_origin:origin,prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix,navigation_path:path}},...(!graph?{output_column_page:{offset:0,limit:8}}:{})},async()=>structuredClone(binding)));
 return {observe,page,path,crumbs,nodeIndex};
}
for(const nested of [false,true])test('input mapper keeps owned Done with '+(nested?'12 nested':'9 root')+' breadcrumbs',async()=>{
 const f=fixture({nested}),r=await f.observe();assert.equal(r.status,'SUCCEEDED');const s=r.output,c=s.wizard.input_port_context;
 assert.equal(c.status,'observed');assert.equal(c.path.length,nested?12:9);assert.equal(c.node_path.length,nested?9:6);
 assert.deepEqual(c.node_path.slice(0,-1).map(({tid,label})=>({tid,label})),f.path);
 assert.equal(s.ui.elements.find(e=>e.tid==='MF;TF-1;WizrdMCF;btnDone').allowed_actions.includes('finish_wizard'),true);
 assert.deepEqual(f.page.events,[]);
});
for(const fault of ['path','opening','duplicate','unbound_path','foreign_node'])test('nested input mapper refuses '+fault,async()=>{
 const f=fixture({fault}),s=(await f.observe()).output;
 assert.notEqual(s.wizard.input_port_context.status,'observed');assert.equal(s.ui.elements.some(e=>e.allowed_actions.includes('finish_wizard')),false);
});
for(const nested of [false,true])test((nested?'nested':'root')+' node overview returns through the prepared workflow path',async()=>{
 const f=fixture({graph:true,nested}),s=(await f.observe()).output;
 assert.equal(s.node_context.status,'observed');assert.equal(s.node_context.path.length,nested?9:6);
 assert.deepEqual(s.node_context.path.slice(0,-1).map(({tid,label})=>({tid,label})),f.path);
});
