const requireValue=(value,message)=>{if(!value)throw Error(message);};
const formatOf=s=>s.table_settings?.format;

export function verifyTableFormatPage(state,{offset,identity}={}) {
  const f=formatOf(state),p=f?.page;
  requireValue(state.table_settings?.status==='observed'&&state.table_settings.kind==='format'
    &&['complete_definition_page','rendered_definition_window'].includes(p?.status)
    &&typeof p.schema_id==='string'&&p.schema_id.length>0&&p.offset===offset&&p.limit===8
    &&Number.isInteger(p.total_columns)&&p.total_columns>0&&p.total_columns<=1000,'Incomplete Table format metadata');
  const end=Math.min(offset+8,p.total_columns),fields=f.metadata_fields;
  requireValue(Array.isArray(fields)&&fields.length===end-offset&&fields.length>0
    &&fields.every((v,i)=>v.index===offset+i&&Number.isInteger(v.source_index)&&v.source_index>=0&&v.source_index<p.total_columns
      &&typeof v.name_key==='string'&&v.name_key.length>0&&typeof v.record_id==='string'&&v.record_id.length>0
      &&['integer','real','string','boolean','datetime','variant'].includes(v.type))
    &&p.next_offset===(end===p.total_columns?null:end),'Invalid Table format cursor or fields');
  if(identity)requireValue(p.schema_id===identity.schema_id&&p.total_columns===identity.total_columns,'Table format schema changed');
  return {schema_id:p.schema_id,total_columns:p.total_columns};
}

export async function readTableFormatDefinitions(channel,table) {
  const fields=[];let identity,offset=0;
  for(let i=0;i<125;i++) {
    const s=await channel.observe({condition:'Table format metadata at '+offset,tableDialog:{table,kind:'format'},tableFormatPage:{offset,limit:8},
      ready:s=>!!formatOf(s)?.page?.schema_id});
    identity=verifyTableFormatPage(s,{offset,identity});fields.push(...structuredClone(formatOf(s).metadata_fields));
    if(formatOf(s).page.next_offset===null) {
      requireValue(['source_index','name_key','record_id'].every(k=>new Set(fields.map(f=>f[k])).size===fields.length),'Duplicate Table format fields');
      return {...identity,fields,definition_complete:true};
    }
    offset=formatOf(s).page.next_offset;
  }
  throw Error('Table format page budget exceeded');
}

export async function revealTableFormatField(channel,table,definition,target) {
  const offset=Math.floor(target.index/8)*8;
  let previousTop;
  for(let scrolls=0;scrolls<=128;scrolls++) {
    const s=await channel.observe({condition:'Table format field '+target.index+' available',tableDialog:{table,kind:'format'},tableFormatPage:{offset,limit:8},
      ready:s=>!!formatOf(s)?.page?.schema_id});
    verifyTableFormatPage(s,{offset,identity:definition});
    const f=formatOf(s),actual=f.metadata_fields.find(f=>f.index===target.index);
    requireValue(actual?.name_key===target.name_key&&actual.source_index===target.source_index&&actual.type===target.type&&actual.record_id===target.record_id,
      'Table format field changed');
    if(f.fields.some(f=>f.index===target.index&&f.record_id===target.record_id&&f.status==='observed'))return s;
    requireValue(scrolls<128,'Table format scroll budget exceeded');
    const p=f.page,controls=s.ui.elements.filter(e=>e.ref===f.definition_scroll_ref&&e.scroll?.ref===e.ref&&e.allowed_actions.includes('scroll'));
    requireValue(controls.length===1,'Table format scroll owner unavailable');
    const control=controls[0];
    requireValue(Number.isInteger(p.rendered_start)&&Number.isInteger(p.rendered_end)&&p.rendered_end>p.rendered_start,
      'Table format visible range unavailable');
    requireValue(control.scroll.top!==previousTop,'Table format scroll made no progress');
    const direction=target.index<p.rendered_start?-1:1;
    requireValue(direction>0?control.scroll.top<control.scroll.max_top:control.scroll.top>0,'Table format scroll boundary reached');
    const rows=direction<0?p.rendered_start-target.index:target.index-p.rendered_end+1;
    requireValue(rows>0,'Table format target is missing inside visible range');
    const rowHeight=control.bounding_box.height/(p.rendered_end-p.rendered_start);
    const delta=direction*Math.min(1000,Math.max(24,Math.ceil(rows*rowHeight)));
    previousTop=control.scroll.top;
    await channel.perform({condition:'reveal Table format field '+target.index,initialObservation:s,
      ready:s=>formatOf(s)?.page?.schema_id===definition.schema_id,
      resolve:s=>({verb:'scroll',ref:formatOf(s).definition_scroll_ref,delta_y:delta}),
      identity:()=>({table,schema_id:definition.schema_id,field:target.index})});
  }
}
