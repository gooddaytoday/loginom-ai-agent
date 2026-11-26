import test from 'node:test';
import assert from 'node:assert/strict';
import {createdDatabaseTile,removeCreatedDatabaseTile} from '../lib/imports-database-tile-release.mjs';

const form='MF;TF-1;ConnectionsViewWizard';
const oldTile={Module:'module',Instance:1,label:'SQLite',path:'/own/saved.db',icon:'bg-vendor-icon-sqliteunidacdbconnection'};
const newTile={...oldTile,Instance:2,path:''};
const before=[oldTile],expected=[oldTile,newTile];

test('SQLite deletion requires the one blank native addition, including a same-label existing connection',()=>{
 assert.deepEqual(createdDatabaseTile(before,expected,newTile),newTile);
 assert.equal(createdDatabaseTile(before,expected,oldTile),null);
 assert.equal(createdDatabaseTile(null,expected,newTile),null);
 assert.equal(createdDatabaseTile(before,[newTile],newTile),null);
 assert.equal(createdDatabaseTile(before,[...expected,{...newTile,Instance:3}],newTile),null);
 assert.equal(createdDatabaseTile(before,[{...oldTile,path:'/changed.db'},newTile],newTile),null);
 const saved={...newTile,path:'/own/assigned.db'};
 assert.equal(createdDatabaseTile(before,[oldTile,saved],saved),null);
});

function fixture(t,fault) {
 const calls=[],edges={};
 const record=r=>({data:{Data:{__ObjectId:{Module:r.Module,Instance:r.Instance}},Title:r.label,ConnectionPath:r.path,IconCls:r.icon,Deletable:true}});
 const original=record(oldTile),added=record(newTile);
 let records=[original,added],selection=[fault==='foreign selection'?original:added],windowOpen=false;
 const visible={checkVisibility:()=>true,getBoundingClientRect:()=>({width:10,height:10})};
 const toolbar={...visible,id:'delete',getAttribute:()=>form+';tbrActions;btnDeleteConnection'};
 const yes={...visible,id:'yes',textContent:'Удалить',getAttribute:()=>'msgbox-1;tlb;yes'};
 const text={textContent:'Действительно удалить подключение SQLite?'};
 const dialog={...visible,id:'dialog',contains:e=>e===text||e===yes};
 const modal={el:{dom:dialog},cfg:{},msg:{el:{dom:text}},msgButtons:{yes:{el:{dom:yes},disabled:false}}};
 const root={...visible,isConnected:true,querySelectorAll:()=>[toolbar]};
 const connections={};
 const deleteButton={el:{dom:toolbar},disabled:fault==='disabled'};
 class ConnectionsViewWizard {
  FView={el:{dom:root}};
  FCustomItems={btnDeleteConnection:deleteButton};
  ListView={};
  Store={getRange:()=>records};
 }
 const owner={module:{FConnectionsNode:connections}};
 const controller={Node:{data:{node:connections}},FController:new ConnectionsViewWizard()};
 const components={delete:deleteButton,yes:modal.msgButtons.yes,
  dialog:fault==='foreign dialog'?{}:modal};
 for(const [key,value] of Object.entries({
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}},
   ext:{GetStoreSource:s=>s,GetSelectedGridRecords:()=>selection}},
  document:{querySelectorAll:selector=>{
   if(selector.startsWith('[data-tid='))return [root];
   if(selector==='.x-window')return windowOpen?[dialog]:[];
   if(fault==='visible mask')return [visible];
   if(fault==='zero-area mask')return [{...visible,getBoundingClientRect:()=>({width:0,height:0})}];
   return [];
  }},
  Ext:{Msg:modal,getCmp:id=>components[id]},
 })) {
  const prior=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{configurable:true,value});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,key,prior);else delete globalThis[key];});
 }
 edges.delete=()=>{
  calls.push('open');
  windowOpen=true;
  modal.cfg={title:'Удаление подключения'};
  if(fault==='changed selection')selection=[original];
  if(fault==='changed title')text.textContent='Действительно удалить подключение Другой?';
 };
 edges.yes=()=>{
  calls.push('confirm');
  if(fault==='lost reply')throw Error('click reply lost');
  windowOpen=false;
  records=fault==='changed inventory'?[]:[original];
  selection=[];
 };
 const handle=value=>({value,dispose:async()=>{},evaluate:async fn=>fn(value),getProperty:async key=>handle(value[key]),
  asElement:()=>({click:async()=>edges[value.id](),dispose:async()=>{}})});
 const page={evaluateHandle:async(fn,args)=>handle(fn({...args,opening:args.opening?.value})),
  evaluate:async(fn,args)=>fn(args),locator:()=>({count:async()=>windowOpen?1:0})};
 const release=()=>removeCreatedDatabaseTile(page,{owner,form,before,expected,tile:fault==='unproved'?null:newTile,
  guard:async()=>{},wait:async(label,read)=>{const result=await read();assert.ok(result,label);return result;},remaining:()=>1000});
 return {calls,release,records:()=>records};
}

for(const fault of [undefined,'zero-area mask'])test('SQLite cleanup confirms one native deletion and rereads the original inventory'+(fault?' with a zero-area mask':''),async t=>{
 const f=fixture(t,fault);
 assert.equal(await f.release(),true);
 assert.deepEqual(f.calls,['open','confirm']);
 assert.deepEqual(f.records().map(r=>r.data.Data.__ObjectId.Instance),[oldTile.Instance]);
});

for(const fault of ['unproved','foreign selection','disabled','visible mask'])test('SQLite cleanup keeps the tile before a delete gesture for '+fault,async t=>{
 const f=fixture(t,fault);
 assert.equal(await f.release(),false);
 assert.deepEqual(f.calls,[]);
 assert.equal(f.records().length,2);
});

for(const fault of ['foreign dialog','changed selection','changed title','lost reply','changed inventory'])test('SQLite cleanup blocks release for '+fault,async t=>{
 const f=fixture(t,fault);
 await assert.rejects(f.release());
 assert.deepEqual(f.calls,['lost reply','changed inventory'].includes(fault)?['open','confirm']:['open']);
});
