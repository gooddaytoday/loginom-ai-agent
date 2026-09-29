// Operator-only oracles. These functions never execute a node or interpret
// absence of an error as proof that a wizard gesture did not run JavaScript.
import {createHash} from 'node:crypto';

export const javascriptInputColumns = Object.freeze(['RowID','Customer','Qty','UnitPriceCents','DiscountPct'].map(name=>
  Object.freeze({name,label:name,type:name==='Customer'?'string':'integer',data_kind:'Дискретный',used:true})));
export const javascriptInputRows = Object.freeze([
  ['1','  Alpha  ','2','1000','10'], ['2','BETA','0','375','0'],
  ['3','Alpha','-3','250','0'], ['4','Гамма','4','125','20'],
  ['5','Ёж','1','999','100'], ['6','delta','5','100','0'],
].map(Object.freeze));
const businessInputVariants=Object.freeze({
  base:Object.freeze({path:'model-input/sales.csv',name:'sales.csv',bytes:157,
    sha256:'4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e',
    columns:javascriptInputColumns,rows:javascriptInputRows}),
  changed:Object.freeze({path:'operator-only/sales-changed.csv',name:'sales-changed.csv',bytes:157,
    sha256:'97b2be2549ab389a1b5e2fd1605125ab2b158cd788b1c6c43a24ed85d84e32d7',
    columns:javascriptInputColumns,rows:Object.freeze(javascriptInputRows.map((row,i)=>Object.freeze(i===0?[row[0],row[1],'3',row[3],row[4]]:[...row])))}),
  reordered:Object.freeze({path:'operator-only/sales-reordered.csv',name:'sales-reordered.csv',bytes:157,
    sha256:'405a8f4515087df2ca0eecbc8169df235dc81f2eb6981d36baaabbbf96202c0b',
    columns:Object.freeze(['DiscountPct','Customer','UnitPriceCents','RowID','Qty'].map(name=>javascriptInputColumns.find(column=>column.name===name))),
    rows:Object.freeze(javascriptInputRows.map(row=>Object.freeze([row[4],row[1],row[3],row[0],row[2]])))}),
});

export function javascriptBusinessInputVariant(id='base'){
  const variant=businessInputVariants[id];
  if(!variant)throw Error('Unknown JavaScript business input variant');
  return variant;
}
export const javascriptOutputColumns = Object.freeze([
  Object.freeze({name:'ObservedID',label:'ObservedID',type:'integer',data_kind:'Дискретный'}),
  Object.freeze({name:'PhaseMarker',label:'PhaseMarker',type:'string',data_kind:'Дискретный'}),
]);

export function verifyJavascriptInputMapping(mapping,node) {
  const context=mapping?.node_context,port=context?.input_port;
  if(mapping?.verified!==true||mapping.inventory_complete!==true||mapping.source_identity_verified!==true
    ||mapping.mapping_wizard!=='TuneDataSourceMappingWizard'||typeof mapping.autosync!=='boolean'
    ||context?.verified!==true||context.surface!=='wizard'||!['document_id','workflow_id','node_id'].every(key=>context[key]===node?.[key])
    ||port?.direction!=='input'||port.port!==0||typeof port.port_guid!=='string'||!port.port_guid
    ||mapping.source_fields?.length!==5||mapping.target_fields?.length!==5)
    throw Error('JavaScript input port mapping identity or completeness is unconfirmed');
  for(const expected of javascriptInputColumns){
    const sources=mapping.source_fields.filter(field=>field.name===expected.name&&field.type===expected.type);
    const targets=mapping.target_fields.filter(field=>field.name===expected.name&&field.type===expected.type);
    if(sources.length!==1||targets.length!==1||typeof sources[0].required!=='boolean'||typeof targets[0].required!=='boolean'
      ||targets[0].source?.record_id!==sources[0].record_id||targets[0].source?.field_id!==sources[0].field_id
      ||targets[0].source?.name!==expected.name||targets[0].source?.type!==expected.type)
      throw Error('JavaScript input field mapping differs: '+expected.name);
  }
  return {verified:true,node:{...node},port:0,port_guid:port.port_guid,columns:5,input_technical_name:'RowID'};
}

export function javascriptInitialPages(prefix,node,inputProof) {
  const input=prefix+';WizrdMCF;TuneDataSourceInputPortWizard';
  if(inputProof?.verified!==true||inputProof.port!==0||inputProof.columns!==5||!inputProof.port_guid
    ||!['document_id','workflow_id','node_id'].every(key=>typeof node?.[key]==='string'&&node[key]===inputProof.node?.[key]))return [input];
  return [input,prefix+';WizrdMCF;JavaScriptColumnsWizard'];
}

export function compactJavascriptJournalRecord(saved,line) {
  if(!Number.isSafeInteger(line)||line<1)throw Error('Positive journal line required');
  const reference={journal:'execution-events.jsonl',line,sha256:createHash('sha256').update(JSON.stringify(saved)+'\n').digest('hex')};
  for(const key of ['recorded_at','phase','operation_id','action_key','id','state','status']){
    if(typeof saved[key]==='string')reference[key]=saved[key].slice(0,240);
  }
  return reference;
}

export function verifyJavascriptTable(table, kind, inputVariant='base') {
  if(!['input','output'].includes(kind))throw Error('Unknown JavaScript table oracle');
  const variant=javascriptBusinessInputVariant(inputVariant);
  const columns=kind==='input'?variant.columns:javascriptOutputColumns;
  const rows=kind==='input'?variant.rows:javascriptInputRows.map(row=>[row[0],'JS_G2_TABLE_V1']);
  if(table?.sample_complete!==true||table.row_count!==6||table.sample_rows!==6||table.sample?.length!==6
    ||table.schema?.length!==columns.length||!table.schema.every((c,i)=>c.name===columns[i].name&&c.type===columns[i].type)
    ||!table.sample.every((row,i)=>row.length===columns.length&&row.every((cell,j)=>cell.type===columns[j].type
      &&cell.is_null===false&&cell.value===rows[i][j]&&(cell.type!=='integer'||cell.precision==='exact_integer'))))
    throw Error('JavaScript '+kind+' table differs from pinned typed six-row oracle');
  return {verified:true,rows:6,columns:columns.length,numeric_tolerance:0,whitespace_preserved:true};
}

export function verifyJavascriptFixture(bytes, manifest, inputVariant='base') {
  const variant=javascriptBusinessInputVariant(inputVariant);
  const pins=manifest?.files?.filter(file=>file.path===variant.path);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(pins?.length!==1||pins[0].bytes!==variant.bytes||pins[0].sha256!==variant.sha256
    ||bytes.length!==pins[0].bytes||sha256!==pins[0].sha256)throw Error('JavaScript input fixture pin differs');
  return {path:pins[0].path,bytes:bytes.length,sha256};
}

export function javascriptSentinelOutcome({stage,messages,baselineIds,identity,ownerVerified,terminal}) {
  if(!['next','done','preview','execute'].includes(stage)||!Array.isArray(messages)||!Array.isArray(baselineIds)
    ||!identity?.effect_id||!identity.node_id||!/^[a-f0-9]{64}$/.test(identity.source_sha256??'')
    ||messages.some(m=>!m?.id||typeof m.text!=='string'))
    throw Error('Invalid sentinel observation');
  const fresh=messages.filter(message=>!baselineIds.includes(message.id)
    &&['effect_id','node_id','source_sha256'].every(key=>message[key]===identity[key]));
  const found=fresh.some(message=>message.text.includes('JS_G2_EXECUTION_SENTINEL_V1'));
  return {stage,execution:found&&ownerVerified===true?'confirmed':'ambiguous',
    sentinel_observed:found,owner_verified:ownerVerified===true,terminal_observed:terminal===true,
    gate_passed:found&&ownerVerified===true&&terminal===true,fresh_message_ids:fresh.map(message=>message.id),
    absence_proves_no_execution:false};
}

export function createJavascriptEffectJournal({record,now=Date.now,deadline}) {
  const effects=new Map();
  return async function once(id,identity,perform) {
    if(typeof id!=='string'||!id||effects.has(id))throw Error('Duplicate JavaScript effect: '+id);
    if(now()>=deadline)throw Error('JavaScript trial deadline expired before '+id);
    // Reserve before awaiting the durable receipt: a failed write must not
    // make a later call eligible to resend the gesture.
    effects.set(id,'reserved');
    await record({id,state:'dispatching',identity,deadline});
    if(now()>=deadline)throw Error('JavaScript trial deadline expired before dispatch '+id);
    effects.set(id,'dispatched');
    try {
      const result=await perform();
      effects.set(id,'observed');await record({id,state:'observed',identity,result});return result;
    } catch(error) {
      effects.set(id,'unconfirmed');await record({id,state:'unconfirmed',identity,error:String(error.message)});throw error;
    }
  };
}
// Bounded public Playwright events only. No page URLs, console payloads or
// download names are captured; an observed closure does not establish its cause.
export function observeJavascriptBrowserLifecycle({context,page,record,stage}) {
  const listeners=[],pages=new Set();let sequence=0,dropped=0,writeFailed=false,closeRequested=false,pending=Promise.resolve();
  const browser=context.browser();
  const emit=(event,details={})=>{
    if(sequence>=128){dropped++;return;}
    const entry={phase:'browser_lifecycle',event,sequence:++sequence,at:new Date().toISOString(),stage:stage(),
      operator_close_requested:closeRequested,page_closed:page.isClosed(),browser_connected:browser?.isConnected()??null,...details};
    pending=pending.then(()=>record(entry)).catch(()=>{writeFailed=true;});
  };
  const listen=(target,event,handler)=>{target.on(event,handler);listeners.push({target,event,handler});};
  const attach=p=>{
    if(pages.has(p)||pages.size>=16)return;
    pages.add(p);const page_id=pages.size;
    for(const event of ['close','crash','download'])listen(p,event,()=>emit('page_'+event,{page_id}));
    listen(p,'pageerror',error=>emit('page_error',{page_id,timeout:error?.name==='TimeoutError'}));
  };
  for(const p of context.pages())attach(p);
  listen(context,'page',p=>{attach(p);emit('context_page');});
  listen(context,'close',()=>emit('context_close'));
  if(browser)listen(browser,'disconnected',()=>emit('browser_disconnected'));
  emit('attached');
  return {
    async beforeClose(){closeRequested=true;emit('operator_context_close_requested');await pending;},
    async finish(){for(const {target,event,handler} of listeners)target.off(event,handler);await pending;return {events:sequence,dropped,write_failed:writeFailed};}
  };
}
