import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readDataPartitionBrowser,readDataPartitionContext} from '../lib/datapartition-context.mjs';

function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;PartitionComponentWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,parent,tid,checkVisibility:()=>true,getAttribute:()=>tid,contains(x){return x===this||!!x.parent&&this.contains(x.parent);}};all.push(e);return e;};
 const root=element(base.slice(0,-1));
 const component=(key,value)=>{const e=element(base+key,root);return components[e.id]={el:{dom:e},getValue:()=>value};};
 const values={method:0,priority:false,position:0,seed:'17'};
 for(const [key,name] of [['pedSamplingMethod;ValueControl','method'],['cntTestPriority;cnt;chb','priority'],['pedTestPriorityPosition;ValueControl','position'],['RandSeedEdit;edtRandSeed;ValueControl','seed']])component(key,null).getValue=()=>values[name];
 const store=rs=>({$className:'Ext.data.Store',getData:()=>({items:rs}),getCount:()=>rs.length,isLoading:()=>false});
 const rows=['Teach','Test'].map((name,index)=>{
  const owner=element(base+'SizeGridForm;editor'+index,root),control={getValue:()=>index?3:6};
  return {isModel:true,internalId:'s'+index,data:{SamplingType:0,SizePath:'Partition.'+name+'DataSetSize',AbsoluteEditor:{el:{dom:owner},Controller:{Items:{ValueControl:control}},isDisabled:()=>false}}};
 });
 const sizes=store(rows);component('SizeGridForm;grdDataSet',null).getStore=()=>sizes;
 const fields=['Group','Payload'].map((name,index)=>({isModel:true,internalId:'f'+index,data:{Name:name,DisplayName:'same',Index:index,DataType:5,DataKind:2,UsageType:index?0:1,UsageFlag:!index}}));
 const source=store(fields),chain={$className:'Ext.data.ChainedStore',getSource:()=>source,getData:()=>({items:fields}),isLoading:()=>false};
 component('StratifiedMethodForm;grdStratifiedGrid',null).getStore=()=>chain;
 component('StratifiedMethodForm;pedCompleteUniqueValues;ValueControl',false);
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>all.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {rows,sizes,values,fields,chain,source,root,read:()=>vm.runInNewContext('('+readDataPartitionBrowser.toString()+')("MF;TF")',context)};
}

test('DataPartition reads owned size editors and complete source behind a filtered chain',()=>{
 const f=fixture();assert.equal(f.read().verified,true);assert.equal(f.read().parameters.training.value,6);
 f.values.method=2;f.chain.getData=()=>({items:[f.fields[0]]});
 const r=f.read();assert.equal(r.verified,true);assert.equal(r.input_fields.length,2);assert.deepEqual(Array.from(r.parameters.stratified.fields),['Group']);
 assert.equal(r.settings_applied,false);
});

test('DataPartition rejects missing, filtered, buffered, loading or foreign inventories and editors',()=>{
 for(const change of [f=>f.sizes.getCount=()=>1,f=>f.sizes.isLoading=()=>true,f=>f.sizes.isBufferedStore=true,
  f=>f.sizes.getData=()=>({items:f.rows,getSource:()=>({items:[]})}),f=>f.rows[1].internalId='s0',
  f=>f.rows[0].data.SizePath='Partition.TestDataSetSize',f=>f.rows[0].data.AbsoluteEditor.el.dom.parent=null,
  f=>f.rows[0].data.AbsoluteEditor.Controller.Items.ValueControl.getValue=()=>NaN,f=>f.values.seed='0',
  f=>f.values.method=99,f=>f.root.checkVisibility=()=>false]){
  const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
 const f=fixture();f.values.method=2;f.chain.getData=()=>({items:[{...f.fields[0]}]});assert.equal(f.read().verified,false);
});

test('DataPartition readback refuses owner changes and separate port wizards',async()=>{
 let count=0;
 const binding={workflow_ref:{prefix:'MF;TF'}};
 assert.equal((await readDataPartitionContext({evaluate:async()=>({verified:true})},binding,async()=>({verified:true,surface:'wizard',node_id:++count}))).reason,'data_partition_node_changed');
 assert.equal((await readDataPartitionContext({},binding,async()=>({verified:true,surface:'wizard',output_port:{}}))).reason,'data_partition_node_surface');
});
