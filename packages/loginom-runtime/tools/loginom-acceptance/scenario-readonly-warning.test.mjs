import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {makeReadOnlyWarningAcknowledgement as make} from './scenario-readonly-warning.mjs';
const options={sessionId:'own',documentId:'doc',packagePath:'/mimo/MiMo-case/scenario.lgp'};
function fixture(change={}){
 const text='Пакет "'+options.packagePath+'" открыт только на чтение, потому что он уже открыт другим пользователем, либо к файлу есть доступ только на чтение. Сохранение возможно только под другим именем.';
 const elements={'toast;p.h;p.t':{innerText:change.title??'Предупреждение'},'toast;cnt;cnt;cmp':{innerText:change.text??text},'toast;p.h;close':{}};
 elements.toast={contains:e=>Object.values(elements).includes(e)};
 const document={querySelectorAll:selector=>change.absent?[]:[elements[JSON.parse(selector.slice(10,-1))]].filter(Boolean)};
 const map={FServerConnection:{UserName:change.account??'mimo',Connected:true},PackageNodes:{Count:1,Items:()=>({PackageFileName:change.path??options.packagePath,ReadOnly:change.readonly??true,HasRunningNodes:()=>change.running??false})}};
 const context=vm.createContext({document,location:{origin:'http://10.200.11.224'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}}}});
 vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['x',{request:'{"session":"own"}'}]])}`,context);
 let clicks=0;const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')',context)(arg),locator:()=>({click:async()=>{clicks++},waitFor:async()=>{}})};
 return {run:()=>vm.runInThisContext('('+make(options)+')')(page),clicks:()=>clicks};
}
test('acknowledges exactly the bound read-only notice once',async()=>{const f=fixture();assert.equal((await f.run()).status,'ACKNOWLEDGED');assert.equal(f.clicks(),1)});
test('does not dismiss a changed notice or foreign/active/writable package',async()=>{for(const c of [{text:'Ошибка вычисления'},{title:'Ошибка'},{path:'/mimo/MiMo-other/scenario.lgp'},{account:'other'},{running:true},{readonly:false}]){const f=fixture(c);assert.equal((await f.run()).status,'BLOCKED');assert.equal(f.clicks(),0)}});
test('already expired notice needs no gesture',async()=>{const f=fixture({absent:true});assert.equal((await f.run()).status,'ABSENT');assert.equal(f.clicks(),0)});
