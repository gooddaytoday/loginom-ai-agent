import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTreeConversionBrowser} from '../lib/tree-conversion-context.mjs';

test('conversion mapping reads the owned live LinkedRecord, not stale SourceName/SourceIndex',()=>{
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;DataToTreeWizard;';
 const field={data:{Name:'OrderID',Value:1,DataType:4}};
 const node=(name,container,array=false)=>({isModel:true,data:{Name:name,DisplayName:name,DataType:4,IsContainer:container,IsArray:array,Node:{},SourceName:'',SourceIndex:-1,LinkedRecord:null},childNodes:[]});
 const root=node('Root',true),items=node('items',true,true),leaf=node('RowID',false);
 root.childNodes=[items];items.parentNode=root;items.childNodes=[leaf];leaf.parentNode=items;leaf.data.LinkedRecord=field;
 const el=id=>({id,checkVisibility:()=>true,contains:()=>true,querySelectorAll:()=>[]});
 const wizard=el('wizard'),tree=el('tree'),fields=el('fields');
 const elements=new Map([[base.slice(0,-1),wizard],[base+'trpDataTree',tree],[base+'grdFields',fields]]);
 const components={tree:{el:{dom:tree},getStore:()=>({isLoading:()=>false,getRoot:()=>({childNodes:[root]})}),getSelection:()=>[]},
  fields:{el:{dom:fields},getStore:()=>({isLoading:()=>false,getRange:()=>[field]})}};
 const read=vm.runInNewContext('('+readTreeConversionBrowser.toString()+')',{
  document:{querySelectorAll:selector=>{const tid=JSON.parse(selector.slice('[data-tid='.length,-1));return elements.has(tid)?[elements.get(tid)]:[];}},Ext:{getCmp:id=>components[id]},
 });
 const mapped=read(prefix);assert.equal(mapped.verified,true);assert.equal(mapped.nodes[2].source_field,'OrderID');
 leaf.data.LinkedRecord={data:{...field.data}};
 assert.equal(read(prefix).verified,false,'a foreign record with identical text is not a binding');
 leaf.data.LinkedRecord=null;
 assert.equal(read(prefix).nodes[2].source_field,'');
 leaf.data.LinkedRecord=field;field.data.DataType=5;
 assert.equal(read(prefix).verified,false,'linked source type must agree with the leaf');
});
