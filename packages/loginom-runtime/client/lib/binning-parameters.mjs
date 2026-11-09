const need=(v,m)=>{if(!v)throw Error('Binning: '+m);};
const civil=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}$/.test(v)&&Number.isFinite(Date.parse(v+'Z'))&&new Date(v+'Z').toISOString()===v+'Z';
const bounds=a=>Array.isArray(a)&&a.length===2&&(a.every(Number.isFinite)||a.every(civil))&&a[0]<a[1];
export function validateBinningParameters(parameters,mode,r){
 need(parameters&&typeof parameters==='object'&&!Array.isArray(parameters),'parameters must be an object');
 need(['internal','apply'].includes(mode),'use internal to train or existing apply to preserve saved intervals');
 if(mode==='apply'){
  need(Object.keys(parameters).length===0,'apply takes parameters:{}; no settings edits or training');
  if(r)need(r.target.kind==='existing'&&r.inputs.length===0&&r.mappings.length===0&&r.finish==='execute','apply requires existing node, inputs:[], mappings:[], finish:execute');
 }else{
  need(Object.keys(parameters).length===1&&parameters.binning,'use parameters.binning');
  const p=parameters.binning;
  need(typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['field','method','size','limits','intervals','ties','sd_coefficient'].includes(k)),'use field, method, size, limits, intervals, ties and sd_coefficient only');
  need(typeof p.field==='string'&&p.field.trim().length>0&&p.field.length<=128,'field must be an exact Integer/Real/DateTime input name');
  need(['count','width','frequency','sd','manual'].includes(p.method),'method must be count, width, frequency, sd or manual');
  need(p.sd_coefficient===undefined||p.method==='sd','sd_coefficient is supported only for sd');
  need(p.ties===undefined||p.method==='frequency','ties is supported only for frequency; omit ties for '+p.method);
  if(p.method==='manual'){
   need(p.size===undefined&&p.limits===undefined,'manual preserves saved method/size/limits; omit those parameters');
   need(Array.isArray(p.intervals)&&p.intervals.length>0&&p.intervals.length<=1000,'manual requires all materialized intervals');
   p.intervals.forEach((b,i)=>{
    need(b&&Object.keys(b).length===5&&['lower','upper','lower_included','upper_included','label'].every(k=>Object.hasOwn(b,k))&&bounds([b.lower,b.upper])&&typeof b.lower_included==='boolean'&&typeof b.upper_included==='boolean'&&typeof b.label==='string'&&b.label.length<=128,'invalid manual interval');
    if(i)need(p.intervals[i-1].upper===b.lower&&p.intervals[i-1].upper_included!==b.lower_included,'adjacent bounds must meet with exactly one inclusion');
   });
   if(r)need(r.target.kind==='existing'&&r.inputs.length===0,'manual requires the same existing trained node and inputs:[]');
  }else if(p.method==='sd'){
   need([1,2,3].includes(p.sd_coefficient),'sd requires sd_coefficient 1, 2 or 3');
   need(p.size===undefined&&p.limits===undefined&&p.intervals===undefined,'sd omits size, limits and intervals; edit labels with manual after Train');
  }else{
   need(p.intervals===undefined,'interval edits require method manual after training');
   need(Number.isFinite(p.size)&&p.size>0&&(p.method==='width'||Number.isSafeInteger(p.size)),'size must be positive; count/frequency need an integer');
   if(p.method==='frequency')need(p.limits===undefined&&(p.ties===undefined||['next','current'].includes(p.ties)),'frequency omits limits; ties next (default) or current');
   else need(p.limits===undefined||bounds(p.limits),'count/width limits must be typed [lower,upper], lower<upper; omit for native automatic limits');
  }
  if(r){
   need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one table source at input 0 required');
   need(r.mappings.length===0,'mapping overrides and external bins are outside this stage');
  }
 }
 if(r)need(JSON.stringify(r.read.ports)===JSON.stringify(r.finish==='execute'?[0,1]:[]),'execute requires both ordered ports [0,1]; Done/Close use []');
}
export function resolveBinningField(parameters,fields){
 const p=parameters.binning;
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields.map(f=>f.name)).size===fields.length,'complete unique input schema required');
 const field=fields.find(f=>f.name===p.field);
 need(field&&['integer','real','datetime'].includes(field.type),'selected field must be observed Integer/Real/DateTime: '+p.field);
 const values=p.method==='manual'?p.intervals.flatMap(b=>[b.lower,b.upper]):p.limits;
 if(field.type==='datetime')need(['count','manual'].includes(p.method)&&values?.every(civil),'DateTime requires count/manual and civil ISO milliseconds without timezone');
 else if(values)need(values.every(Number.isFinite),'numeric fields require numeric bounds');
 if(field.type==='integer'&&values)need(values.every(Number.isSafeInteger),'Integer bounds must be safe integers');
 return field;
}
