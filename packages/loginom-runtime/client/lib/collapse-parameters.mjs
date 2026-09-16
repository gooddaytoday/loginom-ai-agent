const need=(v,m)=>{if(!v)throw Error(m);};
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
export function validateCollapseParameters(p,mode,r){
 need(mode==='unpivot','Collapse columns supports unpivot mode');
 need(p&&Object.keys(p).every(k=>['information','transposed','ignore_empty'].includes(k)),'Invalid collapse parameters');
 const replacement=p.information!==undefined||p.transposed!==undefined;
 need(replacement||r.target.kind==='existing','New collapse requires complete field roles');
 need(p.ignore_empty===undefined||typeof p.ignore_empty==='boolean','Boolean ignore_empty required');
 need(r.target.kind==='existing'||typeof p.ignore_empty==='boolean','New collapse requires explicit empty policy');
 if(replacement){
  need(Array.isArray(p.information)&&p.information.length<=128&&Array.isArray(p.transposed)&&p.transposed.length>0&&p.transposed.length<=128,'Complete ordered collapse roles required');
  const seen=new Set();for(const f of [...p.information,...p.transposed]){need(f?.kind==='input_field'&&Object.keys(f).sort().join(',')==='kind,name'&&name(f.name)&&!seen.has(f.name.toLowerCase()),'Unknown, duplicate or conflicting collapse role');seen.add(f.name.toLowerCase());}
 }
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'Collapse has one input');
 need(r.target.kind==='existing'||r.inputs.length===1,'New collapse requires explicit input');
 need(r.read.ports.every(i=>i===0),'Collapse has one output');
 need(r.mappings.length<=2&&r.mappings.every(m=>m.port===0),'Collapse accepts input/output mapping 0');
 for(const m of r.mappings)if(m.fields){const src=new Set(),out=new Set();for(const f of m.fields){
  need(f.source?.kind==='configured_field'&&name(f.source.name)&&!src.has(f.source.name.toLowerCase()),'Unique configured mapping sources required');src.add(f.source.name.toLowerCase());
  const n=f.name??f.source.name;need(name(n)&&!out.has(n.toLowerCase()),'Unique output names required');out.add(n.toLowerCase());need(m.direction==='output'||f.excluded!==true,'Input exclusions unsupported');
 }}
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');return p;
}
export function resolveCollapseParameters(p,fields){
 need(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Complete unique collapse input required');
 const resolve=list=>list.map(k=>{const found=fields.filter(f=>f.name===k.name);need(found.length===1,'Collapse input field missing: '+k.name);need(['integer','real','string','boolean','datetime'].includes(found[0].type),'Input variant and unsupported scalar types are deferred');return found[0];});
 const information=resolve(p.information),transposed=resolve(p.transposed);
 need(information.every(f=>!['names','displaynames','values','datatypes'].includes(f.name.toLowerCase())),'Information field conflicts with a native collapse output name');
 return {information,transposed};
}
export function validateCollapseInputParameters(p,resolved,native){if(p.information!==undefined)resolveCollapseParameters(p,resolved.fields??native.target_fields);}
