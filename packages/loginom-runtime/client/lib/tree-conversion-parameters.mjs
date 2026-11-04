const text=description=>({type:'string',minLength:1,maxLength:128,description});
export const tableToTreeParametersSchema={type:'object',properties:{nodes:{type:'array',minItems:3,maxItems:64,
 description:'Complete ordered parent-before-child structure: Root, one object array, scalar leaves and at most one nested object. Explicit nodes replaces the whole structure; omit on existing to preserve.',
 items:{type:'object',properties:{path:{type:'string',maxLength:512,description:'JSON Pointer path, root empty; omit array indexes.'},name:text('Technical name, matching decoded path segment; root Root.'),
 label:text('Display label; must equal name.'),type:{type:'string',enum:['object','integer','real','string','boolean'],description:'Exact source scalar type; object for containers.'},
 is_array:{type:'boolean',description:'True only on the single repeated object branch.'},source_field:text('Required only on scalar leaves: exact technical input field name.')},
 required:['path','name','label','type','is_array'],additionalProperties:false}}},required:[],additionalProperties:false};
export const treeToJsonParametersSchema={type:'object',properties:{exclude_root:{type:'boolean',const:true,description:'Exclude the technical Root wrapper.'},
 pretty:{type:'boolean',const:false,description:'Compact JSON only.'},keys:{type:'string',enum:['names'],description:'Use technical names.'},
 multi_row:{type:'boolean',const:false,description:'One JSON document, no root-array splitting.'},datetime:{type:'string',enum:['iso8601'],description:'Keep ISO8601 setting; date fields are unsupported.'}},required:[],additionalProperties:false};
const need=(v,m)=>{if(!v)throw Error(m);};
const pointer=name=>name.replaceAll('~','~0').replaceAll('/','~1');
export function validateTreeConversionParameters(p,mode,r){
 const table=r.target.type==='trees.from_table',schema=table?tableToTreeParametersSchema:treeToJsonParametersSchema;
 need(mode===(table?'manual_structure':'serialize')&&p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>Object.hasOwn(schema.properties,k)),'Unsupported tree conversion parameters or mode');
 need(Array.isArray(r.mappings)&&r.mappings.length===0&&r.inputs.length<=1&&r.inputs.every(i=>i.input===0&&i.output>=0),'Tree conversion requires mappings:[] and one input 0');
 if(r.target.kind==='new')need(r.inputs.length===1&&Object.keys(schema.properties).every(k=>Object.hasOwn(p,k)),'New tree conversion requires all parameters and one input');
 if(!table){for(const [k,v] of Object.entries(p))need(v===(schema.properties[k].const??schema.properties[k].enum[0]),'Unsupported serialization '+k);return;}
 if(p.nodes===undefined)return;
 need(Array.isArray(p.nodes)&&p.nodes.length>=3&&p.nodes.length<=64,'Tree structure requires 3..64 nodes');
 const byPath=new Map();let arrays=0,objects=0;
 for(const [i,n] of p.nodes.entries()){
  need(n&&Object.keys(n).every(k=>Object.hasOwn(schema.properties.nodes.items.properties,k))&&['path','name','label','type','is_array'].every(k=>Object.hasOwn(n,k)),'Incomplete tree structure node');
  need(typeof n.path==='string'&&n.path.length<=512&&!byPath.has(n.path)&&typeof n.name==='string'&&n.name.length>0&&n.name.length<=128&&!/[\x00-\x1f]/.test(n.name)&&n.label===n.name&&typeof n.is_array==='boolean','Invalid tree path/name/label');
  need(['object','integer','real','string','boolean'].includes(n.type)&&(!n.is_array||n.type==='object'),'Unsupported tree type');
  if(i===0)need(n.path===''&&n.name==='Root'&&n.type==='object'&&!n.is_array,'Tree root must be object Root');
  else{
   const parent=byPath.get(n.path.slice(0,n.path.lastIndexOf('/')));
   need(parent?.type==='object'&&n.path===parent.path+'/'+pointer(n.name),'Tree parent/path/order differs');
   need(n.path.split('/').length<=4&&(!parent.is_array?parent.path===''||byPath.get(parent.path.slice(0,parent.path.lastIndexOf('/')))?.is_array: true),'Only one repeated branch and one nested object are supported');
  }
  if(n.type==='object'){
   need(!Object.hasOwn(n,'source_field'),'Container cannot bind a source field');
   if(i>0){if(n.is_array){arrays++;need(n.path.split('/').length===2,'Array must be a root child');}else{objects++;need(byPath.get(n.path.slice(0,n.path.lastIndexOf('/')))?.is_array,'Nested object must be an array child');}}
  }else need(typeof n.source_field==='string'&&n.source_field.length>0&&n.source_field.length<=128&&!n.is_array,'Scalar requires source_field');
  byPath.set(n.path,n);
 }
 need(arrays===1&&objects<=1&&p.nodes.some(n=>n.type!=='object'),'One object array and scalar leaves required');
 // Enforce depth-first schema order, not merely parent-before-child.
 const ordered=[];const walk=path=>{ordered.push(path);for(const n of p.nodes.slice(1).filter(n=>n.path.slice(0,n.path.lastIndexOf('/'))===path))walk(n.path);};walk('');
 need(JSON.stringify(ordered)===JSON.stringify(p.nodes.map(n=>n.path)),'Tree structure must follow native depth-first order');
}
export function validateTableTreeSource(port,nodes){
 need(port?.port_kind!=='tree'&&port.sample_complete===true&&Number.isInteger(port.row_count)&&port.row_count>0&&port.sample?.length===port.row_count,'Read the complete nonempty table before conversion');
 need(2+port.row_count*(nodes.length-1)<=256,'Tree instances exceed 256');
 for(const node of nodes.filter(n=>n.type!=='object'))need(port.schema.filter(c=>c.name===node.source_field&&c.type===node.type).length===1,'Tree source field/type differs: '+node.source_field);
}
export function validateSerializationTree(port){
 const s=port?.tree?.schema;
 need(port?.port_kind==='tree'&&port.tree?.complete===true&&Array.isArray(s)&&s.length>0&&s.length<=64&&!s[0].is_array&&s[0].is_container&&s.filter(n=>n.is_array).length===1,'Serialization requires a complete object tree with one array');
 need(s.every(n=>n.is_container||['integer','real','string','boolean'].includes(n.type)),'Serialization rejects dates and Variant');
 return true;
}
