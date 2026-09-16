import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {exportPaletteScroll} from '../lib/text-export-palette.mjs';
const ownerTid='MF;TF-1;ModelForm;pnlVendors;tree',itemTid='MF;TF-1;ModelForm;colVendors_Компоненты>Экспорт>Текстовый_файл;TreeText';
function fixture(){
 let top=0,writes=0;const mode={visible:false,overlay:false,duplicate:false,wrongOwner:false,wrongIcon:false};
 const row={contains:e=>e===item,querySelectorAll:()=>mode.wrongIcon?[]:[{}]},owner={isConnected:true,contains:e=>e===row||e===item,checkVisibility:()=>true,
  getBoundingClientRect:()=>({x:10,y:100,width:280,height:600,right:290,bottom:700}),clientHeight:600,scrollHeight:2001,
  get scrollTop(){return top;},set scrollTop(v){writes++;top=v;}};
 const item={textContent:'Текстовый файл',checkVisibility:()=>true,closest:()=>null,contains:e=>e===item,getBoundingClientRect:()=>({x:50,y:(mode.visible?200:1800)-top,width:100,height:20})};
 const document={querySelectorAll:selector=>selector.includes(';TreeText')?(mode.duplicate?[item,item]:[item]):selector.includes('pnlVendors')?(mode.wrongOwner?[{}]:[owner]):[row],elementFromPoint:(x,y)=>mode.overlay?{}:y===item.getBoundingClientRect().y+10?item:owner};
 const run=args=>vm.runInNewContext('('+exportPaletteScroll.toString()+')(owner,args)',{document,innerWidth:1508,innerHeight:862,owner,args:{owner_tid:ownerTid,item_tid:itemTid,...args}});
 return {mode,run,writes:()=>writes,owner};
}
test('offscreen export scrolls its exact owner once; visible item stays in place',()=>{
 const f=fixture(),before=f.run({});assert.equal(before.visible,false);const moved=f.run({before,apply:true});assert.equal(moved.after,before.to);assert.equal(f.writes(),1);
 const visible=fixture();visible.mode.visible=true;assert.equal(visible.run({}).visible,true);assert.equal(visible.writes(),0);
});
test('palette refuses foreign, duplicate, covered, stale and excessive scroll owners',()=>{
 for(const kind of ['overlay','duplicate','wrongOwner','wrongIcon']){const f=fixture();f.mode[kind]=true;assert.throws(()=>f.run({}));assert.equal(f.writes(),0);}
 const stale=fixture(),before=stale.run({});stale.mode.visible=true;assert.throws(()=>stale.run({before,apply:true}));assert.equal(stale.writes(),0);
 const huge=fixture();huge.owner.scrollHeight=99999;assert.throws(()=>huge.run({}));assert.equal(huge.writes(),0);
});
