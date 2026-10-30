import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readElimOutlierBrowser,readElimOutlierContext} from '../lib/elim-outlier-context.mjs';
function fixture(change=()=>{}){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;ElimOutlierWizard;',elements=new Map(),components=new Map();
 const root={checkVisibility:()=>true,contains:e=>[...elements.values()].includes(e)};
 const add=(name,component)=>{const dom={id:name};elements.set(base+name,dom);components.set(name,{el:{dom},...component});};
 const fields=[{Name:'RowID',DisplayName:'RowID',DataType:4,DataKind:1,ChkUsable:false},{Name:'X',DisplayName:'X',DataType:3,DataKind:1,ChkUsable:true},{Name:'Note',DisplayName:'Note',DataType:5,DataKind:2,ChkUsable:false}].map((data,i)=>({isModel:true,internalId:'f'+i,data}));
 const store={$className:'Ext.data.Store',getData:()=>({items:fields}),getCount:()=>fields.length,getProxy:()=>({$className:'bg.ext.CollectionProxy'}),isLoading:()=>false};
 const selection=[fields[1]],values={pedDetectOSko:1,pedDetectESko:3,pedDetectOKvartil:1.5,pedDetectEKvartil:3,pedActionOut:1,pedActionExtr:1,pedOrderedSample:false,pedUseQuality:false};
 add('grdColumnsSettings',{getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection})});
 for(const key of Object.keys(values)){add(key+';ValueControl',{getValue:()=>values[key]});add(key+';SwitchButton',{pressed:false});}
 const radios=[true,false];for(const [i,key] of ['radiofield','radiofield-1'].entries())add('pedModeOE;ValueControl;'+key,{getValue:()=>radios[i]});
 change({fields,store,values,radios,selection,components,elements});
 const context=vm.createContext({document:{querySelectorAll:s=>{const tid=JSON.parse(s.slice(10,-1));return tid===base.slice(0,-1)?[root]:elements.has(tid)?[elements.get(tid)]:[];}},Ext:{getCmp:id=>components.get(id)}});
 return JSON.parse(JSON.stringify(vm.runInContext('('+readElimOutlierBrowser.toString()+')',context)(prefix)));
}
test('complete bound native store yields SD/IQR controls and separate field participation',()=>{
 const s=fixture();assert.equal(s.verified,true);assert.equal(s.fields.length,3);assert.equal(s.selected.name,'X');assert.deepEqual(s.settings,{method:'sd',outlier_factor:1,extreme_factor:3,outlier_policy:'keep',extreme_policy:'keep'});
 assert.equal(fixture(f=>{f.radios[0]=false;f.radios[1]=true;}).settings.method,'iqr');
 assert.equal(fixture(f=>{f.selection[0]=f.fields[0];f.values.pedDetectOSko=null;}).settings,null);
});
test('context refuses partial/filtered/loading cache, duplicate identity, ambiguous selection and invalid controls',()=>{
 for(const change of [f=>f.store.getCount=()=>99,f=>f.store.isLoading=()=>true,f=>f.store.getData=()=>({items:f.fields,getSource:()=>({items:[]})}),f=>f.fields[0].data.Name='X',f=>f.fields[0].internalId='f1',f=>f.selection.push(f.fields[0]),f=>f.radios[1]=true,f=>f.values.pedDetectOSko=Infinity,f=>f.values.pedUseQuality=null,f=>f.fields[0].data.ChkUsable=1,f=>f.components.get('grdColumnsSettings').el.dom={}])assert.equal(fixture(change).verified,false);
 assert.equal(fixture(f=>f.components.get('pedOrderedSample;SwitchButton').pressed=true).switches.pedOrderedSample,true);
});
test('native outlier context refuses ownership drift and port surfaces',async()=>{
 const binding={workflow_ref:{prefix:'x'}},page={evaluate:async()=>({verified:true})};let count=0;
 assert.equal((await readElimOutlierContext(page,binding,async()=>({verified:true,surface:'wizard',node_id:++count}))).reason,'elim_outlier_owner_changed');
 assert.equal((await readElimOutlierContext(page,binding,async()=>({verified:true,surface:'wizard',output_port:{port:0}}))).verified,false);
});
