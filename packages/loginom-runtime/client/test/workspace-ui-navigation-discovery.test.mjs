import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NavigationPage} from './fixtures/navigation/ui-page.mjs';
import {nativePage} from './fixtures/navigation/native-page.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {openPreparedWizard} from '../lib/node-wizard-open.mjs';
const identity=JSON.parse(readFileSync(new URL('./fixtures/navigation/panel-identity.json',import.meta.url)));
const saved=JSON.parse(readFileSync(new URL('./fixtures/navigation/saved-package-after.json',import.meta.url)));
function fixture(mode){
 const page=new NavigationPage(),tid=mode==='legacy'?identity.legacy_panel_tid:identity.panel_tid;
 const panel=page.add('div',mode==='foreign_tab'?tid.replace('TF-1','TF-2'):tid);
 if(mode==='duplicate_panel')page.add('div',tid);
 if(mode==='both_aliases')page.add('div',identity.legacy_panel_tid);
 const wizard=page.add('div','MF;TF-1;WizrdMCF');page.add('button','MF;TF-1;WizrdMCF;CalcDataWizard;btnAddExpr','',undefined,wizard);
 for(const [index,c] of saved.crumbs.entries()){
  if(mode==='missing'&&index===3)continue;
  const crumb=page.add('a',mode==='broken_chain'&&index===3?'MF;TF-1;cnrNaviMode;b.s_Other':c.tid,c.label,undefined,panel);
  if(index===4)page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
  if(index===5)page.add('span',null,'',undefined,crumb).attrs.class='bg-vendor-icon-calcdata';
  if(index===6)page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-wizard';
  if(mode==='duplicate_crumb'&&index===5)page.add('a',c.tid,c.label,undefined,panel);
 }
 if(mode==='bounded')for(let i=0;i<33;i++)page.add('a','MF;TF-1;cnrNaviMode;b.s_extra'+i,'Extra',undefined,panel);
 return page;
}
for(const mode of ['native','legacy','foreign_tab','duplicate_panel','both_aliases','missing','broken_chain','duplicate_crumb','bounded'])test('navigation owner discovery: '+mode,async()=>{
 const page=fixture(mode),full=await page.observe(),narrow=await page.execute({mode:'observe',root_ref:full.wizard.root_ref});
 assert.deepEqual(narrow.output.wizard.owner_context,full.wizard.owner_context);
 const owner=full.wizard.owner_context;
 if(['native','legacy'].includes(mode)){assert.equal(owner.status,'observed');assert.equal(owner.opening_verified,false);assert.deepEqual(owner.path.map(({tid,label})=>({tid,label})),saved.crumbs.map(({tid,label})=>({tid,label})));}
 else assert.notEqual(owner.status,'observed');
});
for(const fault of [null,'document','workflow','node','label','proof','lost_reply'])test('native panel through real wizard helper: '+fault,async()=>{
 const f=nativePage(),before=await readPreparedNodeContext(f.page,f.binding);let state={prepared_node_context:before,wizard:{status:'absent'},ui:{elements:[{tid:before.tid+';Setting',ref:'settings',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'NavigationDiagnostic'},workflow_path:f.binding.workflow_ref.navigation_path}},{tid:before.tid+';Label;Label',graph_node:{part:'label'},label:'NavigationDiagnostic'}]}};let gestures=0;
 const channel={observe:async()=>state,perform:async()=>{gestures++;f.enterWizard();const ui=await fixture('native').observe();state={prepared_node_context:await readPreparedNodeContext(f.page,f.binding),wizard:ui.wizard,ui:{elements:[]}};
  if(['document','workflow','node'].includes(fault))state.prepared_node_context[fault+'_id']='foreign';
  if(fault==='label')state.wizard.owner_context.node.label='Foreign';
  if(fault==='proof')delete state.prepared_node_context.navigation_rebinding;
  if(fault==='lost_reply')throw Error('reply lost');
 }};
 if(fault)await assert.rejects(openPreparedWizard(channel));else assert.equal((await openPreparedWizard(channel)).verified,true);
 assert.equal(gestures,1);
});
