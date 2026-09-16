const need=(v,m)=>{if(!v)throw Error(m);};
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
export function validateSortingParameters(p,mode,r){
 need(mode==='keys','Sorting supports keys mode');
 need(p&&Object.keys(p).every(k=>['keys','compare_with_locale'].includes(k)),'Invalid sorting parameters');
 need(p.compare_with_locale===undefined||typeof p.compare_with_locale==='boolean','Boolean locale flag required');
 need(p.keys!==undefined||r.target.kind==='existing','New sorting requires complete keys');
 if(p.keys!==undefined){
  need(Array.isArray(p.keys)&&p.keys.length>0&&p.keys.length<=128,'Nonempty ordered sorting keys required');
  const names=new Set();for(const k of p.keys){
   need(k&&Object.keys(k).every(x=>['field','direction','case_sensitive'].includes(x))&&k.field?.kind==='input_field'
    &&Object.keys(k.field).sort().join(',')==='kind,name'&&name(k.field.name)&&['ASC','DESC'].includes(k.direction),'Invalid sorting key');
   need(k.case_sensitive===undefined||typeof k.case_sensitive==='boolean','Boolean case flag required');
   need(!names.has(k.field.name.toLowerCase()),'Duplicate sorting key');names.add(k.field.name.toLowerCase());
  }
  need(r.target.kind==='existing'||r.inputs.length===1,'New sorting requires one explicit input');
 }
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'Sorting accepts one input');
 need(r.read.ports.every(i=>i===0),'Sorting has one output');
 need(r.mappings.length<=2&&r.mappings.every(m=>m.port===0),'Sorting has one input/output mapping');
 for(const m of r.mappings)if(m.fields){const src=new Set(),out=new Set();for(const f of m.fields){
  need(f.source?.kind==='configured_field'&&name(f.source.name)&&!src.has(f.source.name.toLowerCase()),'Unique configured mapping fields required');src.add(f.source.name.toLowerCase());
  const n=f.name??f.source.name;need(name(n)&&!out.has(n.toLowerCase()),'Unique mapping output names required');out.add(n.toLowerCase());
  need(m.direction==='output'||f.excluded!==true,'Input exclusions are unsupported');
 }}
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit separate input mappings');return p;
}
export function resolveSortingParameters(p,fields){
 need(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name)).size===fields.length,'Complete unique input schema required');
 return p.keys.map(k=>{const matches=fields.filter(f=>f.name===k.field.name);need(matches.length===1,'Sorting input field is missing: '+k.field.name);
  const f=matches[0],text=['string','variant'].includes(f.type);
  need(text?typeof k.case_sensitive==='boolean':k.case_sensitive===undefined,'Explicit case_sensitive required only for string/variant keys');
  return {...f,direction:k.direction,...(text?{case_sensitive:k.case_sensitive}:{})};
 });
}
export function validateSortingInputParameters(p,resolved,native){
 if(p.keys===undefined)return;
 // The mapping resolver preserves a retained name when a patch omits it.
 // Source names alone cannot describe the fields the sorting wizard will see.
 resolveSortingParameters(p,resolved.fields??native.target_fields);
}
