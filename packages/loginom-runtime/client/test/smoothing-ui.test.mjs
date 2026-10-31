import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';
test('smoothing checkbox binds exact cached Usable flag and row ownership',async()=>{
 for(const fault of ['valid','record_changed','flag_changed','duplicate_image','foreign_store']){
  const page=new Page(),base='MF;TF-1;WizrdMCF;SmoothingWizard;';page.context.innerWidth=1000;page.context.innerHeight=800;
  const form=page.add('div','MF;TF-1;WizrdMCF','',{x:10,y:80,width:950,height:600});
  const root=page.add('div',base.slice(0,-1),'',{x:20,y:90,width:900,height:500},form);
  const grid=page.add('div',base+'grdColumnsSettings;tbl','',{x:30,y:100,width:800,height:400},root);grid.id='smoothing-grid';grid.attrs.id=grid.id;
  const row=page.add('table',null,'',{x:35,y:120,width:700,height:30},grid);Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':'0','data-recordid':fault==='record_changed'?'other':'x','data-boundview':grid.id});
  const cell=page.add('td',base+'colUsable_X','',{x:160,y:120,width:100,height:30},row);
  const image=page.add('img',null,'',{x:200,y:125,width:16,height:16},cell);image.attrs.class='x-grid-checkcolumn';
  if(fault==='duplicate_image'){const second=page.add('img',null,'',{x:220,y:125,width:16,height:16},cell);second.attrs.class='x-grid-checkcolumn';}
  const record={isModel:true,internalId:'x',data:{Name:'X',Usable:fault==='flag_changed'}};
  page.context.Ext={getCmp:id=>id===grid.id?{el:{dom:grid},getStore:()=>({$className:fault==='foreign_store'?'Other':'Ext.data.Store',isLoading:()=>false,getData:()=>({items:[record]})})}:undefined};
  const s=await page.observe(),flags=s.ui.elements.filter(e=>e.smoothing_cell?.part==='used');
  assert.equal(s.wizard.stage,'smoothing');assert.equal(flags.length,fault==='valid'?1:0,fault);
  if(fault==='valid'){assert.equal(flags[0].smoothing_cell.record_id,'x');assert.ok(flags[0].allowed_actions.includes('click'));}
 }
});
