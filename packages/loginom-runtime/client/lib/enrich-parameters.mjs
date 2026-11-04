const need=(v,m)=>{if(!v)throw Error(m);};
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const name=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\x00-\x1f]/.test(v);

export function validateEnrichParameters(p,mode,r){
 need(mode==='left','Enrich supports left only');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='enrichment'),'Only enrichment parameters are supported');
 need(r.read.ports.every(p=>p===0)&&(r.finish!=='execute'||r.read.ports.length===1),'Enrich execution requires output 0');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
 if(!Object.hasOwn(p,'enrichment')){
  need(r.target.kind==='existing'&&r.inputs.length===0&&r.mappings.every(m=>m.direction==='output'),
   'Complete enrichment required for a new node or declared input changes');
 }else{
  const e=p.enrichment;
  need(object(e,['tables','prefixes']),'Complete enrichment tables and prefixes required');
  need(object(e.prefixes,['enabled','name','label'])&&typeof e.prefixes.enabled==='boolean'
   &&typeof e.prefixes.name==='string'&&e.prefixes.name.length<=128
   &&typeof e.prefixes.label==='string'&&e.prefixes.label.length<=128,'Explicit enrichment prefix settings required');
  need(!e.prefixes.enabled||e.prefixes.name===''||/^[\p{L}_][\p{L}\p{N}_]*$/u.test(e.prefixes.name),'Enrich name prefix must be an identifier');
  need(Array.isArray(e.tables)&&e.tables.length>=1&&e.tables.length<=2,'Enrich requires one or two lookups');
  for(const [i,t] of e.tables.entries()){
   need(object(t,['port','keys'])&&t.port===i+1,'Enrich tables must be ordered and contiguous');
   need(Array.isArray(t.keys)&&t.keys.length>=1&&t.keys.length<=128,'Each lookup requires a nonempty bounded composite key');
   const mains=new Set(),lookups=new Set();
   for(const k of t.keys){
    need(object(k,['main','lookup'])&&name(k.main)&&name(k.lookup),'Enrich key requires exact main and lookup field names');
    need(!mains.has(k.main.toLowerCase())&&!lookups.has(k.lookup.toLowerCase()),'Enrich key fields must be unique within each lookup');
    mains.add(k.main.toLowerCase());lookups.add(k.lookup.toLowerCase());
   }
  }
  const count=e.tables.length+1;
  need(r.inputs.every(i=>i.input<count),'Enrich input is outside declared tables');
  need(r.target.kind==='existing'||r.inputs.length===count&&Array.from({length:count},(_,i)=>i).every(i=>r.inputs.some(p=>p.input===i)),
   'New enrichment requires every input source');
  need(r.mappings.every(m=>m.direction!=='input'||m.port<count),'Enrich input mapping is outside declared tables');
 }
 need(r.mappings.every(m=>m.changes===undefined&&(m.direction!=='output'||m.port===0)
  &&(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),
  'Enrich mappings require complete configured fields layouts without changes patches or input exclusions');
 for(const m of r.mappings){
  const sources=new Set(),targets=new Set();
  for(const f of m.fields??m.changes??[]){
   const source=f.source.name.toLowerCase(),target=(f.name??f.source.name).toLowerCase();
   need(!sources.has(source)&&!targets.has(target),'Enrich mapping name conflict');sources.add(source);targets.add(target);
  }
 }
}

export function resolveEnrichTables(p,schemas){
 const tables=p.enrichment?.tables;
 need(Array.isArray(tables)&&Array.isArray(schemas)&&schemas.length===tables.length+1,'Every enrich input schema required');
 for(const fields of schemas)need(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,
  'Complete unique enrich field inventory required');
 return tables.map(t=>{
  const input=schemas[t.port];need(input&&t.keys.length>0,'Enrich lookup schema and nonempty keys required');
  const pairs=t.keys.map(k=>{
   const main=schemas[0].filter(f=>f.name===k.main),lookup=input.filter(f=>f.name===k.lookup);
   need(main.length===1&&lookup.length===1,'Exact enrichment key field is missing or ambiguous');
   need(main[0].type===lookup[0].type,'Enrich key types differ; convert upstream explicitly');
   return {main:k.main,source:k.lookup};
  });
  return {port:t.port,pairs,unmatched:input.filter(f=>!pairs.some(k=>k.source===f.name)).map(f=>f.name)};
 });
}

export function enrichOutputFields(c){
 const fields=c.input_fields[0].map(f=>({name:f.name,label:f.label,type:f.type,used:true}));
 const names=new Set(fields.map(f=>f.name.toLowerCase()));
 for(const m of c.mappings)for(const source of m.unmatched){
  const f=c.input_fields[m.port].find(f=>f.name===source);need(f,'Enrich non-key source disappeared');
  const base=(c.prefixes.enabled?c.prefixes.name:'')+f.name;
  let result=base,index=1;
  while(names.has(result.toLowerCase()))result=base+'_'+index++;
  names.add(result.toLowerCase());
  fields.push({name:result,label:(c.prefixes.enabled?c.prefixes.label:'')+f.label,type:f.type,used:true});
 }
 return fields;
}

export function validateEnrichSchemas(request,schemas){
 const mappings=resolveEnrichTables(request.parameters,schemas);
 const fields=enrichOutputFields({input_fields:schemas,mappings,prefixes:request.parameters.enrichment.prefixes});
 const output=request.mappings.find(m=>m.direction==='output');
 if(output?.fields)need(output.fields.length===fields.length&&new Set(output.fields.map(f=>f.source.name)).size===fields.length
  &&output.fields.every(f=>fields.some(s=>s.name===f.source.name)),'Enrich output mapping is incomplete');
 return {mappings,fields};
}
