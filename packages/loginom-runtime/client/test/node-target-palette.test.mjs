import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
const prefix='MF;TF-1;ModelForm;colVendors_Компоненты>';
for(const [type,path] of [
 ['imports.text','Импорт>Текстовый_файл'],
 ['transform.calculator','Трансформация>Калькулятор'],
 ['preprocessing.data_recovery','Предобработка>Заполнение_пропусков'],
])test('native palette preflight resolves the actual group for '+type,async()=>{
 const seen=[];let scrolled=false;
 const page={locator:selector=>({scrollIntoViewIfNeeded:async()=>{scrolled=true;},evaluate:async()=>{assert.equal(scrolled,true);return true;},evaluateAll:async read=>{
  seen.push(selector);
  return read(selector==='[data-tid='+JSON.stringify(prefix+path+';TreeText')+']'?[{getBoundingClientRect:()=>({width:120}),closest:()=>null}]:[]);
 }})};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',pinned:{},
  execute:code=>new Function('page','return ('+code+')(page)')(page)});
 await adapter.preflight({target:{kind:'new',type},workflow_ref:{prefix:'MF;TF-1'},inputs:[]},{interaction_ready:true},Date.now()+5000);
 assert.equal(seen.length,1);
});
test('a disabled preprocessing component is refused before any graph mutation',async()=>{
 const page={locator:()=>({evaluateAll:read=>read([{getBoundingClientRect:()=>({width:120}),closest:()=>({disabled:true})}])})};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',pinned:{},
  execute:code=>new Function('page','return ('+code+')(page)')(page)});
 await assert.rejects(adapter.preflight({target:{kind:'new',type:'preprocessing.data_recovery'},workflow_ref:{prefix:'MF;TF-1'},inputs:[]},{interaction_ready:true},Date.now()+5000),/Component unavailable/);
});
