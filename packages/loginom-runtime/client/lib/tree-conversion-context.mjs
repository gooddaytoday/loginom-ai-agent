// Read cached wizard controls and tree records; all mutations use the existing
// observed UI channel. No server proxy or native handler is called here.
export function readTreeConversionBrowser(prefix){
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
 const roots=['DataToTreeWizard','TreeToJSONWizard'].flatMap(kind=>exact(prefix+';WizrdMCF;'+kind).filter(visible).map(root=>({root,kind})));
 if(!roots.length)return {applicable:false};
 const need=(ok,m)=>{if(!ok)throw Error(m);};
 try{
  need(roots.length===1,'tree_conversion_root');const {root,kind}=roots[0],base=prefix+';WizrdMCF;'+kind+';';
  const cmp=(tid,owner=root)=>{const all=exact(tid),c=all.length===1&&Ext.getCmp(all[0].id);need(all.length===1&&owner.contains(all[0])&&c?.el?.dom===all[0],'tree_conversion_control');return c;};
  const bool=key=>{const c=cmp(base+key+';ValueControl'),value=c.getValue();need(typeof value==='boolean'&&value===c.el.dom.classList.contains('x-form-cb-checked'),'tree_conversion_checkbox');return value;};
  if(kind==='TreeToJSONWizard')return {applicable:true,verified:true,inventory_complete:true,kind:'tree_to_json',base,
   exclude_root:bool('pedRootExcluded'),pretty:bool('pedPrettifyJSON'),keys:bool('pedDisplayNameAsKey')?'labels':'names',multi_row:bool('pedMultiRowOutput'),datetime:bool('pedDateTimeIsISO8601')?'iso8601':'unsupported'};
  const tree=cmp(base+'trpDataTree'),store=tree.getStore(),nativeRoot=store.getRoot(),fields=cmp(base+'grdFields').getStore();
  need(!store.isLoading()&&!fields.isLoading()&&nativeRoot.childNodes.length===1,'tree_conversion_store');
  const sourceRecords=fields.getRange();
  const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},nodes=[],records=new Set();
  const pointer=v=>v.replaceAll('~','~0').replaceAll('/','~1');
  const walk=(r,parent,path,depth)=>{
   need(depth<=16&&nodes.length<64&&!records.has(r)&&r.isModel&&Array.isArray(r.childNodes),'tree_conversion_structure');records.add(r);
   const d=r.data;need(typeof d.Name==='string'&&typeof d.IsArray==='boolean'&&typeof d.IsContainer==='boolean','tree_conversion_node');
   const linked=d.LinkedRecord;
   if(!d.IsContainer)need(linked==null?d.SourceName===''&&d.SourceIndex===-1:sourceRecords.includes(linked)
    &&typeof linked.data.Name==='string'&&Number.isInteger(linked.data.Value)&&linked.data.DataType===d.DataType,'tree_conversion_source_binding');
   const next=parent===null?'':path+'/'+pointer(d.Name),index=nodes.length;
   const row=[...tree.el.dom.querySelectorAll('[data-recordid]')].filter(e=>e.getAttribute('data-recordid')===String(r.internalId));
   const tids=row.flatMap(e=>[...e.querySelectorAll('[data-tid]')].map(e=>e.getAttribute('data-tid')));
   const texts=tids.filter(t=>t.endsWith(';TreeText'));
   nodes.push({path:next,name:d.Name,label:d.DisplayName,type:d.IsContainer?'object':types[d.DataType]??'unsupported',is_array:d.IsArray,
    ...(!d.IsContainer?{source_field:linked?.data.Name??''}:{}),index,parent,record_id:String(r.internalId),
    ...(texts.length===1?{tid:texts[0]}:{}),delete_tid:tids.find(t=>t.includes(';colDelete_'))??null});
   for(const child of r.childNodes){need(child.parentNode===r,'tree_conversion_parent');if(!child.data.Node)continue;walk(child,index,next,depth+1);}
  };
  walk(nativeRoot.childNodes[0],null,'',0);
  const source_fields=sourceRecords.map(r=>{const d=r.data;need(typeof d.Name==='string'&&Number.isInteger(d.Value),'tree_conversion_field');return {name:d.Name,type:types[d.DataType]??'unsupported',tid:base+'colFields_'+d.Value};});
  const selected=tree.getSelection().map(r=>String(r.internalId)),forms=exact('EditDataTreeNodeDefForm').filter(visible);
  need(forms.length<=1,'tree_conversion_editor_count');let editor=null;
  if(forms.length){
   const form=Ext.getCmp(forms[0].id),controller=form?.Controller;
   need(form?.el?.dom===forms[0]&&form.$className==='bg.wizards.datatree.view.EditDataTreeNodeDefForm'&&controller?.FView===form
    &&records.has(controller.Record)&&selected.length===1&&nodes.some(n=>n.record_id===selected[0])
    &&['btnAddChild','btnAddSibling','btnEdit'].some(k=>form.previousFocus?.el?.dom===cmp(base+k).el.dom),'tree_conversion_editor_owner');
   const field=k=>{const c=cmp('EditDataTreeNodeDefForm;'+k,forms[0]);return c.getValue();};
   editor={root_tid:'EditDataTreeNodeDefForm',portal_bound:true,selected_record_id:selected[0],add:controller.FAddMode===true,
    name:field('edtName'),label:field('edtDisplayName'),type:types[field('cbxDataType')]??'unsupported',
    is_array:field('chbIsArray'),is_container:field('chbIsContainer')};
  }
  const messages=exact('msgbox;cnt;cnt;cmp').filter(visible),selectedNode=nodes.find(n=>n.record_id===selected[0]);
  const delete_confirmation=messages.length===1&&selected.length===1&&selectedNode?.path
   &&messages[0].textContent.trim()==='Вы действительно хотите удалить узел "'+selectedNode.label+'" вместе с дочерними узлами?'
   &&exact('msgbox;tlb;yes').filter(visible).length===1?{root_tid:'msgbox',path:selectedNode.path,selected_record_id:selected[0]}:null;
  return {applicable:true,verified:true,inventory_complete:true,kind:'table_to_tree',base,nodes,source_fields,selected,editor,delete_confirmation};
 }catch(error){return {applicable:true,verified:false,reason:error.message};}
}
