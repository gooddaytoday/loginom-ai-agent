import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {runtimeImport} from './runtime-import.mjs';
import {NavigationPage} from './ui-page.mjs';
import {nativePage} from './native-page.mjs';
const {makeWorkspaceUiCode,validateUiAction}=await runtimeImport('workspace-ui.mjs');
const {readPreparedNodeContext}=await runtimeImport('node-context.mjs');
const read=n=>JSON.parse(fs.readFileSync(new URL('./'+n,import.meta.url)));
const proof=read('native-node-context.json'),geometry=read('navigation-geometry.json'),observed=read('mapping-observation.json').output;
export async function captureFixture(mode="full"){
 const f=nativePage(),page=new NavigationPage(),binding=structuredClone(proof.binding),prefix=binding.workflow_ref.prefix;
 page.context.innerWidth=geometry.viewport.width;page.context.innerHeight=geometry.viewport.height;
 page.document.documentElement.box={x:0,y:0,width:1280,height:800};page.document.body.box=page.document.documentElement.box;
 Object.assign(f.binding,binding);f.prep.id=binding.document_id;f.prep.document=page.document;
 f.record.request=JSON.stringify({type:'transform.replace_columns',document_id:binding.document_id,node_id:binding.node.node_id});f.record.workflowId=binding.workflow_ref.workflow_id;f.record.crumbs=structuredClone(binding.workflow_ref.navigation_path);f.record.tab=page.tab;
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
 geometry.breadcrumbs.forEach((original,i)=>{const c=structuredClone(original);if(i>=6)c.box={x:1096+(i-6)*40,y:41,width:39,height:24};addCrumb(c,i,natives[i]);});
 const stem=prefix+';WizrdMCF;TuneDataSourceMappingWizard;';
 page.add('button',stem+'btnAddMappingColumn','',{x:200,y:120,width:25,height:25},form);
 for(const [i,key] of ['rbLinks','rbTable'].entries()){const wrap=page.add('div',stem+key,'',{x:300+i*150,y:120,width:140,height:25},form);wrap.attrs.class='x-form-type-radio'+(key==='rbTable'?' x-form-cb-checked':'');page.add('input',stem+key+';InputEl','',{x:301+i*150,y:121,width:16,height:16},wrap).attrs.type='radio';}
 const auto=page.add('button',stem+'btnAutoSyncThroughColumns','',{x:240,y:120,width:25,height:25},form);auto.attrs.class='x-btn-pressed';

 const bodyGrid=page.add('div',stem+'grdTargetColumns;tbl','',{x:200,y:200,width:800,height:125},form);
 bodyGrid.attrs.id='diagnostic-target';Object.assign(bodyGrid,{clientWidth:800,scrollWidth:800,clientHeight:125,scrollHeight:125,scrollLeft:0,scrollTop:0});
 const container=page.add('div',null,'',bodyGrid.box,bodyGrid);container.attrs.class='x-grid-item-container';
 const filter=page.add('div',stem+'TargetFilter','',{x:200,y:160,width:300,height:25},form);
 page.add('input',stem+'TargetFilter;InputEl','',{x:201,y:161,width:298,height:23},filter).value='';
 for(const [i,field] of observed.wizard.output_columns.fields.entries()){
  const row=page.add('table',null,'',{x:200,y:200+i*25,width:800,height:25},container);
  Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':String(i),'data-boundview':'diagnostic-target'});
  for(const [j,[suffix,text]] of [['colSourceDisplayName_',field.name],['colName_',field.name],['colDisplayName_',field.label],['colDataKind_',field.data_kind],['colUsageType_',field.usage]].entries()){
   const cell=page.add('td',stem+suffix+field.name,text,{x:200+j*150,y:200+i*25,width:140,height:25},row);
   if(j===0||j===2)page.add('span',null,'',{x:201+j*150,y:201+i*25,width:16,height:16},cell).attrs.class='bg-TBGDataType-dt'+({integer:'Integer',string:'String',real:'Float'}[field.type]);
  }
 }
 page.add('button',prefix+';WizrdMCF;btnDone','Готово',{x:1050,y:720,width:100,height:25},form);

 if(mode==='foreign')pt.FIndex=1;
 if(mode==='partial')container.children[0].attrs['data-boundview']='foreign';
 if(mode==='filter')filter.children[0].value='Id';
 if(mode==='window')bodyGrid.scrollHeight=200;
 if(mode==='links')for(const e of form.children.filter(e=>e.attrs['data-tid']?.endsWith(';rbTable')))e.attrs.class='x-form-type-radio';
 return {page,binding,f,form,bodyGrid,container,filter,proof,packagePath:observed.package_identity.path,port:pt};
}
