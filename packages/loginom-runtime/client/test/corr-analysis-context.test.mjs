import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCorrAnalysisBrowser,readCorrAnalysisContext} from '../lib/corr-analysis-context.mjs';
function fixture(){
 const base='MF;TF;WizrdMCF;CorrAnalysisWizard',elements=[],components={};
 const el=tid=>{const e={id:'e'+elements.length,tid,checkVisibility:()=>true,contains:()=>true};elements.push(e);return e;};
 const root=el(base),view={el:{dom:root}};components[root.id]=view;
 const records=['X','Y','Z'].map((Name,i)=>({isModel:true,internalId:i,data:{Name,DisplayName:Name,DataType:3,ChkFirstSet:i<2,ChkSecondSet:i===2}}));
 const proxy={$className:'bg.ext.CollectionProxy',pendingOperations:{}},store={$className:'Ext.data.Store',getProxy:()=>proxy,getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 view.Controller={FView:view,FColumnsStore:store};
 for(const key of ['cbCorrTypeLinear','cbCorrTypeKendall','cbCorrTypeSpearmen','cbCorrTypeExtremum']){const e=el(base+';'+key);components[e.id]={el:{dom:e},getValue:()=>key==='cbCorrTypeLinear'};}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {records,proxy,store,view,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readCorrAnalysisBrowser.toString()+')("MF;TF")',context)))};
}
test('correlation observes complete cached assignments and native checkbox values',()=>{
 const r=fixture().read();assert.equal(r.verified,true);assert.deepEqual(r.fields.map(f=>f.first_set),[true,true,false]);assert.deepEqual(r.coefficients,{pearson:true,kendall:false,spearman:false,extremum:false});
});
test('correlation refuses stale, partial, remote and foreign native settings',()=>{
 for(const change of [f=>f.records[1].data.Name='X',f=>f.records[1].internalId=0,f=>f.records[0].data.ChkFirstSet='true',f=>f.proxy.pendingOperations={load:1},f=>f.store.getCount=()=>99,f=>f.store.isLoading=()=>true,f=>f.proxy.$className='Ajax',f=>f.view.Controller.FView={}]){
  const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('correlation rejects an owner change across the native read',async()=>{
 let i=0;const r=await readCorrAnalysisContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}));assert.equal(r.reason,'correlation_node_changed');
});
