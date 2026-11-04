const need=(v,m)=>{if(!v)throw Error('ColUnion: '+m);};
export function validateColUnionParameters(p,mode,r){
 need(mode==='positional','only positional mode is supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='col_union'),'only col_union settings are supported');
 const c=p.col_union;
 if(c!==undefined){
  need(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['row_count','padding','determining_input'].includes(k)),'unsupported settings');
  need(c.row_count===undefined||['minimum','maximum','input'].includes(c.row_count),'invalid row_count');
  need(c.padding===undefined||['null','repeat','last'].includes(c.padding),'invalid padding');
  need(c.determining_input===undefined||['main','attached'].includes(c.determining_input),'invalid determining_input');
  need(c.determining_input===undefined||c.row_count===undefined||c.row_count==='input','determining_input requires row_count=input');
 }
 if(r.target.kind==='new'){
  need(c?.row_count&&c.padding,'new nodes require row_count and padding');
  need(c.row_count!=='input'||c.determining_input,'row_count=input requires determining_input');
  need(r.inputs.length===2&&[0,1].every(port=>r.inputs.some(i=>i.input===port)),'exactly two input sources are required');
 }
 need(r.inputs.every(i=>[0,1].includes(i.input)),'only input ports 0 and 1 are supported');
 need(r.read.ports.every(p=>p===0)&&(r.finish!=='execute'||r.read.ports.length===1),'execute requires output 0');
 need(r.mappings.every(m=>(m.direction==='input'?[0,1].includes(m.port):m.port===0)
  &&(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&f.excluded!==true)),'mappings must retain both inputs and every output field');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
}
export function resolveColUnionParameters(p,current){
 const patch=p.col_union??{},c={...current,...patch};
 need(['minimum','maximum','input'].includes(c.row_count)&&['null','repeat','last'].includes(c.padding),'complete supported settings required');
 if(c.row_count==='input')need(['main','attached'].includes(c.determining_input),'row_count=input requires determining_input');
 if(c.row_count!=='input'){
  need(patch.determining_input===undefined,'determining_input requires row_count=input');
  delete c.determining_input;
 }
 return c;
}
export function validateColUnionSchemas(request,schemas){
 need(Array.isArray(schemas)&&schemas.length===2,'both input schemas are required');
 for(const fields of schemas)need(Array.isArray(fields)&&fields.length>0&&fields.length<=1000
  &&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length
  &&fields.every(f=>typeof f.name==='string'&&typeof f.label==='string'&&['integer','real','string','boolean','datetime'].includes(f.type)),'complete scalar input schema required');
 return schemas;
}
export function validateColUnionOutput(configuration,native){
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'verified output sources required');
 const expected=configuration.input_fields.flat(),actual=native.source_fields;
 const signature=fs=>fs.map(f=>JSON.stringify([f.label,f.type])).sort();
 need(actual.length===expected.length&&JSON.stringify(signature(actual))===JSON.stringify(signature(expected)),'output must preserve every input field and scalar type');
 need(new Set(actual.map(f=>f.name.toLowerCase())).size===actual.length,'native output names must be unique');
 return actual.map(f=>({...f,used:true}));
}
