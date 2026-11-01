const text=(description,maxLength=128)=>({type:'string',minLength:1,maxLength,description});
export const jsonToTreeParametersSchema={type:'object',properties:{json_field:text('Exact input string column containing one JSON object.'),
 root_mode:{type:'string',enum:['auto'],description:'Automatic root; one repeated object branch only.'}},required:[],additionalProperties:false};
export const treeToTableParametersSchema={type:'object',properties:{
 selected_paths:{type:'array',minItems:1,maxItems:64,items:text('JSON Pointer schema leaf path, without array indexes.',512),description:'Replace the complete leaf selection in native schema order.'},
 repeat_parents:{type:'boolean',description:'Repeat selected ancestors on every child row.'},
 composite_names:{type:'boolean',const:false,description:'Short leaf names only.'},composite_labels:{type:'boolean',const:false,description:'Short leaf labels only.'},
 label_separator:{type:'string',enum:['.'],description:'Preserve native dot separator.'}},required:[],additionalProperties:false};
export function validateTreeParameters(parameters,mode,request){
 const json=request.target.type==='trees.from_json',schema=json?jsonToTreeParametersSchema:treeToTableParametersSchema;
 if(mode!==(json?'auto_structure':'selected_nodes')||!parameters||typeof parameters!=='object'||Array.isArray(parameters)
  ||Object.keys(parameters).some(k=>!Object.hasOwn(schema.properties,k))||request.mappings.length)
  throw Error('Tree stage 1 requires its documented mode, parameters and mappings:[]');
 if(request.inputs.length>1||request.inputs.some(i=>i.input!==0)||request.target.kind==='new'&&request.inputs.length!==1)throw Error('Tree stage 1 requires one input 0');
 if(request.target.kind==='new'&&Object.keys(schema.properties).some(k=>!Object.hasOwn(parameters,k)))throw Error('New tree node requires every documented parameter');
 if(json){
  if(parameters.json_field!==undefined&&(typeof parameters.json_field!=='string'||!parameters.json_field||parameters.json_field.length>128))throw Error('Invalid parameters.json_field');
  if(parameters.root_mode!==undefined&&parameters.root_mode!=='auto')throw Error('Invalid parameters.root_mode: only auto is supported');
  return;
 }
 if(parameters.selected_paths!==undefined&&(!Array.isArray(parameters.selected_paths)||!parameters.selected_paths.length||parameters.selected_paths.length>64
  ||new Set(parameters.selected_paths).size!==parameters.selected_paths.length||parameters.selected_paths.some(p=>typeof p!=='string'||p.length>512||!/^\/(?:[^~]|~[01])+$/.test(p))))
  throw Error('Invalid parameters.selected_paths: distinct JSON Pointer schema paths required');
 if(parameters.repeat_parents!==undefined&&typeof parameters.repeat_parents!=='boolean')throw Error('Invalid parameters.repeat_parents');
 for(const k of ['composite_names','composite_labels'])if(parameters[k]!==undefined&&parameters[k]!==false)throw Error('Invalid parameters.'+k+': only false is supported');
 if(parameters.label_separator!==undefined&&parameters.label_separator!=='.')throw Error('Invalid parameters.label_separator: only dot is supported');
}

// Inspect only the admitted JSON shape. Numeric lexemes are retained as text;
// the native tree reader independently supplies every delivered scalar value.
export function validateTreeJsonScope(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw Error('Tree JSON input exceeds the bounded object scope');
 const numbers=new WeakSet();
 const root=JSON.parse(text,(_key,value,context)=>{
  if(typeof value!=='number')return value;
  if(!Number.isFinite(value)||/^-?\d+$/.test(context.source)&&(BigInt(context.source)<-9223372036854775808n||BigInt(context.source)>9223372036854775807n))throw Error('Tree numeric value exceeds native scalar scope');
  const number={source:context.source};numbers.add(number);return number;
 });
 const stack=[];
 for(const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)){
  if(token==='{'){stack.push({keys:new Set(),key:true});continue;}
  if(token==='['){stack.push({});continue;}
  if(token==='}'||token===']'){stack.pop();continue;}
  const top=stack.at(-1);if(!top?.keys)continue;
  if(token===','){top.key=true;continue;}if(token===':'){top.key=false;continue;}
  if(top.key&&token.startsWith('"')){const key=JSON.parse(token);if(top.keys.has(key))throw Error('Duplicate JSON keys are outside tree stage 1');top.keys.add(key);top.key=false;}
 }
 let arrays=0,nodes=0;const leafNames=new Set();
 const walk=(value,depth,inArray=false)=>{
  if(++nodes>256||depth>16)throw Error('Tree JSON exceeds 256 nodes or depth 16');
  if(value===null||numbers.has(value)||['string','boolean'].includes(typeof value)){
   if(typeof value==='string'&&/^\d{4}-\d\d-\d\d(?:T|$)/.test(value))throw Error('Tree stage 1 does not support inferred dates');return;
  }
  if(Array.isArray(value)){
   if(++arrays!==1||!value.length||value.some(v=>!v||typeof v!=='object'||Array.isArray(v)||numbers.has(v)))throw Error('Tree stage 1 requires one nonempty repeated object branch');
   const kinds=new Map();
   for(const record of value)for(const [key,cell] of Object.entries(record)){
    const kind=cell===null?'null':numbers.has(cell)?'number':typeof cell;
    if(kind==='object'||kind==='undefined')throw Error('Nested containers in repeated records are outside tree stage 1');
    if(kind!=='null'&&kinds.has(key)&&kinds.get(key)!==kind)throw Error('Mixed Variant fields are outside tree stage 1');
    if(kind!=='null')kinds.set(key,kind);
   }
   for(const key of kinds.keys()){if(leafNames.has(key))throw Error('Colliding leaf names are outside tree stage 1');leafNames.add(key);}
   for(const record of value)walk(record,depth+1,true);return;
  }
  if(!value||typeof value!=='object')throw Error('Tree stage 1 requires an object document');
  for(const [key,cell] of Object.entries(value)){
   if(!key||key.length>128)throw Error('Tree field name exceeds stage 1 scope');
   const scalar=cell===null||numbers.has(cell)||typeof cell!=='object';
   if(scalar&&!inArray){if(leafNames.has(key))throw Error('Colliding leaf names are outside tree stage 1');leafNames.add(key);}
   walk(cell,depth+1);
  }
 };
 if(!root||typeof root!=='object'||Array.isArray(root)||numbers.has(root))throw Error('Tree stage 1 requires one JSON object');
 walk(root,0);if(arrays!==1)throw Error('Tree stage 1 requires one repeated object branch');
 return {verified:true,node_count:nodes};
}

export function validateSelectedTreePaths(schema,paths){
 if(!Array.isArray(schema)||!schema.length||schema.length>256||schema[0].is_array||schema.filter(n=>n.is_array).length!==1)throw Error('Tree stage 1 requires one object and one repeated branch');
 const leaves=schema.filter(n=>!n.is_container);
 if(new Set(leaves.map(n=>n.name)).size!==leaves.length||leaves.some(n=>!['integer','real','string','boolean'].includes(n.type)))throw Error('Tree stage 1 requires distinct scalar leaf names and supported types');
 if(paths){const selected=leaves.filter(n=>paths.includes(n.path)).map(n=>n.path);
  if(JSON.stringify(selected)!==JSON.stringify(paths))throw Error('Invalid parameters.selected_paths: choose existing leaves in native schema order');}
 return true;
}
