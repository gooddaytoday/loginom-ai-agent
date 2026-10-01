import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readMappingBrowser,readNodeMapping,makeNodeMappingContextCode} from '../lib/node-mapping-context.mjs';
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

for(const kind of ['value','missing','duplicate','long','disconnected'])test('render mismatch retains bounded evidence without admitting '+kind,()=>{
 const f=fixture(),cell=f.all.find(e=>e.tid===f.base+'colSourceDisplayName_Out0');
 if(kind==='value')cell.textContent='Different';
 if(kind==='missing')f.all.splice(f.all.indexOf(cell),1);
 if(kind==='duplicate')f.el(cell.tid,'Other',cell.parent);
 if(kind==='long')cell.textContent='x'.repeat(10000);
 if(kind==='disconnected'){
  f.target[0].data.ConnectedRecord=null;f.source[0].data.ConnectedRecord=null;
  f.target[0].data.SourceDisplayName=null;f.target[0].data.SourceDataType=null;
 }
 const result=f.read();assert.equal(result.verified,false);assert.equal(result.reason,'mapping_render_value');
 assert.equal(result.source_identity_verified,false);
 const d=result.render_mismatch;
 assert.equal(d.column,'colSourceDisplayName_');assert.equal(d.field_name,'Out0');assert.equal(d.row_index,0);
 assert.equal(d.expected,kind==='disconnected'?'':'Same');assert.equal(d.source_connected,kind!=='disconnected');
 assert.equal(d.cell_count,kind==='missing'?0:kind==='duplicate'?2:1);
 assert.ok(d.cells.length<=2);for(const entry of d.cells)assert.ok(entry.text.length<=240);
 if(kind==='long'){assert.equal(d.cells[0].text.length,240);assert.equal(d.cells[0].truncated,true);}
 assert.equal(d.source_count,2);assert.equal(d.target_count,2);
});
test('unverified render diagnostics cannot bypass the bracketing native owner check',async()=>{
 const f=fixture();f.all.find(e=>e.tid===f.base+'colName_Out0').textContent='Wrong';
 let reads=0;const result=await readNodeMapping({evaluate:async()=>f.read()},{workflow_ref:{prefix:'MF;TF'}},
  async()=>({verified:true,surface:'wizard',node_id:String(++reads)}));
 assert.deepEqual(result,{verified:false,reason:'mapping_node_changed'});
});

for(const mode of ['hidden','visible','unbound','throw','overflow'])test('failure-only header diagnostic '+mode,()=>{
 const f=fixture(),cell=f.all.find(e=>e.tid===f.base+'colSourceDisplayName_Out0');
 f.all.splice(f.all.indexOf(cell),1);
 const header=f.el(f.base+'targetHeader','',mode==='unbound'?null:f.root);
 const column=f.el(f.base+'sourceColumnHeader','',header);column.checkVisibility=()=>mode!=='hidden';
 let calls=0;
 f.views[f.grids[1].id].headerCt={el:{dom:header},getGridColumns:()=>{
  calls++;if(mode==='throw')throw Error('UI unavailable');
  return Array.from({length:mode==='overflow'?33:1},()=>({dataIndex:'SourceDisplayName',itemId:'source',hidden:mode==='hidden',el:{dom:column}}));
 }};
 const result=f.read();assert.equal(result.verified,false);assert.equal(result.reason,'mapping_render_value');
 const d=result.render_mismatch;assert.equal(d.cell_count,0);assert.equal(d.cached_targets.length,2);
 assert.equal(d.cached_targets_truncated,false);assert.equal(d.cached_targets[0].connected,true);
 assert.equal(d.cached_targets[0].name,'Out0');assert.equal(d.cached_targets[0].type,'string');
 assert.equal(d.headers.status,mode==='unbound'||mode==='overflow'?'unavailable':mode==='throw'?'diagnostic_failed':'observed');
 assert.equal(calls,mode==='unbound'?0:1);
 if(['hidden','visible'].includes(mode)){
  assert.equal(d.headers.columns[0].data_index,'SourceDisplayName');assert.equal(d.headers.columns[0].dom_in_owner,true);
  assert.equal(d.headers.columns[0].hidden,mode==='hidden');assert.equal(d.headers.columns[0].visible,mode!=='hidden');
 }
});
test('successful mapping does not inspect optional diagnostic headers',()=>{
 const f=fixture();Object.defineProperty(f.views[f.grids[1].id],'headerCt',{get(){throw Error('Diagnostic must not run');}});
 assert.equal(f.read().verified,true);
});

function pendingFixture() {
 const f=fixture({socket:true});f.source.splice(0);
 for(const t of f.target)Object.assign(t.data,{ConnectedRecord:null,SourceDisplayName:null,SourceDataType:null});
 for(const cell of [...f.all])if(cell.tid?.startsWith(f.base+'colSourceDisplayName_'))f.all.splice(f.all.indexOf(cell),1);
 const header=f.el(f.base+'grdTargetColumns;headercontainer','',f.root);
 const element=f.el(f.base+'colSourceDisplayName','',header);element.checkVisibility=()=>false;
 const column={dataIndex:'SourceDisplayName',itemId:'colSourceDisplayName',hidden:true,el:{dom:element}};
 const columns=[column];f.views[f.grids[1].id].headerCt={el:{dom:header},getGridColumns:()=>columns};
 return {...f,header,element,column,columns};
}
test('owned hidden source column proves configured inventory without proving mapping',()=>{
 const f=pendingFixture(),r=f.read();
 assert.equal(r.verified,false);assert.equal(r.reason,'mapping_source_pending');assert.equal(r.source_identity_verified,false);
 assert.equal(r.configured_inventory_verified,true);assert.equal(r.inventory_complete,true);
 assert.equal(r.source_fields.length,0);assert.equal(r.target_fields.length,2);
 assert.equal(r.target_fields[0].name,'Out0');assert.equal(r.target_fields[0].source,null);
 assert.equal(r.source_pending.native_header_verified,true);assert.equal(r.source_pending.target_count,2);
 assert.equal(r.settings_applied,false);assert.equal(r.package_saved,false);
});
for(const [name,change] of Object.entries({
 visible:f=>{f.element.checkVisibility=()=>true;},not_hidden:f=>{f.column.hidden=false;},
 foreign_header:f=>{f.header.parent=null;},missing_header:f=>{f.all.splice(f.all.indexOf(f.header),1);},
 duplicate_header:f=>{f.el(f.header.tid,'',f.root);},foreign_column:f=>{f.column.el.dom=f.header;},
 duplicate_column:f=>{f.columns.push({...f.column});},duplicate_dom:f=>{f.el(f.element.tid,'',f.header);},
 wrong_data_index:f=>{f.column.dataIndex='Other';},wrong_item_id:f=>{f.column.itemId='Other';},
 connected:f=>{f.target[0].data.ConnectedRecord={data:{}};},nonempty_source:f=>{f.source.push({});},
 source_label:f=>{f.target[0].data.SourceDisplayName='Unknown';},source_type:f=>{f.target[0].data.SourceDataType=5;},
 source_cell:f=>{f.el(f.base+'colSourceDisplayName_Out0','wrong',f.rows[0]);},
 empty_source_cell:f=>{f.el(f.base+'colSourceDisplayName_Out0','',f.rows[0]);},
 changed_name_cell:f=>{f.all.find(e=>e.tid===f.base+'colName_Out0').textContent='Other';},
 incomplete_store:f=>{f.stores[1].getCount=()=>1;},autosync:f=>{f.views[f.button.id].pressed=true;},
 wrong_form:f=>{for(const e of f.all)if(e.tid)e.tid=e.tid.replace('DataSetOutputSocketWizard','DerivedDataSourceOutputSocketWizard');}
}))test('configured-only mapping rejects '+name,()=>{
 const f=pendingFixture();change(f);const r=f.read();assert.equal(r.verified,false);assert.notEqual(r.configured_inventory_verified,true);
});


test('mapping read admits only its native disabled output delete-column mask',()=>{
 const variants=['valid','enabled','foreign-native','foreign-root','foreign-view','foreign-tid','duplicate-column','duplicate-mask','loading','message','dialog','text','input'];
 for(const variant of variants){
  const f=fixture(variant==='input'?{input:true}:{socket:true});
  const wizard=f.el('MF;TF;WizrdMCF');f.root.parent=wizard;
  const model={FView:{el:{dom:wizard}}};
  const workspace={getActiveTab:()=>({Controller:{FController:model}})};
  f.context.bg={app:{Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
  const column=f.el(f.base+'colTargetDelete','',f.root);f.views[column.id]={el:{dom:column},disabled:true};
  const mask=f.el(null,'',column);mask.parentElement=column;mask.mask=true;
  const classes=new Set(['x-mask','x-border-box']);mask.classList.contains=name=>classes.has(name);
  if(variant==='enabled')f.views[column.id].disabled=false;
  if(variant==='foreign-native')f.views[column.id].el.dom={};
  if(variant==='foreign-root')column.parent={};
  if(variant==='foreign-view')model.FView.el.dom={};
  if(variant==='foreign-tid')column.tid='other-column';
  if(variant==='duplicate-column')f.el(column.tid);
  if(variant==='duplicate-mask'){const second=f.el(null,'',column);second.mask=true;second.parentElement=column;}
  if(variant==='loading')classes.add('x-mask-msg');
  if(variant==='message')classes.add('bg-mask-message');
  if(variant==='dialog')mask.attrs.role='dialog';
  if(variant==='text')mask.textContent='Loading';
  const result=f.read();
  assert.equal(result.verified,variant==='valid',variant+': '+result.reason);
  if(variant!=='valid')assert.equal(result.reason,'mapping_mask',variant);
 }
});

function inputEditorFixture() {
 const f=fixture({input:true}),wizard=f.el('MF;TF;WizrdMCF'),body=f.el('MF');f.root.parent=wizard;
 const form=f.el('EditTuneColumnDefForm'),mask=f.el(null,'',body);mask.mask=true;mask.parentElement=body;mask.attrs.role='presentation';
 const classes=new Set(['x-mask','x-border-box']);mask.classList.contains=key=>classes.has(key);form.matches=key=>key==='.x-window';
 const native={constructor:{name:'EditTuneColumnDefForm'},FView:{el:{dom:form}},FAddMode:false,Records:[f.target[0]]};
 const component={$className:'bg.wizards.columns.view.EditColumnDefForm',el:{dom:form},Controller:native,modal:true,hidden:false};
 const manager={front:component,mask:{dom:mask}};component.zIndexManager=manager;f.context.Ext.WindowManager=manager;f.views[form.id]=component;
 const model={FView:{el:{dom:wizard}}},workspace={getActiveTab:()=>({Controller:{FController:model}})};
 f.context.bg={app:{Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
 f.context.document.body=body;f.stores[1].getAt=i=>f.target[i];
 const query=f.grids[1].querySelectorAll.bind(f.grids[1]);f.grids[1].querySelectorAll=q=>q==='table.x-grid-item-selected'?[f.rows[0]]:query(q);
 const editor={opening_operation_id:'owned-input:n1',port_guid:'00000000-0000-4000-8000-000000000001',record_id:'t0'};
 return {...f,wizard,body,form,mask,classes,native,component,manager,model,editor,
  readOwned:()=>vm.runInNewContext('('+readMappingBrowser.toString()+')('+JSON.stringify({prefix:'MF;TF',editor})+')',f.context)};
}

test('an explicitly bound original input editor reads complete reciprocal caches; default masked read still refuses',()=>{
 const f=inputEditorFixture();assert.equal(f.read().reason,'mapping_mask');
 const result=f.readOwned();assert.equal(result.verified,true);assert.equal(result.inventory_complete,true);
 assert.equal(result.source_identity_verified,true);assert.deepEqual(Array.from(result.target_fields,t=>t.source.name),['A','B']);
 assert.equal(result.settings_applied,false);assert.equal(result.package_saved,false);
});

for(const [name,change] of [
 ['unbound record',f=>f.editor.record_id=null],['foreign field',f=>f.editor.record_id='t1'],
 ['foreign manager',f=>f.component.zIndexManager={...f.manager}],['foreign front',f=>f.manager.front={}],
 ['foreign mask',f=>f.manager.mask.dom={}],['duplicate mask',f=>{const m=f.el(null);m.mask=true;m.parentElement=f.body;}],
 ['foreign parent',f=>f.mask.parentElement={}],['wrong body',f=>f.body.tid='foreign'],
 ['loading',f=>f.classes.add('x-mask-msg')],['message',f=>f.classes.add('bg-mask-message')],
 ['wrong role',f=>f.mask.attrs.role='dialog'],['mask text',f=>f.mask.textContent='Loading'],
 ['foreign wizard',f=>f.model.FView.el.dom={}],['foreign component',f=>f.component.el.dom={}],
 ['foreign native view',f=>f.native.FView.el.dom={}],['wrong native class',f=>f.native.constructor.name='OtherForm'],
 ['wrong component class',f=>f.component.$className='OtherForm'],['nonmodal',f=>f.component.modal=false],
 ['hidden editor',f=>f.component.hidden=true],['add mode',f=>f.native.FAddMode=true],
 ['foreign records',f=>f.native.Records=[{...f.target[0]}]],['two records',f=>f.native.Records.push(f.target[1])],
 ['record accessor',f=>Object.defineProperty(f.native,'Records',{get(){throw Error('getter must not run');}})],
 ['view accessor',f=>Object.defineProperty(f.native,'FView',{get(){throw Error('getter must not run');}})],
 ['add mode accessor',f=>Object.defineProperty(f.native,'FAddMode',{get(){throw Error('getter must not run');}})],
 ['wrong selected ID',f=>f.rows[0].attrs['data-recordid']='foreign'],['wrong selected index',f=>f.rows[0].attrs['data-recordindex']='1'],
 ['missing selected index',f=>delete f.rows[0].attrs['data-recordindex']],
 ['wrong selected view',f=>f.rows[0].attrs['data-boundview']='foreign'],['two selected rows',f=>f.grids[1].querySelectorAll=()=>f.rows],
 ['loading store',f=>f.stores[1].isLoading=()=>true],['foreign grid view',f=>f.views[f.grids[1].id].el.dom={}],
 ['two editors',f=>f.el('EditTuneColumnDefForm')],
])test('owned input backdrop refuses '+name,()=>{
 const f=inputEditorFixture();change(f);assert.equal(f.readOwned().reason,'mapping_mask');
});

for(const change of [f=>f.source[0].data.ConnectedRecord=f.target[1],f=>f.target[0].data.SourceDataType=4,
 f=>f.stores[0].getTotalCount=()=>3,f=>f.target[1].data.Required='false'])
test('owned editor backdrop retains full native inventory and reciprocal guards '+change.toString(),()=>{
 const f=inputEditorFixture();change(f);assert.equal(f.readOwned().verified,false);
});

test('owned editor context requires its original input0 opening and brackets the cache read',async()=>{
 const f=inputEditorFixture(),node={verified:true,surface:'wizard',input_port:{direction:'input',port:0,
  port_guid:f.editor.port_guid,opening_operation_id:f.editor.opening_operation_id}},binding={workflow_ref:{prefix:'MF;TF'}};
 let reads=0;const page={evaluate:async(fn,arg)=>{reads++;return vm.runInNewContext('('+fn.toString()+')('+JSON.stringify(arg)+')',f.context);}};
 assert.equal((await readNodeMapping(page,binding,async()=>node,readMappingBrowser,f.editor)).verified,true);
 for(const change of [p=>p.direction='output',p=>p.port=1,p=>p.port_guid='foreign',p=>p.opening_operation_id='foreign']){
  const foreign=structuredClone(node);change(foreign.input_port);const before=reads;
  assert.equal((await readNodeMapping(page,binding,async()=>foreign,readMappingBrowser,f.editor)).reason,'mapping_editor_owner');assert.equal(reads,before);
 }
 let n=0;assert.equal((await readNodeMapping(page,binding,async()=>({...node,node_id:String(++n)}),readMappingBrowser,f.editor)).reason,'mapping_node_changed');
});

test('owned mapping editor generator refuses changed binding shapes without reading getters',()=>{
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',
  navigation_path:[{tid:'crumb',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const editor=inputEditorFixture().editor;assert.doesNotThrow(()=>makeNodeMappingContextCode(binding,editor));
 for(const change of [e=>delete e.record_id,e=>e.extra=true,e=>e.record_id='',e=>e.port_guid='foreign',
  e=>Object.defineProperty(e,'record_id',{get(){throw Error('getter must not run');}}),e=>e[Symbol('foreign')]=true]){
  const value={...editor};change(value);assert.throws(()=>makeNodeMappingContextCode(binding,value),/Exact owned input mapping editor/);
 }
});


test('empty output socket mapping reports actual empty inventories without inventing rows',()=>{
 const variants=['valid','loading','nonzero-total','filtered','nonempty-source','nonempty-target','input','other-form','stale-row'];
 for(const variant of variants){
  const f=fixture(variant==='input'?{input:true}:variant==='other-form'?{}:{socket:true});
  const source=f.source[0],target=f.target[0];f.source.splice(0);f.target.splice(0);
  if(variant!=='stale-row')for(let i=f.all.length-1;i>=0;i--)if(f.rows.some(row=>row.contains(f.all[i])))f.all.splice(i,1);
  if(variant==='loading')f.stores[0].isLoading=()=>true;
  if(variant==='nonzero-total')f.stores[0].getTotalCount=()=>1;
  if(variant==='filtered')f.stores[0].getData=()=>({items:[],getSource:()=>({items:[source]})});
  if(variant==='nonempty-source'){source.data.ConnectedRecord=null;f.source.push(source);}
  if(variant==='nonempty-target'){Object.assign(target.data,{ConnectedRecord:null,SourceDisplayName:null,SourceDataType:null});f.target.push(target);}
  const r=f.read();assert.equal(r.verified,variant==='valid',variant+': '+r.reason);
  if(variant==='valid'){
   assert.equal(r.inventory_complete,true);assert.equal(r.state_source,'cached_mapping_stores');
   assert.equal(r.source_fields.length,0);assert.equal(r.target_fields.length,0);assert.equal(r.rendered_indices.length,0);
   assert.equal(r.settings_applied,false);assert.equal(r.package_saved,false);
  }
 }
});
