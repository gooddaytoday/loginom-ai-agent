// Owned native-cache observer for the two JavaScript wizard pages. A missing
// cache contract is a refusal with inventory, never permission to read a proxy.
export function readJavascriptSchema({root,native,binding,prefix}) {
  try {
  const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  if(tab!==binding.tab||tab.Controller.Node?.data?.node!==native||tab.Controller.FController?.FModelNode!==binding.nodeData
    ||tab.Controller.FController?.FView?.el?.dom!==root||!root.isConnected)throw Error('JavaScript schema owner changed');
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const all=[...root.querySelectorAll('[data-tid]')];
  const forms=['TuneDataSourceInputPortWizard','JavaScriptColumnsWizard'];
  const pages=all.filter(e=>forms.some(form=>e.getAttribute('data-tid')===prefix+';WizrdMCF;'+form)&&visible(e));
  if(pages.length!==1)throw Error('Unique JavaScript schema page required');
  const page=pages[0],base=page.getAttribute('data-tid'),form=base.split(';').at(-1);
  const exact=suffix=>all.filter(e=>e.getAttribute('data-tid')===base+';'+suffix&&page.contains(e));
  const inventory={form,page_tid:base,verified:false,grids:[],controls:[],generation:null};
  for(const element of [...page.querySelectorAll('[data-tid$=";tbl"]')]) {
    const view=globalThis.Ext?.getCmp?.(element.id),store=view?.getStore?.();
    if(view?.el?.dom!==element||store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.())throw Error('JavaScript schema store is unavailable');
    const data=store.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
    if(!Array.isArray(records)||records.length>64||store.getCount()!==records.length||store.getTotalCount()!==records.length
      ||source&&(!Array.isArray(source)||source.length!==records.length||source.some(r=>!records.includes(r))))throw Error('JavaScript schema cache is filtered or incomplete');
    const ids=new Set();
    const fields=records.map(record=>{
      if(!record?.isModel||!record.data||ids.has(String(record.internalId)))throw Error('JavaScript schema record identity invalid');
      ids.add(String(record.internalId));
      // Ext model data is a local cache, unlike FModelNode/FModelNodePort.
      const descriptors=Object.getOwnPropertyDescriptors(record.data);
      const scalars=Object.fromEntries(Object.entries(descriptors).filter(([,d])=>d.value===null||['string','number','boolean'].includes(typeof d.value)).map(([key,d])=>[key,d.value]));
      const connected=descriptors.ConnectedRecord?.value;
      return {record_id:String(record.internalId),...scalars,connected_record_id:connected?String(connected.internalId):null,
        connected_back_id:connected?.data?.ConnectedRecord?String(connected.data.ConnectedRecord.internalId):null};
    });
    inventory.grids.push({tid:element.getAttribute('data-tid'),store_class:store.$className,total:store.getTotalCount(),count:records.length,fields});
  }
  for(const suffix of ['btnAutoSyncThroughColumns','btnAddMappingColumn','btnEditMappingColumn']) {
    const elements=exact(suffix);
    if(elements.length>1)throw Error('JavaScript schema control is ambiguous');
    if(elements.length) {
      const control=globalThis.Ext?.getCmp?.(elements[0].id);
      if(control?.el?.dom!==elements[0])throw Error('JavaScript schema control binding missing');
      inventory.controls.push({tid:base+';'+suffix,disabled:control.disabled===true,visible:visible(elements[0]),pressed:typeof control.pressed==='boolean'?control.pressed:null});
    }
  }
  if(form==='JavaScriptColumnsWizard') {
    const es=exact('BooleanPropEdit;ValueControl'),control=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);
    const input=exact('BooleanPropEdit;ValueControl;InputEl'),display=exact('BooleanPropEdit;ValueControl;DisplayEl');
    if(es.length!==1||input.length!==1||display.length!==1||control?.el?.dom!==es[0]||control.inputEl?.dom!==input[0]
      ||typeof control.checked!=='boolean'||control.checked!==es[0].classList.contains('x-form-cb-checked'))throw Error('JavaScript generation checkbox binding unavailable');
    inventory.generation={checked:control.checked,disabled:control.disabled===true,tid:display[0].getAttribute('data-tid')};
  }
  const target=inventory.grids.filter(grid=>grid.tid===base+';grdTargetColumns;tbl');
  if(target.length!==1)throw Error('JavaScript target schema unavailable');
  const names=new Set();
  if(target[0].fields.some((field,i)=>typeof field.Name!=='string'||!field.Name||names.has(field.Name)
    ||(names.add(field.Name),false)||![1,2,3,4,5,6].includes(field.DataType)||field.Index!==i
    ||typeof field.Required!=='boolean'||field.Broken===true))return {...inventory,reason:'native_field_contract_unconfirmed'};
  const sourceGrids=inventory.grids.filter(grid=>grid.tid===base+';grdSourceColumns;tbl');
  if(sourceGrids.length>1)return {...inventory,reason:'source_grid_ambiguous'};
  if(sourceGrids.length===1){
    const sources=sourceGrids[0].fields,targets=target[0].fields;
    if([...sources,...targets].some(field=>field.connected_record_id!==null&&field.connected_back_id!==field.record_id)
      ||sources.some(field=>field.connected_record_id!==null&&!targets.some(t=>t.record_id===field.connected_record_id&&t.connected_record_id===field.record_id))
      ||targets.some(field=>field.connected_record_id!==null&&!sources.some(s=>s.record_id===field.connected_record_id&&s.connected_record_id===field.record_id)))
      return {...inventory,reason:'mapping_reciprocity_unconfirmed'};
  }
  inventory.mapping_reciprocity_verified=sourceGrids.length===1;
  inventory.inventory_complete=true;inventory.verified=true;return inventory;
  } catch(error) {
    // Diagnostic data remains unusable for mutation. Preserve bounded cached
    // shapes so a refused native binding does not require a blind second run.
    const elements=root?.isConnected?[...root.querySelectorAll('[data-tid$=";tbl"]')].slice(0,4):[];
    return {verified:false,reason:String(error.message),diagnostic_only:true,grids:elements.map(element=>{
      const view=globalThis.Ext?.getCmp?.(element.id),store=view?.store;
      const records=store?.data?.items;
      return {tid:element.getAttribute('data-tid'),view_class:view?.$className??null,store_class:store?.$className??null,
        view_bound:view?.el?.dom===element,current_page:store?.currentPage??null,total:store?.totalCount??null,
        records:Array.isArray(records)?records.slice(0,8).map(record=>({id:String(record.internalId),
          fields:Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(record.data??{})).slice(0,48)
            .map(([key,d])=>[key,d.value===null?null:['boolean','number'].includes(typeof d.value)?d.value:typeof d.value==='string'?d.value.slice(0,240):typeof d.value]))})):null};
    })};
  }
}

