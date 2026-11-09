const need=(v,m)=>{if(!v)throw Error('Ungroup: '+m);};
const name=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\x00-\x1f]/.test(v);
export const UNGROUP_BANDS=['ConfidenceBandUpper','ConfidenceBandLower'];
const SEASONALITY={period:'year',multiplier:1,index_count:12,rare_density:0.25,absent_periods:1,novelty_periods:1,max_history_periods:0};
export function validateUngroupParameters(p,mode,r){
 need(['shares','computed','seasonal'].includes(mode),'only shares/computed/seasonal supported; variables are unsupported');
 need(p&&typeof p==='object'&&!Array.isArray(p),'parameters required');
 need(Object.keys(p).every(k=>k==='ungroup'||mode==='seasonal'&&k==='seasonality'),'unknown parameters; seasonality belongs to mode seasonal');
 const u=p.ungroup,season=p.seasonality;
 need(u!==undefined||r.target.kind==='existing'&&r.inputs.length===0&&!r.mappings.some(m=>m.direction==='input'),'new or changed inputs require complete ungroup settings');
 need(mode!=='seasonal'||(u===undefined)===(season===undefined),'seasonal requires ungroup and seasonality together, or neither on an existing node');
 if(season!==undefined){
  need(season&&typeof season==='object'&&Object.keys(season).sort().join(',')===['support_order_field','total_order_field',...Object.keys(SEASONALITY)].sort().join(','),'complete seasonality settings required');
  need(name(season.total_order_field)&&name(season.support_order_field),'exact order field names required');
  for(const [k,v] of Object.entries(SEASONALITY))need(season[k]===v,'seasonality.'+k+' supports only '+v);
 }
 if(u!==undefined){
  need(u&&Object.keys(u).sort().join(',')==='balance,item_field,keys,rounding,share_field,value_field','complete ungroup settings required');
  need([u.value_field,u.item_field,u.share_field].every(name),'exact field names required');
  need(Array.isArray(u.keys)&&u.keys.length>0&&u.keys.length<=128,'nonempty bounded group keys required');
  const totals=new Set(),support=new Set();
  for(const k of u.keys){
   need(k&&Object.keys(k).sort().join(',')==='support,total'&&name(k.total)&&name(k.support),'group pair requires total and support');
   need(!totals.has(k.total.toLowerCase())&&!support.has(k.support.toLowerCase()),'duplicate group fields');
   totals.add(k.total.toLowerCase());support.add(k.support.toLowerCase());
  }
  need(!totals.has(u.value_field.toLowerCase())&&!support.has(u.item_field.toLowerCase())&&!support.has(u.share_field.toLowerCase())&&u.item_field.toLowerCase()!==u.share_field.toLowerCase(),'field roles must be distinct');
  const round=u.rounding;
  need(round&&['none','precision','multiple'].includes(round.format),'rounding format unsupported');
  need(Object.keys(round).sort().join(',')===(round.format==='none'?'format':'format,value'),'explicit rounding parameter required only for precision/multiple');
  if(round.format!=='none')need(Number.isInteger(round.value)&&round.value>=(round.format==='precision'?0:1)&&round.value<=(round.format==='precision'?12:2147483647),'rounding value outside supported range');
  need(['none','last','proportional','equal'].includes(u.balance),'balance unsupported');
  if(mode!=='shares')need(round.format==='none'&&u.balance==='none',mode+' supports no rounding or balancing in this cycle');
  if(season){const t=season.total_order_field.toLowerCase(),s=season.support_order_field.toLowerCase();
   need(!totals.has(t)&&t!==u.value_field.toLowerCase()&&!support.has(s)&&![u.item_field,u.share_field].some(f=>f.toLowerCase()===s),'order fields must not be group keys or other roles');}
 }
 need(r.inputs.length<=2&&new Set(r.inputs.map(i=>i.input)).size===r.inputs.length&&r.inputs.every(i=>[0,1].includes(i.input)),'two distinct table inputs required');
 need(r.target.kind==='existing'||r.inputs.length===2,'both totals input 0 and support input 1 required');
 need(r.read.ports.every(p=>p===0||mode!=='shares'&&p===1)&& (r.finish!=='execute'||r.read.ports.length>0),'shares reads output 0; computed/seasonal read output 0 and/or 1');
 // Seasonal may drop only the native confidence bands from output 0.
 need(r.mappings.every(m=>(m.direction==='input'?[0,1].includes(m.port):m.port===0)
  &&(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&(f.excluded!==true||mode==='seasonal'&&m.direction==='output'&&UNGROUP_BANDS.includes(f.source.name)))),'unsupported mapping, exclusion or port 1');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
}
export function resolveUngroupFields(u,schemas,{requireKinds=true,seasonality}={}){
 need(Array.isArray(schemas)&&schemas.length===2,'both input schemas required');
 const field=(port,n)=>{const matches=schemas[port].filter(f=>f.name===n);need(matches.length===1,'field absent or ambiguous: '+n);return matches[0];};
 for(const k of u.keys){const a=field(0,k.total),b=field(1,k.support);need(a.type===b.type&&['integer','real','string','boolean','datetime'].includes(a.type),'group key types differ or unsupported');}
 for(const [port,n] of [[0,u.value_field],[1,u.share_field]]){const f=field(port,n);need(['integer','real'].includes(f.type)&&(!requireKinds||f.data_kind==='Непрерывный'),'total/share must be continuous integer/real: '+n);}
 need(field(1,u.item_field).type==='string','item names must be string');
 if(seasonality){
  need(field(0,seasonality.total_order_field).type==='datetime'&&field(1,seasonality.support_order_field).type==='datetime','order fields must be datetime on both inputs');
  need(field(0,u.value_field).type==='integer'&&field(1,u.share_field).type==='integer','seasonal supports continuous integer total and support values');
 }
 return u;
}
export function ungroupOutputFields(c){
 const u=c.ungroup,totals=c.input_fields[0];
 if(c.method==='seasonal'){
  // Native seasonal output 0 set (order varies by input mapping): numeric
  // results follow the integer total; the seasonal factor is real.
  const t=totals.find(f=>f.name===u.value_field).type,g=n=>({name:n,label:n,type:t});
  return [...totals,g(u.value_field+'_Rounded'),c.input_fields[1].find(f=>f.name===u.item_field),g('OutputValue'),...UNGROUP_BANDS.map(g),g('OutputTrend'),
   {name:'OutputSI',label:'OutputSI',type:'real'},g('OutputVT'),{name:'OutputVTDesc',label:'OutputVTDesc',type:'string'}].map(f=>({...f,used:true}));
 }
 const numeric=c.method==='computed'?totals.find(f=>f.name===u.value_field).type:'real';
 return [...totals,{name:u.value_field+'_Rounded',label:u.value_field+'_Rounded',type:numeric},c.input_fields[1].find(f=>f.name===u.item_field),{name:'OutputValue',label:'OutputValue',type:numeric}].map(f=>({...f,used:true}));
}
export function ungroupSecondaryFields(c,indexCount){
 const u=c.ungroup,support=c.input_fields[1],item=u.item_field??u.item_fields[0];
 const fields=[item,...u.keys.map(k=>k.support)].map(n=>support.find(f=>f.name===n));
 return c.method==='seasonal'?[...fields,...['UngroupQuality',...Array.from({length:indexCount},(_,i)=>'SeasonalIndex'+(i+1))].map(name=>({name,type:'real'}))]:fields;
}
