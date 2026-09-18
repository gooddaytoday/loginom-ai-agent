const need=(v,m)=>{if(!v)throw Error(m);};
const name=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\x00-\x1f]/.test(v);
export function validateJoinParameters(p,mode,r){
 need(['inner','left'].includes(mode),'Join supports inner and left modes');
 need(p&&typeof p==='object'&&!Array.isArray(p),'Join parameters required');
 const preserve=Object.keys(p).length===0;
 need(!preserve||r.target.kind==='existing','New join requires explicit keys and options');
 need(!preserve||r.inputs.length===0&&!r.mappings.some(m=>m.direction==='input'),'Changing join inputs requires explicit keys and options');
 if(!preserve){
  need(Object.keys(p).sort().join(',')==='case_sensitive,include_joined_keys,keys','Explicit join keys and options required');
  need(typeof p.case_sensitive==='boolean'&&typeof p.include_joined_keys==='boolean','Explicit join booleans required');
  need(Array.isArray(p.keys)&&p.keys.length>0&&p.keys.length<=1000,'Bounded nonempty join keys required');
  const left=new Set(),right=new Set();
  for(const k of p.keys){
   need(k&&Object.keys(k).sort().join(',')==='left,right'&&name(k.left)&&name(k.right),'Join key pair requires left and right field names');
   need(!left.has(k.left.toLowerCase())&&!right.has(k.right.toLowerCase()),'Join key fields must be unique on each side');
   left.add(k.left.toLowerCase());right.add(k.right.toLowerCase());
  }
 }
 need(r.inputs.length<=2&&r.inputs.every(i=>i.input===0||i.input===1),'Join has two inputs');
 need(r.target.kind==='existing'||r.inputs.length===2,'New join requires both input sources');
 need(r.read.ports.every(p=>p===0),'Join has one output');
 need(r.finish!=='execute'||r.read.ports.length===1,'Join execution must read its output');
 need(r.mappings.every(m=>(m.direction==='input'?[0,1].includes(m.port):m.port===0)
  &&(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),'Invalid join mapping');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit join input mappings');
 for(const m of r.mappings){if(!m.fields&&!m.changes)continue;
  const sources=new Set(),outputs=new Set();
  for(const f of m.fields??m.changes){const source=f.source.name.toLowerCase(),target=(f.name??f.source.name).toLowerCase();
   need(!sources.has(source)&&!outputs.has(target),'Join mapping name conflict');sources.add(source);outputs.add(target);
  }
 }
}
export function resolveJoinKeys(parameters,schemas){
 need(Array.isArray(schemas)&&schemas.length===2,'Both effective join schemas required');
 return parameters.keys.map(k=>{
  const pair=[schemas[0].filter(f=>f.name===k.left),schemas[1].filter(f=>f.name===k.right)];
  need(pair.every(a=>a.length===1),'Join key is absent or ambiguous');
  need(pair[0][0].type===pair[1][0].type,'Join key types differ');
  return {...k,type:pair[0][0].type};
 });
}
export function joinOutputFields(configuration){
 const rightKeys=new Set(configuration.keys.map(k=>k.right));
 return [...configuration.input_fields[0],...configuration.input_fields[1].filter(f=>configuration.include_joined_keys||!rightKeys.has(f.name))].map(f=>({name:f.name,label:f.label,type:f.type,used:true}));
}
