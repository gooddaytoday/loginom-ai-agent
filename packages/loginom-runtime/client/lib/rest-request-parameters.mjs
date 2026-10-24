const text=maxLength=>({type:'string',minLength:1,maxLength});
export const restRequestParametersSchema={type:'object',additionalProperties:false,properties:{
 connection:{type:'object',additionalProperties:false,properties:{name:{...text(120),description:'Unique REST connection label in the current module. Reuse the same name to reference an existing connection.'},base_url:{...text(2048),description:'For a new connection: absolute HTTP(S) base URL, without query, fragment, username or password. Creates a native module REST-service connection with GET, query parameters, no authentication and certificate verification enabled.'},response_content_type:{type:'string',enum:['application/json','text/html'],description:'Allowed response Content-Type in the native connection. Omit to preserve the connection default/saved value (new connections default to application/json). Use text/html for httpbin.org/status/200 and /status/404; a successful HTTP status can still have ErrorCode=-1 when the returned Content-Type is rejected.'}},required:['name']},
 query_parameters:{type:'array',minItems:1,maxItems:32,items:{type:'object',additionalProperties:false,properties:{name:{...text(128),description:'Query parameter name sent to the service.'},field:{...text(128),description:'Exact technical string field name from table input 0. Pass raw values: the handler creates a URL-encoding step automatically. Do not pre-encode values or add a codec node.'}},required:['name','field']},description:'Complete ordered query parameter bindings. For example, RequestId and Key each bind to their corresponding raw input field. The handler URL-encodes values once before the native REST node; the original source table is preserved.'},
},description:'GET with string query parameters and optional allowed response Content-Type. Explicit connection/query bindings require one raw table input and finish=execute. For an existing REST directly connected to that raw source, repeat that same source/output in inputs to authorize inserting the encoder on this link; a different source is rejected. This authorizes materializing the automatic URL-encoding step. Do not pre-encode values. The handler creates/reuses a native module connection and its graph reference; table input 0 is the native Data input, not the service or variable port. Output 0 is RequestID/Response text (it can be empty on request failure); output 1 contains RequestID/ErrorCode/ErrorDesc/HttpStatusCode, including failures. HTTP >=400 yields ErrorCode=6 while node execution can complete normally. Derive a request error flag from ErrorCode != 0, not from node execution status or missing response rows. Parse Response using supported downstream transformations and obtain the actual HTTP status from output 1, joining by native RequestID if needed. Existing parameters:{} preserves saved settings and supports Done/Close without executing.'};
const need=(ok,message)=>{if(!ok)throw Error('REST request: '+message);};
export function validateRestRequestParameters(p,mode,r){
 need(mode==='request','only request mode is supported');
 need(p&&typeof p==='object'&&!Array.isArray(p),'parameters must be an object');
 need(Object.keys(p).every(k=>['connection','query_parameters'].includes(k)),'only connection and query_parameters are supported in stage 1');
 if(!Object.keys(p).length)need(r.target.kind==='existing','a new request requires connection and query_parameters');
 else{
  need(r.inputs.length===1&&r.finish==='execute','explicit raw query bindings require one table input and finish=execute to authorize URL encoding. next_step: retry with a NEW operation_id, '+(r.target.kind==='existing'?'the SAME existing target, inputs confirming the same raw source and output already connected to input 0, unchanged connection/query_parameters, and finish=execute':'one raw table input and finish=execute'));
  const c=p.connection;
  need(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['name','base_url','response_content_type'].includes(k)),'connection requires name, optional base_url and response_content_type only');
  need(typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=120&&!/[\0\r\n]/.test(c.name),'connection.name must be a nonempty single-line label');
  if(c.response_content_type!==undefined)need(['application/json','text/html'].includes(c.response_content_type),'response_content_type must be application/json or text/html');
  if(c.base_url!==undefined){
   need(typeof c.base_url==='string'&&c.base_url.length<=2048,'base_url must be a bounded string');
   let url;try{url=new URL(c.base_url);}catch{throw Error('REST request: base_url must be an absolute HTTP(S) URL');}
   need(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash,'base_url must be HTTP(S) without credentials, query or fragment');
  }
  need(Array.isArray(p.query_parameters)&&p.query_parameters.length>0&&p.query_parameters.length<=32,'query_parameters requires 1–32 bindings');
  const names=new Set();
  for(const q of p.query_parameters){
   need(q&&Object.keys(q).sort().join(',')==='field,name','each query binding requires exactly name and field');
   need(['name','field'].every(k=>typeof q[k]==='string'&&q[k].trim()&&q[k].length<=128&&!/[\0\r\n]/.test(q[k])),'query names and fields must be nonempty single-line strings');
   need(!names.has(q.name),'query parameter names must be unique');names.add(q.name);
  }
 }
 need(r.target.kind==='existing'||r.inputs.length===1,'a new request requires one table input at input 0');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'only table input 0 is supported');
 need(r.read.ports.every(port=>port===0||port===1),'only output ports 0 and 1 are available');
 need(r.mappings.every(m=>m.direction==='input'&&m.port===0),'output remapping is outside stage 1; preserve the native REST output fields');
 need(r.finish!=='close'||r.mappings.length===0,'Close cannot commit mappings');
}
