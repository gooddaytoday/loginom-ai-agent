import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readColUnionBrowser,readColUnionContext} from '../lib/col-union-context.mjs';
function fixture(){
 const elements=[],components={},base='MF;TF;WizrdMCF;ColUnionDataWizard';
 const el=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent);}};elements.push(e);return e;};
 const wizard=el('MF;TF;WizrdMCF'),root=el(base,wizard),form={};components[wizard.id]={el:{dom:wizard},Controller:form};
 const owner={constructor:{name:'ColUnionDataWizard'},FWizardForm:form,FCurDataSourceGuid:'00000000-0000-0000-0000-000000000000'};
 components[root.id]={el:{dom:root},'@@TestCmpController':owner};
 const add=(key,value)=>{const e=el(base+';'+key,root);components[e.id]={el:{dom:e},...value};};
 const properties=[];
 for(const [key,value] of [['pedRowsPaddingType',0],['pedTailsAlignType',1]]){
  const p={FInitializing:false,FLastViewMode:0,FLastValue:value,FLastVariable:null};properties.push(p);add(key,{Controller:p});
  add(key+';ValueControl',{getValue:()=>p.FLastValue,getStore:()=>({getData:()=>({items:[0,1,2].map(Value=>({data:{Value,DisplayText:String(Value)}}))})})});
 }
 const rows=[0,1].map(i=>({internalId:'s'+i,data:{Value:'11111111-1111-1111-1111-11111111111'+i,DisplayText:'source '+i}}));
 const store={getData:()=>({items:rows}),getCount:()=>2,getTotalCount:()=>0,getRemoteFilter:()=>false,getRemoteSort:()=>false},selection=[];
 add('grdDataSources',{getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection})});add('grdDataSources;tbl',{getStore:()=>store});
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {owner,rows,store,properties,selection,read:()=>vm.runInNewContext('('+readColUnionBrowser.toString()+')("MF;TF")',context)};
}
test('col union reads complete local source rows without treating remote total as a local inventory',()=>{const f=fixture();Object.defineProperty(f.owner,'FEngine',{get(){throw Error('RPC');}});const r=f.read();assert.equal(r.verified,true);assert.deepEqual(JSON.parse(JSON.stringify(r.settings)),{row_count:'maximum',padding:'null'});});
test('col union refuses variables, filtered source inventories and foreign selected records',()=>{
 for(const change of [f=>f.properties[0].FLastViewMode=1,f=>f.store.getData=()=>({items:f.rows,getSource:()=>({items:[...f.rows,{}]})}),f=>f.rows[1].data.Value=f.rows[0].data.Value,f=>{f.properties[1].FLastValue=2;f.selection.push({...f.rows[0]});}]){const f=fixture();change(f);assert.equal(f.read().verified,false);}
 const f=fixture();f.properties[1].FLastValue=2;f.owner.FCurDataSourceGuid=f.rows[1].data.Value;f.selection.push(f.rows[1]);assert.equal(f.read().settings.determining_input,'attached');
});
test('determining input follows the owned draft selection before native PageExit commits its GUID',()=>{
 for(const [index,wanted] of [[0,'main'],[1,'attached']]){
  const f=fixture();f.properties[1].FLastValue=2;f.selection.push(f.rows[index]);
  const result=f.read();assert.equal(result.verified,true);assert.equal(result.binding_ready,true);assert.equal(result.settings.determining_input,wanted);
 }
 const f=fixture();f.properties[1].FLastValue=2;f.owner.FCurDataSourceGuid=f.rows[0].data.Value;
 assert.equal(f.read().settings.determining_input,null);assert.equal(f.read().binding_ready,false);
 f.selection.push(...f.rows);assert.equal(f.read().verified,false);
});
test('col union context refuses a port wizard and an owner change across its native read',async()=>{assert.equal((await readColUnionContext({}, {},async()=>({verified:true,surface:'wizard',input_port:{}}))).verified,false);let n=0;assert.equal((await readColUnionContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++n}))).verified,false);});
