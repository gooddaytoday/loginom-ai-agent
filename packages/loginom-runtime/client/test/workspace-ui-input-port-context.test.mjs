import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {NavigationPage} from './fixtures/navigation/ui-page.mjs';
import {nativePage} from './fixtures/navigation/native-page.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('./fixtures/input-port-context/'+n,import.meta.url)));
const proof=read('native-node-context.json'),geometry=read('navigation-geometry.json'),observed=read('mapping-observation.json').output;
async function run(mode){
 const f=nativePage(),page=new NavigationPage(),binding=structuredClone(proof.binding),prefix=binding.workflow_ref.prefix;
 page.context.innerWidth=geometry.viewport.width;page.context.innerHeight=geometry.viewport.height;
 page.document.documentElement.box={x:0,y:0,width:1280,height:800};page.document.body.box=page.document.documentElement.box;
 Object.assign(f.binding,binding);f.prep.id=binding.document_id;f.prep.document=page.document;
 f.record.workflowId=binding.workflow_ref.workflow_id;f.record.crumbs=structuredClone(binding.workflow_ref.navigation_path);f.record.tab=page.tab;
 page.tab.attrs['data-tid']=binding.workflow_ref.tab_tid;
 f.node.FGuid=binding.node.node_id;f.pkg.PackageName=binding.workflow_ref.navigation_path[2].label;f.pkg.PackageFileName=observed.package_identity.path;
 f.main.FMapTree.FServerConnection.UserName='lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e';
 page.context.bg=f.context.bg;page.context.Ext=f.context.Ext;page.context.__loginomDockPreparationV1=f.prep;
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',page.context);
 page.execute=async options=>JSON.parse(JSON.stringify(await vm.runInContext('('+makeWorkspaceUiCode({expected_build:'7.4.2',expected_origin:'https://loginom.test',prepared_node_context:binding,...options})+')',page.context)(page)));
 const panel=page.add('div',prefix+';NavigationBar;'+(mode==='panel_alias'?'NavPanel':'NavigationPanel'),'',geometry.panels[0].box);
 const addCrumb=(c,i,native)=>{const e=page.add('a',c.tid,c.text??c.label,c.box??{x:190+i*120,y:41,width:100,height:24},panel);e.id='native-crumb-'+i;f.components.set(e.id,{el:{dom:e},_node:{data:{node:native}}});const cls={4:'maptree-icon-workflow',5:'bg-vendor-icon-replacement',8:'maptree-icon-wizard'}[i];if(cls)page.add('span',null,'',{x:e.box.x+1,y:e.box.y+1,width:16,height:16},e).attrs.class=cls;return e;};
 binding.workflow_ref.navigation_path.forEach((c,i)=>addCrumb(c,i,f.native[i]));
 const graph=page.add('div',prefix+';ModelForm;cmpDiagram');const body=page.add('g',prefix+';Graph;NullDiagnostic','',undefined,graph);
 f.graph.FDiagram.FNodes.FCollection[0].FGuid=binding.node.node_id;f.graph.FDiagram.FmxGraph.container=graph;f.graph.FDiagram.FmxGraph.view.getState=()=>({shape:{node:body}});
 assert.equal((await readPreparedNodeContext(page,binding)).verified,true); // captures real navigation baseline
 graph.remove();panel.children.slice().forEach(e=>e.remove());
 class ModelInputPortsTreeNode{};class ModelPortTreeNode{};class WizardModelComponentForm{};
 Object.assign(page.context.bg.app,{ModelInputPortsTreeNode,ModelPortTreeNode});
 const group=Object.assign(new ModelInputPortsTreeNode(),{ParentNode:f.node});
 const pt=Object.assign(new ModelPortTreeNode(),{ParentNode:group,FIndex:0,FModelNodePort:{}});
 const wn=Object.assign(new page.context.bg.app.WizardTreeNode(),{ParentNode:pt});
 const form=page.add('div',prefix+';WizrdMCF','',{x:182,y:75,width:1054,height:700});
 const model=Object.assign(new WizardModelComponentForm(),{FModelSocket:{},FView:{el:{dom:form}}});f.controller.Node.data.node=wn;f.controller.FController=model;
 const node={FGuid:binding.node.node_id,data:f.node.FModelNode},port={data:pt.FModelNodePort,parent:node,FPortIndex:0,FGuid:proof.result.input_port.port_guid};
 f.prep.inputPortOpenReceipts=new Map([['open',{phase:'verified',direction:'input',document_id:binding.document_id,workflow_id:binding.workflow_ref.workflow_id,node_id:binding.node.node_id,wizard:model,nodeTree:f.node,portTree:pt,workflow:f.flow,packageNode:f.pkg,node,port,nodeData:node.data,portData:port.data,portGuid:port.FGuid,nativeIndex:0,portIndex:0,enginePort:model.FModelSocket,operation_id:proof.result.input_port.opening_operation_id}]]);
 const natives=[...f.native.slice(0,6),group,pt,wn];
 geometry.breadcrumbs.forEach((original,i)=>{const c=structuredClone(original);if(mode==='hidden_workflow'&&i===4||mode==='hidden_node'&&i===5)c.box={x:0,y:0,width:0,height:0};if(mode==='folder_visible'&&i===6||mode==='all_visible'&&i>=6)c.box={x:1096+(i-6)*40,y:41,width:39,height:24};addCrumb(c,i,natives[i]);});
 const stem=prefix+';WizrdMCF;TuneDataSourceMappingWizard;';
 page.add('button',stem+'btnAddMappingColumn','',{x:200,y:120,width:25,height:25},form);
 for(const [i,key] of ['rbLinks','rbTable'].entries()){const wrap=page.add('div',stem+key,'',{x:300+i*150,y:120,width:140,height:25},form);wrap.attrs.class='x-form-type-radio'+(key==='rbTable'?' x-form-cb-checked':'');page.add('input',stem+key+';InputEl','',{x:301+i*150,y:121,width:16,height:16},wrap).attrs.type='radio';}
 const auto=page.add('button',stem+'btnAutoSyncThroughColumns','',{x:240,y:120,width:25,height:25},form);auto.attrs.class='x-btn-pressed';
 for(const [i,field] of observed.wizard.output_columns.fields.entries()){
  const row=page.add('table',null,'',{x:200,y:200+i*30,width:800,height:25},form);
  for(const [j,[suffix,text]] of [['colSourceDisplayName_',field.name],['colName_',field.name],['colDisplayName_',field.label],['colDataKind_',field.data_kind],['colUsageType_',field.usage]].entries()){
   const cell=page.add('td',stem+suffix+field.name,text,{x:200+j*150,y:200+i*30,width:140,height:25},row);
   if(j===0||j===2)page.add('span',null,'',{x:201+j*150,y:201+i*30,width:16,height:16},cell).attrs.class='bg-TBGDataType-dt'+({integer:'Integer',string:'String',real:'Float'}[field.type]);
  }
 }
 page.add('button',prefix+';WizrdMCF;btnDone','Готово',{x:1050,y:720,width:100,height:25},form);
 if(mode==='foreign_port')pt.FIndex=1;
 if(mode==='path_mismatch')panel.children[2].ownText='foreign';
 if(mode==='foreign_account')f.main.FMapTree.FServerConnection.UserName='foreign';
 if(mode==='foreign_path')f.pkg.PackageFileName='/foreign/package.lgp';
 if(mode==='foreign_connection')f.main.FMapTree.FServerConnection={UserName:f.main.FMapTree.FServerConnection.UserName};
 if(mode==='foreign_node')f.node.FGuid='foreign';
 if(mode==='missing_owner')f.prep.inputPortOpenReceipts.clear();
 if(mode==='ambiguous_owner')f.prep.inputPortOpenReceipts.set('duplicate',{...f.prep.inputPortOpenReceipts.get('open')});
 if(mode==='foreign_parent')group.ParentNode=f.native[4];
 if(mode==='duplicate_panel')page.add('div',prefix+';NavigationBar;NavigationPanel','',geometry.panels[0].box);
 if(mode==='bad_folder_caption')panel.children[6].ownText='Other';
 if(mode==='broken_chain')panel.children[6].attrs['data-tid']=prefix+';cnrNaviMode;b.s_Other';
 const native=await readPreparedNodeContext(page,binding);const receipt=await page.execute({mode:'observe'});
 const s=receipt.output,done=s?.ui?.elements.find(e=>e.tid===prefix+';WizrdMCF;btnDone');
 const actual={native,receipt_status:receipt.status,error:receipt.error,wizard:s?.wizard,done:done&&{enabled:done.enabled,interaction:done.interaction,allowed_actions:done.allowed_actions},events:page.events};
 assert.equal(page.events.length,0);
 return {native,receipt,done,events:page.events};
}
const rejectedNative=['foreign_port','path_mismatch','foreign_account','foreign_path','foreign_connection','foreign_node','missing_owner','ambiguous_owner','foreign_parent'];
const rejectedObserver=['hidden_workflow','hidden_node','duplicate_panel','bad_folder_caption','panel_alias','broken_chain'];
for(const mode of ['captured_hidden','folder_visible','all_visible',...rejectedNative,...rejectedObserver])test('native input-port structural breadcrumb: '+mode,async()=>{
 const {native,receipt,done,events}=await run(mode);
 assert.equal(events.length,0);
 if(rejectedNative.includes(mode)){assert.equal(native.verified,false);assert.notEqual(receipt.status,'SUCCEEDED');return;}
 assert.equal(native.verified,true);assert.deepEqual(JSON.parse(JSON.stringify(native.input_port)),proof.result.input_port);
 assert.equal(receipt.status,'SUCCEEDED');
 if(rejectedObserver.includes(mode))assert.notEqual(receipt.output.wizard.input_port_context.status,'observed');
 else assert.equal(receipt.output.wizard.input_port_context.status,'observed');
 assert.equal(done.allowed_actions.includes('finish_wizard'),false);
 assert.equal(receipt.output.wizard.input_mapping.reason,'links_mode_unverified');
});
test('observer lost reply never repeats a gesture',async()=>{
 let calls=0;const read=async()=>{calls++;const result=await run('captured_hidden');assert.equal(result.events.length,0);throw Error('lost reply')};
 await assert.rejects(read(),/lost reply/);assert.equal(calls,1);
});
