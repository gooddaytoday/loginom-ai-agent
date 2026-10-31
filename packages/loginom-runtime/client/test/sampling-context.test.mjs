import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readSamplingBrowser,readSamplingContext} from '../lib/sampling-context.mjs';
function fixture(change=()=>{},nested=false,method='Последовательный',sequencePresent=true){
 const prefix='MF;TF-1',shellTid=prefix+';WizrdMCF',base=shellTid+';SamplingComponentWizard';
 const sizesBase=(nested?shellTid:base)+';SizeGridForm',sequenceBase=(nested?shellTid:base)+';SequenceMethodForm';
 const root={checkVisibility:()=>true,contains:()=>true},shell={contains:()=>true};
 // Observed native size records contain a path, not an AbsoluteSize value.
 const sizes=[{internalId:'size',data:{DisplayName:'Сэмплированное',SamplingType:1,SizePath:'Sampling.SamplingRecordCount',id:1}}];
 const groups=[{internalId:'sample',data:{DisplayName:'Сэмплированное'}},{internalId:'unused',data:{DisplayName:'Неиспользуемое'}}];
 const store=items=>({$className:'Ext.data.Store',getData:()=>({items}),getCount:()=>items.length,isLoading:()=>false});
 const stores=[store(sizes),store(groups)],controls={absolute_size:10,absolute_disabled:method!=='Последовательный',relative_disabled:method==='Последовательный'};
 const grids=[{id:'sizes',checkVisibility:()=>true,querySelectorAll:()=>[row]},{id:'groups',checkVisibility:()=>true,querySelectorAll:()=>[]}];
 const abs={id:'absolute'},rel={id:'relative'},row={getAttribute:()=> 'size',textContent:'Сэмплированное',querySelectorAll:()=>[abs,rel]};
 const icon={getAttribute:()=>''},cell={querySelectorAll:()=>[icon],querySelector:()=>icon,textContent:'',closest:()=>row};
 const methodElement={id:'method'};
 const tids={[shellTid]:[shell],[base]:[root],[base+';pedSamplingMethod;ValueControl']:[methodElement],
  [sizesBase+';grdDataSet']:[grids[0]],[sizesBase+';colSizeType_0']:[cell],
  [sizesBase+';colAbsoluteSize;FloatPropEdit;PropContainer;ValueContainer;ValueControl']:[abs],
  [sizesBase+';colRelativeSize;FloatPropEdit;PropContainer;ValueContainer;ValueControl']:[rel],
  ...(sequencePresent?{[sequenceBase+';grdSequence']:[grids[1]]}:{})};
 for(const [tid,es] of Object.entries(tids))for(const e of es)e.getAttribute=key=>key==='data-tid'?tid:null;
 const components={method:{el:{dom:methodElement},getRawValue:()=>method},
  sizes:{el:{dom:grids[0]},getStore:()=>stores[0],getSelectionModel:()=>({getSelection:()=>[]})},
  groups:{el:{dom:grids[1]},getStore:()=>stores[1],getSelectionModel:()=>({getSelection:()=>[]})},
  absolute:{el:{dom:abs},getValue:()=>controls.absolute_size,isDisabled:()=>controls.absolute_disabled},
  relative:{el:{dom:rel},isDisabled:()=>controls.relative_disabled}};
 const observedRefs={document:null,ids:new WeakMap([[icon,'ui-owned-icon']]),refs:new Map([['ui-owned-icon',{deref:()=>icon}]])};
 change({stores,sizes,groups,controls,components,tids,observedRefs,icon});
 const document={querySelectorAll:s=>{if(s==='[data-tid]')return Object.values(tids).flat();
  if(s.startsWith('[data-tid$=')){const suffix=JSON.parse(s.slice(11,-1));return Object.entries(tids).filter(([tid])=>tid.endsWith(suffix)).flatMap(([,es])=>es);}
  return tids[JSON.parse(s.slice(10,-1))]??[];}};
 observedRefs.document=document;
 const context=vm.createContext({document,Ext:{getCmp:id=>components[id]}});
 context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=observedRefs;
 return JSON.parse(JSON.stringify(vm.runInContext('('+readSamplingBrowser.toString()+')',context)(prefix)));
}
test('serialized observer binds native size-path rows to the complete owned UI controls without invoking remote getters',()=>{
 const result=fixture(({sizes})=>Object.defineProperty(sizes[0].data,'Remote',{enumerable:true,get(){throw Error('remote getter accessed');}}));
 assert.equal(result.verified,true);assert.equal(result.sizes[0].values.SizePath,'Sampling.SamplingRecordCount');
 assert.equal(result.units[0].absolute_size,10);assert.equal(result.units[0].unit,'rows');
 assert.equal(result.units[0].record_id,'size');assert.equal(result.sequence.length,2);assert.equal(result.settings_applied,false);
 assert.equal(result.units[0].icon_ref,'ui-owned-icon');
});
test('observer binds the actual size-row icon to its existing observed reference and refuses stale or absent references',()=>{
 for(const change of [f=>f.observedRefs.ids=new WeakMap(),f=>f.observedRefs.refs.clear(),f=>f.observedRefs.refs.set('ui-owned-icon',{deref:()=>({})})])assert.equal(fixture(change).verified,false);
});
test('observer admits the actual initial method before its sequence form exists, and requires that grid after selecting sequential',()=>{
 const r=fixture(()=>{},false,'Случайный',false);
 assert.equal(r.verified,true);assert.equal(r.sequence_materialized,false);assert.deepEqual(r.sequence,[]);assert.equal(r.units[0].unit,'percent');
 assert.equal(fixture(()=>{},false,'Последовательный',false).reason,'sampling_grid');
});
test('observer refuses loading, filtered, incomplete and foreign grids or unbound numeric controls',()=>{
 for(const change of [f=>f.stores[0].isLoading=()=>true,f=>f.stores[1].getCount=()=>3,f=>f.groups.pop(),
  f=>f.stores[0].getData=()=>({items:f.sizes,getSource:()=>({items:[...f.sizes,{}]})}),f=>f.components.sizes.el.dom={},
  f=>f.components.absolute.el.dom={},f=>f.controls.relative_disabled=false,f=>f.controls.absolute_size=NaN])assert.equal(fixture(change).verified,false);
});
test('observer refuses a separate port wizard or an owner change',async()=>{
 const owner={verified:true,surface:'wizard',node_id:'A'},page={evaluate:async()=>({verified:true})};let n=0;
 assert.equal((await readSamplingContext(page,{workflow_ref:{prefix:'x'}},async()=>({...owner,node_id:++n===1?'A':'B'}))).verified,false);
 assert.equal((await readSamplingContext(page,{workflow_ref:{prefix:'x'}},async()=>({...owner,input_port:{port:0}}))).verified,false);
});
test('nested forms bind their unique data-tid in the owned wizard without invented component ancestry',()=>{
 const r=fixture(()=>{},true);assert.equal(r.verified,true);assert.equal(r.sizes_base,'MF;TF-1;WizrdMCF;SizeGridForm');assert.equal(r.sequence_base,'MF;TF-1;WizrdMCF;SequenceMethodForm');
});

function addMethodGrid(f,suffix,records,cells,selected=[]){
 const base='MF;TF-1;WizrdMCF;SamplingComponentWizard;',tid=base+suffix,id=suffix;
 const element={id,getAttribute:()=>tid,checkVisibility:()=>true,querySelectorAll:()=>records.map((r,i)=>({getAttribute:()=>r.internalId,textContent:'',querySelectorAll:()=>cells[i]}))};
 f.tids[tid]=[element];
 f.components[id]={el:{dom:element},getStore:()=>({$className:'Ext.data.Store',getCount:()=>records.length,getData:()=>({items:records}),isLoading:()=>false}),getSelectionModel:()=>({getSelection:()=>selected})};
 for(const row of cells)for(const cell of row){cell.getAttribute=()=>base+cell.suffix;f.tids[base+cell.suffix]=[cell];}
}
test('strata identity and selection come from rendered technical-name cells and checked native flags',()=>{
 const result=fixture(f=>{
  const flag={suffix:'StratifiedMethodForm;grdStratifiedGrid;headercontainer;UsageFlag_Class',querySelectorAll:()=>[{classList:{contains:c=>c==='x-grid-checkcolumn-checked'}}]};
  const name={suffix:'StratifiedMethodForm;colDisplayName_Class'};
  addMethodGrid(f,'StratifiedMethodForm;grdStratifiedGrid',[{internalId:'class',data:{DisplayName:'Категория'}}],[[flag,name]]);
 },false,'Стратифицированный',false);
 assert.equal(result.verified,true);
 assert.equal(result.strata.rows[0].values.Name,'Class');
 assert.equal(result.strata.rows[0].values.UsageFlag,true);
});
test('biased factors use the native factor column dataIndex, with string categories and selected field bound separately',()=>{
 const result=fixture(f=>{
  const field={internalId:'class',data:{DisplayName:'Категория'}};
  addMethodGrid(f,'BiasedMethodForm;grdBiasedColumns',[field],[[{suffix:'BiasedMethodForm;colDisplayName_Class'}]],[field]);
  addMethodGrid(f,'BiasedMethodForm;grdBiased',[{internalId:'A',data:{NativeFactor:0.4}}],[[{suffix:'BiasedMethodForm;colBiasedValue_0',textContent:'A'}]]);
  const column={id:'factor'};f.tids['MF;TF-1;WizrdMCF;SamplingComponentWizard;BiasedMethodForm;colBiasedFactor']=[column];
  f.components.factor={el:{dom:column},dataIndex:'NativeFactor'};
 },false,'Отбор со смещением',false);
 assert.equal(result.verified,true);
 assert.equal(result.bias_fields.rows[0].values.Name,'Class');assert.equal(result.bias_fields.rows[0].selected,true);
 assert.equal(result.bias.rows[0].values.Value,'A');assert.equal(result.bias.rows[0].values.Factor,0.4);
});
