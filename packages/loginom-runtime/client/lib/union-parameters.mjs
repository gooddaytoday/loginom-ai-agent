const need=(v,m)=>{if(!v)throw Error(m);};
const name=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\x00-\x1f]/.test(v);
export function validateUnionParameters(p,mode,r){
 need(mode==='append_all','Union supports append_all');
 need(p&&Object.keys(p).sort().join(',')==='prefixes,tables','Explicit union tables and prefixes required');
 need(p.prefixes&&Object.keys(p.prefixes).sort().join(',')==='enabled,label,name'&&typeof p.prefixes.enabled==='boolean'
  &&typeof p.prefixes.label==='string'&&p.prefixes.label.length<=128&&typeof p.prefixes.name==='string'&&p.prefixes.name.length<=128,'Explicit union prefix settings required');
 need(!p.prefixes.enabled||/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.prefixes.name),'Union prefix must be an identifier');
 need(Array.isArray(p.tables)&&p.tables.length>=1&&p.tables.length<=14,'Union requires two to fifteen tables');
 for(const [i,t] of p.tables.entries()){
  need(t&&Object.keys(t).sort().join(',')==='fields,port'&&t.port===i+1,'Union tables must be ordered and contiguous');
  need(Array.isArray(t.fields)&&t.fields.length<=1000,'Complete bounded union field mappings required');
  const sources=new Set(),targets=new Set();
  for(const f of t.fields){need(f&&Object.keys(f).sort().join(',')==='main,source'&&name(f.source)&&(f.main===null||name(f.main)),'Union field requires source and explicit main name or null');
   need(!sources.has(f.source.toLowerCase())&&(f.main===null||!targets.has(f.main.toLowerCase())),'Union field destinations must be unique within each input');
   sources.add(f.source.toLowerCase());if(f.main!==null)targets.add(f.main.toLowerCase());}
 }
 const count=p.tables.length+1;
 need(r.inputs.every(i=>i.input<count),'Union input is outside declared tables');
 need(r.target.kind==='existing'||r.inputs.length===count&&Array.from({length:count},(_,i)=>i).every(i=>r.inputs.some(p=>p.input===i)),'New union requires every input source');
 need(r.read.ports.every(p=>p===0)&& (r.finish!=='execute'||r.read.ports.length===1),'Union execution requires output0');
 need(r.mappings.every(m=>(m.direction==='input'?m.port<count:m.port===0)
  &&(m.fields??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),'Invalid union port mapping');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
 for(const m of r.mappings){if(!m.fields)continue;const sources=new Set(),targets=new Set();
  for(const f of m.fields){const source=f.source.name.toLowerCase(),target=(f.name??f.source.name).toLowerCase();
   need(!sources.has(source)&&!targets.has(target),'Union mapping name conflict');sources.add(source);targets.add(target);
  }
 }
}
export function resolveUnionTables(p,schemas){
 need(Array.isArray(schemas)&&schemas.length===p.tables.length+1,'Every union input schema required');
 const main=schemas[0],result=[];
 for(const t of p.tables){const input=schemas[t.port];
  need(t.fields.length===input.length&&t.fields.every(f=>input.filter(s=>s.name===f.source).length===1),'Union mapping must account for every input field');
  const pairs=[],unmatched=[];
  for(const f of t.fields){const source=input.find(s=>s.name===f.source);
   if(f.main===null){unmatched.push(source.name);continue;}
   const targets=main.filter(s=>s.name===f.main);need(targets.length===1,'Union main field is missing or ambiguous');
   need(source.type===targets[0].type,'Union field types differ; convert upstream explicitly');
   pairs.push({main:f.main,source:f.source});
  }result.push({port:t.port,pairs,unmatched});
 }
 return result;
}
export function unionOutputFields(c){
 const fields=c.input_fields[0].map(f=>({name:f.name,label:f.label,type:f.type,used:true}));
 for(const m of c.mappings)for(const name of m.unmatched){const f=c.input_fields[m.port].find(f=>f.name===name);need(f,'Unmatched union source disappeared');
  fields.push({name:(c.prefixes.enabled?c.prefixes.name:'')+f.name,label:(c.prefixes.enabled?c.prefixes.label:'')+f.label,type:f.type,used:true});}
 need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Union output names conflict; rename an input explicitly');
 return fields;
}
export function validateUnionSchemas(request,schemas){
 const mappings=resolveUnionTables(request.parameters,schemas),fields=unionOutputFields({input_fields:schemas,mappings,prefixes:request.parameters.prefixes});
 const output=request.mappings.find(m=>m.direction==='output');
 // Explicit null destinations remain visible unless explicitly excluded in a
 // complete output mapping. No automatic data-loss policy is invented here.
 if(output?.fields)need(output.fields.length===fields.length&&new Set(output.fields.map(f=>f.source.name)).size===fields.length&&output.fields.every(f=>fields.some(s=>s.name===f.source.name)),'Union output mapping is incomplete');
 return {mappings,fields};
}
