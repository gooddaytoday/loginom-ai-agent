import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';
test('sliding window exposes only its own native row Apply/Cancel controls',async()=>{
 for(const fault of ['valid','foreign','hidden_editor','duplicate']){
  const page=new Page(),base='MF;TF-1;WizrdMCF;SlidingWindowWizard;';
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const form=page.add('div','MF;TF-1;WizrdMCF','',{x:10,y:80,width:950,height:600});
  const root=page.add('div',base.slice(0,-1),'',{x:20,y:90,width:900,height:500},form);
  const grid=page.add('div',base+'grdColumns','',{x:30,y:100,width:800,height:400},root);
  page.add('div',base+'grdColumns;tbl','',{x:35,y:105,width:790,height:300},grid);
  const editor=page.add('div',base+'grdColumns;roweditor','',{x:40,y:120,width:700,height:60},grid);
  if(fault==='hidden_editor')editor.style.display='none';
  const parent=fault==='foreign'?root:grid;
  page.add('div','roweditorbuttons;update','Применить',{x:400,y:200,width:90,height:25},parent);
  if(fault==='duplicate')page.add('div','roweditorbuttons;update','Применить',{x:500,y:200,width:90,height:25},parent);
  const s=await page.observe(),buttons=s.ui.elements.filter(e=>e.tid==='roweditorbuttons;update');
  assert.equal(s.wizard.stage,'sliding_window');
  assert.equal(buttons.length,fault==='valid'?1:0,fault);
  if(fault==='valid')assert.ok(buttons[0].allowed_actions.includes('click'));
 }
});
