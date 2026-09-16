// Local assembly of addressed native definition pages. UI gestures and source
// bytes stay outside this helper; output paging uses guarded native scrolling.
export async function readImportDefinitionPages(channel,{expectedCount,ready=()=>true}={}) {
  return readDefinitionPages(channel,{expectedCount,ready,output:false});
}

export async function readOutputDefinitionPages(channel,{expectedCount,ready=()=>true}={}) {
  return readDefinitionPages(channel,{expectedCount,ready,output:true});
}

async function readDefinitionPages(channel,{expectedCount,ready,output}) {
  if(expectedCount!==undefined&&(!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>1000))
    throw new Error('Expected import definition count must be within 1–1000');
  const fields=[];let schemaId=null,total=null,offset=0;
  for(let pageNumber=0;pageNumber<125;pageNumber++) {
    const columnKey=output?'output_columns':'import_columns';
    let state=await channel.observe({condition:'complete '+(output?'output':'import')+' definition page at '+offset,
      [output?'outputColumnPage':'importColumnPage']:{offset,limit:8},ready:state=>(output?['output_mapping','input_mapping'].includes(state.wizard?.stage):state.wizard?.stage==='text_import_format')
        && (state.wizard[columnKey]?.page?.status==='complete_definition_page'
          || output && state.wizard[columnKey]?.page?.status==='rendered_definition_window')&&ready(state)});
    if(output)state=await revealOutputPage(channel,state,{offset,schemaId,total,ready});
    const columns=state.wizard?.[columnKey],p=columns?.page;
    if(p?.status!=='complete_definition_page'||typeof p.schema_id!=='string'||!p.schema_id
      ||p.offset!==offset||p.limit!==8||!Number.isInteger(p.total_columns)||p.total_columns<1||p.total_columns>1000
      ||!Array.isArray(columns.fields)||p.returned!==columns.fields.length
      ||p.returned!==Math.min(8,p.total_columns-offset)||p.returned<1
      ||columns.fields.some((f,i)=>f.status!=='observed'||f.index!==offset+i))throw new Error('Incomplete import definition page');
    if(schemaId!==null&&(schemaId!==p.schema_id||total!==p.total_columns))throw new Error('Import definitions changed between pages');
    if(expectedCount!==undefined&&p.total_columns!==expectedCount)throw new Error('Import definition count differs');
    schemaId=p.schema_id;total=p.total_columns;
    fields.push(...structuredClone(columns.fields));offset+=p.returned;
    if(p.next_offset!==(offset===total?null:offset))throw new Error('Import definition cursor differs');
    if(offset===total)return {schema_id:schemaId,total_columns:total,fields,definition_complete:true,
      source_schema_verified:false,settings_applied:false};
  }
  throw new Error('Import definition page budget exceeded');
}

async function revealOutputPage(channel,state,{offset,schemaId,total,ready}) {
  const firstPage=state.wizard.output_columns.page;
  const identity={schema_id:schemaId??firstPage.schema_id,total_columns:total??firstPage.total_columns};
  for(let scrolls=0;state.wizard.output_columns.page.status==='rendered_definition_window';scrolls++) {
    if(scrolls>=128)throw new Error('Output definition scroll budget exceeded');
    const valid=s=>{const c=s.wizard?.output_columns,p=c?.page;
      return ['output_mapping','input_mapping'].includes(s.wizard?.stage) && p?.status==='rendered_definition_window'
        && p.schema_id===identity.schema_id && p.total_columns===identity.total_columns && p.offset===offset
        && Number.isInteger(p.rendered_start) && Number.isInteger(p.rendered_end) && p.rendered_start>=0
        && p.rendered_end>p.rendered_start && p.rendered_end<=p.total_columns && ready(s);};
    if(!valid(state))throw new Error('Output definitions changed before scroll');
    await channel.perform({condition:'reveal addressed output definition page',initialObservation:state,
      ready:valid,identity:()=>identity,resolve:s=>{
        const c=s.wizard.output_columns,p=c.page;
        const es=s.ui.elements.filter(e=>e.ref===c.definition_scroll_ref && e.scroll?.ref===e.ref && e.allowed_actions.includes('scroll'));
        if(es.length!==1)throw new Error('Output definition scroll owner unavailable');
        const e=es[0],direction=offset<p.rendered_start?-1:1;
        if(direction>0?e.scroll.top>=e.scroll.max_top:e.scroll.top<=0)throw new Error('Output definition scroll boundary reached');
        return {verb:'scroll',ref:e.ref,delta_y:direction*500};
      }});
    state=await channel.observe({condition:'output definition page after native scroll',outputColumnPage:{offset,limit:8},
      ready:s=>['output_mapping','input_mapping'].includes(s.wizard?.stage) && ['complete_definition_page','rendered_definition_window'].includes(s.wizard.output_columns?.page?.status) && ready(s)});
    const p=state.wizard.output_columns.page;
    if(p.schema_id!==identity.schema_id || p.total_columns!==identity.total_columns)throw new Error('Output definitions changed during scroll');
  }
  return state;
}

export async function observeOutputDefinitionPage(channel,{offset,ready=()=>true,schemaId,total,field,fieldAction='click'}={}) {
  if(!Number.isInteger(offset)||offset<0||offset>=1000)throw new Error('Bounded output definition offset required');
  const accepts=s=>['output_mapping','input_mapping'].includes(s.wizard?.stage)
    &&['complete_definition_page','rendered_definition_window'].includes(s.wizard.output_columns?.page?.status)&&ready(s);
  let state=await channel.observe({condition:'addressed output definition page at '+offset,outputColumnPage:{offset,limit:8},ready:accepts});
  state=await revealOutputPage(channel,state,{offset,schemaId,total,ready});
  const p=state.wizard.output_columns.page;
  if(p.status!=='complete_definition_page'||p.offset!==offset||schemaId!==undefined&&p.schema_id!==schemaId
    ||total!==undefined&&p.total_columns!==total)throw new Error('Addressed output definition changed');
  if(!field)return state;
  const identity={offset,ready,schemaId:p.schema_id,total:p.total_columns};
  const rowOf=s=>s.wizard?.output_columns?.fields?.find(f=>f.index===field.index&&f.name===field.name&&f.label===field.label);
  const cellOf=s=>s.ui.elements.find(e=>e.ref===rowOf(s)?.name_ref);
  for(let attempt=0;attempt<128;attempt++){
    const row=rowOf(state),cell=cellOf(state);
    if(!row||!cell)throw Error('Addressed output field disappeared');
    if(cell.allowed_actions.includes(fieldAction))return state;
    const grids=state.ui.elements.filter(e=>e.ref===state.wizard.output_columns.definition_scroll_ref&&e.scroll?.ref===e.ref&&e.allowed_actions.includes('scroll'));
    if(grids.length!==1)throw Error('Output field scroll owner unavailable');
    const grid=grids[0],center=cell.bounding_box.y+cell.bounding_box.height/2;
    const direction=center<grid.bounding_box.y?-1:center>grid.bounding_box.y+grid.bounding_box.height?1:0;
    if(!direction)throw Error('Output field is obscured');
    const before=grid.scroll.top;
    await channel.perform({condition:'reveal addressed output field for interaction',initialObservation:state,
      ready:s=>ready(s)&&s.wizard?.output_columns?.page?.schema_id===identity.schemaId&&!!rowOf(s),
      identity:()=>({schema_id:identity.schemaId,field,scroll_owner:grid.ref}),
      resolve:()=>({verb:'scroll',ref:grid.ref,delta_y:direction*400})});
    state=await observeOutputDefinitionPage(channel,identity);
    const after=state.ui.elements.find(e=>e.ref===grid.ref)?.scroll;
    if(!after||direction*(after.top-before)<=0)throw Error('Output field scroll made no progress');
  }
  throw Error('Output field scroll budget exceeded');
}
