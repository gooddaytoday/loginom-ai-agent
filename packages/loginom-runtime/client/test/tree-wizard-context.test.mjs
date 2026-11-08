import test from 'node:test';
import assert from 'node:assert/strict';
import {readTreeWizardBrowser} from '../lib/node-output-context.mjs';

const prefix='MF;TF-1',base=prefix+';WizrdMCF;TreeToDataWizard;';
function wizard({indexChecked=false,indexUnderObject=false,secondIndex=false}={}){
 const byTid=new Map(),cmps=new Map();let id=0;
 const element=(tid,extra={})=>{const e={id:'e'+(++id),tid,classList:{contains:c=>c==='x-form-cb-checked'&&e.checked===true},
  closest:()=>null,checkVisibility:()=>true,contains:()=>true,getAttribute:k=>k==='data-tid'?tid:e.attrs?.[k],querySelectorAll:()=>[],...extra};
  if(tid)byTid.set(tid,[...(byTid.get(tid)??[]),e]);return e;};
 element(base.slice(0,-1));
 const checkbox=(key,value)=>{const e=element(base+key+';ValueControl');e.checked=value;cmps.set(e.id,{el:{dom:e},getValue:()=>value});};
 checkbox('pedRepeatParentNodeValues',true);checkbox('pedCompositeColumnNames',false);checkbox('pedCompositeColumnDisplayNames',false);
 const sep=element(base+'pedCompositeDisplayNameSeparator;ValueControl');cmps.set(sep.id,{el:{dom:sep},getValue:()=>'.'});
 let internal=0;const rows=[];
 const record=(data,children=[])=>{const r={isModel:true,internalId:++internal,data:{loaded:true,...data},childNodes:children};
  for(const c of children)c.parentNode=r;
  const tids=data.Node===null?['colNodes_0>'+data.DisplayName+';TreeCheckbox']:[data.Name+';TreeCheckbox',...(data.IsContainer?[data.Name+';TreeExpander']:[])];
  rows.push({getAttribute:k=>k==='data-recordid'?String(r.internalId):null,querySelectorAll:()=>tids.map(t=>({getAttribute:()=>t}))});return r;};
 const index=()=>record({Name:'',DisplayName:'Глобальный индекс узла',IsContainer:false,IsArray:false,Node:null,checked:indexChecked});
 const node=(name,container=false,array=false,children=[])=>record({Name:name,IsContainer:container,IsArray:array,Node:{},checked:false,SelectedGlobalIndex:false},children);
 const items=node('items',true,true,[...(secondIndex?[index()]:[]),index(),node('code'),node('qty')]);
 const root=node('Root',true,false,[node('batch'),indexUnderObject?node('meta',true,false,[index()]):items]);
 const nativeRoot={childNodes:[root]};
 const tree=element(base+'trpDataTree',{querySelectorAll:selector=>selector==='[data-recordid]'?rows:[]});
 cmps.set(tree.id,{el:{dom:tree},getStore:()=>({isLoading:()=>false,getRoot:()=>nativeRoot})});
 globalThis.document={querySelectorAll:selector=>byTid.get(JSON.parse(selector.slice('[data-tid='.length,-1)))??[]};
 globalThis.Ext={getCmp:key=>cmps.get(key)};
}
const read=options=>{wizard(options);try{return readTreeWizardBrowser(prefix);}finally{delete globalThis.document;delete globalThis.Ext;}};

test('tree-to-table wizard reports the native global index leaf on its array',()=>{
 const off=read();
 assert.equal(off.verified,true,off.reason);
 const items=off.nodes.find(n=>n.path==='/items');
 assert.equal(items.selected_global_index,false);assert.equal(items.global_index_tid,'colNodes_0>Глобальный индекс узла;TreeCheckbox');
 assert.deepEqual(off.nodes.map(n=>n.path),['','/batch','/items','/items/code','/items/qty']);
 const on=read({indexChecked:true});
 assert.equal(on.verified,true,on.reason);assert.equal(on.nodes.find(n=>n.path==='/items').selected_global_index,true);
 assert.equal(on.nodes.filter(n=>n.selected_global_index).length,1);
});
test('tree-to-table wizard refuses an index leaf outside an array or a duplicate index leaf',()=>{
 assert.deepEqual(read({indexUnderObject:true}),{verified:false,reason:'tree_index_record'});
 assert.deepEqual(read({secondIndex:true}),{verified:false,reason:'tree_index_record'});
});
