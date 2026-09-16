import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readMappingBrowser,readNodeMapping} from '../lib/node-mapping-context.mjs';
function fixture({grouped=false,input=false,socket=false}={}) {
 grouped ||= socket;
 const base='MF;TF;WizrdMCF;'+(input?'TuneDataSourceMappingWizard':socket?'DataSetOutputSocketWizard':grouped?'DerivedDataSourceOutputSocketWizard':'ColumnsMappingEngineOutputPortWizard')+';',all=[],views={};
 const el=(tid,text='',parent=null)=>{const e={tid,textContent:text,parent,id:'e'+all.length,attrs:{},checkVisibility:()=>true,
  getAttribute(k){return k==='data-tid'?this.tid:this.attrs[k]??null;},contains(other){return other===this||!!other.parent&&this.contains(other.parent);},
  querySelectorAll(q){return all.filter(x=>x!==this&&this.contains(x)&&q==='table.x-grid-item'&&x.row);},classList:{contains:()=>false}};all.push(e);return e;};
 const root=el(base.slice(0,-1)),grids=['grdSourceColumns;tbl','grdTargetColumns;tbl'].map(s=>el(base+s,'',root));
 const source=['A','B'].map((name,i)=>({isModel:true,internalId:'s'+i,data:{ID:i,Index:i,Name:name,DisplayName:'Same',DataType:5,Broken:false,Required:false}}));
 const target=source.map((s,i)=>{const t={isModel:true,internalId:'t'+i,data:{...s.data,Name:'Out'+i,DataKind:2,ConnectedRecord:s,SourceDisplayName:'Same',SourceDataType:5}};s.data.ConnectedRecord=t;return t;});
 if(input)for(const t of target)Object.assign(t.data,{UsageType:3,DefaultUsageType:0,OriginType:0,ReverseBroken:false,IsDerived:false});
 if(grouped){for(const s of source)s.data.GroupField='';for(const t of target)Object.assign(t.data,{GroupField:'',IsDerived:false});}
 const stores=[source,target].map(items=>({$className:'Ext.data.Store',isLoading:()=>false,getCount:()=>items.length,getTotalCount:()=>items.length,getData:()=>({items,getSource:()=>({items})})}));
 grids.forEach((g,i)=>{views[g.id]={el:{dom:g},getStore:()=>stores[i]};});
 const rows=target.map((t,i)=>{const r=el(null,'',grids[1]);r.row=true;r.attrs={'data-recordindex':String(i),'data-recordid':t.internalId,'data-boundview':grids[1].id};
  for(const [key,value] of [['colName_',t.data.Name],['colDisplayName_','Same'],['colSourceDisplayName_','Same']])el(base+key+t.data.Name,value,r);return r;});
 const button=el(base+'btnAutoSyncThroughColumns','',root);views[button.id]={el:{dom:button},pressed:false};
 const context={document:{querySelectorAll:q=>q==='[data-tid]'?all:all.filter(e=>e.mask)},Ext:{getCmp:id=>views[id]}};
 return {source,target,stores,grids,views,rows,button,root,all,context,el,base,
  read:()=>vm.runInNewContext('('+readMappingBrowser.toString()+')("MF;TF")',context)};
}
test('cached mapping ties duplicate labels to distinct source identities',()=>{
 const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.inventory_complete,true);
 assert.deepEqual(Array.from(r.target_fields,t=>t.source.name),['A','B']);assert.equal(r.settings_applied,false);
});
test('cached mapping refuses foreign connections, filtered stores and inconsistent rendered rows',()=>{
 const changes=[f=>{f.target[0].data.ConnectedRecord={...f.source[0]};},f=>{f.source[0].data.ConnectedRecord=f.target[1];},
  f=>{f.target[1].data.ConnectedRecord=f.source[0];},f=>{f.stores[0].getTotalCount=()=>3;},
  f=>{f.stores[0].getData=()=>({items:f.source,getSource:()=>({items:f.source.map(r=>({...r}))})});},
  f=>{f.stores[0].isLoading=()=>true;},f=>{f.source[0].data.Broken=true;},
  f=>{f.source[1].data.Name='A';},f=>{f.source[1].data.ID=0;},f=>{f.target[0].data.SourceDataType=4;},f=>{f.target[0].data.DataKind=99;},
  f=>{f.rows[0].attrs['data-recordid']='foreign';},f=>{f.rows[0].attrs['data-boundview']='foreign';},
  f=>{f.rows[1].attrs['data-recordindex']='0';},f=>{f.views[f.grids[0].id].el.dom=f.grids[1];},
  f=>{f.all.find(e=>e.tid?.endsWith('colName_Out0')).textContent='Wrong';},f=>{f.views[f.button.id].pressed=true;}];
 for(const [i,change] of changes.entries()){const f=fixture();change(f);assert.equal(f.read().verified,false,String(i));}
});
test('node mapping brackets its read with the same prepared wizard identity',async()=>{
 const f=fixture(),context={verified:true,surface:'wizard',node_id:'node'},page={evaluate:async()=>f.read()},binding={workflow_ref:{prefix:'MF;TF'}};
 assert.equal((await readNodeMapping(page,binding,async()=>context)).verified,true);
 let reads=0;assert.equal((await readNodeMapping(page,binding,async()=>({...context,node_id:String(++reads)}))).reason,'mapping_node_changed');
});

 test('native mapping refuses a plain reconnect mask even while cached grids remain',()=>{
 const f=fixture();f.all.push({mask:true,getAttribute:()=>null,checkVisibility:()=>true});assert.equal(f.read().reason,'mapping_mask');
 });

function excludedFixture() {
 const f=fixture({grouped:true}),t=f.target[1],source=f.source[1];
 source.data.ConnectedRecord=null;
 Object.assign(t.data,{Index:0,Name:source.data.Name,GroupField:'Исключенные',ConnectedRecord:null,
   SourceDisplayName:null,SourceDataType:null,DataKind:0});
 for(const c of f.all.filter(e=>e.parent===f.rows[1])) {
   c.tid=c.tid.replace('Out1',source.data.Name);
   if(c.tid.includes(';colName_'))c.textContent=source.data.Name;
   if(c.tid.includes(';colSourceDisplayName_'))c.textContent='';
 }
 return f;
}

test('separate output wizard distinguishes excluded source identity from an active connection',()=>{
 const f=excludedFixture(),r=f.read();assert.equal(r.verified,true);
 assert.equal(r.mapping_wizard,'DerivedDataSourceOutputSocketWizard');
 assert.equal(r.target_fields[1].excluded,true);assert.equal(r.target_fields[1].source,null);
 assert.equal(r.target_fields[1].exclusion_source.record_id,'s1');
 assert.equal(r.target_fields[1].index,1);assert.equal(r.target_fields[1].group_index,0);
 assert.equal(r.target_fields[0].excluded,false);assert.equal(r.target_fields[0].source.record_id,'s0');
 assert.equal(r.target_fields[0].inherited,false);
});
test('unloaded derived sources retain excluded inventory but cannot prove source identity',()=>{
 const f=excludedFixture();f.source.splice(0);
 for(const t of f.target)Object.assign(t.data,{ConnectedRecord:null,SourceDisplayName:null,SourceDataType:null});
 for(const e of f.all)if(e.tid?.includes(';colSourceDisplayName_'))e.textContent='';
 const result=f.read();assert.equal(result.verified,true);assert.equal(result.inventory_complete,true);assert.equal(result.source_identity_verified,false);
 assert.equal(result.target_fields[1].excluded,true);assert.equal(result.target_fields[1].exclusion_source,null);
 f.target[1].data.DataKind=2;assert.equal(f.read().verified,false);
});

test('exclusion refuses unknown groups, false identities, mandatory and inherited fields',()=>{
 const changes=[
  f=>{f.source[1].data.GroupField='Исключенные';},
  f=>{f.target[1].data.GroupField='Unknown';},
  f=>{delete f.target[1].data.GroupField;},
  f=>{f.target[1].data.Index=1;},
  f=>{f.target[1].data.ConnectedRecord=f.source[1];},
  f=>{f.source[1].data.ConnectedRecord=f.target[1];},
  f=>{f.source[1].data.Required=true;},
  f=>{f.target[1].data.Required=true;},
  f=>{f.target[1].data.IsDerived=true;},
  f=>{delete f.target[1].data.IsDerived;},
  f=>{f.target[1].data.SourceDisplayName='Same';},
  f=>{f.target[1].data.SourceDataType=5;},
  f=>{f.target[1].data.DataKind=2;},
  f=>{f.source[1].data.Name='Other';},
  f=>{f.source[1].data.DataType=4;},
  f=>{f.rows[1].attrs['data-recordindex']='0';},
  f=>{f.rows[1].attrs['data-recordid']='foreign';},
  f=>{f.all.find(e=>e.tid===f.base+'colSourceDisplayName_B').textContent='Same';},
 ];
 for(const [i,change] of changes.entries()){const f=excludedFixture();change(f);assert.equal(f.read().verified,false,String(i));}
});

test('reader refuses two visible mapping masters and ignores an inactive cached master',()=>{
 const f=excludedFixture(),other=f.el('MF;TF;WizrdMCF;ColumnsMappingEngineOutputPortWizard');
 assert.equal(f.read().reason,'mapping_root');other.checkVisibility=()=>false;assert.equal(f.read().verified,true);
});

test('native mapping accepts a differently sorted backing collection with identical records',()=>{
 const f=fixture();f.stores[1].getData=()=>({items:f.target,getSource:()=>({items:[...f.target].reverse()})});assert.equal(f.read().verified,true);
});

 test('native mapping exposes required source and target restrictions and rejects unknown values',()=>{
 const f=fixture();f.source[0].data.Required=true;f.target[1].data.Required=true;
 const r=f.read();assert.equal(r.source_fields[0].required,true);assert.equal(r.target_fields[0].source.required,true);assert.equal(r.target_fields[1].required,true);
 delete f.source[1].data.Required;assert.equal(f.read().verified,false);
 });

test('grouped target active-only total retains the complete excluded inventory after node reconfiguration',()=>{
 const f=excludedFixture();f.stores[1].getTotalCount=()=>1;
 const r=f.read();assert.equal(r.verified,true);assert.equal(r.target_fields.length,2);assert.equal(r.target_fields[1].excluded,true);
});
for(const [name,change] of Object.entries({wrong_total:f=>f.stores[1].getTotalCount=()=>0,
 no_source:f=>f.stores[1].getData=()=>({items:f.target}),
 missing_excluded:f=>f.stores[1].getData=()=>({items:f.target.slice(0,1),getSource:()=>({items:f.target})}),
 foreign_source:f=>f.stores[1].getData=()=>({items:f.target,getSource:()=>({items:f.target.map(r=>({...r}))})}),
 source_total:f=>f.stores[0].getTotalCount=()=>1,
}))test('active-only target total rejects '+name,()=>{
 const f=excludedFixture();f.stores[1].getTotalCount=()=>1;change(f);assert.equal(f.read().verified,false);
});

test('input mapping retains usage and rejects a broken reverse connection',()=>{
 const f=fixture({input:true}),r=f.read();assert.equal(r.verified,true);assert.equal(r.mapping_wizard,'TuneDataSourceMappingWizard');assert.equal(r.target_fields[0].usage_type,3);
 f.target[0].data.ReverseBroken=true;assert.equal(f.read().verified,false);
});

test('conditional calculator mapping keeps the same strict excluded-record proof',()=>{
 const f=excludedFixture();
 for(const e of f.all)if(e.tid)e.tid=e.tid.replace('DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard');
 const r=f.read();assert.equal(r.verified,true);assert.equal(r.mapping_wizard,'DerivedDataSourceMappingEngineOutputPortWizard');
 assert.equal(r.target_fields[1].exclusion_source.record_id,'s1');
 f.target[1].data.IsDerived=true;assert.equal(f.read().verified,false);
});

test('grouping input roles retain native group and measure usage without accepting unknown roles',()=>{
 const f=fixture({input:true});f.target[0].data.UsageType=6;f.target[1].data.UsageType=7;
 const r=f.read();assert.equal(r.verified,true);assert.deepEqual(Array.from(r.target_fields,x=>x.usage_type),[6,7]);
 f.target[0].data.UsageType=99;assert.equal(f.read().reason,'mapping_input_usage');
});

test('only a settled local CollectionProxy may retain the previous total after a grouping deletion',()=>{
 const f=fixture({grouped:true}),s=f.stores[1],proxy={$className:'bg.ext.CollectionProxy',pendingOperations:{}};
 s.getTotalCount=()=>3;s.currentPage=1;s.getProxy=()=>proxy;s.getRemoteFilter=()=>false;s.getRemoteSort=()=>false;
 assert.equal(f.read().verified,true);
 for(const mutate of [()=>{proxy.pendingOperations={running:{}};},()=>{s.currentPage=2;},()=>{s.getRemoteFilter=()=>true;},()=>{proxy.$className='Ext.data.proxy.Ajax';}]){
  proxy.pendingOperations={};proxy.$className='bg.ext.CollectionProxy';s.currentPage=1;s.getRemoteFilter=()=>false;
  mutate();assert.equal(f.read().reason,'mapping_filtered_store');
 }
});

function linksFixture(){
 const f=fixture({grouped:true});f.selected=[f.source[0]];
 for(const [name,value] of [['rbLinks',true],['rbTable',false]]){
  const e=f.el(f.base+name,'',f.root);e.classList={contains:k=>k==='x-form-cb-checked'&&value};
  f.views[e.id]={el:{dom:e},getValue:()=>value};
 }
 f.views[f.grids[0].id].getSelectionModel=()=>({getSelection:()=>f.selected});
 f.sourceRows=f.source.map((s,i)=>{const r=f.el(null,'',f.grids[0]);r.row=true;r.attrs={'data-recordindex':String(i),'data-recordid':s.internalId,'data-boundview':f.grids[0].id};
  r.classList={contains:k=>k==='x-grid-item-selected'&&f.selected.includes(s)};f.el(f.base+'colSourceName_'+s.data.Name,s.data.DisplayName,r);return r;});
 // Links has no editable name/source-display columns from the Table view.
 for(const e of f.all)if(e.tid?.includes(';colName_')||e.tid?.includes(';colSourceDisplayName_'))e.tid=null;
 return f;
}
test('links mapping binds native selection and rendered source rows',()=>{
 const f=linksFixture(),r=f.read();assert.equal(r.verified,true);assert.deepEqual(Array.from(r.source_selection.record_ids),['s0']);
 assert.equal(r.target_fields[0].name,'Out0');assert.equal(r.autosync,false);
});
for(const [name,change] of Object.entries({foreignSelection:f=>f.selected=[{...f.source[0]}],wrongRow:f=>f.sourceRows[0].attrs['data-recordid']='foreign',
 wrongView:f=>f.sourceRows[0].attrs['data-boundview']='foreign',wrongLabel:f=>f.all.find(e=>e.tid===f.base+'colSourceName_A').textContent='other',
 selectionMismatch:f=>f.sourceRows[0].classList={contains:()=>false},radio:f=>f.views[f.all.find(e=>e.tid===f.base+'rbLinks').id].getValue=()=>false}))
 test('links mapping refuses '+name,()=>{const f=linksFixture();change(f);assert.equal(f.read().verified,false);});
test('standalone dataset output schema retains effective data kinds and rejects malformed kinds',()=>{
 const f=fixture({socket:true});f.target[0].data.DataKind=1;const r=f.read();assert.equal(r.verified,true,r.reason);assert.equal(r.mapping_wizard,'DataSetOutputSocketWizard');assert.deepEqual(Array.from(r.target_fields,f=>f.data_kind),['Непрерывный','Дискретный']);
 f.target[0].data.DataKind=99;assert.equal(f.read().verified,false);
});
